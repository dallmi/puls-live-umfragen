# PULS — Live-Umfragen

Selbst-gehostete Lösung für interaktive Präsentationen mit Live-Abstimmung.
Das Publikum tritt per sechsstelligem Code oder QR-Code bei und stimmt auf dem eigenen Gerät ab —
die Ergebnisse erscheinen in Echtzeit auf der Präsentationsfläche.

Gestaltet nach einem konservativen Corporate-Designsystem: Weiß dominiert, Corporate Red
nur als Akzent, Diagramme in Bordeaux, Frutiger-Schriftstapel, keine Rundungen, keine Verläufe.

## Funktionen

| Folientyp | Beschreibung |
|---|---|
| Multiple Choice | Eine oder mehrere Optionen (max. 8), Live-Balkendiagramm |
| Wortwolke | 1–3 Begriffe pro Person, Wolke wächst live |
| Offene Frage | Freitext-Antworten als Antwort-Wand (max. 5 pro Person) |
| Skala | Bewertung 1–5/6/7/10 mit Durchschnitt und Verteilung |
| Q&A | Publikum reicht Fragen ein und wählt sie hoch |
| Infofolie | Statischer Text ohne Interaktion |

Außerdem: Moderations-Steuerung (Folienwechsel, Abstimmung sperren, Ergebnisse ausblenden,
Antworten zurücksetzen), Live-Teilnehmerzähler, QR-Code für den Beitritt, Tastatursteuerung
im Präsentationsmodus (←/→, Esc), Persistenz über Neustarts.

**Ergebnisse nachträglich ansehen und exportieren:** Alle Antworten bleiben gespeichert —
der Moderationslink zeigt im Editor unter jeder Folie die Ergebnisse (live und nach der
Veranstaltung). Zwei Export-Formate, beide nach dem Corporate-Designsystem formatiert:

- **Excel-Export** (`.xlsx`, serverseitig ohne Fremdpakete erzeugt): Übersichtsblatt plus
  ein Blatt pro Folie — Arial, schwarze 0,75pt-Linien statt Gitternetz, warme Zebrastreifen,
  fixierte Kopfzeile, Autofilter, Summenzeilen mit 1pt-Linien.
- **PowerPoint-Export** (`.pptx`, clientseitig mit lokal gevendorter PptxGenJS-Bibliothek):
  16:9-Foliensatz mit Titel-/Übersichtsfolie und einer Folie pro Frage — roter Akzentbalken,
  Balken in Bordeaux (Führender in Rot), 1pt schwarze Achslinien, Wortwolke in der
  Markenfarb-Sequenz, Seitenzahlen und Quellzeile.

## Start

Voraussetzung: **Node.js ≥ 18** — sonst nichts. Keine npm-Pakete, kein Build-Schritt, keine externen Dienste.

```bash
node server.js            # Standard: Port 3000
PORT=8080 node server.js  # eigener Port
```

Dann im Browser `http://localhost:3000` öffnen:

