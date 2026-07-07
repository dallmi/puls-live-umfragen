# Quickstart-Guide-Aktualisierung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Screenshot capture and PDF rendering need an interactive browser session and human-eye framing judgement, so this plan is executed inline, not via fresh subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den In-App-Quickstart (`public/anleitung.html`) so aktualisieren, dass alle 10 Screenshots und alle DE/EN-Texte die nach dem A–D-Revamp bestehende UI zeigen und die wichtigsten Neuerungen erklären.

**Architecture:** Reines Content-/Asset-Update. `anleitung.html` behält sein Gerüst (5 Schritte, 2 Sprachblöcke `de`/`en`, ein Screenshot je Schritt, `features[]` + `tip`, `SHOTS`/`shotSrc` unverändert). Neu sind: (1) 10 Screenshots derselben Dateinamen aus der aktuellen UI, aufgenommen am laufenden lokalen Server über eine Demo-Präsentation; (2) neu geschriebene `h2`/`body`/`cap` je Schritt in DE und EN; (3) zwei per Headless-Chrome neu erzeugte PDFs. Kein Servereingriff.

**Tech Stack:** Vanilla HTML/CSS/JS (Zero-Dependency), Node `server.js` (Port 3000), Playwright-/chrome-devtools-MCP für Aufnahme + Interaktion, Headless-Chrome „print-to-pdf" für die PDFs.

## Global Constraints

- Kein Servereingriff: `server.js`, `api/index.js` unverändert. Keine neuen Abhängigkeiten.
- Gleiche 5 Bildnamen `01-start.png · 02-editor.png · 03-praesentieren.png · 04-abstimmen.png · 05-quiz.png` in `public/img/anleitung/` (DE) und `public/img/anleitung/en/` (EN). `SHOTS`, `shotSrc()`, das `steps[]`-Schema (`h2`, `body`, `cap`, `img`, optional `phone`) bleiben unverändert.
- Nur diese Dateien ändern sich: `public/anleitung.html`, die 10 PNGs, `public/anleitung.pdf`, `public/anleitung-en.pdf`.
- Design-System strikt: Marken-Rot `#E60000` nur als Akzent, Radius 2px, keine Fremd-Browser-Tabs/Adressleisten mit Klartext-URLs im Bild, keine ALL-CAPS/Verläufe. Ton/Stil der Texte wie bisher (Sie-Form DE, sachlich).
- Nur **implementierte** Funktionen zeigen. Die MC-Diagrammtypen (bars/donut/pie/dots) sind nur eine Spec und **nicht** im Code — nicht abbilden.
- Schritt 4 (`abstimmen`) bleibt `phone: true`. Aufnahmegrößen: Editor/Präsentation ~1440 px breit, Publikum im Handy-Seitenverhältnis (~390×844).

---

## Datei-Struktur

- `public/anleitung.html` — einzige Code-Datei. Betroffen: die beiden `GUIDE.de.steps[]` / `GUIDE.en.steps[]` (je 5 Objekte `h2`/`body`/`cap`), sowie geprüft (ggf. minimal angepasst) `features[]` und `tip`. `SHOTS`, `shotSrc`, `render()`, Kopf-/Fußzeile bleiben unangetastet.
- `public/img/anleitung/*.png` (5 DE) + `public/img/anleitung/en/*.png` (5 EN) — komplett neu aufgenommen.
- `public/anleitung.pdf` (DE) + `public/anleitung-en.pdf` (EN) — neu gerendert aus dem aktualisierten `anleitung.html`.

## Demo-Inhalte (Ground Truth für alle Aufnahmen)

**DE-Demo** — Titel „Team‑Meeting Juli", Namenserfassung **an**, Akzent Marken-Rot, kein Logo. Folien:
1. **Multiple Choice** — „Wie ist die Stimmung im Team heute?" · Optionen: „Super 🚀", „Gut", „Geht so", „Müde".
2. **Skala** — „Wie gut lief das letzte Quartal?" · min 1 / max 5 · Labels „Schwach" … „Top".
3. **Quiz** — „In welchem Jahr wurde unser Team gegründet?" · Optionen „2019", „2020", „2021", „2022" · richtig: **2021**.

**EN-Demo** — Titel „Team meeting July", name collection **on**. Folien:
1. **Multiple Choice** — „How is the team feeling today?" · „Great 🚀", „Good", „So‑so", „Tired".
2. **Scale** — „How did last quarter go?" · 1…5 · „Weak" … „Top".
3. **Quiz** — „What year was our team founded?" · „2019", „2020", „2021", „2022" · correct: **2021**.

