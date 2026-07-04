# Mockup C — Präsentationsmodus: Join-Bühne & Controls (P1–P4)

Stand: 4. Juli 2026 · Grundlage: UX-Audit `docs/ux-review/`, Mockup C · betrifft `public/presenter.html`

## Ziel

Den Vollbild-Präsentationsmodus (`#presentMode` in `public/presenter.html`) so überarbeiten, dass er vier Audit-Befunde löst:

- **P1 (Hoch) — Beitritt ist aus der letzten Reihe nicht lesbar.** Heute steht die Beitritts-Info klein in der Topbar (`#presentJoinLine`) und der QR misst 64 px in der Fußleiste (`#presentQr`). Genau der Moment, in dem der Saal beitreten soll, hat die schwächste Darstellung.
- **P2 (Mittel) — Zustands-Buttons zeigen ihren Zustand nicht.** „Ergebnisse ausblenden" und „Abstimmung sperren" (`#btnToggleResults`, `#btnToggleLock`) wechseln nur ihr Label; ob gerade gesperrt/ausgeblendet ist, sieht man weder unter Bühnenstress noch als Publikum.
- **P3 (Mittel) — Bühnenwirkung wird verschenkt.** Inhalt klebt oben links (`.present-body` ist oben-bündig), halbe Leinwand bleibt leer.
- **P4 (Niedrig) — Tastatursteuerung ist unsichtbar.** Pfeiltasten/Esc funktionieren, werden aber nirgends angezeigt (die CSS-Klasse `.present-footer .hints` existiert bereits, das Element fehlt).

## Nicht-Ziele

- **Kein Servereingriff.** `server.js`, Datenmodell und der geteilte Zustand bleiben unverändert. Die Beitritts-Bühne ist rein **präsentator-lokal** — die Server-Folie (`activeIndex`) und die Publikums-Sicht (`vote.html`) werden davon nicht berührt.
- Keine neuen Abhängigkeiten (Zero-Dependency), kein Test-Runner.
- Keine Änderung am Editor-Teil von `presenter.html` (nur der Präsentationsmodus).
- Andere Mockups (A/B/D) sind nicht Teil des Umfangs.

## Bestand (Ground Truth)

