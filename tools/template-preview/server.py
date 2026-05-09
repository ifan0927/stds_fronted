from __future__ import annotations

import html
import json
import mimetypes
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


PORT = 9999
ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_DIR = ROOT / "artifacts" / "ui-templates"
MANIFEST_PATH = TEMPLATE_DIR / "manifest.json"


def load_manifest() -> list[dict[str, str]]:
    if not MANIFEST_PATH.exists():
        return []
    with MANIFEST_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)
    templates = data.get("templates", [])
    if not isinstance(templates, list):
        return []
    return [item for item in templates if isinstance(item, dict)]


def find_template(slug: str) -> dict[str, str] | None:
    for item in load_manifest():
        if item.get("slug") == slug:
            return item
    return None


def safe_template_path(file_name: str) -> Path | None:
    candidate = (TEMPLATE_DIR / file_name).resolve()
    try:
        candidate.relative_to(TEMPLATE_DIR.resolve())
    except ValueError:
        return None
    if not candidate.is_file():
        return None
    return candidate


def render_index() -> bytes:
    templates = load_manifest()
    rows = []
    for item in templates:
        title = html.escape(item.get("title", "Untitled template"))
        slug = html.escape(item.get("slug", ""))
        issue = html.escape(item.get("issue", ""))
        status = html.escape(item.get("status", "planned"))
        description = html.escape(item.get("description", ""))
        href = f"/templates/{slug}"
        disabled = item.get("file") == ""
        action = (
            '<span class="muted">尚未建立 HTML</span>'
            if disabled
            else f'<a class="button" href="{href}">Open</a>'
        )
        rows.append(
            f"""
            <tr>
              <td><strong>{title}</strong><div class="desc">{description}</div></td>
              <td>{issue}</td>
              <td><span class="status">{status}</span></td>
              <td>{action}</td>
            </tr>
            """
        )

    body = "\n".join(rows)
    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>STDS UI Template Preview</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #64748b;
      --line: #d9dee7;
      --accent: #0f766e;
      --accent-weak: #e6f4f1;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }}
    header {{
      background: var(--panel);
      border-bottom: 1px solid var(--line);
      padding: 24px 32px;
    }}
    main {{
      max-width: 1120px;
      margin: 0 auto;
      padding: 28px 24px 48px;
    }}
    h1 {{
      margin: 0 0 6px;
      font-size: 24px;
      letter-spacing: 0;
    }}
    p {{ margin: 0; color: var(--muted); }}
    .panel {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
    }}
    th, td {{
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 14px;
    }}
    th {{
      background: #fbfcfd;
      color: #475569;
      font-weight: 600;
    }}
    tr:last-child td {{ border-bottom: 0; }}
    .desc {{
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
    }}
    .status {{
      display: inline-flex;
      min-width: 72px;
      justify-content: center;
      border-radius: 999px;
      background: var(--accent-weak);
      color: var(--accent);
      padding: 3px 10px;
      font-size: 12px;
      font-weight: 600;
    }}
    .button {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 64px;
      border-radius: 6px;
      background: var(--accent);
      color: #fff;
      padding: 6px 12px;
      text-decoration: none;
      font-weight: 600;
    }}
    .muted {{ color: var(--muted); }}
    @media (max-width: 760px) {{
      header {{ padding: 20px; }}
      main {{ padding: 20px 12px 36px; }}
      table, thead, tbody, tr, th, td {{ display: block; }}
      thead {{ display: none; }}
      tr {{ border-bottom: 1px solid var(--line); }}
      td {{ border-bottom: 0; padding: 10px 14px; }}
    }}
  </style>
</head>
<body>
  <header>
    <h1>STDS UI Template Preview</h1>
    <p>放置 standalone HTML template 後，更新 manifest 即可從這裡開啟預覽。</p>
  </header>
  <main>
    <section class="panel">
      <table>
        <thead>
          <tr>
            <th>Template</th>
            <th>Issue</th>
            <th>Status</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>
          {body}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>
""".encode("utf-8")


class PreviewHandler(BaseHTTPRequestHandler):
    def do_HEAD(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path in {"/", "/index.html"}:
            self.respond(HTTPStatus.OK, b"", "text/html; charset=utf-8")
            return
        if path.startswith("/templates/"):
            slug = path.removeprefix("/templates/").strip("/")
            item = find_template(slug)
            if not item:
                self.respond(HTTPStatus.NOT_FOUND, b"", "text/plain; charset=utf-8")
                return
            template_path = safe_template_path(item.get("file", ""))
            if not template_path:
                self.respond(HTTPStatus.NOT_FOUND, b"", "text/plain; charset=utf-8")
                return
            content_type = mimetypes.guess_type(template_path.name)[0] or "text/html"
            self.respond(HTTPStatus.OK, b"", content_type)
            return
        self.respond(HTTPStatus.NOT_FOUND, b"", "text/plain; charset=utf-8")

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path in {"/", "/index.html"}:
            self.respond(HTTPStatus.OK, render_index(), "text/html; charset=utf-8")
            return

        if path.startswith("/templates/"):
            slug = path.removeprefix("/templates/").strip("/")
            item = find_template(slug)
            if not item:
                self.respond_text(HTTPStatus.NOT_FOUND, "Template route not found.")
                return
            file_name = item.get("file", "")
            template_path = safe_template_path(file_name)
            if not template_path:
                self.respond_text(HTTPStatus.NOT_FOUND, "Template HTML has not been created yet.")
                return
            content_type = mimetypes.guess_type(template_path.name)[0] or "text/html"
            self.respond(HTTPStatus.OK, template_path.read_bytes(), content_type)
            return

        self.respond_text(HTTPStatus.NOT_FOUND, "Not found.")

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")

    def respond_text(self, status: HTTPStatus, message: str) -> None:
        self.respond(status, message.encode("utf-8"), "text/plain; charset=utf-8")

    def respond(self, status: HTTPStatus, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), PreviewHandler)
    print(f"STDS UI template preview server listening on http://0.0.0.0:{PORT}")
    server.serve_forever()
