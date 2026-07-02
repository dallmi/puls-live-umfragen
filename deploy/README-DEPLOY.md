# Deployment — puls.verwalterfuchs.de

Live-Instanz auf dem bestehenden Hetzner-Server (`46.224.120.157`, Host „verwalterfuchs-prod"),
nach demselben Muster wie der Immobilien-Clone.

## Aufbau auf dem Server

```
/opt/puls/
  server.js, package.json, public/   App-Dateien (rsync vom Mac)
  docker-compose.yml                 node:22-alpine, Port 127.0.0.1:3210 → 3000
  data/store.json                    Persistenz (Docker-Volume-Mount, überlebt Updates)
```

- **Container:** `puls` (node:22-alpine, kein eigenes Image nötig, `restart: unless-stopped`)
- **nginx:** `/etc/nginx/sites-available/puls` → Proxy auf `127.0.0.1:3210`,
  SSE-tauglich (`proxy_buffering off`, `proxy_read_timeout 24h`)
- **TLS:** Let's Encrypt via certbot (`puls.verwalterfuchs.de`), Erneuerung automatisch
  über den bestehenden certbot-Timer
- **DNS:** Wildcard `*.verwalterfuchs.de` (Cloudflare, DNS-only) zeigt bereits auf den Server —
  keine DNS-Pflege nötig

## Update ausrollen

```bash
./deploy/deploy.sh
```

(rsynct die App-Dateien und startet den Container neu; Antworten/Präsentationen in
`data/` bleiben erhalten.)

## Nützliche Befehle auf dem Server

```bash
ssh root@46.224.120.157
docker logs -f puls              # Live-Logs
docker compose -f /opt/puls/docker-compose.yml restart
cat /opt/puls/data/store.json    # Datenbestand ansehen
```

Hinweis: Dieser Ordner (`deploy/`) ist bewusst **nicht** Teil von `puls-windows.zip`,
damit keine Server-Details in die Firmenversion gelangen.
