# Mockup A — Editor: Typ-Galerie & Live-Vorschau (E1–E6, Ü2)

Stand: 6. Juli 2026 · Grundlage: UX-Audit `docs/ux-review/`, Mockup A · betrifft `public/presenter.html` (Editor) + `public/vote.html` (Vorschau-Modus)

## Ziel

Den Moderations-/Editor-Teil von `presenter.html` überarbeiten und sieben Befunde lösen:

- **E1 (Hoch) — Neun Folientypen verstecken sich in einem nativen Dropdown.** `#slideType` ist ein `<select>` (Zeile 111); der Funktionsreichtum (Punkte, Ranking, Quiz …) ist kaum entdeckbar. → **Typ-Galerie** mit Mini-Vorschau/Icon + Ein-Satz-Erklärung.
- **E2 (Hoch) — Keine Publikums-Vorschau beim Bearbeiten.** → **Live-Handy-Vorschau** neben dem Editor, die bei jeder Eingabe mitläuft.
- **E3 (Mittel) — Einstellungen verdrängen die Kernaufgabe.** Die „Präsentation"-Karte (Titel, Namen, Selbststeuerung, Sitzungen, Branding) steht über dem Folien-Editor. → **einklappen**.
- **E4 (Mittel) — Destruktives steht neben Alltäglichem.** „Alle Antworten zurücksetzen" (Header) und „Antworten zurücksetzen"/„Löschen" (Editor-Kopf) stehen neben Export/Präsentieren. → **Overflow-Menü** + eigener Bestätigungsdialog.
- **E5 (Niedrig) — Umordnen getrennt, Duplizieren fehlt.** Reorder nur über ↑/↓ im Editor-Kopf; kein Duplizieren. → **Drag-Reorder in der Liste + Duplizieren/Löschen am Eintrag**.
- **E6 (Niedrig) — Kopfleiste bricht auf dem Handy.** Speicher-Status, Sprache, Zurücksetzen, zwei Exporte, Präsentieren in einer Zeile. → **Sekundäres ins Menü**, „Präsentieren" bleibt Primäraktion.
- **Ü2 (Niedrig) — Browser-Dialoge brechen die Gestaltung.** `confirm()`/`alert()` an 8 Stellen. → **eigene In-Style-Dialoge**.

## Nicht-Ziele

- **Kein Servereingriff.** `server.js` unverändert. Reorder/Duplizieren nutzen das bestehende `PUT /api/presentations/:id/slides`; die Vorschau ist rein clientseitig; Galerie/Dialoge sind clientseitig.
- Kein Umbau des Präsentationsmodus (Mockup C ist erledigt) und der Abstimm-UI (Mockup B) — die Vorschau **nutzt** die bestehende `vote.html` unverändert bis auf den additiven Vorschau-Modus.
- Keine neuen Abhängigkeiten (Zero-Dependency), kein Test-Runner.

## Bestand (Ground Truth)

- `SLIDE_TYPES = ['choice','wordcloud','open','scale','ranking','points','quiz','qa','info']` (`i18n.js:272`); `typeMeta(type) → { label: t('type.<type>.label'), hint: t('type.<type>.hint') }` (`common.js:122`).
- `.editor-layout` Grid `280px 1fr`, bricht bei ≤900 px einspaltig (`app.css:102`). Aside: Zugang-Karte + Folienliste (`#slideList`, `renderSlideList` :453). Section: „Präsentation"-Einstellungskarte (:51) + `#slideEditor` (:98, mit `#slideType`-Select, per-Typ-Feldern) + Ergebnis-Karte.
- Header (`#editorHeader` :13): Save-State, Lang, `#btnResetAll` (destruktiv), `#btnExport` (Excel), `#btnPptx` (PowerPoint), `#btnPresent` (Primär).
- Editor-Kopf `#slideEditor` (:99–107): `#btnMoveUp`/`#btnMoveDown`/`#btnResetSlide`/`#btnDeleteSlide` (destruktiv) in einer Reihe.
- `addSlide` (:666) legt eine Default-`choice`-Folie an; `#slideType`-`change` (:567) baut die per-Typ-Felder; `moveSlide(delta)` (:691).
- `confirm()`/`alert()`: `:621` archiveConfirm, `:625` archiveFailed, `:650`/`:660` brand tooLarge, `:681` deleteSlide, `:712` pptxFailed, `:720` resetSlide, `:724` resetAll.

## Abschnitt 1 — 3-Spalten-Layout