---

## Task 1: Server starten, DE-Demo bauen, Seed-Stimmen setzen

**Files:** keine Code-Änderung — erzeugt Laufzeit-Zustand + notiert `id`/`token` für die Aufnahmen.

- [ ] **Step 1: Server starten (Hintergrund)**

```bash
cd /Users/micha/Documents/Claude/Mentimeter && node server.js
```
Erwartung: Server lauscht auf `http://localhost:3000`. Prüfen: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → `200`.

- [ ] **Step 2: DE-Demo-Präsentation anlegen**

Über den Browser (`/`) „Team‑Meeting Juli" erstellen ODER direkt per API. Endpunkte vorher aus `server.js` verifizieren (`grep -n "app.post" server.js`). `id` **und** `token` aus der Präsentator-URL notieren — sie werden in Task 2/3 gebraucht.

- [ ] **Step 3: Die 3 Demo-Folien anlegen** (MC, Skala, Quiz) mit den DE-Inhalten oben; beim Quiz „2021" als richtig markieren; **Namenserfassung aktivieren** (Präsentationsoption). Automatisches Speichern abwarten.

- [ ] **Step 4: Ein paar benannte Quiz-Stimmen seeden** (für die 🏆-Rangliste in Schritt 5)

Genaue Vote-Endpunkte aus `server.js` ableiten (`grep -n "vote\|/answer\|name" server.js`). 3–4 Teilnehmer mit Namen (z. B. „Mara", „Jonas", „Lena", „Tim") auf die Quiz-Folie antworten lassen — teils richtig (2021), teils falsch — entweder über mehrere `vote.html`-Sitzungen oder direkte POSTs. Ergebnis: Rangliste mit ≥3 benannten Einträgen.

- [ ] **Step 5: Verifizieren**

Präsentator-Editor öffnen (`presenter.html?id=…&token=…`): 3 Folien sichtbar, Quiz hat eine markierte richtige Antwort, Namenserfassung an. Quiz-Ergebnis zeigt ≥3 Namen. **Kein Commit** (nur Laufzeit-Zustand).

---

## Task 2: Die 5 DE-Screenshots aufnehmen

**Files:**
- Overwrite: `public/img/anleitung/01-start.png … 05-quiz.png`

App-Sprache = **DE** (Standard). Vor jeder Aufnahme sicherstellen, dass keine Fremd-Browser-Chrome/Adressleiste mit Klartext-URL im Bild ist (nur der App-Viewport). Aufnahme via chrome-devtools-/Playwright-MCP am laufenden Server.

- [ ] **Step 1: `01-start.png`** — Viewport 1440×900, navigieren zu `http://localhost:3000/`. Aufnahme der neuen Startseite: **Beitreten zentral/dominant**, „Neue Präsentation" als ruhiger Zweitweg. Screenshot des App-Bereichs (nicht des Browserfensters).

- [ ] **Step 2: `02-editor.png`** — Viewport 1440×900, `presenter.html?id=…&token=…`, MC-Folie ausgewählt mit getippter Frage+Optionen, sodass die **Live-Handy-Vorschau rechts** gefüllt ist. **Zuerst das Overlay-Verhalten der Typ-Galerie prüfen** (öffnen über „+ Neue Folie"/„Typ ändern"): Ist sie ein modaler Overlay, der den Editor verdeckt, dann die Galerie so aufnehmen, dass die **9 Kacheln** klar lesbar sind (Kernneuerung). Komponiert das Overlay so, dass Editor + Vorschau mit sichtbar bleiben, diese Fassung wählen. Ziel: Neuheit „Galerie + mitlaufende Vorschau" ist erkennbar.

- [ ] **Step 3: `03-praesentieren.png`** — Viewport 1440×900, im Editor „Präsentieren" klicken → **Beitritts-Bühne** (großer Zugangscode, QR, Live-Zähler, „Los geht's"). Kein echtes Fullscreen nötig — das `#presentMode`-Overlay als Bild reicht. Aufnahme.

- [ ] **Step 4: `04-abstimmen.png`** — Präsentator im Präsentationsmodus auf **MC-Folie** (Folie 1), Abstimmung offen. In separater Handy-Sitzung `vote.html` beitreten (Code aus der Bühne), Viewport **390×844**, eine Option **antippen**, sodass die Optionen **an Ort und Stelle zu Ergebnis-Balken morphen** und die **eigene Wahl markiert** ist. (2–3 zusätzliche Stimmen für schönere Balken.) Aufnahme der Handy-Ansicht **nach** dem Antippen.

