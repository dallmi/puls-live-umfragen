# Multiple-Choice — Diagrammtypen (Balken · Donut · Torte · Punkte)

Stand: 6. Juli 2026 · Grundlage: Mentimeter-Vergleich (vier Diagramm-Icons im Bearbeiten-Panel) · betrifft `public/common.js` (Renderer), `public/presenter.html` (Editor-Auswahl + Signaturen), `public/design-system.css` (Palette), `public/i18n.js` (Keys), `server.js` (ein Feld persistieren)

## Ziel

Für **Multiple-Choice-Folien** eine Auswahl der Ergebnis-Visualisierung anbieten — wie Mentimeters vier Icons: **Balken** (heute), **Donut**, **Torte**, **Punkte** (Piktogramm). Der Typ wird pro Folie im Editor gewählt, gespeichert und einheitlich in Editor-Vorschau, Präsentationsmodus und Abstimm-Ansicht angezeigt. Alles handgezeichnetes SVG — keine Chart-Bibliothek, offline-/CDN-frei wie der Rest von PULS.

## Nicht-Ziele

- **Nur `choice` (Multiple-Choice).** Quiz (`renderQuiz`) und 100-Punkte-Verteilung (`renderPoints`) bekommen die Auswahl **nicht** (eigene Semantik: Antwortschlüssel-Hervorhebung bzw. Budget-Anteile — später als eigene Specs möglich).
- **Kein Live-Umschalten im Präsentationsmodus.** Der Typ ist eine gespeicherte Folien-Eigenschaft, keine transiente Präsentations-UI.
- **Keine „Ergebnisse als Prozentsatz"-Umschaltung.** PULS zeigt weiterhin Anzahl **und** % (wie die Balken heute); kein neuer Prozent-Toggle.
- **Keine neuen Abhängigkeiten**, kein Test-Runner. Balken bleiben unverändert der Default.

## Bestand (Ground Truth)

- **Renderer:** `renderResults(container, slide, results, opts)` (`common.js:206`) verzweigt per `results.kind`; `case 'choice' → renderChoice(...)` (`common.js:228`). `renderChoice` baut `.barchart` mit einer `.bar-row` je Option: `.bar-label`, `.bar-track > .bar-fill` (Breite via `requestAnimationFrame` von 0 % animiert), `.bar-value` (Anzahl + `.bar-pct`). Klassen `own` (eigene Wahl, `opts.own` = Index oder Index-Array) und `leader` (führende Option). Abschluss: `.results-meta` mit Stimmenzahl (`results.voters`). Optionen sind auf **max. 8** begrenzt (`server.js:196`, `slice(0,8)`).
- **Drei Anzeigeflächen, ein Renderer:** Editor-Vorschau (`presenter.html` `#editorResults`, via `renderResultsPanel` :424), Präsentationsmodus (`#presentResults` ~:1112), Abstimm-Ansicht (`vote.html` `updateResults`/`paintMorphBoard` :393/:875). Alle rufen dasselbe `renderResults`.
- **Anti-Flacker-Signaturen** (Commit 5fff0a8): `presenter.html` baut zwei JSON-Signaturen — `lastResultsSig` (`:433`, Editor) und `lastPresentSig` (`~:1108`, Präsentation) — und zeichnet nur bei Änderung neu. Beide enthalten heute `id,type,options,min,max,…,results`, **aber nicht** `chartType`. `vote.html` `updateResults` zeichnet **ohne** lokale Signatur bei jedem Snapshot neu.
- **Server:** `sanitizeSlide(input)` (`server.js:185`) baut das gespeicherte Folien-Objekt; der `choice`-Zweig (`:193`) setzt `slide.options` (max 8) und `slide.multiple`. `publicSlide(slide)` (`server.js:295`) gibt `{...rest}` zurück (entfernt nur `answers`; bei Quiz zusätzlich `correct`/`startedAt`) — **beliebige weitere Folien-Felder werden also automatisch an Clients durchgereicht**.

## Abschnitt 1 — Datenmodell & Fluss