- `.editor-layout` von `280px 1fr` auf **`280px 1fr minmax(300px, 360px)`** (Liste | Editor | Vorschau). Bei ≤ ~1100 px fällt die Vorschau-Spalte unter den Editor (Breakpoint), bei ≤900 px alles einspaltig.
- Die Vorschau-Spalte enthält den Handy-Rahmen (Abschnitt 3). Zugang-Karte + Folienliste bleiben in der linken Spalte.

## Abschnitt 2 — E1: Typ-Galerie statt Dropdown

- Neue **Galerie** (Overlay-Dialog): Kachel je der 9 Typen aus `SLIDE_TYPES` mit einem schlichten **In-Style-SVG-Icon** je Typ, dem `typeMeta().label` und dem `typeMeta().hint` (Ein-Satz-Erklärung). Reihenfolge = `SLIDE_TYPES`.
- **Öffnen:** „+ Neue Folie" öffnet die Galerie; Klick auf eine Kachel legt eine Folie dieses Typs an (Default-Felder je Typ) und wählt sie aus. Im Editor ersetzt ein **„Typ ändern"**-Button (mit aktuellem Typ-Label) das native `<select>` und öffnet dieselbe Galerie; Auswahl ändert den Typ der aktuellen Folie (Frage bleibt erhalten).
- Neue SVG-Icons je Typ als kleine Inline-Funktion `typeIcon(type)`; Galerie-Bau `openTypeGallery(onPick)`.
- Tastatur/A11y: Kacheln sind Buttons, Esc schließt, Fokus in den Dialog.

## Abschnitt 3 — E2: Live-Handy-Vorschau (iframe, Vorschau-Modus)

- **Vorschau-Modus in `vote.html`** (additiv): erkennt `?preview=1`. Dann **kein** Code-Beitritt, **kein** SSE/Polling, **kein** Senden. Stattdessen: lauscht auf `window`-`message`-Events; empfängt `{ kind:'puls-preview', slide, brand }` und rendert diese Folie über den bestehenden `renderVote`-Pfad, aber mit einem `PREVIEW`-Guard, der `submit()` zu einem No-op macht und `curResults()`/Live-Repaint deaktiviert (reine Eingabe-Ansicht, wie ein Publikum vor dem Voten). `applyBrand` mit dem übergebenen `brand`.
- **Editor-Seite:** ein `<iframe src="/vote.html?preview=1">` im **Handy-Rahmen** (`.phone-frame`, wie im Präsentationsmodus-Mockup); bei jeder relevanten Editor-Eingabe wird die aktuelle (In-Editor-)Folie **debounced** per `iframe.contentWindow.postMessage({kind:'puls-preview', slide, brand}, location.origin)` geschickt. Bildunterschrift „Aktualisiert sich beim Tippen".
- Robustheit: Origin-Check bei `postMessage`; wenn das iframe (noch) nicht bereit ist, sendet der Editor beim `load`-Event erneut; kein Absturz, wenn `slide` leer ist (leerer Rahmen + Hinweis).

## Abschnitt 4 — E3: Einstellungen einklappen

- Die „Präsentation"-Karte wird **einklappbar**: Kartentitel als Toggle (`aria-expanded`), Inhalt ein-/ausklappbar; **startet eingeklappt**, damit `#slideEditor` über der Falz steht. Zustand pro Sitzung in `sessionStorage` (`puls.settingsOpen`).

## Abschnitt 5 — E4 + Ü2: Gefahraktionen trennen + eigene Dialoge