- [ ] **Step 5: `05-quiz.png`** — Präsentator im Präsentationsmodus auf die **Quiz-Folie** wechseln (Seed-Stimmen aus Task 1 vorhanden), **„Ergebnisse einblenden"** klicken → richtige Antwort **grün hervorgehoben** + **🏆-Rangliste** mit Namen. Viewport 1440×900, Aufnahme des Präsentations-Overlays.

- [ ] **Step 6: Sichtprüfung** aller 5 PNGs (Größe/Lesbarkeit, Marken-Rot, keine Fremd-Tabs). Dateien liegen unter `public/img/anleitung/`. Neu-Auf­nahme einzelner Shots bei Bedarf.

---

## Task 3: EN-Demo bauen und die 5 EN-Screenshots aufnehmen

**Files:**
- Overwrite: `public/img/anleitung/en/01-start.png … 05-quiz.png`

- [ ] **Step 1: App-Sprache auf EN schalten** — über den Sprachumschalter der App bzw. `localStorage['puls.lang']='en'`, damit alle UI-Beschriftungen Englisch sind.

- [ ] **Step 2: EN-Demo „Team meeting July"** analog Task 1 anlegen (3 Folien mit den EN-Inhalten, Quiz richtig=2021, name collection on) und **benannte Quiz-Stimmen** seeden (z. B. „Mara", „Noah", „Ava", „Sam").

- [ ] **Step 3: Die 5 EN-Shots** exakt wie Task 2 Steps 1–5 aufnehmen, aber gegen die EN-Demo und mit englischer UI; speichern unter `public/img/anleitung/en/` (gleiche Dateinamen).

- [ ] **Step 4: Sichtprüfung** aller 5 EN-PNGs: englische UI-Beschriftung, gleiche Bildzustände wie DE.

---

## Task 4: DE- und EN-Texte in `anleitung.html` neu schreiben

**Files:**
- Modify: `public/anleitung.html` — `GUIDE.de.steps[]` und `GUIDE.en.steps[]` (je 5 `h2`/`body`/`cap`); `features[]`/`tip` prüfen und nur bei Widerspruch zur neuen UI anpassen.

**Interfaces:** `SHOTS`, `shotSrc()`, `render()`, das `steps[]`-Schema (`h2`,`body`,`cap`,`img`,`phone`) bleiben unverändert; nur die Stringwerte werden ersetzt.

- [ ] **Step 1: DE Schritt 1 ersetzen** (`img:0`)
  - `h2`: `Präsentation erstellen`
  - `body`: `<p>Auf der Startseite steht das <b>Beitreten</b> im Mittelpunkt (für das Publikum). Ihren eigenen Einstieg finden Sie darunter unter <b>„Neue Präsentation erstellen"</b>: Titel eingeben, auf <b>Erstellen</b> klicken — Sie erhalten sofort einen privaten Moderationslink und einen sechsstelligen Zugangscode.</p><ul><li><b>Zugang sichern:</b> Der Moderationslink liegt nur in Ihrem Browser. Sichern Sie ihn direkt nach dem Erstellen per <b>Kopieren, QR‑Code oder E‑Mail</b>, damit Sie ihn nicht verlieren.</li><li>Ihre Präsentationen erscheinen auf demselben Gerät wieder unter <b>„Meine Präsentationen"</b>.</li></ul>`
  - `cap`: `Startseite — Beitreten steht im Mittelpunkt, „Neue Präsentation" ist der ruhige Zweitweg.`

- [ ] **Step 2: DE Schritt 2 ersetzen** (`img:1`)
  - `h2`: `Folien anlegen — Typ‑Galerie & Live‑Vorschau`
  - `body`: `<p>Der Editor hat drei Spalten: links die <b>Folienliste</b> (ziehen zum Sortieren), in der Mitte die Folie, rechts eine <b>Live‑Handy‑Vorschau</b>, die beim Tippen mitläuft. Über <b>„+ Neue Folie"</b> oder <b>„Typ ändern"</b> öffnet sich die <b>Typ‑Galerie</b> — 9 Kacheln mit Icon und kurzer Erklärung:</p><ul><li><b>Multiple Choice</b> · <b>Wortwolke</b> · <b>Offene Frage</b> · <b>Skala</b></li><li><b>Ranking</b> · <b>100 Punkte</b> · <b>Quiz</b> (mit richtiger Antwort)</li><li><b>Q&amp;A</b> (Fragen aus dem Publikum mit 👍) · <b>Infofolie</b></li></ul><p>Feineinstellungen sind eingeklappt und lassen sich bei Bedarf aufklappen. Alles wird automatisch gespeichert.</p>`
  - `cap`: `Editor — Typ‑Galerie mit 9 Kacheln, links die Folienliste, rechts die mitlaufende Handy‑Vorschau.`

