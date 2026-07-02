# DE/EN-Sprachumschalter — Design

## Kontext

PULS ist aktuell vollständig auf Deutsch. Ziel: ein Sprachumschalter, mit dem
jede Person (Ersteller:in, Moderator:in, Publikum) auf ihrem eigenen Gerät live
zwischen Deutsch und Englisch wechseln kann — ohne Page-Reload.

Betroffen sind alle drei Frontend-Seiten (`index.html`, `presenter.html`,
`vote.html`) sowie das gemeinsame `public/common.js`. `server.js` liefert
bereits sprachneutrale Fehlercodes (`not_found`, `limit_reached`, …) und bleibt
unverändert.

## Sprachwahl & Persistenz

- Gespeichert pro Gerät/Browser in `localStorage['puls.lang']` (`'de'` | `'en'`).
- Beim allerersten Besuch ohne gespeicherten Wert: `navigator.language`
  auswerten — beginnt sie mit `en`, startet die App auf Englisch, sonst
  Deutsch. Danach gilt ausschliesslich die manuell gewählte Sprache.
- Kein Server-seitiger Zustand — reine Client-Einstellung, konsistent mit dem
  bestehenden Muster (`puls.participantId`, `puls.mine`, `puls.voted.*`).

## Architektur

### Neues Modul `public/i18n.js`

Geladen vor `common.js` auf allen drei Seiten. Stellt bereit:

- **Wörterbücher**: flache Objekte `DE`/`EN`, Keys wie `'vote.submit'`,
  `'results.voters'`. Werte entweder ein String mit `{{platzhalter}}`-Syntax,
  oder — für zählabhängige Texte — `{ one: '…', other: '…' }`.
- `t(key, vars)` — löst Übersetzung für aktuelle Sprache auf, interpoliert
  `vars`. Ist der Eintrag ein `{one, other}`-Objekt, wählt `t()` automatisch
  anhand `vars.n === 1`. Fehlt ein Key, Fallback auf Deutsch, dann auf den
  Key selbst (Absicherung gegen Tippfehler).
- `getLang()` / `setLang(lang)` — lesen/schreiben `localStorage`, `setLang`
  aktualisiert zusätzlich `document.documentElement.lang`.
- `applyStaticTranslations(root = document)` — durchläuft
  `[data-i18n]` (→ `textContent`), `[data-i18n-placeholder]`,
  `[data-i18n-title]`, `[data-i18n-aria-label]` und setzt die übersetzten
  Werte.
- `initLangToggle(container, onChange)` — rendert die Zwei-Knopf-Control
  „DE · EN" in `container`, markiert die aktive Sprache, ruft bei Klick
  `setLang()` gefolgt von `onChange()` auf.

### Anpassungen bestehender Dateien

**`index.html` / `presenter.html` / `vote.html`**
- `<script src="/i18n.js"></script>` vor `common.js` einbinden.
- Statische Textknoten bekommen `data-i18n`-Attribute (Labels, Buttons,
  Platzhaltertexte, Hilfetexte, leere Zustände). Wo "PULS" als Markenname
  fett und unübersetzt bleibt, wird nur der übersetzbare Teil in ein eigenes
  Element mit `data-i18n` gepackt.
- Jede Seite bekommt eine lokale `refreshLanguage()`-Funktion, die
  1. `applyStaticTranslations()` aufruft,
  2. die aktuell sichtbaren dynamischen Teile neu zeichnet (siehe unten),
  3. `document.title` neu setzt.
- Der Umschalter-Container wird per `initLangToggle(el, refreshLanguage)`
  im Header verdrahtet.

  | Seite | Refresh bei Sprachwechsel |
  |---|---|
  | `index.html` | `renderMine()` erneut, sichtbare Fehlermeldung (falls vorhanden) neu übersetzen |
  | `presenter.html` | Falls Editor sichtbar: `renderSlideList()` + `renderSlideEditor()` erneut. Vollbild-Präsentationsmodus hat keinen Umschalter (siehe unten) |
  | `vote.html` | Falls Folie geladen: `buildSlide()` + `updateResults()` erneut |

- Alle hartkodierten deutschen Strings in den Inline-`<script>`-Blöcken
  (Fehlermeldungen, `confirm()`-Dialoge, Status-Texte wie „Speichert …",
  Pluralisierungen wie „X Personen verbunden") werden durch `t()`-Aufrufe
  ersetzt.

**`common.js`**
- Alle Renderer (`renderChoice`, `renderWordcloud`, `renderOpen`,
  `renderScale`, `renderQA`, `renderInfo`, Leerzustände) nutzen `t()` statt
  hartkodierter Strings.
- `TYPE_META` (statisches Objekt) wird durch eine Funktion `typeMeta(type)`
  ersetzt, die Label/Hinweis zur Laufzeit aus `t()` liefert. Alle
  Aufrufstellen (`TYPE_META[x]` in `presenter.html`, `vote.html`) werden auf
  `typeMeta(x)` umgestellt.

**`app.css`**
- Kleine Ergänzung für `.lang-toggle` (zwei Textbuttons, aktive Sprache mit
  Bordeaux-Unterstrich hervorgehoben — keine Rundung, kein Verlauf, konsistent
  mit dem bestehenden Designsystem).

**`server.js`**
- Unverändert.

## Umschalter — Platzierung

- `index.html`: Header, neben dem Untertitel.
- `presenter.html`: Editor-Header (`#editorHeader`), neben den bestehenden
  Buttons. **Nicht** im Vollbild-Präsentationsmodus (`#presentMode`) — dort
  bleibt die Ansicht bewusst clean; die gewählte Sprache aus dem Editor gilt
  auch dort, da `t()` global auf `getLang()` zugreift.
- `vote.html`: Header, neben dem Code-Label — jedes Publikums-Gerät wählt
  unabhängig.

## Out of Scope

- Server-Konsolenausgaben beim Start (`console.log` in `server.js`) bleiben
  Deutsch — laufen nur im Terminal des Hosts.
- Von Nutzer:innen erstellte Inhalte (Präsentationstitel, Folienfragen,
  Antwortoptionen, Skalenbeschriftungen) werden nicht übersetzt — das ist
  freier Text der Ersteller:innen, wie bei vergleichbaren Tools üblich.
- Der serverseitige Default-Titel „Unbenannte Präsentation" bei leerem Titel
  bleibt unverändert (gespeicherte Nutzdaten, keine UI-Zeichenkette).
- README/Dokumentation bleibt Deutsch.
- Weitere Sprachen über DE/EN hinaus.

## Testing

Kein Build-/Test-Runner im Projekt vorhanden. Manuelle Verifikation über den
Playwright-MCP-Browser:

- Alle drei Seiten in beiden Sprachen durchklicken (Formulare, Fehlerzustände).
- Alle sechs Folientypen inkl. Pluralisierung bei 0/1/mehreren Stimmen/
  Antworten/Personen.
- Sprachwechsel während eine Folie/Präsentation aktiv ist (dynamische
  Neuzeichnung ohne Reload prüfen).
- Default-Sprache beim ersten Besuch mit Browser auf Englisch vs. Deutsch
  gestellt.