- Neues optionales Feld auf `choice`-Folien: **`chartType ∈ {'bars','donut','pie','dots'}`**, Default `'bars'`. Fehlend = Balken → jede bestehende Folie und jeder gespeicherte `store.json` rendert unverändert.
- **Server (einziger Eingriff):** im `choice`-Zweig von `sanitizeSlide` (`server.js:193`) validieren + persistieren:
  `const CHART_TYPES = ['bars','donut','pie','dots']; slide.chartType = CHART_TYPES.includes(input.chartType) ? input.chartType : 'bars';`
  `publicSlide` bleibt **unverändert** — `chartType` fließt über `...rest` automatisch in den öffentlichen Snapshot (Präsentation + Abstimmen).
- **Signaturen:** `chartType` in `lastResultsSig` **und** `lastPresentSig` aufnehmen, damit ein Typwechsel neu zeichnet, laufende Polls aber weiter nicht flackern. `vote.html` braucht **keine** Signaturänderung (rendert ohnehin je Snapshot aus `snap.slide.chartType`).

## Abschnitt 2 — Auswahl im Editor (nur MC)

- Im MC-Einstellungsbereich (dort, wo `#editMultiple` liegt, nur bei `slide.type === 'choice'` sichtbar — bestehendes Sichtbarkeitsmuster) eine **Reihe von vier Icon-Buttons**: Balken / Donut / Torte / Punkte. Aktiver Typ hervorgehoben (`aria-pressed`).
- Klick setzt `currentSlide().chartType` und ruft das bestehende **`scheduleSave()`**; die Editor-Vorschau zeichnet über die (um `chartType` erweiterte) Signatur sofort neu.
- Icons: kleine In-Style-SVGs im Stil der bestehenden `typeIcon`-Galerie (schlicht, 2 px Radius, kein Verlauf).

## Abschnitt 3 — Die vier Renderer (`common.js`)

`renderChoice` wird zum **Dispatcher**: liest `slide.chartType` (Default `'bars'`) und ruft einen von vier Sub-Renderern. Alle behalten die `.results-meta`-Stimmenzeile und die exakten Anzahl-/%-Werte; `own`/`leader` bleiben erhalten, wo sinnvoll.

- **`renderChoiceBars`** — der heutige `renderChoice`-Code **wortgleich** ausgelagert. Unverändert einfarbig/gebrandet (Design-Entscheidung: Länge kodiert die Größe, Farbe wird nicht gebraucht).
- **`renderChoiceDonut`** — ein SVG-Kreis pro Option als Segment über `stroke-dasharray`/`stroke-dashoffset` (Ringbreite ~ 18 % des Radius), Segment-Sweep bei Datenänderung animiert. Legende: Farb-Swatch + Label + Anzahl/% je Option. Mitte zeigt die Gesamt-Stimmenzahl.
- **`renderChoicePie`** — wie Donut, aber Vollkreis-Keile (SVG-`path`-Bögen, kein Loch). Gleiche Legende.
- **`renderChoiceDots`** — Piktogramm: je Option ein Cluster aus Punkten, eingefärbt aus der Palette, mit Label + Anzahl/% daneben. **Ein Punkt = eine Stimme**, solange die Gesamtzahl ein Punkt-Budget (z. B. 60) nicht übersteigt; darüber proportionale Skalierung (1 Punkt ≈ k Stimmen) mit dezentem Hinweis — exakte Zahlen stehen ohnehin an jedem Cluster und in `.results-meta`.
- **Animationsmodell** wie bei den Balken heute: bei Datenänderung neu bauen + animieren (konsistent mit dem bestehenden Verhalten; die Signatur verhindert Neuaufbau ohne Änderung).

## Abschnitt 4 — Farbpalette (Donut/Torte/Punkte)