- [ ] **Step 3: DE Schritt 3 ersetzen** (`img:2`)
  - `h2`: `Präsentieren — die Beitritts‑Bühne`
  - `body`: `<p>Klicken Sie oben rechts auf <b>Präsentieren</b>. Zuerst erscheint die <b>Beitritts‑Bühne</b>: großer Zugangscode, QR‑Code und ein <b>Live‑Zähler</b>, der zeigt, wie viele schon dabei sind. Sobald genug Leute da sind, starten Sie mit <b>„Los geht's"</b>.</p><ul><li>Mit <b>← / →</b> (oder den Pfeiltasten) wechseln Sie die Folie; Tastatur-Hinweise sind eingeblendet.</li><li><b>Ergebnisse</b> und <b>Abstimmung</b> schalten Sie über echte Zustands‑Umschalter mit Status‑Chips ein und aus.</li></ul>`
  - `cap`: `Präsentationsmodus — Beitritts‑Bühne mit großem Code, QR und Live‑Zähler.`

- [ ] **Step 4: DE Schritt 4 ersetzen** (`img:3`, `phone:true` bleibt)
  - `h2`: `Das Publikum stimmt ab`
  - `body`: `<p>Die Teilnehmenden öffnen die angezeigte Adresse (oder scannen den QR‑Code) und geben den Code ein. Das Antworten ist überall gleich: Ein <b>Antippen sendet sofort</b> — die Optionen <b>morphen an Ort und Stelle</b> zu Ergebnis‑Balken, die eigene Wahl ist markiert. Ändern ist möglich, solange die Abstimmung offen ist.</p><ul><li>Mehrwertige Typen (<b>100 Punkte</b>, <b>Ranking</b>, <b>Offene Frage</b>) bestätigen über eine feste Leiste unten.</li><li>Ganz unten kann das Publikum zusätzlich mit <b>Emojis</b> reagieren.</li></ul>`
  - `cap`: `Handy‑Ansicht nach dem Antippen — die Optionen werden an Ort und Stelle zu Ergebnis‑Balken, die eigene Wahl ist markiert.`

- [ ] **Step 5: DE Schritt 5 ersetzen** (`img:4`)
  - `h2`: `Quiz mit Rangliste`
  - `body`: `<p>Beim Folientyp <b>Quiz</b> markieren Sie die richtige Antwort. Schnelle und richtige Antworten geben mehr Punkte. Erst wenn Sie <b>„Ergebnisse einblenden"</b> klicken, erscheint die Auflösung: die richtige Antwort wird <b>grün hervorgehoben</b> und darunter zeigt eine <b>🏆 Rangliste</b> die Führenden (dafür die <b>Namenserfassung</b> aktivieren).</p>`
  - `cap`: `Quiz nach der Auflösung — richtige Antwort grün hervorgehoben, darunter die Rangliste.`

- [ ] **Step 6: EN Schritt 1 ersetzen** (`img:0`)
  - `h2`: `Create a presentation`
  - `body`: `<p>On the start page, <b>joining</b> takes centre stage (for your audience). Your own entry point sits below under <b>„Create a new presentation"</b>: enter a title, click <b>Create</b> — you immediately get a private presenter link and a six‑digit access code.</p><ul><li><b>Secure your access:</b> the presenter link lives only in your browser. Right after creating, save it via <b>copy, QR code or email</b> so you don't lose it.</li><li>Your presentations reappear on the same device under <b>„My presentations"</b>.</li></ul>`
  - `cap`: `Start page — joining takes centre stage, „New presentation" is the calm secondary path.`

