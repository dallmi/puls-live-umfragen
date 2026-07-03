# Mockup D — Startseite & Zugang sichern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Startseite von PULS so umbauen, dass Beitreten dominiert (L1), sechs Ziffern automatisch weiterleiten (L2) und der Moderationslink nach dem Erstellen aktiv gesichert werden kann (L3).

**Architecture:** Rein clientseitig. Nach dem Erstellen wird der Startseiten-Inhalt gegen eine „Zugang sichern"-Ansicht getauscht (gleiche Seite, keine Navigation) statt direkt zu `presenter.html` zu springen. Ein einziger Sicher-Block (Link/Kopieren/QR/Mail) wird gebaut und zweimal genutzt: in dieser Ansicht und in einem „Link sichern"-Dialog aus „Meine Präsentationen". Kein Servereingriff, kein Backend-Mail (`mailto:` clientseitig).

**Tech Stack:** Vanilla HTML/CSS/JS. Wiederverwendete Helfer aus `public/common.js` (`renderQR`, `el`, `esc`, `formatCode`, `api`) und `public/i18n.js` (`t`, `applyStaticTranslations`, `initLangToggle`). Design-System-Tokens/Klassen aus `public/design-system.css`.

## Global Constraints

- **Zero-Dependency**: keine neuen npm-Pakete, kein Test-Runner, kein CDN. Nur bereits gevendorte Libs.
- **Kein Servereingriff**: `server.js` bleibt unverändert.
- **Kein Tracking/keine Konten/keine Cookies**: „Per Mail" ausschließlich als clientseitiger `mailto:`-Link.
- **Design-System strikt**: nur bestehende Tokens/Klassen, Radius `var(--radius)` = 2px, linksbündig, kein ALL-CAPS, keine Verläufe, Rot (`--primary #E60000`) nur als Akzent.
- **Zweisprachig**: jeder neue sichtbare Text als i18n-Schlüssel mit **DE + EN**.
- **Moderationslink-Form**: `` `${location.origin}/presenter.html?id=${id}&token=${adminToken}` ``.

## Verifikationsmodell (kein automatisiertes Test-Framework)

Das Projekt hat bewusst keinen Test-Runner. Jede Aufgabe wird **browser-getrieben** am laufenden Server verifiziert:

- Server einmal starten: `npm start` (läuft auf `http://localhost:3000`). Nach Frontend-Änderungen genügt ein Hard-Reload (Cmd+Shift+R) im Browser — kein Neustart nötig.
- „Erwartet"-Angaben in den Schritten sind die im Browser sichtbaren/messbaren Ergebnisse.

## File Structure

