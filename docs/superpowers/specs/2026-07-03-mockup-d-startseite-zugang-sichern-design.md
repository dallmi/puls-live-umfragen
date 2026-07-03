# Mockup D — Startseite & Zugang sichern (L1, L2, L3)

Stand: 3. Juli 2026 · Grundlage: UX-Audit `docs/ux-review/`, Mockup D · Repo-Stand `2ccefc7`

## Ziel

Die Startseite (`public/index.html`) so umbauen, dass sie die drei Audit-Befunde auf diesem Screen löst:

- **L3 (Hoch) — Moderationszugang kann stillschweigend verloren gehen.** Der `adminToken` lebt heute nur im `localStorage` dieses einen Browsers und in der URL. Anderes Gerät, geleerter Verlauf oder privates Fenster → die Präsentation ist unerreichbar, ohne Vorwarnung. **Kritischster Befund des Audits (faktisch ein Datenverlust-Risiko).**
- **L1 (Mittel) — Beide Rollen gleichgewichtet.** „Teilnehmen" und „Erstellen" stehen als gleichwertige Karten nebeneinander; real ist Beitreten die häufigere, oft eilige Aktion.
- **L2 (Niedrig) — Code-Eingabe ohne Auto-Weiter.** Nach der sechsten Ziffer passiert nichts; erst der Button prüft.

## Nicht-Ziele

- Keine Konten, keine Cookies, kein Tracking (Kernprinzip der App bleibt).
- **Kein Servereingriff.** `server.js`, Datenmodell und `adminToken`-Erzeugung bleiben unverändert.
- Kein Backend-Mailversand (widerspräche dem No-Tracking-Prinzip und bräuchte Infrastruktur/Secrets). „Per Mail" wird als clientseitiger `mailto:`-Link umgesetzt.
- Keine echte Konto-Wiederherstellung — der Verlust wird durch aktives Sichern *verhindert*, nicht nachträglich repariert.
- Andere Mockups (A/B/C) sind hier ausdrücklich nicht Teil des Umfangs.

## Ansatz

**Ansicht-Umschaltung in `index.html`, rein clientseitig** (gewählter Ansatz ① aus dem Brainstorming). Nach dem Erstellen wird nicht sofort zu `presenter.html` navigiert, sondern der Startseiten-Inhalt gegen eine „Zugang sichern"-Ansicht getauscht (gleiche Seite, keine Navigation). Erst „Weiter zur Moderation" navigiert.

Wiederverwendet werden vorhandene Helfer:
- `renderQR(container, text, sizePx)` aus `public/common.js:457` + gevendorte `public/vendor/qrcode.js`
- `el()`, `esc()`, `formatCode()`, `api()`, `t()` aus `common.js` / `i18n.js`
- localStorage-Schlüssel `puls.mine` (Einträge `{id, code, title, adminToken}`) bleibt unverändert.

Der Moderationslink wird clientseitig gebaut:
`` `${location.origin}/presenter.html?id=${id}&token=${adminToken}` ``

### Komponenten / Isolation

Eine einzige Sicher-Block-Baufunktion, zweimal genutzt — kein Duplikat:

- `buildSecureBlock({ title, url }) → HTMLElement` — rendert Linkzeile + „Link kopieren", QR (via `renderQR`), „Per Mail senden" (`mailto:`). Enthält **keine** Navigations-/Schließen-Buttons; die setzt der jeweilige Aufrufer außen herum.
- Aufrufer 1: **Nach-Erstellen-Ansicht** (rahmt den Block mit Überschrift „erstellt ✓", Erklärsatz, „Weiter zur Moderation →", Später-Hinweis).
- Aufrufer 2: **„Link sichern"-Dialog** aus „Meine Präsentationen" (rahmt den Block mit Titelzeile + „Schließen"-Button in einem In-Style-Overlay).

## Abschnitt 1 — Startseite neu (L1, L2)

- Hero-Text unverändert.
- Statt `landing-grid` mit zwei gleichwertigen Karten:
  - **Beitreten dominant & zentriert** — große Karte (`ds-card accent-primary`) mit dem Code-Feld als Hauptelement, Helferzeile „Kein Code? Fragen Sie die Person, die präsentiert."
  - **„oder"-Trenner**.
  - **Erstellen als ruhiger Zweitweg** — leichtere/kleinere Karte darunter: Titelfeld + „Erstellen".
- **Code-Feld:** ein einzelnes großes Feld im Format „000 000" (nicht sechs Einzelboxen — robuster bei Paste/Backspace/Handytastatur, wirkt optisch gleich sechsstellig). `inputmode="numeric"`, `maxlength="7"` (inkl. Leerzeichen), Formatierung „123 456" wie bisher.
- **Auto-Weiter (L2):** Sobald 6 Ziffern vorliegen (auch per Paste), automatisch `GET /api/join/<code>` prüfen und bei Erfolg zu `/vote.html?code=<code>` navigieren. Kein Klick nötig.
  - Debounce/Guard: pro 6-stelliger Eingabe nur eine laufende Prüfung; erneutes Tippen bricht die vorige Rückmeldung ab.
  - Fehlerfall: unbekannter Code → Inline-Fehler am Feld (`landing.join.errNotFound`), Feld bleibt fokussiert. Netzwerkfehler → gleiche Meldung.
  - Ein sichtbarer „Teilnehmen"-Fallback-Button bleibt für Barrierefreiheit/Enter erhalten (der Auto-Weiter ist Zusatz, nicht Ersatz).

## Abschnitt 2 — „Zugang sichern" nach dem Erstellen (L3, Kern)

Nach erfolgreichem `POST /api/presentations`:

1. Wie bisher in `puls.mine` speichern (unverändert).
2. **Statt** `location.href = presenter…` → Startseiten-Inhalt (`main .container`) gegen die Sicher-Ansicht tauschen. Enthält:
   - Überschrift „Präsentation erstellt ✓".
   - Erklärsatz: *Nur dieser Link führt zurück in die Moderation — sichern Sie ihn.*
   - Der Sicher-Block (`buildSecureBlock`): Moderationslink schreibgeschützt/monospace + **[Link kopieren]** (Feedback „Kopiert ✓", `navigator.clipboard` mit `document.execCommand`-Fallback); **QR-Code** + Bildunterschrift „Mit dem Handy scannen, um den Zugang auf ein zweites Gerät zu holen"; **[Per Mail senden]** → `mailto:?subject=…&body=…` mit Titel + Link.
   - Primärbutton **[Weiter zur Moderation →]** → `presenter.html?id=…&token=…`.
   - Dezenter Hinweis „Sie finden ihn später auch unter ‚Meine Präsentationen'."

## Abschnitt 3 — Meine Präsentationen + Startseiten-Hinweis (L3, Teil 2)

- Kartentitel „Meine Präsentationen" bekommt eine dezente Metazeile **„nur in diesem Browser gespeichert"**.
- Jeder Eintrag: bestehender **„Moderieren"**-Button **+ neu „Link sichern"**, öffnet den Sicher-Block als **In-Style-Dialog** (Overlay, `ds-card`, mit „Schließen").
- Der Dialog nutzt exakt `buildSecureBlock` — identischer Inhalt wie Abschnitt 2, nur ohne „Weiter zur Moderation".

## Abschnitt 4 — i18n, Stil, Struktur

- Neue Schlüssel, jeweils **DE + EN**, im Muster von `public/i18n.js`:
  - `landing.join.helpNoCode`
  - `landing.create.divider` („oder" / „or")
  - `landing.secure.heading`, `landing.secure.intro`, `landing.secure.linkLabel`, `landing.secure.copy`, `landing.secure.copied`, `landing.secure.qrCaption`, `landing.secure.mail`, `landing.secure.mailSubject`, `landing.secure.mailBody`, `landing.secure.continue`, `landing.secure.laterHint`
  - `landing.mine.storedHint` („nur in diesem Browser gespeichert"), `landing.mine.secure` („Link sichern"), `landing.mine.dialogTitle`, `landing.dialog.close`
- Nur bestehende Design-System-Klassen (`ds-card`, `ds-btn`, `ds-btn-primary`, `ds-btn-lg`, `field`, `help`, `error-note`); **keine neuen Farben/Verläufe**, 2 px Radius, linksbündig, kein ALL-CAPS. Nötige neue Layout-Regeln (Sicher-Ansicht, „oder"-Trenner, Overlay) in `public/app.css` ergänzen, im vorhandenen Stil.
- Overlay: schlichter In-Style-Dialog (streift Ü2), schließbar per Button, Klick auf Backdrop und `Esc`.
- Der gesamte Umbau spielt sich in `public/index.html` (Markup + Script), `public/i18n.js` (Keys) und `public/app.css` (Layout) ab.

## Randfälle

- `navigator.clipboard` nicht verfügbar (HTTP/altes Handy) → `document.execCommand('copy')`-Fallback; scheitert auch das, bleibt der Link markierbar sichtbar.
- QR-Lib nicht geladen → `renderQR` ist bereits no-op-sicher; Link + Kopieren + Mail bleiben nutzbar.
- Sprache umschalten (DE/EN) auf jeder Ansicht (Startseite, Sicher-Ansicht, Dialog) → Texte müssen live nachziehen (`refreshLanguage` erweitern).
- Erstellen schlägt fehl → bisheriges Verhalten (Inline-Fehler `landing.create.errFailed`), kein Ansichtswechsel.
- Sehr lange Titel → im `mailto`-Body und in der Überschrift sauber escapen/kürzen.

## Verifikation

Rein clientseitiges Frontend → im laufenden Browser durchspielen (nicht nur Lesen):

1. Erstellen → Sicher-Ansicht erscheint; Link kopieren zeigt „Kopiert ✓"; QR wird gerendert; „Per Mail" öffnet `mailto` mit Titel + Link; „Weiter zur Moderation" landet in `presenter.html` mit gültigem Token.
2. Beitreten: 6 Ziffern tippen **und** einfügen → Auto-Weiter zu `vote.html`; falscher Code → Inline-Fehler.
3. Startseite neu laden → „Meine Präsentationen" zeigt Metazeile; „Link sichern" öffnet Dialog mit gleichem Block; „Moderieren" funktioniert weiter.
4. DE/EN umschalten auf allen drei Ansichten.
5. Kein Servereingriff — `server.js` unverändert.
