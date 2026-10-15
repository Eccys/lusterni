import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('HTML entrypoints reference existing local assets', () => {
  const htmlFiles = [
    'index.html',
    '404.html',
    'vote/index.html',
    'votes/index.html',
    'store/index.html',
    'studio.html',
    'preview.html',
  ];

  for (const relHtml of htmlFiles) {
    const fullPath = path.join(rootDir, relHtml);
    assert.ok(fs.existsSync(fullPath), `Missing HTML entrypoint: ${relHtml}`);
    const content = fs.readFileSync(fullPath, 'utf8');
    const htmlDir = path.dirname(fullPath);

    const refs = [
      ...content.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi),
    ].map(m => m[1]);

    for (const rawRef of refs) {
      if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(rawRef)) continue;
      const cleanRef = rawRef.split('?')[0].split('#')[0];
      if (!cleanRef || cleanRef === '/') continue;
      const targetPath = cleanRef.startsWith('/')
        ? path.join(rootDir, cleanRef.replace(/^\/+/, ''))
        : path.resolve(htmlDir, cleanRef);
      assert.ok(
        fs.existsSync(targetPath),
        `${relHtml} references missing asset ${rawRef} (resolved: ${targetPath})`
      );
    }
  }
});

test('All JS bundles and store/js/app.js pass syntax check', () => {
  const assetsDir = path.join(rootDir, 'assets');
  const jsFiles = fs
    .readdirSync(assetsDir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(assetsDir, f));
  jsFiles.push(path.join(rootDir, 'store/js/app.js'));

  for (const jsFile of jsFiles) {
    execFileSync(process.execPath, ['--check', jsFile], { stdio: 'pipe' });
  }
});

test('Discord component embed JSON files and inline script are valid JSON', () => {
  const discordEmbed = JSON.parse(fs.readFileSync(path.join(rootDir, 'discord-embed.json'), 'utf8'));
  const compactEmbed = JSON.parse(fs.readFileSync(path.join(rootDir, 'embed.json'), 'utf8'));
  assert.deepEqual(discordEmbed, compactEmbed);

  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const match = indexHtml.match(
    /<script id="discord:component-embed" type="application\/json">([\s\S]*?)<\/script>/
  );
  assert.ok(match, 'index.html must contain discord:component-embed script tag');
  const inlineEmbed = JSON.parse(match[1]);
  assert.deepEqual(inlineEmbed, compactEmbed);
});

test('store/js/app.js preserves pathname in checkout URLs and guards basket ident', () => {
  const appJs = fs.readFileSync(path.join(rootDir, 'store/js/app.js'), 'utf8');
  assert.match(
    appJs,
    /function completeUrl\(\)\s*\{\s*return `\$\{window\.location\.origin\}\$\{window\.location\.pathname\}\?checkout=complete`;\s*\}/
  );
  assert.match(
    appJs,
    /function cancelUrl\(\)\s*\{\s*return `\$\{window\.location\.origin\}\$\{window\.location\.pathname\}`;\s*\}/
  );
  assert.match(
    appJs,
    /async function updatePackageQuantity[\s\S]*?const ident = state\.basket\?\.ident \|\| getStoredBasketIdent\(\);\s*if \(!ident\) return;/
  );
});