- **Overflow-Menü „…":** ein wiederverwendbares kleines Menü (Button + aufklappende Liste). Im **Header** wandern „Excel-Export", „PowerPoint-Export" und „Alle Antworten zurücksetzen" hinein (E4/E6); im **Editor-Kopf** wandern „Antworten zurücksetzen" und „Löschen" (+ „Duplizieren" aus E5) hinein. „Präsentieren" bleibt sichtbare Primäraktion.
- **Eigene Dialoge** (Ü2): Helfer `confirmDialog({title, body, confirmLabel, danger}) → Promise<bool>` und `alertDialog({title, body})` — In-Style-Overlay (`.ds-card`, roter Bestätigen-Button bei `danger`), schließbar per Button/Backdrop/Esc, Fokus im Dialog. Alle 8 `confirm()`/`alert()`-Stellen werden ersetzt; destruktive Bestätigungen zeigen einen **Konsequenz-Text** (z. B. „Alle Antworten aller Folien werden gelöscht — nicht umkehrbar.").

## Abschnitt 6 — E5: Drag-Reorder + Duplizieren

- Die Folienliste (`#slideList`) wird per **Drag-Handle** sortierbar (Pointer-Events, 44 px, wie das Ranking-Drag aus Mockup B), mit `pointercancel`-Teardown. Reorder aktualisiert `pres.slides` + `selectedIdx` und speichert.
- Jeder Listeneintrag bekommt **Duplizieren** und **Löschen** (am Eintrag bzw. im Overflow des Editor-Kopfs). **Duplizieren** = tiefe Kopie der Folie mit neuer `crypto.randomUUID()`, direkt hinter das Original eingefügt, Auswahl auf die Kopie, `scheduleSave`.
- Die ↑/↓-Buttons im Editor-Kopf (`#btnMoveUp`/`#btnMoveDown`) entfallen (Reorder lebt jetzt in der Liste).

## Abschnitt 7 — E6: Mobile Kopfleiste

- Umgesetzt über das Overflow-Menü aus Abschnitt 5: sekundäre Header-Aktionen (Exporte, Zurücksetzen) im Menü; „Präsentieren" bleibt als einzige Primäraktion. Save-State + Sprache bleiben sichtbar. Auf dem Handy bricht die Leiste nicht mehr mehrzeilig.

## Abschnitt 8 — Struktur, Stil, i18n

- Betroffen: `public/presenter.html` (Editor-Markup + Script — Hauptteil), `public/vote.html` (additiver Vorschau-Modus), `public/app.css` (3-Spalten, Galerie, Phone-Frame, Overflow-Menü, Dialoge, Drag), `public/i18n.js` (neue Keys DE+EN: Galerie-Titel, „Typ ändern", Vorschau-Untertitel, Menü-Labels, Dialog-Texte/Konsequenzen, „Duplizieren", „aufklappen/einklappen"). Typ-Labels/Hints (`type.<type>.*`) bestehen bereits.
- **Kein Servereingriff.** Design-System strikt (Rot `--primary #E60000` nur Akzent, Radius 2 px, kein Verlauf, kein ALL-CAPS); Wiederverwendung `typeMeta`, `renderVote`/`applyBrand` (in `vote.html`), `renderSlideList`/`renderSlideEditor`, `scheduleSave`/`PUT slides`.
- Da `presenter.html` groß ist: gemeinsame Muster (Overflow-Menü, Dialog, Drag) als kleine Helfer, nicht dupliziert.

## Randfälle

- **Vorschau vor „ready":** Editor postet erneut beim iframe-`load`; leere Folie → Rahmen mit dezentem Hinweis.
- **Typwechsel** über die Galerie erhält die Frage; per-Typ-Default-Felder werden gesetzt (bestehende Typ-Change-Logik wiederverwenden).
- **Duplizieren einer Folie mit Antworten:** die Kopie startet ohne Antworten (nur die Folien-Definition wird kopiert; `answers` nicht).
- **Reorder während laufender Präsentation** ist im Editor-Kontext (nicht präsentierend) — `activeIndex` des Servers bleibt gültig, da `PUT slides` die Liste ersetzt; kein Sonderfall nötig.
- **Dialoge**: Esc/Backdrop schließen = Abbruch (Promise `false`); nur der explizite Bestätigen-Button löst die Aktion aus.
- **Sprache/Branding** ziehen in Galerie, Dialogen und Vorschau nach (`refreshLanguage`; Vorschau bekommt `brand` mitgeschickt).
- **Vorschau-Sicherheit:** `postMessage` mit `location.origin`; `vote.html`-Vorschau akzeptiert nur Messages von `location.origin`.

## Verifikation

Rein clientseitig; browser-getrieben am laufenden Server (`node server.js`, Port 3000). Präsentation anlegen, Moderationslink öffnen; per chrome-devtools/Playwright-MCP + Screenshots:

1. **E1:** „+ Neue Folie" → Galerie mit 9 Kacheln (Icon + Erklärung); Klick legt Folie an. „Typ ändern" öffnet die Galerie und ändert den Typ (Frage bleibt).
2. **E2:** rechte Handy-Vorschau zeigt die aktuelle Folie; Tippen in Frage/Optionen aktualisiert die Vorschau; die Vorschau ist die echte `vote.html`-Ansicht (kein Senden).
3. **E3:** „Präsentation"-Karte startet eingeklappt; Auf-/Zuklappen funktioniert; Editor steht oben.
4. **E4/Ü2:** Löschen/Zurücksetzen liegen im „…"-Menü; Klick öffnet einen eigenen Dialog mit Konsequenz-Text + rotem Button; Esc/Backdrop bricht ab; keine nativen `confirm/alert` mehr.
5. **E5:** Liste per Drag umsortierbar (44 px, `pointercancel` sauber); Duplizieren erzeugt eine Kopie dahinter; Löschen am Eintrag.
6. **E6:** schmales Fenster → Header bricht nicht; „Präsentieren" bleibt, Rest im Menü.
7. DE/EN geprüft; `server.js` unverändert; keine Konsolenfehler.
