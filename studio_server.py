import http.server
import json
import os
import re
import socketserver
import subprocess
import sys
import webbrowser

PORT = 8080
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_PATH = os.path.join(ROOT_DIR, "index.html")
JSON_PATH = os.path.join(ROOT_DIR, "discord-embed.json")
EMBED_JSON_PATH = os.path.join(ROOT_DIR, "embed.json")

class StudioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def do_GET(self):
        if self.path in ("/", "/studio", "/studio/", "/studio.html"):
            try:
                studio_file = os.path.join(ROOT_DIR, "studio.html")
                with open(studio_file, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            except Exception as e:
                self.send_error(500, str(e))
                return
        elif self.path == "/api/load":
            try:
                with open(JSON_PATH, "r", encoding="utf-8") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(data.encode("utf-8"))
            except Exception as e:
                self.send_error(500, str(e))
            return
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/save":
            try:
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len).decode("utf-8")
                payload = json.loads(body)

                # 1. Update discord-embed.json (indented for human readability)
                with open(JSON_PATH, "w", encoding="utf-8") as f:
                    json.dump(payload, f, indent=2, ensure_ascii=False)

                # 2. Update embed.json (compact raw bytes for Discord linked JSON)
                compact = json.dumps(payload, separators=(',', ':'), ensure_ascii=False)
                with open(EMBED_JSON_PATH, "w", encoding="utf-8") as f:
                    f.write(compact)

                # 3. Update index.html via safe slice replacement (avoids regex newline unescaping)
                with open(INDEX_PATH, "r", encoding="utf-8") as f:
                    html = f.read()

                start_tag = '<script id="discord:component-embed" type="application/json">'
                end_tag = '</script>'
                start_pos = html.find(start_tag)
                if start_pos == -1:
                    raise Exception("Could not find start tag for discord:component-embed in index.html")
                end_pos = html.find(end_tag, start_pos)
                if end_pos == -1:
                    raise Exception("Could not find end tag for discord:component-embed in index.html")

                new_html = html[:start_pos + len(start_tag)] + compact + html[end_pos:]
                with open(INDEX_PATH, "w", encoding="utf-8") as f:
                    f.write(new_html)

                response = {"ok": True, "bytes": len(compact.encode("utf-8"))}
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(response).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode("utf-8"))
            return

        elif self.path == "/api/push":
            try:
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
                data = json.loads(body)
                msg = data.get("message", "Update Discord Component Embed from Studio")

                # Git commit & push
                add_res = subprocess.run(["git", "add", "index.html", "discord-embed.json", "embed.json"], cwd=ROOT_DIR, capture_output=True, text=True)
                commit_res = subprocess.run(["git", "commit", "-m", msg], cwd=ROOT_DIR, capture_output=True, text=True)
                push_res = subprocess.run(["git", "push", "origin", "newgen"], cwd=ROOT_DIR, capture_output=True, text=True)

                if push_res.returncode != 0 and "Everything up-to-date" not in push_res.stderr:
                    raise Exception(push_res.stderr or push_res.stdout)

                out = (commit_res.stdout + "\n" + push_res.stdout + "\n" + push_res.stderr).strip()
                response = {"ok": True, "output": out}
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(response).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode("utf-8"))
            return

        self.send_error(404, "Not Found")

def main():
    # Allow address reuse
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("", PORT), StudioHandler) as httpd:
        print(f"==================================================")
        print(f"  Discord Link Preview Studio IDE Live at:")
        print(f"  http://localhost:{PORT}")
        print(f"==================================================")
        httpd.serve_forever()

if __name__ == "__main__":
    main()
