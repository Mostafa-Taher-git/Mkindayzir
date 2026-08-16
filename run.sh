#!/usr/bin/env bash
# Runs OpsDesk: starts the Flask backend (if not already up) and opens the
# correct URL in the browser. Use this instead of "Open with Live Server",
# because Live Server cannot proxy POST requests to the API.
set -e
cd "$(dirname "$0")"

# Activate the virtualenv
if [ -f venv/bin/activate ]; then
  source venv/bin/activate
fi

# Start Flask only if nothing is already listening on 5000
if ! curl -s -o /dev/null http://127.0.0.1:5000/ ; then
  echo "Starting Flask backend..."
  python run.py > /tmp/opsdesk.log 2>&1 &
  # wait for it to come up
  for i in $(seq 1 20); do
    curl -s -o /dev/null http://127.0.0.1:5000/ && break
    sleep 1
  done
else
  echo "Flask already running on :5000"
fi

echo "Opening http://127.0.0.1:5000 ..."
xdg-open http://127.0.0.1:5000 2>/dev/null || \
  google-chrome http://127.0.0.1:5000 2>/dev/null || \
  echo "Could not auto-open browser. Open http://127.0.0.1:5000 manually."