- Markup `#presentMode`: `presenter.html:212–247` — `.present-topbar` (Brand-Logo + `#presentJoinLine`, rechts `#audienceCount` + „Beenden"), `.present-body` (`#presentQuestion` + `#presentResults`), `.present-footer` (`#presentQr` 64 px, `.nav` mit `#btnPrev`/`#presentPos`/`#btnNext`, `#btnToggleResults`/`#btnToggleLock`).
- Logik: `enterPresent()` (`:722`), `exitPresent()` (`:740`), `navigate(delta)` (`:750`), `onSnapshot(snap)` (`:760`), `keydown`-Handler (`:834`: ArrowRight/PageDown → `navigate(1)`, ArrowLeft/PageUp → `navigate(-1)`, Escape → `exitPresent()`).
- Snapshot-Felder: `activeIndex`, `slideCount`, `audience`, `resultsHidden`, `votingLocked`, `slide`, `results`, `reactions`, `brand`, `leaderboard`.
- Helfer: `renderQR(container, text, sizePx)`, `formatCode`, `esc`, `t`; `publicBase` (LAN-Adresse für Handys, `resolvePublicBase()`).
- CSS: `.present-mode/.present-topbar/.present-body/.present-question/.present-results/.present-footer/.join-line/.qr-small/.hints` in `public/app.css:144–167`. `.present-body` hat heute `padding:2.5rem 4rem; display:flex; flex-direction:column` (oben-bündig). `.hints` ist definiert, aber ungenutzt.

## Abschnitt 1 — Beitritts-Bühne + Dauer-Join-Leiste (P1)

Neuer präsentator-lokaler Zustand `let joinStage = false;`, in `enterPresent()` auf `true` gesetzt.

- **Startbühne** (`joinStage === true`): eine vollflächige, vertikal zentrierte Ansicht (neues Element `#presentJoinStage` in `#presentMode`) mit:
  - Kopfzeile „Machen Sie mit — am eigenen Gerät:"
  - **Großer Code** (`formatCode(pres.code)`, sehr groß, `font-variant-numeric: tabular-nums`).
  - Zeile „beitreten auf **`<publicBase ohne Protokoll>`**".
  - **Großer QR** (~240 px) mit `renderQR(el, `${publicBase}/${pres.code}`, 240)`.
  - **Live-Zähler** „**N** Personen sind schon dabei" aus `snapshot.audience`, aktualisiert bei jedem `onSnapshot`.
  - Primärbutton **„Los geht's →"** (`#btnStartSlides`).
  - „Beenden" bleibt sichtbar/erreichbar.
- Bei `joinStage === true` sind der reguläre Folieninhalt (`.present-body`), die Fußleisten-Navigation und die Dauer-Join-Leiste ausgeblendet; die Startbühne füllt die Fläche.
- **Übergang zu den Folien:** `#btnStartSlides`-Klick **und** ArrowRight/PageDown (wenn `joinStage`) setzen `joinStage=false` und zeigen die aktuelle Folie. Danach navigieren ←/→ wie bisher.
- **Dauer-Join-Leiste** (`joinStage === false`, während der Folien): ersetzt/erweitert `#presentJoinLine` zu einer kompakten, gut lesbaren Leiste „Beitritt: Code **<Code>** · Mini-QR (~44 px)". Die Leiste ist **klickbar** und ruft die große Bühne zurück (`joinStage=true`).
- **Rückkehr zur Bühne** zusätzlich per Tastatur: ArrowLeft/PageUp **auf der ersten Folie** (`activeIndex === 0`, `joinStage===false`) setzt `joinStage=true` statt einer (ohnehin gesperrten) Rück-Navigation. So klammern ←/→ die Folien mit der Beitritts-Bühne vorn ein.

Rendering-Funktion `applyStagePresence()` (oder Erweiterung von `onSnapshot`) schaltet Sichtbarkeit von `#presentJoinStage` vs. `.present-body`/`.present-footer`-Nav abhängig von `joinStage` und hält Code/QR/Zähler aktuell.

## Abschnitt 2 — Echte Toggles + Status-Chip (P2)

- `#btnToggleResults` und `#btnToggleLock` werden zu **Schaltern mit sichtbarem An/Aus-Zustand**: konstantes Label („Ergebnisse" / „Abstimmung") plus ein Zustands-Indikator; `aria-pressed` spiegelt den Zustand; der aktive „gesperrt/ausgeblendet"-Zustand ist deutlich hervorgehoben (rot gefüllte Pill via Design-System-Token `--primary`). In `onSnapshot` wird statt nur des Labels auch `aria-pressed`/`.is-active` gesetzt aus `snap.resultsHidden` bzw. `snap.votingLocked`.
- **Status-Chip auf der Bühne, publikumsseitig sichtbar** (neues Element `#presentStatus` im oberen Bereich der `.present-body`): bei `votingLocked` ein Chip „**Abstimmung gesperrt**", bei `resultsHidden` ein Chip „**Ergebnisse ausgeblendet**"; beide können gleichzeitig erscheinen. Leer/versteckt, wenn keiner der Zustände aktiv ist. Wird in `onSnapshot` gesetzt.

## Abschnitt 3 — Bühne zentriert + skaliert (P3)

- `.present-body`: `justify-content: center` (vertikal zentriert) statt oben-bündig; `overflow:auto` bleibt als Überlauf-Sicherung.
- Frage und Ergebnisse **skalieren mit der Fläche** über `clamp()`-Viewport-Größen mit Deckeln:
  - `.present-question` von fest 2.4rem auf `clamp(2rem, 4.5vw, 4rem)`.
  - `.present-results .barchart` max-width von 900 px auf `min(1100px, 90vw)`; Balkenhöhe (`.bar-track`), Balken-Label/-Wert (`.bar-label`/`.bar-value`), Leaderboard- und Wortwolken-Größen moderat angehoben (viewport-relativ mit Deckel).
- Robustheit: Deckel verhindern Überlauf; bei sehr vielen Optionen wird innerhalb `.present-body` gescrollt.

## Abschnitt 4 — Tastatur-Hinweise (P4)

- In `.present-footer` das fehlende `.hints`-Element einsetzen: dezent „**← → Folie · Esc beenden**" (i18n `presenter.present.hints`, DE/EN). Nur im Folien-Zustand sichtbar (nicht zwingend auf der Startbühne).

## Abschnitt 5 — Struktur, Stil, i18n

- Betroffen: `public/presenter.html` (Markup `#presentMode` + Präsentations-Script), `public/app.css` (Layout Startbühne/Join-Leiste/Toggles/Chips/Zentrierung/Skalierung), `public/i18n.js` (neue Keys, DE+EN).
- Neue i18n-Keys (jeweils DE+EN): `presenter.join.heading` („Machen Sie mit — am eigenen Gerät:"), `presenter.join.at` (Wiederverwendung `presenter.access.joinAt` möglich), `presenter.join.counter` (`{{n}} Personen sind schon dabei` mit Plural), `presenter.join.start` („Los geht's →"), `presenter.join.barLabel` („Beitritt"), `presenter.present.hints` („← → Folie · Esc beenden"), `presenter.present.statusLocked` („Abstimmung gesperrt"), `presenter.present.statusResultsHidden` („Ergebnisse ausgeblendet"), Toggle-Kurzlabels `presenter.present.resultsLabel` („Ergebnisse"), `presenter.present.votingLabel` („Abstimmung").
- Nur bestehende Design-System-Tokens/Klassen; Rot `--primary #E60000` nur Akzent, Radius 2 px, linksbündig (Startbühne darf zentriert sein — Bühnen-Ausnahme wie im Mockup), kein Verlauf, kein ALL-CAPS.
- Wiederverwendung `renderQR`, `formatCode`, `esc`, `t`; **keine Änderung an `server.js`**.

## Randfälle

- `joinStage` muss in `exitPresent()` zurückgesetzt/irrelevant sein (nächstes `enterPresent` setzt `true`).
- `onSnapshot` läuft auch, wenn `joinStage===true` — dann Code/QR/Live-Zähler der Bühne aktualisieren, aber Folieninhalt nicht anzeigen.
- Sprache umschalten während der Präsentation (`refreshLanguage`) muss Startbühne, Chips, Hints und Toggle-Label live nachziehen (dynamisch gesetzte Texte in `onSnapshot`/eine Render-Funktion, die `refreshLanguage` erneut aufruft).
- `publicBase` kann sich erst nach `resolvePublicBase()` füllen — QR/Join-Text der Bühne beim Öffnen mit dem dann gültigen `publicBase` rendern (wie heute bei `enterPresent`).
- Keine Folien vorhanden: nach „Los geht's →" greift der bestehende `presenter.present.noSlides`-Pfad.
- 0 Zuschauer: Live-Zähler zeigt „0 …" sauber (Plural-Form beachten).

## Verifikation

Rein clientseitig; browser-getrieben am laufenden Server (`node server.js`, Port 3000). Präsentation mit ≥2 Folien anlegen, Token/URL öffnen, „Präsentieren" — dann per chrome-devtools/Playwright-MCP + Screenshots prüfen:

1. Startbühne erscheint zentriert mit großem Code, großem gerendertem QR und Live-Zähler; „Los geht's →" und Pfeil-rechts zeigen die Folien.
2. Während der Folien: kompakte, lesbare Join-Leiste; Klick darauf **und** Pfeil-links auf Folie 1 holen die Bühne zurück; Live-Zähler zieht bei simulierten Beitritten mit.
3. Toggles zeigen ihren Zustand (aria-pressed/aktiv); Status-Chips „Abstimmung gesperrt"/„Ergebnisse ausgeblendet" erscheinen auf der Bühne, wenn aktiv.
4. Frage/Balken sind vertikal zentriert und deutlich größer; kein horizontaler Überlauf, viele Optionen scrollen.
5. Fußleisten-Hinweis „← → Folie · Esc beenden" sichtbar.
6. DE/EN-Umschaltung zieht Startbühne, Chips, Hints, Toggle-Label nach.
7. `server.js` unverändert.
