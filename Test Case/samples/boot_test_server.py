"""Boot the OpsDesk Flask app on an isolated test database (Playwright global setup).

Usage:
    python Test Case/samples/boot_test_server.py 5010

- Deletes and reseeds data/opsdesk_test.db (dev data/opsdesk.db untouched).
- Serves on 127.0.0.1:<port>.
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BASE_DIR)

from app import config  # noqa: E402

config.DB_PATH = os.path.join(BASE_DIR, "data", "opsdesk_test.db")
config.UPLOAD_DIR = os.path.join(BASE_DIR, "data", "uploads_test")
os.environ.setdefault("OPERADESK_SECRET", "playwright-test-secret")
os.environ.setdefault("OPERADESK_AI_ENABLED", "0")

for suffix in ("", "-wal", "-shm"):
    try:
        os.remove(config.DB_PATH + suffix)
    except FileNotFoundError:
        pass

from app import create_app  # noqa: E402

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5010
print(f"OpsDesk test server on http://127.0.0.1:{port} (db={config.DB_PATH})", flush=True)
create_app().run(host="127.0.0.1", port=port, use_reloader=False, threaded=True)