- [ ] **Step 7: EN Schritt 2 ersetzen** (`img:1`)
  - `h2`: `Build your slides — type gallery & live preview`
  - `body`: `<p>The editor has three columns: the <b>slide list</b> on the left (drag to reorder), the slide in the middle, and a <b>live phone preview</b> on the right that follows your typing. <b>„+ New slide"</b> or <b>„Change type"</b> opens the <b>type gallery</b> — 9 tiles with an icon and a short explanation:</p><ul><li><b>Multiple Choice</b> · <b>Word Cloud</b> · <b>Open Question</b> · <b>Scale</b></li><li><b>Ranking</b> · <b>100 Points</b> · <b>Quiz</b> (with a correct answer)</li><li><b>Q&amp;A</b> (audience questions with 👍) · <b>Info slide</b></li></ul><p>Fine settings are collapsed and expand when you need them. Everything is saved automatically.</p>`
  - `cap`: `Editor — type gallery with 9 tiles, slide list on the left, live phone preview on the right.`

- [ ] **Step 8: EN Schritt 3 ersetzen** (`img:2`)
  - `h2`: `Present — the join stage`
  - `body`: `<p>Click <b>Present</b> in the top right. First comes the <b>join stage</b>: a large access code, a QR code and a <b>live counter</b> of how many people are already in. Once enough have joined, start with <b>„Let's go"</b>.</p><ul><li>Use <b>← / →</b> (or the arrow keys) to change slides; keyboard hints are shown.</li><li>Toggle <b>results</b> and <b>voting</b> with real state switches and status chips.</li></ul>`
  - `cap`: `Presentation mode — join stage with a large code, QR and a live counter.`

- [ ] **Step 9: EN Schritt 4 ersetzen** (`img:3`, `phone:true` bleibt)
  - `h2`: `The audience votes`
  - `body`: `<p>Participants open the shown address (or scan the QR code) and enter the code. Answering is the same everywhere: a <b>tap sends immediately</b> — the options <b>morph in place</b> into result bars, with your own choice marked. You can change your answer while voting is open.</p><ul><li>Multi‑value types (<b>100 Points</b>, <b>Ranking</b>, <b>Open Question</b>) confirm via a fixed bar at the bottom.</li><li>At the very bottom the audience can also react with <b>emojis</b>.</li></ul>`
  - `cap`: `Phone view after tapping — the options morph in place into result bars, your own choice marked.`

- [ ] **Step 10: EN Schritt 5 ersetzen** (`img:4`)
  - `h2`: `Quiz with a leaderboard`
  - `body`: `<p>With the <b>Quiz</b> slide type you mark the correct answer. Fast, correct answers earn more points. Only when you click <b>„Show results"</b> does the reveal appear: the correct answer is <b>highlighted green</b> and a <b>🏆 leaderboard</b> below shows the frontrunners (enable <b>name collection</b> for this).</p>`
  - `cap`: `Quiz after the reveal — correct answer highlighted green, leaderboard below.`

- [ ] **Step 11: `features[]`/`tip` prüfen** — beide Sprachen: die Einträge (Branding, Namen erfassen, Selbststeuerung, Q&A‑Moderation, Reaktionen, Trends über Sitzungen, Export, Anonym) stimmen weiter mit der aktuellen UI überein → **unverändert lassen**, sofern kein Widerspruch. Kein erfundener Eintrag.

- [ ] **Step 12: `node --check`** auf dem extrahierten Inline-Script von `anleitung.html`, um Syntaxfehler im geänderten Objektliteral auszuschließen.

```bash
cd /Users/micha/Documents/Claude/Mentimeter
node -e "const fs=require('fs');const h=fs.readFileSync('public/anleitung.html','utf8');const m=h.match(/<script>\n'use strict'[\s\S]*?<\/script>/);require('fs').writeFileSync('/private/tmp/claude-501/-Users-micha-Documents-Claude-Mentimeter/03369ff0-0a35-4a47-8f38-0cffbbf6b3f5/scratchpad/anleitung-inline.js', m[0].replace(/<\/?script>/g,''));" && node --check /private/tmp/claude-501/-Users-micha-Documents-Claude-Mentimeter/03369ff0-0a35-4a47-8f38-0cffbbf6b3f5/scratchpad/anleitung-inline.js && echo OK
```
Erwartung: `OK` (keine Syntaxfehler).

- [ ] **Step 13: Im Browser DE und EN öffnen** (`http://localhost:3000/anleitung.html` und `?lang=en`): alle 5 Schritte zeigen die **neuen** Screenshots und die **neuen** Texte; Sprachumschalter, „PDF"/„Drucken"/„Zur App" funktionieren; keine Konsolenfehler.

---

## Task 5: Beide PDFs neu erzeugen

