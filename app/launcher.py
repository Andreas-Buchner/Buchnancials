import socket
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
import webbrowser
from typing import Final

import uvicorn

from app.core.paths import DATA_DIR

HOST: Final[str] = "127.0.0.1"
STARTUP_TIMEOUT_SECONDS: Final[float] = 15.0


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return int(sock.getsockname()[1])


def _wait_for_server(health_url: str, timeout_seconds: float = STARTUP_TIMEOUT_SECONDS) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=1) as response:
                if response.status == 200:
                    return True
        except urllib.error.URLError:
            time.sleep(0.25)
        except OSError:
            time.sleep(0.25)
    return False


def _pause_before_exit() -> None:
    if not getattr(sys, "frozen", False):
        return

    try:
        input("Press Enter to close this window...")
    except EOFError:
        pass


def main() -> int:
    try:
        from app.main import app as fastapi_app
    except Exception:
        print("Buchnancials failed to start because the application module could not be imported.")
        traceback.print_exc()
        _pause_before_exit()
        return 1

    port = _find_free_port()
    base_url = f"http://{HOST}:{port}"
    health_url = f"{base_url}/health"

    def open_browser_when_ready() -> None:
        if _wait_for_server(health_url):
            webbrowser.open(base_url)
        else:
            print(f"Buchnancials started, but the browser could not be opened automatically. Open {base_url} manually.")

    threading.Thread(target=open_browser_when_ready, daemon=True).start()

    print(f"Starting Buchnancials on {base_url}")
    print(f"Data directory: {DATA_DIR}")
    print("Press Ctrl+C to stop the app.")

    config = uvicorn.Config(
        fastapi_app,
        host=HOST,
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    try:
        server.run()
        return 0
    except Exception:
        print("Buchnancials failed to start the local server.")
        traceback.print_exc()
        _pause_before_exit()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
