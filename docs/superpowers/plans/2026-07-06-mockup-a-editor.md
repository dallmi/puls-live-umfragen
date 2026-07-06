# Mockup A — Editor: Typ-Galerie & Live-Vorschau Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Editor in `presenter.html` überarbeiten: Typ-Galerie statt Dropdown (E1), Live-Handy-Vorschau der echten `vote.html` (E2), einklappbare Einstellungen (E3), Gefahraktionen im Overflow-Menü mit eigenen Dialogen (E4/Ü2), Drag-Reorder + Duplizieren (E5), aufgeräumte mobile Kopfleiste (E6).

**Architecture:** Rein clientseitig. Eigene In-Style-Dialoge (`confirmDialog`/`alertDialog`) ersetzen `confirm()`/`alert()`. Eine Typ-Galerie (Overlay) ersetzt das `<select>`. Die Live-Vorschau ist ein `<iframe src="/vote.html?preview=1">`, das per `postMessage` die aktuelle Folie erhält; `vote.html` bekommt dafür einen additiven Vorschau-Modus (kein Beitritt/SSE/Senden). Reorder/Duplizieren nutzen das bestehende `PUT /api/presentations/:id/slides`.

**Tech Stack:** Vanilla HTML/CSS/JS. Wiederverwendung `typeMeta`/`SLIDE_TYPES`, `renderVote`/`applyBrand` (in vote.html), `renderSlideList`/`renderSlideEditor`/`scheduleSave`, Pointer-Events (Drag), `postMessage`.

## Global Constraints

- **Zero-Dependency**: keine neuen Pakete, kein Test-Runner, kein CDN.
- **Kein Servereingriff**: `server.js` unverändert; Reorder/Duplizieren via bestehendem `PUT …/slides`.
- **Design-System strikt**: nur bestehende Tokens/Klassen; Rot `--primary #E60000` nur Akzent; Radius `var(--radius)` 2px; kein Verlauf; kein ALL-CAPS.
- **Zweisprachig**: jeder neue sichtbare Text als i18n-Key mit **DE + EN**.
- **postMessage-Sicherheit**: immer `location.origin` als targetOrigin; Empfänger prüft `event.origin === location.origin`.
- **9 Folientypen** (`SLIDE_TYPES = ['choice','wordcloud','open','scale','ranking','points','quiz','qa','info']`).

## Verifikationsmodell (kein Test-Runner)

Zero-Dependency, kein Test-Framework — Verifikation **browser-getrieben** am laufenden Server (zentral bereitgestellt auf Port 3000; **nicht** selbst starten). Inline-Syntaxcheck:
```
node -e 'const fs=require("fs");const h=fs.readFileSync("public/presenter.html","utf8");const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync(".superpowers/sdd/_pres_inline.js",m.map(x=>x[1]).join("\n;\n"))' && node --check .superpowers/sdd/_pres_inline.js && echo SYNTAX_OK
```
(vote.html analog mit `_vote_inline.js`.) Editor öffnen: `POST /api/presentations` (Header-Auth `X-Admin-Token`), dann `http://localhost:3000/presenter.html?id=<id>&token=<adminToken>`.

## File Structure

- `public/i18n.js` — Modify: neue `presenter.*`/`dialog.*`-Keys.
- `public/presenter.html` — Modify (Hauptteil): Dialoge, Galerie, Vorschau-iframe, Einstellungen-Toggle, Overflow-Menü, Drag/Duplizieren.
- `public/vote.html` — Modify (additiv): Vorschau-Modus (`?preview=1`, postMessage).
- `public/app.css` — Modify: 3-Spalten, Galerie, Phone-Frame, Overflow-Menü, Dialoge, Drag-Handle.

---

### Task 1: i18n-Keys (DE + EN)

**Files:**
- Modify: `public/i18n.js` (neue Keys nach dem letzten `'presenter.*'`-Eintrag)

**Interfaces:**
- Produces: Keys `dialog.confirm`, `dialog.cancel`, `dialog.close`, `presenter.gallery.title`, `presenter.gallery.newTitle`, `presenter.slide.changeType`, `presenter.preview.title`, `presenter.preview.subtitle`, `presenter.preview.empty`, `presenter.more`, `presenter.slide.duplicate`, `presenter.settings.toggle`, `presenter.confirm.deleteSlideBody`, `presenter.confirm.resetSlideBody`, `presenter.confirm.resetAllBody`, `presenter.confirm.archiveBody`.

- [ ] **Step 1: Keys einfügen**

In `public/i18n.js` nach dem letzten mit `'presenter.` beginnenden Key einfügen:
```js
  'dialog.confirm': { de: 'Bestätigen', en: 'Confirm' },
  'dialog.cancel': { de: 'Abbrechen', en: 'Cancel' },
  'dialog.close': { de: 'Schließen', en: 'Close' },
  'presenter.more': { de: 'Mehr', en: 'More' },
  'presenter.gallery.title': { de: 'Folientyp wählen', en: 'Choose slide type' },
  'presenter.gallery.newTitle': { de: 'Neue Folie — Typ wählen', en: 'New slide — choose type' },
  'presenter.slide.changeType': { de: 'Typ ändern', en: 'Change type' },
  'presenter.slide.duplicate': { de: 'Duplizieren', en: 'Duplicate' },
  'presenter.settings.toggle': { de: 'Präsentation & Einstellungen', en: 'Presentation & settings' },
  'presenter.preview.title': { de: 'Live-Vorschau', en: 'Live preview' },
  'presenter.preview.subtitle': { de: 'Aktualisiert sich beim Tippen — Publikums-Ansicht', en: 'Updates as you type — audience view' },
  'presenter.preview.empty': { de: 'Noch keine Folie ausgewählt.', en: 'No slide selected yet.' },
  'presenter.confirm.deleteSlideBody': { de: 'Diese Folie und ihre Antworten werden gelöscht. Das lässt sich nicht rückgängig machen.', en: 'This slide and its answers will be deleted. This cannot be undone.' },
  'presenter.confirm.resetSlideBody': { de: 'Alle Antworten dieser Folie werden gelöscht — nicht umkehrbar.', en: 'All answers on this slide will be cleared — cannot be undone.' },
  'presenter.confirm.resetAllBody': { de: 'Die Antworten ALLER Folien werden gelöscht — nicht umkehrbar.', en: 'Answers on ALL slides will be cleared — cannot be undone.' },
  'presenter.confirm.archiveBody': { de: 'Die aktuellen Ergebnisse werden archiviert und die Antworten geleert.', en: 'Current results are archived and answers cleared for a new run.' },
```