- `public/i18n.js` — Modify: neue DICT-Schlüssel (`landing.*`) einfügen. Verantwortung: alle Übersetzungen.
- `public/index.html` — Modify: Markup der Startseite (`main .container`) + `<script>` (Beitreten-Auto-Weiter, Erstellen→Sicher-Ansicht, `buildSecureBlock`, Sicher-Ansicht, „Meine Präsentationen"-Dialog, `refreshLanguage`). Verantwortung: Startseite und ihre gesamte Interaktion.
- `public/app.css` — Modify: neue Layout-Regeln (dominante Beitreten-Karte, „oder"-Trenner, ruhige Erstellen-Karte, Sicher-Ansicht, Sicher-Block, Overlay-Dialog). Verantwortung: seitenspezifisches Layout.

---

### Task 1: i18n-Schlüssel (DE + EN)

**Files:**
- Modify: `public/i18n.js` (Einfügen direkt nach `'landing.pageTitle'`, aktuell Zeile 33)

**Interfaces:**
- Produces: DICT-Schlüssel, abrufbar via `t('landing.…')` und `t('landing.secure.mailSubject', { title })` / `t('landing.secure.mailBody', { title, url })`.

- [ ] **Step 1: Schlüssel einfügen**

In `public/i18n.js` unmittelbar nach der Zeile `'landing.pageTitle': { … },` diesen Block einfügen:

```js
  'landing.join.helpNoCode': { de: 'Kein Code? Fragen Sie die Person, die präsentiert.', en: 'No code? Ask the person presenting.' },
  'landing.create.divider': { de: 'oder', en: 'or' },
  'landing.create.secondaryTitle': { de: 'Eigene Präsentation erstellen', en: 'Create your own presentation' },
  'landing.secure.heading': { de: 'Präsentation erstellt', en: 'Presentation created' },
  'landing.secure.intro': { de: 'Nur dieser Link führt zurück in die Moderation — sichern Sie ihn.', en: 'This link is the only way back into moderation — save it.' },
  'landing.secure.linkLabel': { de: 'Moderationslink', en: 'Presenter link' },
  'landing.secure.copy': { de: 'Link kopieren', en: 'Copy link' },
  'landing.secure.copied': { de: 'Kopiert ✓', en: 'Copied ✓' },
  'landing.secure.qrCaption': { de: 'Mit dem Handy scannen, um den Zugang auf ein zweites Gerät zu holen.', en: 'Scan with your phone to keep access on a second device.' },
  'landing.secure.mail': { de: 'Per Mail senden', en: 'Send by email' },
  'landing.secure.mailSubject': { de: 'PULS Moderationslink: {{title}}', en: 'PULS presenter link: {{title}}' },
  'landing.secure.mailBody': { de: 'Moderationslink für „{{title}}":\n{{url}}\n\nNur über diesen Link kommen Sie zurück in die Moderation.', en: 'Presenter link for "{{title}}":\n{{url}}\n\nThis link is the only way back into moderation.' },
  'landing.secure.continue': { de: 'Weiter zur Moderation', en: 'Continue to moderation' },
  'landing.secure.laterHint': { de: 'Sie finden ihn später auch unter „Meine Präsentationen".', en: 'You can also find it later under "My presentations".' },
  'landing.mine.storedHint': { de: 'nur in diesem Browser gespeichert', en: 'stored in this browser only' },
  'landing.mine.secure': { de: 'Link sichern', en: 'Save link' },
  'landing.mine.dialogTitle': { de: 'Zugang sichern', en: 'Save access' },
  'landing.dialog.close': { de: 'Schließen', en: 'Close' },
```

- [ ] **Step 2: Verifizieren (Browser-Konsole)**

`npm start`, dann `http://localhost:3000` öffnen, DevTools-Konsole:

```js
t('landing.secure.heading')                         // "Präsentation erstellt"
t('landing.secure.mailBody', { title: 'X', url: 'Y' }) // enthält "X" und "Y"
setLang('en'); t('landing.mine.secure')             // "Save link"
setLang('de')
```

Erwartet: die kommentierten Werte; keine Rückgabe des bloßen Schlüssels (das hieße „nicht gefunden").

- [ ] **Step 3: Commit**

```bash
git add public/i18n.js
git commit -m "i18n: add landing keys for join hint, create divider and Zugang sichern (DE+EN)"
```

---

### Task 2: Startseite neu — Beitreten dominant (L1) + Auto-Weiter (L2)

**Files:**
- Modify: `public/index.html` (Markup: ersetzt den `<div class="landing-grid">…</div>`-Block, aktuell Zeilen 29–56; Script: Join-Handler, aktuell Zeilen 82–103)
- Modify: `public/app.css` (neue Layout-Regeln neben den bestehenden `.landing-grid`-Regeln bei Zeile 66)

**Interfaces:**
- Consumes: `t()`, `api('GET', '/api/join/<code>')`.
- Produces: die IDs `joinForm`, `joinCode`, `joinError`, `createForm`, `presTitle`, `createError` bleiben erhalten (spätere Tasks hängen daran). Funktion `attemptJoin(code)` (async) für Auto-Weiter und Submit.

- [ ] **Step 1: Markup ersetzen**

In `public/index.html` den kompletten Block von `<div class="landing-grid">` bis zum schließenden `</div>` vor `<div class="ds-card my-presentations" …>` (aktuell Zeilen 29–56) durch dieses Markup ersetzen:

```html
    <div class="join-primary">
      <div class="ds-card accent-primary join-card">
        <div class="ds-card-title" data-i18n="landing.join.title">An einer Präsentation teilnehmen</div>
        <form id="joinForm">
          <div class="field">
            <label for="joinCode" data-i18n="landing.join.codeLabel">Zugangscode</label>
            <input class="code-input" id="joinCode" inputmode="numeric" autocomplete="off"
                   maxlength="7" placeholder="000 000" data-i18n-aria-label="landing.join.codeAria" aria-label="Sechsstelliger Zugangscode">
          </div>
          <button class="ds-btn ds-btn-primary ds-btn-lg" type="submit" data-i18n="landing.join.submit">Teilnehmen</button>
          <div class="error-note" id="joinError"></div>
          <div class="help join-help" data-i18n="landing.join.helpNoCode">Kein Code? Fragen Sie die Person, die präsentiert.</div>
        </form>
      </div>
    </div>

    <div class="or-divider"><span data-i18n="landing.create.divider">oder</span></div>

    <div class="ds-card accent-neutral create-card">
      <div class="ds-card-title" data-i18n="landing.create.secondaryTitle">Eigene Präsentation erstellen</div>
      <form id="createForm" class="create-row">
        <div class="field">
          <label for="presTitle" data-i18n="field.title.label">Titel</label>
          <input type="text" id="presTitle" maxlength="120" placeholder="z. B. Team-Meeting Juli"
                 data-i18n-placeholder="landing.create.titlePlaceholder" autocomplete="off">
        </div>
        <button class="ds-btn ds-btn-lg" type="submit" data-i18n="landing.create.submit">Erstellen</button>
        <div class="error-note" id="createError"></div>
      </form>
    </div>
```

- [ ] **Step 2: Join-Script auf Auto-Weiter umbauen**

In `public/index.html` den bestehenden Join-Block (aktuell Zeilen 82–103: der `joinForm`-Submit-Listener **und** der `joinCode`-`input`-Listener) durch diesen ersetzen:

```js
// --- Beitreten -------------------------------------------------------------
let joining = false;        // verhindert Doppel-Absenden
let lastAttempt = '';       // zuletzt geprüfter 6-stelliger Code (kein Re-Trigger)

async function attemptJoin(code) {
  const errEl = document.getElementById('joinError');
  if (code.length !== 6) { errEl.textContent = t('landing.join.errInvalid'); return; }
  if (joining) return;
  joining = true;
  errEl.textContent = '';
  try {
    await api('GET', `/api/join/${code}`);
    location.href = `/vote.html?code=${code}`;
  } catch {
    errEl.textContent = t('landing.join.errNotFound');
    joining = false;
  }
}

document.getElementById('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  attemptJoin(document.getElementById('joinCode').value.replace(/\D/g, ''));
});

// Eingabe formatieren ("123 456") und bei sechs Ziffern automatisch weiter (L2)
document.getElementById('joinCode').addEventListener('input', (e) => {
  const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
  e.target.value = digits.length > 3 ? digits.slice(0, 3) + ' ' + digits.slice(3) : digits;
  if (digits.length === 6 && digits !== lastAttempt) {
    lastAttempt = digits;
    attemptJoin(digits);
  } else if (digits.length < 6) {
    lastAttempt = '';           // erneut freigeben, sobald wieder unter 6
  }
});
```

- [ ] **Step 3: CSS ergänzen**

In `public/app.css` direkt nach den bestehenden `.landing-grid`-Regeln (nach Zeile 67) einfügen:

```css
/* Mockup D — Beitreten dominant, Erstellen als Zweitweg */
.join-primary { max-width: 460px; margin: 0 auto 1.25rem; }
.join-card .code-input { font-size: 1.9rem; }
.join-help { margin-top: 0.75rem; }
.or-divider {
  display: flex; align-items: center; gap: 1rem;
  max-width: 460px; margin: 0 auto 1.25rem;
  color: var(--grey-4); font-size: 0.8rem;
}
.or-divider::before, .or-divider::after {
  content: ""; flex: 1; height: 1px; background: var(--grey-1);
}
.create-card { max-width: 460px; margin: 0 auto 2rem; }
.create-row { display: flex; gap: 0.6rem; align-items: flex-end; flex-wrap: wrap; }
.create-row .field { flex: 1; min-width: 12rem; margin-bottom: 0; }
```

- [ ] **Step 4: Verifizieren (Browser)**

Hard-Reload auf `http://localhost:3000`. Prüfen:
- Beitreten-Karte steht groß und zentriert oben; Erstellen-Karte kleiner darunter, getrennt durch „oder".
- Eine gültige Präsentation anlegen (kurz über die alte Konsole oder eine bestehende), deren 6-stelligen Code ins Feld **tippen** → automatische Weiterleitung nach `vote.html` ohne Button-Klick. Erwartet: URL wechselt zu `/vote.html?code=…`.
- Denselben Code als 6 Ziffern **einfügen (Paste)** → ebenfalls Auto-Weiter.
- Einen falschen 6-stelligen Code tippen → Inline-Fehler „Kein aktives Event…", Feld bleibt; nach Korrektur auf 5 und wieder auf 6 Ziffern wird erneut geprüft.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.css
git commit -m "L1/L2: make joining the dominant landing action with 6-digit auto-advance"
```

---

### Task 3: Sicher-Block-Baustein (`buildSecureBlock`) + Styles

**Files:**
- Modify: `public/index.html` (`<script>`: neue Funktionen `moderationUrl`, `buildSecureBlock`)
- Modify: `public/app.css` (Styles für Sicher-Block)

**Interfaces:**
- Consumes: `t()`, `renderQR(container, text, sizePx)`, `esc()`.
- Produces:
  - `moderationUrl(id, token) → string` — vollständiger Moderationslink.
  - `buildSecureBlock({ title, url }) → HTMLElement` — Container `.secure-block` mit Link-Zeile + „Link kopieren", QR + Bildunterschrift, „Per Mail senden". **Ohne** Weiter-/Schließen-Buttons (setzt der Aufrufer).

- [ ] **Step 1: Funktionen einfügen**

In `public/index.html` im `<script>` (vor `renderMine`) einfügen:

```js
function moderationUrl(id, token) {
  return `${location.origin}/presenter.html?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
}

// Ein Sicher-Block, zweifach genutzt (Nach-Erstellen-Ansicht + Dialog).
function buildSecureBlock({ title, url }) {
  const block = el(`
    <div class="secure-block">
      <label class="secure-link-label">${esc(t('landing.secure.linkLabel'))}</label>
      <div class="secure-link-row">
        <input class="secure-link" type="text" readonly value="${esc(url)}">
        <button type="button" class="ds-btn secure-copy">${esc(t('landing.secure.copy'))}</button>
      </div>
      <div class="secure-qr"></div>
      <div class="help secure-qr-caption">${esc(t('landing.secure.qrCaption'))}</div>
      <a class="ds-btn secure-mail" href="#">${esc(t('landing.secure.mail'))}</a>
    </div>`);

  renderQR(block.querySelector('.secure-qr'), url, 150);

  block.querySelector('.secure-mail').href =
    'mailto:?subject=' + encodeURIComponent(t('landing.secure.mailSubject', { title })) +
    '&body=' + encodeURIComponent(t('landing.secure.mailBody', { title, url }));

  const copyBtn = block.querySelector('.secure-copy');
  const input = block.querySelector('.secure-link');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      input.focus(); input.select();
      try { document.execCommand('copy'); } catch { /* Link bleibt markiert sichtbar */ }
    }
    copyBtn.textContent = t('landing.secure.copied');
    setTimeout(() => { copyBtn.textContent = t('landing.secure.copy'); }, 1500);
  });

  return block;
}
```

- [ ] **Step 2: Styles einfügen**

In `public/app.css` ans Ende der Datei anhängen:

```css
/* Mockup D — Sicher-Block (Link/Kopieren/QR/Mail) */
.secure-block { margin-top: 0.5rem; }
.secure-link-label {
  display: block; font-size: 0.7rem; color: var(--grey-4);
  text-transform: none; margin-bottom: 0.25rem;
}
.secure-link-row { display: flex; gap: 0.5rem; align-items: stretch; }
.secure-link {
  flex: 1; min-width: 0; font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 0.8rem; padding: 0.55rem 0.6rem;
  border: 1px solid var(--grey-2); border-radius: var(--radius);
  background: var(--row-alt); color: var(--grey-6);
}
.secure-copy { white-space: nowrap; }
.secure-qr { margin: 1rem 0 0.35rem; }
.secure-qr svg { width: 150px; height: 150px; display: block; }
.secure-qr-caption { margin-bottom: 1rem; }
.secure-mail { display: inline-block; }
```

- [ ] **Step 3: Verifizieren (Browser-Konsole)**

Hard-Reload, dann in der Konsole zeitweise einhängen:

```js
document.querySelector('main .container').appendChild(
  buildSecureBlock({ title: 'Test', url: moderationUrl('id-123', 'tok-abc') })
);
```

Erwartet: Block erscheint mit monospacem Link, „Link kopieren", einem gerenderten QR-SVG und einem „Per Mail senden"-Button. „Link kopieren" klicken → Text wechselt kurz zu „Kopiert ✓", Zwischenablage enthält den Link. Mit der Maus über „Per Mail senden" → Statuszeile zeigt eine `mailto:`-Adresse mit Betreff und Link. Danach Reload (Test-Einhängung verschwindet).

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/app.css
git commit -m "L3: add reusable secure-link block (copy, QR, mailto)"
```

---

### Task 4: Erstellen → „Zugang sichern"-Ansicht (L3, Kern)

**Files:**
- Modify: `public/index.html` (`<script>`: Create-Handler, `showSecureView`, Modul-State `secureState`)

**Interfaces:**
- Consumes: `buildSecureBlock`, `moderationUrl`, `t()`, `api('POST', '/api/presentations', …)`, localStorage-Schlüssel `puls.mine`.
- Produces: `showSecureView({ id, token, title })` — ersetzt den Inhalt von `main .container` durch die Sicher-Ansicht und setzt `secureState`. Modul-Variable `secureState` (null oder `{ id, token, title }`).

- [ ] **Step 1: Create-Handler + Sicher-Ansicht einbauen**

In `public/index.html` den bestehenden `createForm`-Submit-Listener (aktuell ~Zeilen 106–121) durch diesen ersetzen und `showSecureView` + `secureState` ergänzen:

```js
// --- Erstellen ---------------------------------------------------------------
let secureState = null;   // { id, token, title } solange die Sicher-Ansicht sichtbar ist

document.getElementById('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('createError');
  errEl.textContent = '';
  try {
    const pres = await api('POST', '/api/presentations', {
      title: document.getElementById('presTitle').value,
    });
    const mine = JSON.parse(localStorage.getItem('puls.mine') || '[]');
    mine.unshift({ id: pres.id, code: pres.code, title: pres.title, adminToken: pres.adminToken });
    localStorage.setItem('puls.mine', JSON.stringify(mine.slice(0, 30)));
    showSecureView({ id: pres.id, token: pres.adminToken, title: pres.title });
  } catch {
    errEl.textContent = t('landing.create.errFailed');
  }
});

function showSecureView({ id, token, title }) {
  secureState = { id, token, title };
  const url = moderationUrl(id, token);
  const container = document.querySelector('main .container');
  container.innerHTML = '';
  const view = el(`
    <section class="secure-view">
      <h1 class="secure-heading">${esc(t('landing.secure.heading'))} <span class="secure-check">✓</span></h1>
      <p class="secure-intro">${esc(t('landing.secure.intro'))}</p>
    </section>`);
  const card = el('<div class="ds-card accent-primary secure-card"></div>');
  card.appendChild(buildSecureBlock({ title, url }));
  const cont = el(`<button type="button" class="ds-btn ds-btn-primary ds-btn-lg secure-continue">${esc(t('landing.secure.continue'))} →</button>`);
  cont.addEventListener('click', () => { location.href = `/presenter.html?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`; });
  const later = el(`<div class="help secure-later">${esc(t('landing.secure.laterHint'))}</div>`);
  card.appendChild(cont);
  card.appendChild(later);
  view.appendChild(card);
  container.appendChild(view);
}
```

- [ ] **Step 2: Styles für die Ansicht einfügen**

In `public/app.css` ans Ende anhängen:

```css
/* Mockup D — Zugang-sichern-Ansicht nach dem Erstellen */
.secure-view { max-width: 520px; margin: 2.5rem auto; }
.secure-heading { font-size: 1.6rem; font-weight: 300; color: var(--black); }
.secure-check { color: var(--success); font-weight: 600; }
.secure-intro { font-size: 0.95rem; color: var(--grey-5); margin: 0.5rem 0 1.5rem; }
.secure-card .secure-continue { margin-top: 1.25rem; }
.secure-later { margin-top: 0.6rem; }
```

- [ ] **Step 3: Verifizieren (Browser)**

Hard-Reload auf `http://localhost:3000`. In der Erstellen-Karte einen Titel eingeben, „Erstellen":
- Erwartet: Startseite wird durch „Präsentation erstellt ✓" + Erklärsatz + Sicher-Block (Link/Kopieren/QR/Mail) + „Weiter zur Moderation →" + Später-Hinweis ersetzt. Keine Navigation bis hierher.
- „Link kopieren" → „Kopiert ✓"; QR sichtbar; „Per Mail senden" öffnet Mailprogramm-Entwurf mit Titel + Link.
- „Weiter zur Moderation →" → landet in `presenter.html?id=…&token=…`, Moderation lädt normal.
- Zurück zur Startseite, neu laden → die eben erstellte Präsentation steht unter „Meine Präsentationen" (localStorage funktioniert weiter).

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/app.css
git commit -m "L3: show a Zugang sichern step after creating instead of jumping to presenter"
```

---

### Task 5: „Meine Präsentationen" — Hinweis + „Link sichern"-Dialog + Sprach-Refresh

**Files:**
- Modify: `public/index.html` (`<script>`: `renderMine` erweitern, `openSecureDialog`, `refreshLanguage` erweitern; Markup: Metazeile am `mineCard`-Titel)
- Modify: `public/app.css` (Overlay-Dialog-Styles)

**Interfaces:**
- Consumes: `buildSecureBlock`, `moderationUrl`, `t()`, `esc()`, `el()`, `formatCode()`, `secureState`, `showSecureView`.
- Produces: `openSecureDialog({ title, url })` — In-Style-Overlay mit dem Sicher-Block; schließbar per Button, Backdrop-Klick und `Esc`. Modul-Variable `dialogState` (null oder `{ title, url }`).

- [ ] **Step 1: Metazeile im Titel von „Meine Präsentationen"**

In `public/index.html` die Titelzeile der `my-presentations`-Karte (aktuell `<div class="ds-card-title" data-i18n="landing.mine.title">Meine Präsentationen</div>`) ersetzen durch:

```html
      <div class="ds-card-title mine-title">
        <span data-i18n="landing.mine.title">Meine Präsentationen</span>
        <span class="mine-stored-hint" data-i18n="landing.mine.storedHint">nur in diesem Browser gespeichert</span>
      </div>
```

- [ ] **Step 2: `renderMine` um „Link sichern" erweitern + Dialog + Sprach-Refresh**

In `public/index.html` die bestehende `renderMine`-Funktion sowie `refreshLanguage` (aktuell ~Zeilen 124–150) durch diesen Block ersetzen und `openSecureDialog` + `dialogState` ergänzen:

```js
// --- Meine Präsentationen -------------------------------------------------------
let dialogState = null;   // { title, url } solange der Sicher-Dialog offen ist

function renderMine() {
  const mine = JSON.parse(localStorage.getItem('puls.mine') || '[]');
  const card = document.getElementById('mineCard');
  const list = document.getElementById('mineList');
  if (!card || !list) return;                 // in der Sicher-Ansicht nicht vorhanden
  if (!mine.length) { card.hidden = true; return; }
  card.hidden = false;
  list.innerHTML = '';
  mine.forEach((p) => {
    const row = el(`
      <div class="item">
        <div>
          <div class="t">${esc(p.title)}</div>
          <div class="c">Code ${formatCode(p.code)}</div>
        </div>
        <div style="display:flex; gap:0.4rem;">
          <button type="button" class="ds-btn mine-secure">${esc(t('landing.mine.secure'))}</button>
          <a class="ds-btn" href="/presenter.html?id=${encodeURIComponent(p.id)}&token=${encodeURIComponent(p.adminToken)}">${esc(t('landing.mine.moderate'))}</a>
        </div>
      </div>`);
    row.querySelector('.mine-secure').addEventListener('click', () => {
      openSecureDialog({ title: p.title, url: moderationUrl(p.id, p.adminToken) });
    });
    list.appendChild(row);
  });
}
renderMine();

function openSecureDialog({ title, url }) {
  closeSecureDialog();
  dialogState = { title, url };
  const overlay = el(`
    <div class="secure-overlay" id="secureOverlay">
      <div class="secure-dialog ds-card" role="dialog" aria-modal="true">
        <div class="ds-card-title">${esc(t('landing.mine.dialogTitle'))}</div>
      </div>
    </div>`);
  const dialog = overlay.querySelector('.secure-dialog');
  dialog.appendChild(buildSecureBlock({ title, url }));
  const close = el(`<button type="button" class="ds-btn secure-dialog-close">${esc(t('landing.dialog.close'))}</button>`);
  close.addEventListener('click', closeSecureDialog);
  dialog.appendChild(close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSecureDialog(); });
  document.body.appendChild(overlay);
}

function closeSecureDialog() {
  dialogState = null;
  const existing = document.getElementById('secureOverlay');
  if (existing) existing.remove();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dialogState) closeSecureDialog();
});

