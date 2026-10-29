#!/usr/bin/env python3
"""Portable loopback-only launcher. Python 3.8+, standard library only."""
import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "assets" / "site"
PACKAGE = ROOT / "assets" / "manifest.json"
INSTALL_ID = hashlib.sha256(str(ROOT).encode("utf-8")).hexdigest()[:20]
STATE_DIR = Path(tempfile.gettempdir()) / ("claude-local-check-" + INSTALL_ID)
STATE = STATE_DIR / "state.json"
LOG = STATE_DIR / "server.log"
APP = "claude-local-check"
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; "
       "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "connect-src 'self' https://ipapi.co; font-src 'self'; object-src 'none'; "
       "base-uri 'self'; form-action 'none'; frame-ancestors 'none'")


def manifest():
    data = json.loads(PACKAGE.read_text(encoding="utf-8"))
    for name, expected in data["files"].items():
        file = (SITE / name).resolve()
        if SITE.resolve() not in file.parents:
            raise ValueError("Invalid packaged asset path")
        if hashlib.sha256(file.read_bytes()).hexdigest() != expected:
            raise ValueError("Packaged asset failed verification: " + name)
    return data


def load_state():
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def request(state, route, method="GET"):
    port = state.get("port")
    if not isinstance(port, int) or not 1 <= port <= 65535:
        raise ValueError("Invalid local port")
    req = urllib.request.Request(
        "http://127.0.0.1:%d%s" % (port, route), method=method,
        headers={"X-Local-Token": state["token"]})
    with HTTP.open(req, timeout=2) as response:
        return json.load(response)


def alive(state):
    if not state:
        return False
    try:
        result = request(state, "/__local/health")
        return (result.get("app") == APP
                and result.get("install_id") == INSTALL_ID
                and result.get("instance") == state.get("instance"))
    except (OSError, ValueError, KeyError):
        return False


def output(state=None, status="stopped", **extra):
    result = {"status": status, "state_file": str(STATE), "log_file": str(LOG)}
    if state and status == "running":
        result.update(url="http://127.0.0.1:%d/zh/" % state["port"],
                      pid=state["pid"], version=state["version"])
    result.update(extra)
    # ASCII JSON avoids console code-page failures on Windows.
    print(json.dumps(result, ensure_ascii=True), flush=True)
    return result


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".png": "image/png",
        ".jpg": "image/jpeg",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def log_message(self, *_args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def local_host(self):
        # Blocks cross-origin/rebinding host names, including proxied host names.
        expected = "127.0.0.1:%d" % self.server.server_port
        if self.headers.get("Host") != expected:
            self.send_error(403)
            return False
        return True

    def authorized(self):
        return secrets.compare_digest(
            self.headers.get("X-Local-Token", ""), self.server.state["token"])

    def json_reply(self, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.local_host():
            return
        if self.path == "/__local/health":
            if not self.authorized():
                self.send_error(403)
                return
            self.json_reply({"app": APP, "install_id": INSTALL_ID,
                             "instance": self.server.state["instance"]})
            return
        super().do_GET()

    def do_HEAD(self):
        if self.local_host():
            super().do_HEAD()

    def do_POST(self):
        if not self.local_host():
            return
        if self.path != "/__local/stop" or not self.authorized():
            self.send_error(403)
            return
        self.json_reply({"status": "stopping"})
        threading.Thread(target=self.server.shutdown, daemon=True).start()

    def send_head(self):
        # Serve only verified, listed files; never browse source or symlinks.
        path = (SITE / urllib.parse.unquote(
            urllib.parse.urlsplit(self.path).path).lstrip("/")).resolve()
        if path.is_dir():
            path = path / "index.html"
        try:
            relative = path.relative_to(SITE.resolve()).as_posix()
        except ValueError:
            self.send_error(404)
            return None
        if relative not in self.server.files:
            self.send_error(404)
            return None
        return super().send_head()


def serve(port):
    package = manifest()
    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    existing = load_state()
    if alive(existing):
        output(existing, "running", reused=True)
        return
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError:
        if port == 0:
            raise
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    state = {"port": server.server_port, "pid": os.getpid(),
             "token": secrets.token_urlsafe(32), "instance": secrets.token_hex(16),
             "version": package["version"]}
    server.state = state
    server.files = package["files"]
    temp = STATE_DIR / ("state-%d.tmp" % os.getpid())
    temp.write_text(json.dumps(state), encoding="utf-8")
    try:
        temp.chmod(0o600)
    except OSError:
        pass
    temp.replace(STATE)
    output(state, "running")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        current = load_state()
        if current and current.get("instance") == state["instance"]:
            STATE.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["start", "status", "stop", "serve"])
    parser.add_argument("--port", type=int, default=4321)
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    if args.command == "serve":
        serve(args.port)
        return
    if args.command == "start":
        manifest()
    state = load_state()
    running = alive(state)
    if args.command == "status":
        output(state, "running" if running else "stopped")
    elif args.command == "stop":
        if running:
            request(state, "/__local/stop", "POST")
            deadline = time.monotonic() + 5
            while alive(state) and time.monotonic() < deadline:
                time.sleep(0.1)
            if alive(state):
                raise RuntimeError("Server did not stop; no other processes were killed")
        output(status="stopped")
    else:
        if not running:
            STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
            kwargs = {"start_new_session": True} if os.name != "nt" else {
                "creationflags": subprocess.DETACHED_PROCESS |
                subprocess.CREATE_NEW_PROCESS_GROUP}
            with LOG.open("ab") as log:
                child = subprocess.Popen(
                    [sys.executable, str(Path(__file__).resolve()), "serve",
                     "--port", str(args.port)],
                    stdin=subprocess.DEVNULL, stdout=log, stderr=log, **kwargs)
            deadline = time.monotonic() + 12
            while time.monotonic() < deadline:
                state = load_state()
                if alive(state):
                    break
                if child.poll() is not None:
                    raise RuntimeError("Server exited; see log: " + str(LOG))
                time.sleep(0.1)
            else:
                child.terminate()
                raise RuntimeError("Startup timed out; see log: " + str(LOG))
        # Check the actual page as well as service identity before giving a URL.
        url = "http://127.0.0.1:%d/zh/" % state["port"]
        with HTTP.open(url, timeout=3) as response:
            if response.status != 200:
                raise RuntimeError("Local page is not available")
        result = output(state, "running", reused=running)
        if args.open:
            webbrowser.open(result["url"])


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        output(status="error", error=str(exc))
        sys.exit(1)