- [ ] **Step 2: Verifizieren**

`node --check public/i18n.js` → exit 0. Presence-Check:
```
node -e 'const fs=require("fs");const s=fs.readFileSync("public/i18n.js","utf8");for(const k of ["dialog.confirm","dialog.cancel","presenter.gallery.title","presenter.slide.changeType","presenter.preview.subtitle","presenter.more","presenter.slide.duplicate","presenter.settings.toggle","presenter.confirm.resetAllBody"]) if(!s.includes("\x27"+k+"\x27")) throw new Error("fehlt "+k);console.log("KEYS OK")'
```
Erwartet `KEYS OK`.

- [ ] **Step 3: Commit**
```bash
git add public/i18n.js
git commit -m "A: add editor i18n keys (dialogs, type gallery, preview, overflow menu, duplicate) DE+EN"
```

---

### Task 2: Eigene In-Style-Dialoge (Ü2)

**Files:**
- Modify: `public/presenter.html` (neue Helfer `confirmDialog`/`alertDialog`; ersetzt 8 `confirm()`/`alert()`-Stellen)
- Modify: `public/app.css` (Dialog-Overlay)

**Interfaces:**
- Consumes: `el`, `esc`, `t`.
- Produces:
  - `confirmDialog({ title, body, confirmLabel, danger }) → Promise<boolean>` — In-Style-Overlay; Bestätigen (rot bei `danger`) resolvet `true`, Abbrechen/Backdrop/Esc resolvet `false`.
  - `alertDialog({ title, body }) → Promise<void>` — Hinweis-Overlay mit „Schließen".

- [ ] **Step 1: Dialog-Helfer einfügen**

In `public/presenter.html` im `<script>` (z. B. vor den Event-Wirings) einfügen:
```js
function overlay(inner) {
  const ov = el(`<div class="ds-overlay" role="dialog" aria-modal="true"></div>`);
  ov.appendChild(inner);
  document.body.appendChild(ov);
  return ov;
}
function confirmDialog({ title, body, confirmLabel, danger }) {
  return new Promise((resolve) => {
    const card = el(`
      <div class="ds-dialog ds-card">
        <div class="ds-card-title">${esc(title)}</div>
        <p class="ds-dialog-body">${esc(body || '')}</p>
        <div class="ds-dialog-actions">
          <button class="ds-btn" data-act="cancel">${esc(t('dialog.cancel'))}</button>
          <button class="ds-btn ${danger ? 'ds-btn-danger' : 'ds-btn-primary'}" data-act="ok">${esc(confirmLabel || t('dialog.confirm'))}</button>
        </div>
      </div>`);
    const ov = overlay(card);
    function done(v) { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); }
    function onKey(e) { if (e.key === 'Escape') done(false); }
    card.querySelector('[data-act="cancel"]').addEventListener('click', () => done(false));
    card.querySelector('[data-act="ok"]').addEventListener('click', () => done(true));
    ov.addEventListener('click', (e) => { if (e.target === ov) done(false); });
    document.addEventListener('keydown', onKey);
    card.querySelector('[data-act="ok"]').focus();
  });
}
function alertDialog({ title, body }) {
  return new Promise((resolve) => {
    const card = el(`
      <div class="ds-dialog ds-card">
        <div class="ds-card-title">${esc(title)}</div>
        <p class="ds-dialog-body">${esc(body || '')}</p>
        <div class="ds-dialog-actions">
          <button class="ds-btn ds-btn-primary" data-act="close">${esc(t('dialog.close'))}</button>
        </div>
      </div>`);
    const ov = overlay(card);
    function done() { ov.remove(); document.removeEventListener('keydown', onKey); resolve(); }
    function onKey(e) { if (e.key === 'Escape') done(); }
    card.querySelector('[data-act="close"]').addEventListener('click', done);
    ov.addEventListener('click', (e) => { if (e.target === ov) done(); });
    document.addEventListener('keydown', onKey);
    card.querySelector('[data-act="close"]').focus();
  });
}
```

- [ ] **Step 2: Die 8 `confirm()`/`alert()`-Stellen ersetzen**