function refreshLanguage() {
  document.title = t('landing.pageTitle');
  if (secureState) { showSecureView(secureState); return; }  // dynamische Ansicht neu bauen
  renderMine();
  if (dialogState) openSecureDialog(dialogState);            // offenen Dialog neu bauen
}
```

- [ ] **Step 3: Overlay-Styles + Metazeile-Styles einfügen**

In `public/app.css` ans Ende anhängen:

```css
/* Mockup D — Meine Präsentationen: Hinweis + Sicher-Dialog */
.mine-title { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.mine-stored-hint { font-size: 0.7rem; font-weight: 400; color: var(--grey-4); }
.secure-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
}
.secure-dialog { max-width: 460px; width: 100%; box-shadow: var(--shadow-hover); }
.secure-dialog-close { margin-top: 1rem; }
```

- [ ] **Step 4: Verifizieren (Browser)**

Hard-Reload auf `http://localhost:3000` (mit mind. einer Präsentation unter „Meine Präsentationen"):
- Kartentitel zeigt rechts dezent „nur in diesem Browser gespeichert".
- „Link sichern" an einem Eintrag → Overlay-Dialog „Zugang sichern" mit demselben Sicher-Block (Link/Kopieren/QR/Mail) + „Schließen".
- Schließen per Button, per Klick auf den abgedunkelten Hintergrund und per `Esc` — jeweils schließt der Dialog.
- „Moderieren" funktioniert unverändert.
- **Sprach-Refresh:** DE/EN im Kopf umschalten (a) auf der Startseite → alle Texte inkl. Metazeile ziehen nach; (b) bei offenem Dialog → Dialog-Texte wechseln; (c) nach dem Erstellen in der Sicher-Ansicht → Überschrift/Buttons/Hinweis wechseln.

