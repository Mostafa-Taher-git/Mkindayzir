#!/usr/bin/env python
"""
Run OpsDesk locally.

  python run.py            # serves on http://127.0.0.1:5000

No external services required. The first run creates data/opsdesk.db
and seeds starter teams, categories and users.
"""
from app import create_app

app = create_app()

if __name__ == "__main__":
    # 0.0.0.0 = listen on all interfaces, so it's reachable whether Chrome
    # uses 127.0.0.1 or localhost. debug=True enables auto-reload on edits.
    app.run(host="0.0.0.0", port=5000, debug=True)