1. **Präsentation erstellen** → Sie landen im Editor (der Moderationslink mit Token wird zusätzlich
   unter „Meine Präsentationen" im Browser gespeichert).
2. Folien anlegen — Änderungen werden automatisch gespeichert.
3. **Präsentieren** klicken → Vollbildmodus mit Live-Ergebnissen.
4. Das Publikum öffnet `http://<ihre-maschine>:3000` und gibt den Code ein —
   oder scannt den QR-Code (Kurz-URL `http://<ihre-maschine>:3000/<code>` funktioniert ebenfalls).

**Beitritt per Handy:** `localhost` funktioniert nur auf dem eigenen Rechner. Handys erreichen
den Server über die LAN-IP (gleiches WLAN vorausgesetzt) — der Presenter erkennt das selbst:
Ist er über `localhost` geöffnet, zeigen QR-Code und Beitrittszeile automatisch die
LAN-Adresse des Servers (`/api/server-info`). Beim ersten Start fragt macOS ggf., ob `node`
eingehende Verbindungen annehmen darf — zulassen. In Gäste-/Firmen-WLANs kann
Client-Isolation Verbindungen zwischen Geräten blockieren.

## Architektur

```
server.js            Zero-Dependency Node.js-Server (http, fs, crypto)
                     REST-API + Server-Sent Events (SSE) für Echtzeit
data/store.json      Persistenz (automatisch, atomisches Schreiben)
public/
  index.html         Startseite: beitreten / erstellen
  presenter.html     Editor + Vollbild-Präsentationsmodus
  vote.html          Publikums-Ansicht (mobile-first)
  common.js          API-Client, SSE-Reconnect, Ergebnis-Renderer
  pptx-export.js     PowerPoint-Export (Foliensatz im Corporate-Design)
  design-system.css  Corporate-Designsystem (Kopie aus dem Arbeitsordner)
  app.css            App-Styles auf Basis des Designsystems
  vendor/qrcode.js   QR-Generator (MIT, lokal — kein CDN)
  vendor/pptxgen.bundle.js  PptxGenJS 3.12 (MIT, lokal — kein CDN)
```

**Entscheidungen mit Blick auf restriktive Firmenumgebungen:**

- **Null Abhängigkeiten** — kein `npm install`, kein Zugriff auf npm-Registry nötig.
- **Keine externen Ressourcen** — keine CDNs, Fonts oder Tracker; alles wird vom eigenen Server ausgeliefert.
- **SSE statt WebSockets** — Server-Sent Events sind gewöhnliches HTTP und kommen deutlich
  zuverlässiger durch Corporate-Proxies und Firewalls; Heartbeat alle 25 s hält Verbindungen offen.
- **Frutiger-Schriftstapel** — ist die Hausschrift auf dem Rechner installiert, wird sie verwendet, sonst Helvetica/Arial.
- **Anonyme Teilnahme** — keine Anmeldung, keine personenbezogenen Daten; Teilnehmer erhalten
  nur eine zufällige Browser-ID (localStorage) zur Duplikat-Vermeidung.

## Sicherheit & Grenzen

- Moderations-Aktionen sind durch ein zufälliges Token geschützt (im Moderationslink enthalten —
  Link nicht weitergeben). Publikum kann ausschließlich antworten.
- Eingaben werden serverseitig begrenzt und clientseitig escaped (kein HTML-Injection über Antworten).
- Kein HTTPS eingebaut: Im Firmennetz hinter einen Reverse-Proxy (IIS/nginx/F5) mit TLS legen
  oder nur im vertrauten Netzsegment betreiben.
- Ein-Prozess-Design mit In-Memory-Zustand: bewusst einfach gehalten, für Meetings/Townhalls
  bis einige hundert Teilnehmende ausgelegt — nicht für mandantenfähigen Dauerbetrieb.
- „Meine Präsentationen" liegt im Browser-localStorage: Moderationslink sichern, wenn der
  Browserwechsel möglich sein soll.

## Windows (Arbeitsrechner)

Der Server nutzt ausschließlich Node-Built-ins und läuft unter Windows unverändert.

**Schnellstart:** Projektordner auf den Rechner kopieren und **`start.bat` doppelklicken** —
sie findet Node, startet den Server und öffnet den Browser. Anderer Port: `start.bat 8080`.

**Wenn Node.js fehlt (zwei Wege):**

1. *Mit Softwarekatalog:* Node.js LTS über das firmeninterne Software Center installieren
   (bei den meisten Banken als Entwicklerwerkzeug freigegeben) — oder von
   [nodejs.org](https://nodejs.org) per MSI-Installer.
2. *Ohne Admin-Rechte:* Auf nodejs.org das **„Windows Binary (.zip)"** herunterladen,
   entpacken und den Ordner als `node` neben die `start.bat` legen (so dass
   `node\node.exe` existiert). Die `start.bat` erkennt und benutzt ihn automatisch —
   keine Installation, keine Registry, keine Admin-Rechte.

**Damit Kolleginnen und Kollegen beitreten können:**

- Eigene IP ermitteln: `ipconfig` → „IPv4-Adresse" (z. B. `10.x.x.x`).
- Teilnehmende öffnen `http://<ihre-ip>:3000` — QR-Code und Beitrittszeile im Presenter
  zeigen die Adresse automatisch an.
- Beim ersten Start fragt die Windows-Firewall ggf. nach Freigabe für `node.exe` →
  „Zugriff zulassen". Erscheint kein Dialog (Gruppenrichtlinie), braucht es eine
  eingehende Regel — mit Admin-Rechten:
  `New-NetFirewallRule -DisplayName "PULS" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow`
  — sonst über IT anfragen oder die App auf einem internen Server betreiben.
- Handys im Gäste-WLAN erreichen einen Laptop im Firmen-LAN in der Regel **nicht**
  (Netztrennung). Realistisch im Firmenumfeld: Teilnehmende nutzen ihren Firmen-Laptop/-Browser,
  oder die App läuft auf einem internen Server, den beide Netze erreichen.

## Betrieb im Firmennetz

Realistischste Optionen, aufsteigend nach Aufwand:

1. **Lokal am eigenen Rechner** (Meetingraum/Townhall): `node server.js` starten, Teilnehmende
   im selben Netz verbinden sich über `http://<hostname>:3000`. Voraussetzung: Node.js ist
   installiert bzw. als genehmigte Software verfügbar und die lokale Firewall lässt den Port zu.
2. **Interner Server/VM**: Ordner kopieren, als Dienst starten (z. B. `systemd` oder Task Scheduler),
   Reverse-Proxy mit TLS und internem DNS-Namen davor — dann funktioniert auch der QR-Beitritt elegant.
3. **Interne Container-Plattform**: Das Projekt ist trivial containerisierbar
   (`FROM node:22-alpine`, `COPY . .`, `CMD ["node","server.js"]`, Volume für `./data`).

Vorher mit IT-Security klären (Shadow-IT-Richtlinien); da keine Daten das Haus verlassen und
keine Fremdpakete enthalten sind, ist die Prüfgrundlage überschaubar: ~600 Zeilen Server-Code,
vollständig lesbar.

## Screenshots

| | |
|---|---|
| ![Startseite](docs/screenshots/landing.png) | ![Editor](docs/screenshots/editor2.png) |
| ![Präsentation: Multiple Choice](docs/screenshots/present-choice.png) | ![Präsentation: Wortwolke](docs/screenshots/present-wordcloud.png) |
| ![Publikum: Abstimmen](docs/screenshots/vote-choice.png) | ![Präsentation: Skala](docs/screenshots/present-scale.png) |

## API (Kurzreferenz)

```
POST   /api/presentations                 { title } → { id, code, adminToken }
GET    /api/join/:code                    Präsentation per Code finden
GET    /api/presentations/:id             öffentlicher Snapshot (mit ?token= Admin-Vollansicht)
GET    /api/presentations/:id/stream      SSE-Livestream (?role=audience|presenter)
POST   /api/presentations/:id/answers     { slideId, participantId, value }
POST   /api/presentations/:id/upvote      { slideId, participantId, questionId }
GET    /api/presentations/:id/export.xlsx Ergebnisse als Excel-Datei (Admin)
PUT    /api/presentations/:id             Titel ändern (Admin)
PUT    /api/presentations/:id/slides      Folien ersetzen (Admin)
POST   /api/presentations/:id/state       { activeIndex, votingLocked, resultsHidden } (Admin)
POST   /api/presentations/:id/reset       Antworten löschen (Admin)
DELETE /api/presentations/:id             Präsentation löschen (Admin)
```