In `public/presenter.html` jede Stelle ersetzen (die umgebenden Handler werden `async`, wo nötig):
- `:621` archive: `if (!confirm(t('presenter.details.archiveConfirm'))) return;` → `if (!await confirmDialog({ title: t('presenter.details.archive'), body: t('presenter.confirm.archiveBody'), confirmLabel: t('presenter.details.archive') })) return;` (den Handler `async` machen).
- `:625` `alert(t('presenter.details.archiveFailed'))` → `await alertDialog({ title: t('presenter.details.archive'), body: t('presenter.details.archiveFailed') });`
- `:650` `alert(t('presenter.brand.tooLarge'))` → `await alertDialog({ title: t('presenter.brand.label'), body: t('presenter.brand.tooLarge') });` (Handler async).
- `:660` `alert(t('presenter.brand.tooLarge'))` → `await alertDialog({ title: t('presenter.brand.label'), body: t('presenter.brand.tooLarge') });` (Handler async).
- `:681` delete: `if (!confirm(t('presenter.confirm.deleteSlide'))) return;` → `if (!await confirmDialog({ title: t('presenter.slide.delete'), body: t('presenter.confirm.deleteSlideBody'), confirmLabel: t('presenter.slide.delete'), danger: true })) return;` (Handler async).
- `:712` `alert(t('presenter.pptxFailed') + e.message)` → `await alertDialog({ title: t('presenter.pptxExport'), body: t('presenter.pptxFailed') + e.message });`
- `:720` resetSlide: `if (!confirm(t('presenter.confirm.resetSlide'))) return;` → `if (!await confirmDialog({ title: t('presenter.slide.resetAnswers'), body: t('presenter.confirm.resetSlideBody'), confirmLabel: t('presenter.slide.resetAnswers'), danger: true })) return;` (Handler async).
- `:724` resetAll: `if (!confirm(t('presenter.confirm.resetAll'))) return;` → `if (!await confirmDialog({ title: t('presenter.resetAll'), body: t('presenter.confirm.resetAllBody'), confirmLabel: t('presenter.resetAll'), danger: true })) return;` (Handler async).

(Für jede geänderte Stelle: die zugehörige `addEventListener('click', () => {...})`-Arrow-Funktion zu `async () => {...}` machen.)

- [ ] **Step 3: Dialog-CSS**

In `public/app.css` ans Ende anhängen:
```css
/* Mockup A — In-Style-Dialoge (Ü2) */
.ds-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
.ds-dialog { max-width: 440px; width: 100%; box-shadow: var(--shadow-hover); }
.ds-dialog-body { font-size: 0.95rem; color: var(--grey-5); margin: 0.5rem 0 1.25rem; }
.ds-dialog-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
```

- [ ] **Step 4: Verifizieren (Browser)**

