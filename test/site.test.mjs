import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'assets');

export function extractLocalHtmlAssetRefs(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') return [];
  const refs = [];
  const attrRegex = /(?:src|href)="([^"]+)"/g;
  let match;
  while ((match = attrRegex.exec(htmlContent)) !== null) {
    const raw = match[1].split('?')[0].split('#')[0].trim();
    if (
      !raw ||
      /^https?:\/\//i.test(raw) ||
      raw.startsWith('mailto:') ||
      raw.startsWith('data:') ||
      raw === '/' ||
      raw === '/about' ||
      raw === '/vote'
    ) {
      continue;
    }
    refs.push(raw);
  }
  return refs;
}

export function extractRelativeJsImports(jsContent) {
  if (!jsContent || typeof jsContent !== 'string') return { staticImports: [], dynamicImports: [] };
  const staticImports = [];
  const dynamicImports = [];

  for (const m of jsContent.matchAll(/from\s*["'](\.\/[^"']+)["']/g)) {
    staticImports.push(m[1]);
  }
  for (const m of jsContent.matchAll(/import\s*\(\s*["'`](\.\/[^"'`]+)["'`]\s*\)/g)) {
    dynamicImports.push(m[1]);
  }
  return { staticImports, dynamicImports };
}

test('All HTML pages exist and reference valid non-empty local assets', () => {
  const htmlPages = ['index.html', 'about/index.html', 'vote/index.html'];

  for (const relPage of htmlPages) {
    const fullPage = path.join(rootDir, relPage);
    assert.ok(fs.existsSync(fullPage), `Expected HTML page ${relPage} to exist`);
    const html = fs.readFileSync(fullPage, 'utf8');
    const refs = extractLocalHtmlAssetRefs(html);
    assert.ok(refs.length > 0, `Expected ${relPage} to reference at least one local asset`);

    for (const ref of refs) {
      const target = path.join(rootDir, ref.replace(/^\/+/, ''));
      assert.ok(fs.existsSync(target), `Missing asset "${ref}" referenced in ${relPage}`);
      const stat = fs.statSync(target);
      assert.ok(stat.size > 0, `Asset "${ref}" referenced in ${relPage} is empty`);
    }
  }
});

test('All JS bundles in assets/ pass syntax check and resolve relative imports', () => {
  const jsFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));
  assert.ok(jsFiles.length > 0, 'Expected JS bundles in assets/');

  for (const file of jsFiles) {
    const fullPath = path.join(assetsDir, file);
    execFileSync(process.execPath, ['--check', fullPath], { stdio: 'pipe' });

    const content = fs.readFileSync(fullPath, 'utf8');
    const { staticImports, dynamicImports } = extractRelativeJsImports(content);

    for (const imp of [...staticImports, ...dynamicImports]) {
      const targetPath = path.resolve(assetsDir, imp);
      assert.ok(fs.existsSync(targetPath), `Missing relative import "${imp}" in assets/${file}`);
    }
  }
});

test('Every index bundle and route chunk shares a single symmetric React runtime module', () => {
  const jsFiles = fs.readdirSync(assetsDir).filter(f => /^index(-vote)?-v\d+\.js$/.test(f));

  for (const indexFile of jsFiles) {
    const indexPath = path.join(assetsDir, indexFile);
    const content = fs.readFileSync(indexPath, 'utf8');
    const { staticImports, dynamicImports } = extractRelativeJsImports(content);

    // Re-export shim (e.g. index-vote-v5.js -> index-vote-v6.js) delegates cleanly to target singleton
    if (dynamicImports.length === 0 && staticImports.length === 1) {
      const targetIndex = path.basename(staticImports[0]);
      assert.ok(
        fs.existsSync(path.join(assetsDir, targetIndex)),
        `${indexFile} re-exports non-existent ${targetIndex}`
      );
      continue;
    }

    assert.ok(dynamicImports.length > 0, `Expected ${indexFile} to dynamically import its route chunk`);
    for (const dyn of dynamicImports) {
      const routeFile = path.basename(dyn);
      const routeContent = fs.readFileSync(path.join(assetsDir, routeFile), 'utf8');
      const routeImports = extractRelativeJsImports(routeContent).staticImports;
      assert.ok(
        routeImports.includes(`./${indexFile}`),
        `Route chunk ${routeFile} (loaded by ${indexFile}) imports [${routeImports.join(', ')}] instead of ./${indexFile}, which would instantiate duplicate React runtimes`
      );
    }
  }
});

test('Site metadata and active entrypoints use 1.17-1.21 version range and v14/v6 bundles', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const aboutHtml = fs.readFileSync(path.join(rootDir, 'about/index.html'), 'utf8');
  const voteHtml = fs.readFileSync(path.join(rootDir, 'vote/index.html'), 'utf8');
  const indexV14 = fs.readFileSync(path.join(assetsDir, 'index-v14.js'), 'utf8');
  const indexVoteV6 = fs.readFileSync(path.join(assetsDir, 'index-vote-v6.js'), 'utf8');

  assert.match(indexHtml, /1\.17[-–]1\.21/);
  assert.match(aboutHtml, /1\.17[-–]1\.21/);
  assert.match(indexV14, /1\.17[-–]1\.21/);
  assert.match(indexVoteV6, /Vote for Arcturus Reborn/);
  assert.match(voteHtml, /Vote for Arcturus Reborn/);

  assert.match(indexHtml, /\/assets\/index-v14\.js/);
  assert.match(aboutHtml, /\/assets\/index-v14\.js/);
  assert.match(voteHtml, /\/assets\/index-vote-v6\.js/);
});

test('Helper extraction functions handle empty, malformed, and external inputs safely', () => {
  assert.deepEqual(extractLocalHtmlAssetRefs(''), []);
  assert.deepEqual(extractLocalHtmlAssetRefs(null), []);
  assert.deepEqual(
    extractLocalHtmlAssetRefs('<a href="https://discord.gg/abc">Discord</a><script src="/assets/index-v14.js?v=1"></script>'),
    ['/assets/index-v14.js']
  );
  assert.deepEqual(extractRelativeJsImports(''), { staticImports: [], dynamicImports: [] });
});
