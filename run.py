#!/usr/bin/env python
"""
Run OpsDesk locally.

  python run.py            # serves on http://127.0.0.1:5000

No external services required. The first run creates data/opsdesk.db
and seeds starter teams, categories and users.

Configuration is read from a .env file in the project root (see
.env.example) or from the shell environment. Values are read at import
time by app/config.py, so load_dotenv() must run BEFORE importing the app.
"""
import os

from dotenv import load_dotenv

load_dotenv()  # reads .env in the project root; real shell env vars win

from app import create_app, config

if config.SECRET_KEY == "dev-secret-change-me" and not os.environ.get("OPERADESK_SECRET"):
    print(
        "WARNING: OPERADESK_SECRET is not set - running with the public dev "
        "fallback key. Copy .env.example to .env and set a random value "
        "(python -c \"import secrets;print(secrets.token_hex(32))\") before "
        "exposing this instance to anyone.",
        file=__import__("sys").stderr,
    )

app = create_app()

if __name__ == "__main__":
    # Local dev server. Use the OPSDESK_DEBUG env var to enable/disable
    # auto-reload instead of editing source. Defaults to False so a fresh
    # clone is safer if the env var is missing.
    debug_mode = os.environ.get("OPSDESK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug_mode)
