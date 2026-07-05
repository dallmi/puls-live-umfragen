# Mockup B — Abstimmen vereinheitlicht (V1–V5, Ü1)

Stand: 5. Juli 2026 · Grundlage: UX-Audit `docs/ux-review/`, Mockup B · betrifft `public/vote.html`

## Ziel

Das Publikums-Abstimmen (`public/vote.html`) auf ein **einheitliches Interaktionsmodell** bringen und fünf weitere Befunde lösen:

- **V1 (Hoch) — Jeder Folientyp folgt einer anderen Abstimm-Logik.** Skala sendet sofort; Choice/Punkte/Ranking verlangen „Abstimmen"; Quiz sperrt nach einer Antwort. Wer eine Präsentation durchläuft, lernt drei verschiedene Regeln.
- **V2 (Mittel) — Ergebnis landet unter der Falz.** Nach dem Voten erscheint „Live-Ergebnis" als separater Block (`#resultsBlock`) unter Formular und Bestätigung — auf dem Handy scrollen.
- **V3 (Mittel) — Touch-Ziele unter 44 px.** Ranking-Pfeile ~30×20 px, Punkte-Stepper ~34 px.
- **V4 (Niedrig) — 100 Punkte in 5er-Tipps.** Bis zu 20 Taps pro Option über +/–-Stepper.
- **V5 (Niedrig) — „Gesperrt" lässt die Folie verschwinden.** Beim Sperren wird die `switch` übersprungen (`vote.html:205`), die Optionen verschwinden, nur ein gelber Hinweis bleibt — wirkt wie ein Fehler.
- **Ü1 (Mittel) — Sehr kleine Schriftgrade** (~11 px / 0,68–0,7 rem) bei gemischtem Publikum.

## Nicht-Ziele

- **Kein Servereingriff.** `server.js` bleibt unverändert. Wichtig: `applyAnswer` **ersetzt** eine erneute Antwort desselben Teilnehmers bereits für choice/scale/points/ranking (`server.js:1399/1425/1441/1453`), und Quiz ist bereits einmalig (`already_answered`, `:1457`). „Ändern jederzeit" ist damit rein clientseitig machbar.
- **Kein „sofortSenden"-Umschalter** als Produktionseinstellung (war ein Prototyp-Vergleich im Mockup). Wir committen auf das Modell.
- Keine neuen Abhängigkeiten (Zero-Dependency), kein Test-Runner.
- Keine Änderung am Editor/Moderation/Präsentationsmodus. Andere Mockups (A/C/D) nicht im Umfang.

## Bestand (Ground Truth)

- `renderVote` (`vote.html` ~:190–244): Frage → bei `votingLocked` nur `.vote-locked`-Notiz, **`switch` wird komplett übersprungen** → keine Optionen. `#voteForm` + per-Typ `buildChoice/buildWordcloud/buildOpen/buildScale/buildPoints/buildRanking/buildQuiz/buildQa`. Danach separater `#resultsBlock` (hidden), den `showResults()` einblendet.
- Sende-Verhalten heute: `scale` sendet sofort beim Antippen (`:496`); `choice` (Auswahl-Array + Button `:327`), `points` (+/–-Stepper STEP=5 + Button `:566`), `ranking` (▲▼ + Button `:613`), `quiz` (Button, dann `already_answered` `:377`), `wordcloud`/`open` (Text + Button). `submit(value,onOk,onErr)` `:289` → `POST /api/presentations/:id/answers`.
- Helfer: `renderResults(container, slide, results, opts)` in `common.js:206` (mit `renderChoice/renderScale/renderPoints/renderRanking/…`), `markVoted`/`votedStore` (localStorage der eigenen Stimmen), `submittedNote`, `showResults`.
- Kleine Schriftgrößen: `.help` u. a. bei ~0.7 rem (Ü1).

## Abschnitt 1 — Einheitliches Sende-Modell (V1)

Drei Regeln, per Typ:

- **Sofort senden** — `choice` (nur wenn *nicht* Mehrfachauswahl) und `scale`: Antippen einer Option → `submit(...)` sofort; der Server ersetzt die vorherige Stimme. Eigene Wahl markiert; erneutes Antippen ändert sie. **Kein Bestätigen-Button.**
- **Feste Bestätigen-Leiste (min 48 px)** — `choice` (Mehrfachauswahl), `points`, `ranking`, `wordcloud`, `open`: die Eingabe wird zusammengestellt und über eine **unten fixierte Leiste** `.vote-confirm-bar` gesendet (ersetzt die verstreuten Inline-Buttons). Die Leiste zeigt den Primär-Button (z. B. „Abstimmen" / „Senden") und ist bei leerer/ungültiger Eingabe deaktiviert.
- **Quiz** — behält bewusst **Bestätigen + Endgültigkeit** (server-seitig einmalig). Klar als Ausnahme gekennzeichnet (Hinweistext „einmalige Antwort").

Die Umschaltung (single-choice → sofort statt Button) und die gemeinsame Leiste werden in `renderVote`/den `build*`-Funktionen umgesetzt.

## Abschnitt 2 — In-Place-Morph (V2)

- Für **balkenfähige** Typen (`choice`, `scale`, `points`, `ranking`) morphen nach der Stimme die Optionen **an Ort und Stelle** zu Live-Ergebnis-Balken — über `renderResults(...)` in denselben `#voteForm`-Bereich gerendert (nicht als separater Block darunter), **eigene Wahl hervorgehoben** (Opt-Flag an `renderResults`/`renderChoice`).
  - `choice` (single) / `scale`: die Balken bleiben **antippbar zum Ändern** — ein Tap sendet neu und re-rendert.
  - `choice` (multi) / `points` / `ranking`: nach dem Bestätigen Balken **+ „Ändern"**-Aktion, die die Eingabe wieder öffnet.
- **Texttypen** (`wordcloud`, `open`, `qa`) behalten ihr Board (Wortwolke / Antwortliste / Q&A) — dort gibt es keine Options-Balken.
- Der separate `#resultsBlock` entfällt für balkenfähige Typen (Morph ersetzt ihn); für Texttypen bleibt er.
- **„Ergebnisse ausgeblendet"** des Moderators (`resultsHidden`) wird wie heute respektiert: dann keine Balken, sondern eine dezente Bestätigung „Deine Stimme zählt" (kein Ergebnis).

## Abschnitt 3 — Sichtbarer Sperr-Zustand (V5)

- Beim Sperren (`votingLocked`) werden die Optionen/Balken **weiterhin gebaut, aber ausgegraut/deaktiviert** dargestellt, mit einem **Overlay-Chip „Abstimmung gesperrt"** — statt die `switch` zu überspringen. Strukturell: `renderVote` baut den Typ auch im gesperrten Zustand und setzt einen `locked`-Modus (Eingaben `disabled`, kein Senden, Chip sichtbar). Hat der Teilnehmer bereits abgestimmt, zeigt der gesperrte Zustand die Ergebnis-Balken (ausgegraut) mit Chip.

## Abschnitt 4 — Ranking-Drag (V3) + Punkte-Slider (V4) + 44-px-Ziele

- **Ranking:** Neuordnen per **Drag-Handle** (Pointer/Touch, `pointer`-Events), die ▲▼-Buttons bleiben als Fallback. Alle Bedienelemente ≥ 44 px.
- **Punkte:** die +/–-Stepper werden durch **einen Slider je Option** (`<input type=range>` mit `step=5`) plus einen sichtbaren **Rest-Budget-Balken** ersetzt; die Summe wird auf `total` (z. B. 100) begrenzt (Überschuss verhindern). Balken zeigt „X von 100 übrig".
- Generell: alle interaktiven Ziele in `vote.html` ≥ 44 px (Skala-Buttons, Choice-Optionen, Slider-Thumb-Trefferfläche).

## Abschnitt 5 — Schriftgrößen (Ü1)

- Publikumsseitige Meta-/Hilfetexte von ~11 px (~0.7 rem) auf **min ~13 px** (~0.82 rem) anheben; Hierarchie über Farbe/Gewicht statt Kleinheit. Betrifft `.help`, `.vote-*`-Metazeilen, Rest-/Hinweiszeilen.

## Abschnitt 6 — Struktur, Stil, i18n

- Betroffen: `public/vote.html` (Markup/Script — größter Teil), `public/app.css` (Sende-Leiste, Morph-Balken im Formular, Slider, Drag-Handles, Sperr-Chip, Schriftgrößen), `public/i18n.js` (neue Keys DE+EN, z. B. `vote.change` „Ändern", `vote.locked.chip`, Slider-/Budget-Texte), und **ggf. eine kleine Ergänzung an `renderResults`/`renderChoice` in `public/common.js**, um die eigene Wahl in den Morph-Balken zu markieren (nur additiv, per Opt-Flag).
- **Kein Servereingriff.** Design-System strikt (Rot `--primary #E60000` nur Akzent, Radius 2 px, kein Verlauf, kein ALL-CAPS). Wiederverwendung `renderResults`, `submit`, `markVoted`/`votedStore`.
- Da `vote.html` schon groß ist und dieser Umbau umfangreich: die `build*`-Funktionen fokussiert halten; gemeinsame Muster (Sende-Leiste, Morph, Sperr-Overlay) in kleine Helfer ziehen statt pro Typ zu duplizieren.

## Randfälle

- **Ändern nach Sofort-Senden:** erneutes Antippen sendet neu; der Server ersetzt — keine Doppelzählung (bestätigt in `applyAnswer`). Optimistisches Markieren + Rollback bei Fehler.
- **Quiz** bleibt einmalig; „Ändern" gibt es dort nicht (Ausnahme klar beschriftet).
- **Sperren während der Eingabe** (vor dem Senden bei Mehrwert-Typen): Eingabe einfrieren, Chip zeigen, nicht gesendete Auswahl bleibt sichtbar (ausgegraut).
- **`resultsHidden`**: kein Morph zu Balken; stattdessen Bestätigung ohne Ergebnis.
- **Selbststeuerung/Namensabfrage** (`selfPaced`, Namensgate) bleiben unverändert und mit dem neuen Modell verträglich.
- **Sprachwechsel** während einer Folie zieht Leiste/Chip/Hinweise nach (bestehendes `refreshLanguage`/`renderVote`-Muster).
- Wortwolke/Offen: Mehrfach-Beiträge (append) bleiben wie heute; ihre „Senden"-Aktion wandert in die feste Leiste.

## Verifikation

Rein clientseitig; browser-getrieben am laufenden Server (`node server.js`, Port 3000). Präsentation mit je einer Folie pro Typ anlegen, als Publikum über `/vote.html?code=…` teilnehmen (zweites Fenster/`participantId` für Live-Balken):

1. **V1/V2:** Single-Choice + Skala antippen → sofort gesendet, Optionen morphen zu Balken mit markierter eigener Wahl, kein Scrollen; anderes Antippen ändert die Stimme.
2. **Bestätigen-Leiste:** Mehrfachauswahl/Punkte/Ranking/Text → feste 48-px-Leiste unten sendet; danach Morph/Board + „Ändern".
3. **Quiz:** einmalige Antwort, endgültig, klar gekennzeichnet.
4. **V3/V4:** Ranking per Drag neu ordnen (≥44 px, ▲▼ als Fallback); Punkte per Slider mit Rest-Budget-Balken.
5. **V5:** Moderator sperrt → Optionen/Balken bleiben ausgegraut sichtbar + Chip „Abstimmung gesperrt".
6. **Ü1:** Meta-/Hilfetexte min ~13 px.
7. `server.js` unverändert; DE/EN geprüft.