**Files:**
- Overwrite: `public/anleitung.pdf`, `public/anleitung-en.pdf`

- [ ] **Step 1: DE-PDF rendern** — Headless-Chrome „print-to-pdf" der Seite `http://localhost:3000/anleitung.html?lang=de` nach `public/anleitung.pdf`, A4, ohne Kopf-/Fußzeile, mit Hintergründen. Bekanntes robustes Rezept: eigenes `--user-data-dir` je Lauf + `timeout`-Wächter (kein blankes `--virtual-time-budget`, das hängt).

```bash
cd /Users/micha/Documents/Claude/Mentimeter
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROF=$(mktemp -d)
timeout 60 "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --user-data-dir="$PROF" \
  --print-to-pdf="public/anleitung.pdf" \
  "http://localhost:3000/anleitung.html?lang=de"
echo "exit=$?"; ls -la public/anleitung.pdf
```
Erwartung: `exit=0`, PDF neu geschrieben (aktuelles Datum, plausible Größe > 300 KB).

- [ ] **Step 2: EN-PDF rendern** — dasselbe mit `?lang=en` nach `public/anleitung-en.pdf`.

```bash
cd /Users/micha/Documents/Claude/Mentimeter
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROF=$(mktemp -d)
timeout 60 "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --user-data-dir="$PROF" \
  --print-to-pdf="public/anleitung-en.pdf" \
  "http://localhost:3000/anleitung.html?lang=en"
echo "exit=$?"; ls -la public/anleitung-en.pdf
```
Erwartung: `exit=0`, PDF neu geschrieben.

- [ ] **Step 3: PDFs sichten** — beide öffnen (oder erste Seiten als Bild rendern): enthalten die **neuen** Screenshots + Texte, sauber mehrseitig, richtige Sprache. Bei Bedarf `--no-pdf-header-footer`/Seitenränder anpassen und neu rendern.

---

## Task 6: Verifikation & Commit

**Files:** keine weiteren Änderungen.

- [ ] **Step 1: Gesamt-Sichtprüfung** — `anleitung.html` in DE und EN: 5 neue Screenshots + 5 neue Texte je Sprache; Handy-Shot (Schritt 4) korrekt schmal; „PDF" verlinkt je Sprache auf die richtige (frisch erzeugte) Datei.

- [ ] **Step 2: `git status` / `git diff --stat`** — nur erwartete Dateien geändert: `public/anleitung.html`, 10 PNGs, 2 PDFs. `server.js`/`api/` unverändert.

- [ ] **Step 3: Commit**

```bash
cd /Users/micha/Documents/Claude/Mentimeter
git add public/anleitung.html public/img/anleitung public/anleitung.pdf public/anleitung-en.pdf
git commit -m "Update Quickstart guide for the A–D UI revamp (new screenshots + text, DE/EN)"
```

- [ ] **Step 4: Server stoppen** (Hintergrundprozess beenden).

---

## Self-Review (Plan gegen Spec)

- **Spec-Abdeckung:** Spec-Abschnitt 1 (5 Schritte neue Inhalte) → Task 4 Steps 1–10 (DE+EN, exakte Strings). Spec-Abschnitt 2 (10 Screenshots) → Tasks 1–3. Spec-Abschnitt 3 (PDFs) → Task 5. Spec-Abschnitt 4 (Datei-Umfang) → Global Constraints + Task 6 Step 2. Randfälle (PDF-Link automatisch korrekt; EN via `puls.lang`; Präsentation ohne echtes Fullscreen; Quiz-Rangliste braucht Namen) → in Tasks 1/2/3/5 adressiert. Zusatz aus jüngster Nutzer-Anweisung (nur implementierte Features; MC-Diagrammtypen sind Spec-only) → Global Constraints.
- **Platzhalter:** keine „TBD/TODO"; alle Texte als fertige Strings, alle Aufnahme-/Render-Kommandos konkret. Einzige bewusste Live-Entscheidung: die genaue Bildkomposition von `02-editor` (Overlay-Verhalten der Galerie) — in Task 2 Step 2 als zu prüfender Schritt mit klarem Ziel formuliert, kein offener Platzhalter.
- **Konsistenz:** `img`-Indizes 0–4 entsprechen `SHOTS`-Reihenfolge; `phone:true` nur Schritt 4; Dateinamen/Pfade identisch DE vs. `/en/`; `SHOTS`/`shotSrc`/`render()` unverändert.