- Neue **kategoriale Palette** als Tokens in `design-system.css`: `--chart-1 … --chart-8` (Optionen sind auf 8 begrenzt → 8 Farben decken jeden Fall exakt ab).
- **Zurückhaltend & barrierearm** (unterscheidbare Farbtöne, ausreichender Kontrast auf dem Chart-Hintergrund; Reihenfolge nach kategorialer Data-Viz-Praxis). Der Alarm-Rot-Akzent (`--primary #E60000`) wird **nicht** als große Füllfläche missbraucht — die Palette bleibt im ruhigen Design-Duktus (die Marke darf anklingen, große Flächen nutzen ruhigere Töne).
- **Balken nutzen die Palette nicht** — sie bleiben einfarbig/gebrandet (bewusste Entscheidung; die Palette erscheint nur, wenn ein Präsentator gezielt einen proportionalen Chart wählt). Gleiche Option = gleicher Palettenslot in Donut/Torte/Punkte (stabile Farbe beim Umschalten zwischen diesen dreien).

## Abschnitt 5 — i18n, A11y, Kompatibilität

- **i18n** (`i18n.js`, DE+EN): Labels + `aria-label` der vier Auswahl-Buttons; Legenden/Hinweistexte (z. B. „1 Punkt ≈ {k} Stimmen").
- **A11y:** jedes Chart-SVG trägt `role="img"` + beschreibendes `aria-label` (wie `.barchart` heute); die Auswahl-Buttons sind echte Buttons mit `aria-pressed`; Legende als Text lesbar (nicht nur Farbe → Farbe + Label + Zahl).
- **Rückwärtskompatibilität:** fehlendes `chartType` ⇒ Balken. Kein Migrationslauf; alte `store.json` und geteilte Präsentationen rendern exakt wie bisher. Quiz/Punkte/übrige Typen bleiben unberührt.

## Randfälle

- **Null Stimmen / leer:** alle vier Typen zeigen den leeren Zustand sauber (Donut/Torte: leerer Ring/Kreis + „noch keine Stimmen"; Punkte: keine Punkte); `.results-meta` = 0.
- **Eine Option dominiert (100 %):** Torte = Vollkreis in einer Farbe; Donut = voller Ring; Punkte = ein Cluster.
- **Lange Optionslabels:** Legende umbricht/kürzt kontrolliert (kein Überlauf über den Chart).
- **> 8 Optionen:** kann nicht auftreten (`sanitizeSlide` begrenzt auf 8) → Palette reicht immer.
- **Typwechsel im Editor** zeichnet dank erweiterter Signatur sofort neu; kein Reload nötig.
- **Präsentationsmodus/Abstimmen** erhalten `chartType` über `publicSlide` → identische Darstellung auf allen drei Flächen.
- **Mehrfachauswahl (`multiple`):** Summe der Stimmen > Teilnehmerzahl möglich; Donut/Torte normieren auf die **Stimmensumme** (nicht Teilnehmerzahl), % konsistent mit den Balken.

## Verifikation

Rein clientseitig bis auf die eine `sanitizeSlide`-Zeile; browser-getrieben am laufenden Server (`node server.js`, Port 3000) per chrome-devtools/Playwright-MCP + Screenshots:

1. MC-Folie anlegen → vier Diagramm-Buttons erscheinen (nur bei MC), Balken ist Default/aktiv.
2. Je Typ (Balken/Donut/Torte/Punkte) wählen → Editor-Vorschau wechselt sofort; Anzahl + % stimmen mit den Balkenwerten überein.
3. Präsentation starten + Abstimm-Link öffnen, ein paar Stimmen abgeben → **identische** Darstellung des gewählten Typs in Editor-Vorschau, Präsentationsmodus und Abstimm-Ansicht.
4. Live-Stimmen treffen ein → Chart aktualisiert/animiert **ohne** Reflackern (Signatur greift); Typwechsel zeichnet sofort neu.
5. Bestehende Folie ohne `chartType` (bzw. alte `store.json`) → zeigt weiterhin Balken.
6. Farben: Donut/Torte/Punkte nutzen die Palette (gleiche Option = gleiche Farbe beim Umschalten); Balken bleiben einfarbig/gebrandet.
7. DE/EN geprüft; Quiz/Punkte-Folien unverändert; keine Konsolenfehler.
