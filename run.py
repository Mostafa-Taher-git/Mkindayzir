#!/usr/bin/env python
"""
Run OpsDesk locally.

  python run.py            # serves on http://127.0.0.1:5000

No external services required. The first run creates data/opsdesk.db
and seeds starter teams, categories and users.
"""
import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    # Local dev server. Use the OPSDESK_DEBUG env var to enable/disable
    # auto-reload instead of editing source. Defaults to False so a fresh
    # clone is safer if the env var is missing.
    debug_mode = os.environ.get("OPSDESK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug_mode)