Syntaxcheck → SYNTAX_OK. Editor öffnen (Präsentation mit ≥1 Folie): „Löschen" → eigener Dialog mit Konsequenz-Text + rotem „Löschen"; Esc/Backdrop bricht ab (Folie bleibt), roter Button löscht. „Alle Antworten zurücksetzen" analog. Keine nativen `confirm/alert` mehr (per `grep -c "confirm(\|alert(" public/presenter.html` → 0). Keine Konsolenfehler.

- [ ] **Step 5: Commit**
```bash
git add public/presenter.html public/app.css
git commit -m "A (Ü2): replace native confirm/alert with in-style confirm/alert dialogs"
```

---

### Task 3: Typ-Galerie (E1)

**Files:**
- Modify: `public/presenter.html` (neue `typeIcon`, `openTypeGallery`, `applyTypeDefaults`; Markup `#slideEditor`: `<select>` → „Typ ändern"-Button; `btnAddSlide`-Handler)
- Modify: `public/app.css` (Galerie-Grid + Kacheln)

**Interfaces:**
- Consumes: `SLIDE_TYPES`, `typeMeta`, `overlay` (Task 2), `renderSlideList`/`renderSlideEditor`/`scheduleSave`, `pres`, `selectedIdx`.
- Produces:
  - `applyTypeDefaults(s, type)` — setzt `s.type` + per-Typ-Defaults (aus der bestehenden Change-Logik).
  - `openTypeGallery({ title, onPick })` — Overlay-Galerie; `onPick(type)` bei Klick, dann schließen.
  - `typeIcon(type) → string` (SVG-Markup je Typ).

- [ ] **Step 1: `applyTypeDefaults` + `typeIcon` + `openTypeGallery` einfügen**

In `public/presenter.html` einfügen:
```js
function applyTypeDefaults(s, type) {
  s.type = type;
  if ((type === 'choice' || type === 'ranking' || type === 'points' || type === 'quiz') && !Array.isArray(s.options)) s.options = ['', ''];
  if (type === 'quiz' && !Number.isInteger(s.correct)) s.correct = 0;
  if (type === 'wordcloud' && !s.maxWords) s.maxWords = 1;
  if (type === 'scale') { s.max = s.max || 5; s.min = 1; s.minLabel = s.minLabel || ''; s.maxLabel = s.maxLabel || ''; }
}

function typeIcon(type) {
  const p = 'stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"';
  const icons = {
    choice: '<circle cx="5" cy="7" r="2" fill="currentColor" stroke="none"/><line x1="9" y1="7" x2="20" y2="7"/><circle cx="5" cy="15" r="2"/><line x1="9" y1="15" x2="20" y2="15"/>',
    wordcloud: '<text x="2" y="10" font-size="8" fill="currentColor" stroke="none">Aa</text><text x="12" y="17" font-size="6" fill="currentColor" stroke="none">bb</text>',
    open: '<rect x="3" y="4" width="18" height="14" rx="1"/><line x1="6" y1="8" x2="16" y2="8"/><line x1="6" y1="12" x2="13" y2="12"/>',
    scale: '<line x1="3" y1="11" x2="21" y2="11"/><circle cx="15" cy="11" r="2.5" fill="currentColor" stroke="none"/>',
    ranking: '<line x1="7" y1="6" x2="20" y2="6"/><line x1="7" y1="11" x2="20" y2="11"/><line x1="7" y1="16" x2="20" y2="16"/><text x="2" y="8" font-size="6" fill="currentColor" stroke="none">1</text><text x="2" y="13" font-size="6" fill="currentColor" stroke="none">2</text><text x="2" y="18" font-size="6" fill="currentColor" stroke="none">3</text>',
    points: '<rect x="3" y="12" width="4" height="7"/><rect x="10" y="7" width="4" height="12"/><rect x="17" y="10" width="4" height="9"/>',
    quiz: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 2.8c-.8.4-1 .8-1 1.7" ${p}/><circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none"/>',
    qa: '<path d="M4 5h16v10H10l-4 4v-4H4z"/>',
    info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/>',
  };
  return `<svg viewBox="0 0 24 24" ${p} aria-hidden="true">${icons[type] || ''}</svg>`;
}

function openTypeGallery({ title, onPick }) {
  const card = el(`<div class="ds-dialog ds-card type-gallery-card"><div class="ds-card-title">${esc(title)}</div><div class="type-gallery"></div></div>`);
  const grid = card.querySelector('.type-gallery');
  SLIDE_TYPES.forEach((type) => {
    const tile = el(`<button class="type-tile"><span class="tt-icon">${typeIcon(type)}</span><span class="tt-label">${esc(typeMeta(type).label)}</span><span class="tt-hint">${esc(typeMeta(type).hint || '')}</span></button>`);
    tile.addEventListener('click', () => { ov.remove(); document.removeEventListener('keydown', onKey); onPick(type); });
    grid.appendChild(tile);
  });
  const ov = overlay(card);
  function onKey(e) { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', onKey); } }
  ov.addEventListener('click', (e) => { if (e.target === ov) { ov.remove(); document.removeEventListener('keydown', onKey); } });
  document.addEventListener('keydown', onKey);
}
```

- [ ] **Step 2: Markup — `<select>` durch „Typ ändern" ersetzen**

In `public/presenter.html` das Typ-Feld (aktuell Zeilen 109–113) ersetzen durch:
```html
          <div class="field">
            <label data-i18n="presenter.field.type">Folientyp</label>
            <div class="type-current">
              <span class="type-current-icon" id="typeCurrentIcon"></span>
              <span class="type-current-label" id="typeCurrentLabel"></span>
              <button class="ds-btn" id="btnChangeType" type="button" data-i18n="presenter.slide.changeType">Typ ändern</button>
            </div>
            <div class="help" id="typeHint"></div>
          </div>
```

- [ ] **Step 3: `renderSlideEditor` + Handler auf Galerie umstellen**

In `renderSlideEditor` (`presenter.html:489–493`) den `typeSel`-Block ersetzen durch:
```js
  $('typeCurrentIcon').innerHTML = typeIcon(s.type);
  $('typeCurrentLabel').textContent = typeMeta(s.type).label;
  $('typeHint').textContent = typeMeta(s.type).hint || '';
```
Den alten `$('slideType').addEventListener('change', …)`-Handler (`:567–580`) **entfernen** und stattdessen einfügen:
```js
$('btnChangeType').addEventListener('click', () => {
  openTypeGallery({ title: t('presenter.gallery.title'), onPick: (type) => {
    applyTypeDefaults(currentSlide(), type);
    renderSlideEditor(); renderSlideList(); scheduleSave();
  }});
});
```
Und den `btnAddSlide`-Handler (`:666`) ersetzen durch:
```js
$('btnAddSlide').addEventListener('click', () => {
  openTypeGallery({ title: t('presenter.gallery.newTitle'), onPick: (type) => {
    const s = { id: crypto.randomUUID(), question: '' };
    applyTypeDefaults(s, type);
    pres.slides.push(s);
    selectedIdx = pres.slides.length - 1;
    renderSlideList(); renderSlideEditor(); scheduleSave();
  }});
});
```

- [ ] **Step 4: Galerie-CSS**

In `public/app.css` ans Ende anhängen:
```css
/* Mockup A — Typ-Galerie (E1) */
.type-gallery-card { max-width: 640px; }
.type-gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; margin-top: 0.5rem; }
@media (max-width: 560px) { .type-gallery { grid-template-columns: repeat(2, 1fr); } }
.type-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 0.3rem; text-align: left; padding: 0.7rem; background: var(--white); border: 1px solid var(--grey-1); border-radius: var(--radius); cursor: pointer; font-family: var(--font-sans); }
.type-tile:hover { border-color: var(--primary); }
.tt-icon svg { width: 28px; height: 28px; color: var(--primary); }
.tt-label { font-size: 0.9rem; font-weight: 600; color: var(--grey-6); }
.tt-hint { font-size: 0.78rem; color: var(--grey-4); line-height: 1.25; }
.type-current { display: flex; align-items: center; gap: 0.6rem; }
.type-current-icon svg { width: 22px; height: 22px; color: var(--primary); }
.type-current-label { font-weight: 600; color: var(--grey-6); margin-right: auto; }
```

- [ ] **Step 5: Verifizieren (Browser)**

Syntaxcheck → SYNTAX_OK. Editor: „+ Neue Folie" → Galerie mit 9 Kacheln (Icon + Label + Erklärung); Klick auf „Skala" legt eine Skala-Folie an (Skala-Felder erscheinen). „Typ ändern" öffnet die Galerie; Wahl „Ranking" ändert den Typ (Frage bleibt, Ranking-Hinweis erscheint). Kein `<select id="slideType">` mehr. Screenshot der Galerie.

- [ ] **Step 6: Commit**
```bash
git add public/presenter.html public/app.css
git commit -m "A (E1): type gallery with icons replaces the native slide-type dropdown"
```

---

### Task 4: Live-Handy-Vorschau (E2)

**Files:**
- Modify: `public/vote.html` (additiver Vorschau-Modus)
- Modify: `public/presenter.html` (Vorschau-Spalte iframe + postMessage)
- Modify: `public/app.css` (Phone-Frame)

**Interfaces:**
- Consumes: bestehender `renderVote`/`onSnapshot`-Pfad in vote.html; `currentSlide`, `renderSlideEditor` in presenter.
- Produces: Vorschau-Protokoll `postMessage({ kind:'puls-preview', slide, brand })` (Editor→iframe) und `postMessage({ kind:'puls-preview-ready' })` (iframe→Editor); Editor-Funktion `pushPreview()`.

- [ ] **Step 1: Vorschau-Modus in `vote.html`**

In `public/vote.html` im `<script>` ganz am Anfang (nach `const params = …`, vor der `if (!CODE …)`-Weiche) einen Vorschau-Zweig einbauen. Ersetze den Block `if (!CODE || CODE.length !== 6) { location.replace('/'); } else { … init(); }` durch:
```js
const PREVIEW = params.get('preview') === '1';
if (PREVIEW) {
  document.body.classList.add('is-preview');
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    if (!e.data || e.data.kind !== 'puls-preview') return;
    renderPreview(e.data.slide, e.data.brand);
  });
  if (window.parent && window.parent !== window) window.parent.postMessage({ kind: 'puls-preview-ready' }, location.origin);
} else if (!CODE || CODE.length !== 6) {
  location.replace('/');
} else {
  document.getElementById('codeLabel').textContent = 'Code ' + formatCode(CODE);
  init();
}

function renderPreview(slide, brand) {
  presId = 'preview';
  if (!slide) { root.innerHTML = ''; root.appendChild(el(`<p class="results-hidden">${esc(t('presenter.preview.empty'))}</p>`)); return; }
  applyBrand(brand || null, presId, []);
  snap = { slide, results: null, resultsHidden: true, votingLocked: false, selfPaced: false, activeIndex: 0, slideCount: 1, slides: [slide], reactions: [], audience: 0 };
  renderedKey = null;
  onSnapshot(snap);
}
```
Außerdem `submit()` im Vorschau-Modus zum No-op machen: in `async function submit(value, onOk, onErr)` als erste Zeile einfügen:
```js
  if (PREVIEW) return; // Vorschau sendet nicht
```
(`renderPreview` setzt `resultsHidden:true` + `results:null`, daher kein Morph/Board; die reine Eingabe-Ansicht wird gezeigt.)

- [ ] **Step 2: Vorschau-Markup + iframe im Editor**

In `public/presenter.html` in `.editor-layout` (nach der `<section>` mit dem Editor, als dritte Spalte) einfügen:
```html
      <aside class="preview-col">
        <div class="ds-card">
          <div class="ds-card-title" data-i18n="presenter.preview.title">Live-Vorschau</div>
          <div class="phone-frame"><iframe id="previewFrame" src="/vote.html?preview=1" title="Live-Vorschau"></iframe></div>
          <div class="ds-card-subtitle" data-i18n="presenter.preview.subtitle">Aktualisiert sich beim Tippen — Publikums-Ansicht</div>
        </div>
      </aside>
```

- [ ] **Step 3: Editor postet die Folie (debounced)**

In `public/presenter.html` einfügen:
```js
let previewReady = false;
let previewTimer = null;
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  if (e.data && e.data.kind === 'puls-preview-ready') { previewReady = true; pushPreview(); }
});
function pushPreview() {
  const frame = $('previewFrame');
  if (!frame || !frame.contentWindow || !previewReady) return;
  const s = currentSlide();
  frame.contentWindow.postMessage({ kind: 'puls-preview', slide: s ? JSON.parse(JSON.stringify(s)) : null, brand: pres ? pres.brand : null }, location.origin);
}
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(pushPreview, 200); }
```
Und `pushPreview()` bzw. `schedulePreview()` an den Editor-Aktualisierungen aufrufen: am Ende von `renderSlideEditor()` `pushPreview();` ergänzen; in den Eingabe-Handlern, die `scheduleSave()` aufrufen (Frage, Optionen, Skala-Felder, Wortzahl, Info-Text, Multiple, Quiz-Correct, Moderated), zusätzlich `schedulePreview();` aufrufen (kann in `scheduleSave` gebündelt werden — falls `scheduleSave` zentral ist, dort `schedulePreview()` mitrufen).

- [ ] **Step 4: Phone-Frame-CSS**

In `public/app.css` ans Ende anhängen:
```css
/* Mockup A — Live-Vorschau (E2) */
.preview-col { position: sticky; top: 1rem; }
.phone-frame { width: 100%; max-width: 320px; margin: 0.5rem auto; border: 10px solid var(--grey-6); border-radius: 22px; overflow: hidden; background: var(--white); aspect-ratio: 320 / 620; }
.phone-frame iframe { width: 100%; height: 100%; border: 0; display: block; }
body.is-preview { background: var(--white); }
body.is-preview .ds-header, body.is-preview .footer-note, body.is-preview #reactionBar { display: none; }
```

- [ ] **Step 5: Verifizieren (Browser)**

Syntaxcheck (beide Dateien) → SYNTAX_OK. Editor öffnen: rechte Spalte zeigt den Handy-Rahmen mit der aktuellen Folie (echte vote.html-Ansicht). In „Frage" tippen → die Vorschau aktualisiert sich (~200 ms debounced). Optionen ändern → Vorschau zieht nach. Vorschau sendet nicht (Klick auf eine Option im iframe löst keine Server-Antwort aus — `POST answers` bleibt aus; Netzwerk-Tab prüfen). Direktaufruf `http://localhost:3000/vote.html?preview=1` zeigt eine leere Rahmen-Ansicht ohne Redirect zu `/`.

- [ ] **Step 6: Commit**
```bash
git add public/vote.html public/presenter.html public/app.css
git commit -m "A (E2): live phone preview via a vote.html preview mode over iframe + postMessage"
```

---

### Task 5: 3-Spalten-Layout + Einstellungen einklappen (E3) + mobile Kopfleiste (E6-Layout)

**Files:**
- Modify: `public/app.css` (`.editor-layout` 3-spaltig + Breakpoints)
- Modify: `public/presenter.html` (Einstellungskarte einklappbar)

**Interfaces:**
- Consumes: `sessionStorage`.
- Produces: einklappbare „Präsentation"-Karte (`#settingsCard`), Zustand in `sessionStorage['puls.settingsOpen']`.

- [ ] **Step 1: `.editor-layout` auf 3 Spalten**

In `public/app.css` die `.editor-layout`-Regeln (`:102–106`) ersetzen durch:
```css
.editor-layout {
  display: grid; grid-template-columns: 280px 1fr minmax(300px, 360px); gap: 1.25rem;
  align-items: start; padding: 1.25rem 0 2rem;
}
@media (max-width: 1100px) { .editor-layout { grid-template-columns: 280px 1fr; } .editor-layout .preview-col { grid-column: 1 / -1; } }
@media (max-width: 900px) { .editor-layout { grid-template-columns: 1fr; } }
```

- [ ] **Step 2: Einstellungskarte einklappbar machen**

In `public/presenter.html` die „Präsentation"-Karte (die `<div class="ds-card" style="margin-bottom: 1rem;">` bei `:51`) so anpassen: der Karte `id="settingsCard"` geben; den Kartentitel zu einem Toggle-Button machen und den Inhalt in einen einklappbaren Container legen. Ersetze die Titelzeile
`<div class="ds-card-title" data-i18n="presenter.details.title">Präsentation</div>`
durch:
```html
          <button class="ds-card-title settings-toggle" id="settingsToggle" type="button" aria-expanded="false">
            <span data-i18n="presenter.settings.toggle">Präsentation & Einstellungen</span>
            <span class="settings-caret" aria-hidden="true">▾</span>
          </button>
          <div class="settings-body" id="settingsBody" hidden>
```
und schließe den neuen `settings-body`-Container mit einem zusätzlichen `</div>` **vor** dem schließenden `</div>` der Karte (der gesamte bisherige Karteninhalt — die vier `.field`-Blöcke — steht jetzt in `#settingsBody`).

Script (einfügen bei den Wirings):
```js
(function initSettingsToggle() {
  const open = sessionStorage.getItem('puls.settingsOpen') === '1';
  const body = document.getElementById('settingsBody');
  const btn = document.getElementById('settingsToggle');
  function apply(v) { body.hidden = !v; btn.setAttribute('aria-expanded', String(v)); btn.querySelector('.settings-caret').textContent = v ? '▴' : '▾'; sessionStorage.setItem('puls.settingsOpen', v ? '1' : '0'); }
  apply(open);
  btn.addEventListener('click', () => apply(body.hidden));
})();
```

- [ ] **Step 3: Toggle-CSS + mobile Header-Basis**

In `public/app.css` ans Ende anhängen:
```css
/* Mockup A — Einstellungen einklappen (E3) */
.settings-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; cursor: pointer; font: inherit; text-align: left; color: var(--grey-6); }
.settings-toggle .settings-caret { color: var(--grey-4); }
.settings-body[hidden] { display: none; }
@media (max-width: 640px) { .ds-header-controls { gap: 0.5rem; flex-wrap: nowrap; } }
```

- [ ] **Step 4: Verifizieren (Browser)**

Syntaxcheck → SYNTAX_OK. Editor: „Präsentation & Einstellungen" startet **eingeklappt**; der Folien-Editor steht oben. Klick klappt auf/zu; Zustand bleibt nach Reload (sessionStorage). Bei ~1200 px stehen drei Spalten; bei ~1000 px rutscht die Vorschau unter den Editor; bei ~700 px alles einspaltig. Screenshot.

- [ ] **Step 5: Commit**
```bash
git add public/presenter.html public/app.css
git commit -m "A (E3): 3-column editor layout with collapsible settings card"
```

---

### Task 6: Overflow-Menü für Gefahr-/Sekundäraktionen (E4/E6)

**Files:**
- Modify: `public/presenter.html` (Overflow-Menü-Helfer; Header + Editor-Kopf umbauen)
- Modify: `public/app.css` (Menü)

**Interfaces:**
- Consumes: `el`, `esc`, `t`, die bestehenden Aktions-Handler (`btnResetAll`, `btnExport`, `btnPptx`, `btnResetSlide`, `btnDeleteSlide`).
- Produces: `overflowMenu(items) → HTMLElement` — Button „…" mit aufklappender Liste; `items = [{ label, onClick, danger }]`.

- [ ] **Step 1: `overflowMenu`-Helfer**

In `public/presenter.html` einfügen:
```js
function overflowMenu(items) {
  const wrap = el(`<div class="overflow-menu"><button class="ds-btn overflow-btn" type="button" aria-haspopup="true" aria-expanded="false" title="${esc(t('presenter.more'))}">⋯</button><div class="overflow-list" hidden></div></div>`);
  const btn = wrap.querySelector('.overflow-btn');
  const list = wrap.querySelector('.overflow-list');
  items.forEach((it) => {
    const b = el(`<button class="overflow-item${it.danger ? ' danger' : ''}" type="button">${esc(it.label)}</button>`);
    b.addEventListener('click', () => { close(); it.onClick(); });
    list.appendChild(b);
  });
  function open() { list.hidden = false; btn.setAttribute('aria-expanded', 'true'); document.addEventListener('click', onDoc, true); }
  function close() { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', onDoc, true); }
  function onDoc(e) { if (!wrap.contains(e.target)) close(); }
  btn.addEventListener('click', (e) => { e.stopPropagation(); list.hidden ? open() : close(); });
  return wrap;
}
```

- [ ] **Step 2: Header — Sekundäres ins Menü (E4/E6)**

In `public/presenter.html` im Header (`.ds-header-controls`, `:15–22`) die drei Buttons `#btnResetAll`, `#btnExport`, `#btnPptx` aus der direkten Reihe nehmen und stattdessen per Script ein Overflow-Menü einhängen. Konkret: gib den drei Buttons `hidden` (oder entferne sie aus dem Markup und behalte nur ihre IDs für die Handler — einfacher: sie bleiben im DOM als versteckte Träger ihrer bestehenden Handler, das Menü ruft `.click()`). Praktisch: lasse die drei Button-Elemente im Markup, setze sie auf `hidden`, und füge vor `#btnPresent` ein Menü ein:
```js
document.querySelector('.ds-header-controls').insertBefore(
  overflowMenu([
    { label: t('presenter.export'), onClick: () => $('btnExport').click() },
    { label: t('presenter.pptxExport'), onClick: () => $('btnPptx').click() },
    { label: t('presenter.resetAll'), danger: true, onClick: () => $('btnResetAll').click() },
  ]),
  document.getElementById('btnPresent')
);
['btnResetAll','btnExport','btnPptx'].forEach((id) => { $(id).hidden = true; });
```
(Die bestehenden Handler bleiben unverändert; das Menü löst sie über `.click()` aus. `#btnExport` ist ein `<a download>` — `.click()` startet den Download korrekt.)

- [ ] **Step 3: Editor-Kopf — Gefahraktionen ins Menü (E4)**

In `public/presenter.html` im `#slideEditor`-Kopf (`:99–107`) die Buttons `#btnResetSlide` und `#btnDeleteSlide` auf `hidden` setzen und ein Overflow-Menü in die Titelzeile hängen. (Die `#btnMoveUp`/`#btnMoveDown` werden in Task 7 entfernt; hier unangetastet lassen.) Script:
```js
$('slideEditorTitle').parentElement.appendChild(
  overflowMenu([
    { label: t('presenter.slide.resetAnswers'), danger: true, onClick: () => $('btnResetSlide').click() },
    { label: t('presenter.slide.delete'), danger: true, onClick: () => $('btnDeleteSlide').click() },
  ])
);
$('btnResetSlide').hidden = true; $('btnDeleteSlide').hidden = true;
```

- [ ] **Step 4: Menü-CSS**

In `public/app.css` ans Ende anhängen:
```css
/* Mockup A — Overflow-Menü (E4/E6) */
.overflow-menu { position: relative; display: inline-block; }
.overflow-btn { min-width: 2.2rem; font-size: 1.1rem; line-height: 1; }
.overflow-list { position: absolute; right: 0; top: calc(100% + 4px); z-index: 500; min-width: 12rem; background: var(--white); border: 1px solid var(--grey-1); border-radius: var(--radius); box-shadow: var(--shadow-hover); padding: 0.25rem; display: flex; flex-direction: column; }
.overflow-list[hidden] { display: none; }
.overflow-item { text-align: left; background: none; border: none; padding: 0.5rem 0.7rem; cursor: pointer; font: inherit; color: var(--grey-6); border-radius: var(--radius); }
.overflow-item:hover { background: var(--surface); }
.overflow-item.danger { color: var(--danger); }
```

- [ ] **Step 5: Verifizieren (Browser)**

Syntaxcheck → SYNTAX_OK. Editor: Header zeigt nur noch „Präsentieren" + ein „⋯"-Menü (Exporte + „Alle Antworten zurücksetzen"); Klick öffnet das Menü, außerhalb schließt es. Editor-Kopf hat ein „⋯"-Menü mit „Antworten zurücksetzen"/„Löschen" (rot). Die Aktionen lösen weiterhin die eigenen Dialoge (Task 2) aus. Bei schmalem Fenster (~500 px) bricht der Header nicht mehrzeilig. Screenshot.

- [ ] **Step 6: Commit**
```bash
git add public/presenter.html public/app.css
git commit -m "A (E4/E6): move danger + secondary actions into an overflow menu; header no longer wraps"
```

---

### Task 7: Drag-Reorder + Duplizieren (E5) + End-to-End

**Files:**
- Modify: `public/presenter.html` (`renderSlideList` Drag + Duplizieren; ↑↓ entfernen; Menü-Eintrag „Duplizieren")
- Modify: `public/app.css` (Drag-Handle in der Liste)

**Interfaces:**
- Consumes: `pres`, `selectedIdx`, `renderSlideList`/`renderSlideEditor`/`scheduleSave`, `overflowMenu` (Task 6), `pushPreview` (Task 4).
- Produces: `duplicateSlide(i)`.

- [ ] **Step 1: `renderSlideList` um Drag-Handle + Aktionen erweitern**

In `public/presenter.html` `renderSlideList` (`:453–474`) ersetzen durch:
```js
function renderSlideList() {
  const list = $('slideList');
  list.innerHTML = '';
  $('noSlides').hidden = pres.slides.length > 0;
  $('slideEditor').hidden = pres.slides.length === 0;
  pres.slides.forEach((s, i) => {
    const item = el(`
      <div class="slide-item${i === selectedIdx ? ' active' : ''}">
        <span class="slide-handle" role="button" aria-label="${esc(t('presenter.slide.moveUp'))}" title="${esc(t('presenter.slide.moveUp'))}">⠿</span>
        <button class="slide-open" type="button">
          <span class="num">${i + 1}</span>
          <span class="meta"><span class="q">${esc(s.question || typeMeta(s.type).label || t('common.slideFallback'))}</span><br><span class="ty">${esc(typeMeta(s.type).label || s.type)}</span></span>
        </button>
        <span class="slide-actions"></span>
      </div>`);
    item.querySelector('.slide-open').addEventListener('click', () => { selectedIdx = i; renderSlideList(); renderSlideEditor(); });
    item.querySelector('.slide-actions').appendChild(overflowMenu([
      { label: t('presenter.slide.duplicate'), onClick: () => duplicateSlide(i) },
      { label: t('presenter.slide.delete'), danger: true, onClick: () => { selectedIdx = i; $('btnDeleteSlide').click(); } },
    ]));
    attachSlideDrag(item, i);
    list.appendChild(item);
  });
}

function duplicateSlide(i) {
  const copy = JSON.parse(JSON.stringify(pres.slides[i]));
  copy.id = crypto.randomUUID();
  pres.slides.splice(i + 1, 0, copy);
  selectedIdx = i + 1;
  renderSlideList(); renderSlideEditor(); scheduleSave();
}

function attachSlideDrag(item, index) {
  const handle = item.querySelector('.slide-handle');
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const rowH = item.getBoundingClientRect().height + 6;
    let curPos = index;
    item.classList.add('dragging');
    function move(ev) {
      const target = Math.max(0, Math.min(pres.slides.length - 1, index + Math.round((ev.clientY - startY) / rowH)));
      if (target !== curPos) {
        const moved = pres.slides.splice(curPos, 1)[0];
        pres.slides.splice(target, 0, moved);
        if (selectedIdx === curPos) selectedIdx = target;
        curPos = target;
        renderSlideList();
      }
    }
    function cleanup() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', cleanup); document.removeEventListener('pointercancel', cleanup); item.classList.remove('dragging'); scheduleSave(); }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', cleanup);
    document.addEventListener('pointercancel', cleanup);
  });
}
```
(Der Löschen-Eintrag im Listen-Menü soll dieselbe bestätigte Löschung auslösen wie `#btnDeleteSlide`. Da `#btnDeleteSlide` auf `selectedIdx` arbeitet: im Listen-Menü zuerst `selectedIdx = i` setzen, dann `$('btnDeleteSlide').click()`. Ersetze den Löschen-`onClick` oben durch: `onClick: () => { selectedIdx = i; $('btnDeleteSlide').click(); }`.)

- [ ] **Step 2: ↑↓-Buttons aus dem Editor-Kopf entfernen**

In `public/presenter.html` die beiden Zeilen `#btnMoveUp` (`:102`) und `#btnMoveDown` (`:103`) aus dem Markup entfernen und ihre Wirings (`$('btnMoveUp').addEventListener(...)`, `$('btnMoveDown').addEventListener(...)` bei `:689–690`) samt `moveSlide` entfernen (Reorder lebt jetzt in der Liste). Falls `moveSlide` nirgends sonst genutzt wird, ebenfalls entfernen.

- [ ] **Step 3: Drag-/Listen-CSS**

In `public/app.css` ans Ende anhängen:
```css
/* Mockup A — Folienliste Drag + Aktionen (E5) */
.slide-item { position: relative; }
.slide-item .slide-handle { flex-shrink: 0; width: 28px; min-height: 44px; display: flex; align-items: center; justify-content: center; color: var(--grey-4); cursor: grab; touch-action: none; user-select: none; }
.slide-item .slide-open { flex: 1; display: flex; align-items: center; gap: 0.6rem; background: none; border: none; text-align: left; cursor: pointer; font: inherit; padding: 0; }
.slide-item.dragging { background: var(--surface-alt); }
.slide-item .slide-actions { flex-shrink: 0; }
```

- [ ] **Step 4: End-to-End-Verifizierung**

Syntaxcheck → SYNTAX_OK. Editor mit mehreren Folien:
1. **E5:** Folien per Drag-Handle (44 px, `pointercancel` sauber) umsortieren; „Duplizieren" (Listen-Menü) erzeugt eine Kopie dahinter (neue ID, ohne Antworten), Auswahl auf die Kopie; „Löschen" (Listen-Menü) fragt über den eigenen Dialog. ↑↓ im Editor-Kopf sind weg.
2. **E1–E6 zusammen:** Galerie legt Folien an; Vorschau läuft beim Tippen mit; Einstellungen eingeklappt; Gefahraktionen im „…"-Menü mit eigenen Dialogen; Header bricht schmal nicht.
3. DE/EN in Galerie/Dialogen/Menü/Vorschau geprüft; `server.js` unverändert (`git status`); keine Konsolenfehler.

- [ ] **Step 5: Commit**
```bash
git add public/presenter.html public/app.css
git commit -m "A (E5): slide-list drag reorder + duplicate; remove editor-head move arrows"
```

---

## Self-Review

**Spec-Abdeckung:**
- E1 (Typ-Galerie) → Task 3. ✓
- E2 (Live-Vorschau) → Task 4 (vote.html Vorschau-Modus + iframe + postMessage). ✓
- E3 (Einstellungen einklappen) → Task 5. ✓
- E4 (Gefahraktionen trennen) → Task 6 (Overflow-Menü) + Task 2 (Dialoge). ✓
- E5 (Drag-Reorder + Duplizieren) → Task 7. ✓
- E6 (mobile Kopfleiste) → Task 6 (Sekundäres ins Menü) + Task 5 (Header-CSS). ✓
- Ü2 (eigene Dialoge) → Task 2. ✓
- Kein Servereingriff, Zero-Dependency, Design-System, DE+EN, postMessage-Origin → Global Constraints. ✓
- Randfälle: Vorschau vor „ready" (Task 4 ready-Handshake + pushPreview), Duplizieren ohne Antworten (Task 7 kopiert nur die Folien-Definition; `answers` sind server-seitig und nicht Teil der Editor-Folie), Dialog-Abbruch (Task 2), Origin-Check (Task 4). ✓

**Platzhalter-Scan:** kein TBD/TODO; Code in jedem Schritt vollständig; wo exakte Zeilen variieren (Einstellungskarte umschließen, Handler async machen), ist die Änderung präzise mit vollständigem einzufügendem Code beschrieben.

**Typ-Konsistenz:** `confirmDialog`/`alertDialog`, `overlay`, `openTypeGallery({title,onPick})`, `applyTypeDefaults(s,type)`, `typeIcon(type)`, `overflowMenu(items)`, `pushPreview`/`schedulePreview`, `duplicateSlide(i)`, `attachSlideDrag(item,index)` durchgängig gleich benannt und genutzt. IDs `previewFrame`, `settingsCard`/`settingsBody`/`settingsToggle`, `typeCurrentIcon`/`typeCurrentLabel`/`btnChangeType` konsistent.
