# Quickstart-Guide nach dem A–D-Revamp aktualisieren

Stand: 6. Juli 2026 · betrifft `public/anleitung.html`, die 10 Screenshots unter `public/img/anleitung/` (+ `/en/`), und `public/anleitung.pdf` / `public/anleitung-en.pdf`

## Ziel

Der In-App-Quickstart (`anleitung.html`) zeigt noch die **alte UI** (Screenshots + Beschreibungen vor dem Redesign). Nach dem A–D-Revamp (Startseite/D, Präsentationsmodus/C, Abstimmen/B, Editor/A) stimmen weder die Bilder noch die Texte. Beides erneuern und die wichtigsten Neuerungen erklären.

## Nicht-Ziele

- Kein Servereingriff (`server.js` unverändert). Kein Umbau der Guide-Mechanik (bleibt selbst-enthaltend, zweisprachig, ein Screenshot je Schritt, PDF/Drucken/Zur-App).
- Keine neuen Abhängigkeiten. PDFs werden per Headless-Chrome „print-to-pdf" erzeugt (nur ein Build-Schritt, keine Runtime-Abhängigkeit).
- Keine Änderung der Datei-/Pfadstruktur: gleiche 5 Bildnamen (`01-start.png … 05-quiz.png`) in `public/img/anleitung/` (DE) und `public/img/anleitung/en/` (EN), damit `shotSrc()`/`SHOTS` in `anleitung.html` unverändert darauf zeigen.

## Bestand (Ground Truth)

- `anleitung.html` (207 Z.): `SHOTS = ['01-start.png','02-editor.png','03-praesentieren.png','04-abstimmen.png','05-quiz.png']`; `shotSrc(lang,file)` → DE `/img/anleitung/`, EN `/img/anleitung/en/`. Zwei Sprachblöcke (`de`/`en`) mit je `meta` + 5 `steps` (`h2`, `body` HTML, `cap`, `img`, optional `phone`). Schritt 4 (`abstimmen`) ist `phone: true`.
- 10 vorhandene Screenshots (5 DE + 5 EN) zeigen die alte UI. 2 vorgerenderte PDFs.

## Abschnitt 1 — 5 Schritte, neue Inhalte

Gerüst (5 Schritte) bleibt; Inhalte auf die neue UI + Neuerungen:

1. **Präsentation erstellen** (`01-start`) — neue Startseite: Beitreten dominant/zentriert, Erstellen als ruhiger Zweitweg. **Hinweiskasten „Zugang sichern"**: nach dem Erstellen den Moderationslink per Kopieren/QR/Mail sichern (neu; schützt vor Verlust, da der Link nur im Browser liegt).
2. **Folien anlegen — Typ-Galerie & Live-Vorschau** (`02-editor`) — 3-Spalten-Editor: Folientyp über die **Galerie** (9 Kacheln mit Icon + Erklärung, geöffnet über „+ Neue Folie"/„Typ ändern"); rechts die **Live-Handy-Vorschau**, die beim Tippen mitläuft. Einstellungen eingeklappt.
3. **Präsentieren — Beitritts-Bühne** (`03-praesentieren`) — Startzustand mit großem Code + QR + Live-Zähler; echte Zustands-Toggles (Ergebnisse/Abstimmung) + Status-Chips; Tastatur-Hinweise; ←/→ blättern.
4. **Das Publikum stimmt ab** (`04-abstimmen`, phone) — vereinheitlichtes Abstimmen: Antippen sendet **sofort**, Optionen morphen **an Ort und Stelle** zu Ergebnis-Balken (eigene Wahl markiert); mehrwertige Typen (Punkte/Ranking/Text) bestätigen über eine feste Leiste unten. Emoji-Reaktionen bleiben.
5. **Quiz mit Rangliste** (`05-quiz`) — Quiz mit Auflösung (richtige Antwort hervorgehoben) + 🏆-Rangliste (nutzt erfasste Namen); Auflösung erst per „Ergebnisse einblenden".

Texte (`h2`, `body`, `cap`) in **DE und EN** neu schreiben; Ton/Stil wie bisher.

## Abschnitt 2 — Screenshots (10, DE+EN)

Alle 10 neu aufnehmen, gleiche Namen/Pfade. Aufnahme **lokal** am laufenden Server über eine repräsentative Demo-Präsentation (Titel „Team-Meeting Juli"/„Team meeting July", Demo-Folien inkl. Multiple Choice, Skala und Quiz). Pro Sprache die App-Sprache umschalten; für die EN-Screenshots englische Demo-Inhalte. Aufnahme-Details:

- `01-start`: Startseite (Beitreten-Karte + „oder" + Erstellen-Karte).
- `02-editor`: 3-Spalten-Editor mit **geöffneter Typ-Galerie** (Overlay), sodass Galerie + Editor + Vorschau-Spalte gemeinsam sichtbar sind.
- `03-praesentieren`: Präsentationsmodus **Beitritts-Bühne** (großer Code, QR, Live-Zähler, „Los geht's").
- `04-abstimmen`: Handy-Ansicht des Publikums bei Multiple Choice **nach dem Antippen** (Optionen als Balken, eigene Wahl markiert) — zeigt „sofort senden + Ergebnis an Ort und Stelle".
- `05-quiz`: Präsentationsmodus-Quiz nach der Auflösung (richtige Antwort hervorgehoben) **mit Rangliste** — dafür ein paar Quiz-Stimmen + Namen seeden.

Konsistente Aufnahmegrößen (Editor/Präsentation bei Beamer-Breite ~1440; Publikum im Handy-Seitenverhältnis). Marken-Rot (#E60000), keine Fremd-Tabs im Bild.

## Abschnitt 3 — PDFs neu erzeugen

`anleitung.pdf` (DE) und `anleitung-en.pdf` (EN) aus dem aktualisierten `anleitung.html` per Headless-Chrome erzeugen: die Seite je Sprache laden (Sprache via `?lang=` bzw. Umschalter/localStorage), `--print-to-pdf` ohne Kopf-/Fußzeile, A4. Ergebnis prüfen (Screenshots + neue Texte enthalten, mehrseitig sauber).

## Abschnitt 4 — Datei-Umfang

Nur `public/anleitung.html` (Texte im `de`/`en`-Block), die 10 PNGs unter `public/img/anleitung/(en/)`, und die 2 PDFs. Kein Servereingriff; Design-System/Zweisprachigkeit unverändert.

## Randfälle

- Der Guide-Header verlinkt „PDF herunterladen" auf die statische PDF — nach Neu-Erzeugung stimmt sie automatisch (gleicher Pfad).
- EN-Screenshots: App-Sprache über den Sprachumschalter/`localStorage` (`puls.lang`) auf `en` setzen, damit die UI-Beschriftung Englisch ist.
- Präsentationsmodus geht in Vollbild — für den Screenshot ggf. ohne echtes Fullscreen (das Overlay `#presentMode` reicht als Bild).
- Quiz-Rangliste braucht erfasste Namen → Demo mit aktivierter Namenserfassung + einigen benannten Quiz-Antworten seeden.

## Verifikation

- `anleitung.html` lokal in DE und EN öffnen: alle 5 Schritte zeigen die **neuen** Screenshots; Texte beschreiben die neue UI + Neuerungen (Galerie, Vorschau, Zugang sichern, Beitritts-Bühne, Sofort-Senden); „Zur App"/„PDF"/„Drucken" funktionieren.
- Beide PDFs öffnen: enthalten die neuen Screenshots + Texte, sauber paginiert.
- `server.js` unverändert; keine Konsolenfehler.
