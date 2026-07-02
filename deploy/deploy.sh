#!/bin/bash
# PULS auf den Hetzner-Server deployen
# Verwendung: ./deploy/deploy.sh
set -e

SERVER="root@46.224.120.157"
APP_DIR="/opt/puls"

cd "$(dirname "$0")/.."

echo "Lade App-Dateien hoch ..."
rsync -az server.js package.json public deploy/docker-compose.yml $SERVER:$APP_DIR/

echo "Starte Container neu ..."
ssh $SERVER "cd $APP_DIR && docker compose up -d --force-recreate && sleep 2 && curl -s -o /dev/null -w 'Health-Check: %{http_code}\n' http://127.0.0.1:3210/"

echo "Fertig: https://puls.verwalterfuchs.de"