- [ ] **Step 5: End-to-End-Durchlauf**

Kompletter Flow in einem Rutsch: Erstellen → Sicher-Ansicht → „Weiter zur Moderation" → zurück zur Startseite → „Meine Präsentationen" → „Link sichern" → Dialog schließen. Dann Beitreten per Auto-Weiter mit dem echten Code. Erwartet: keine Konsolenfehler, alle Schritte wie beschrieben. `server.js` unverändert (`git status` zeigt keine Serveränderung).

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/app.css
git commit -m "L3: add stored-in-this-browser hint and a Link sichern dialog to My presentations"
```

---

## Self-Review

**Spec-Abdeckung:**
- L1 (Beitreten dominant) → Task 2 (Markup + CSS). ✓
- L2 (Auto-Weiter) → Task 2 (`attemptJoin` bei 6 Ziffern, Paste inklusive). ✓
- L3 Kern (Sicher-Schritt nach Erstellen) → Task 3 (`buildSecureBlock`) + Task 4 (`showSecureView`). ✓
- L3 Teil 2 (Startseiten-Hinweis + „Link sichern" jederzeit) → Task 5 (Metazeile + Dialog). ✓
- Sicher-Wege Kopieren/QR/mailto → Task 3. ✓ (Datei-Download bewusst ausgelassen — nicht gewählt.)
- DE+EN i18n → Task 1, in allen Views genutzt; Sprach-Refresh → Task 5. ✓
- Kein Servereingriff, Zero-Dependency, `mailto:` → Global Constraints; kein `server.js` in „Files". ✓
- Randfälle: Clipboard-Fallback (Task 3), QR no-op-sicher (bestehend), Sprach-Refresh aller Ansichten (Task 5), Erstellen-Fehler behält Inline-Meldung (Task 4). ✓

**Platzhalter-Scan:** keine TBD/TODO; jeder Code-Schritt zeigt vollständigen Code. ✓

**Typ-Konsistenz:** `moderationUrl(id, token)`, `buildSecureBlock({title,url})`, `showSecureView({id,token,title})`, `openSecureDialog({title,url})`, `secureState`, `dialogState`, `attemptJoin(code)` durchgängig gleich benannt und genutzt. IDs `joinForm/joinCode/joinError/createForm/presTitle/createError/mineCard/mineList` bleiben stabil. ✓
