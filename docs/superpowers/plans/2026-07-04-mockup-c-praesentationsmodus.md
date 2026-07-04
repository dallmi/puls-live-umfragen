# Mockup C — Präsentationsmodus: Join-Bühne & Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Vollbild-Präsentationsmodus so umbauen, dass Beitritt aus der letzten Reihe lesbar ist (P1), Zustands-Schalter ihren Zustand zeigen (P2), Inhalte die Bühne füllen (P3) und Tastaturhilfen sichtbar sind (P4).

**Architecture:** Alles in `public/presenter.html` (Markup `#presentMode` + Präsentations-Script), `public/app.css` (Layout) und `public/i18n.js` (Keys). Ein neuer **präsentator-lokaler** Zustand `joinStage` steuert, ob die große Beitritts-Bühne oder die Folien gezeigt werden — die Server-Folie (`activeIndex`) und die Publikums-Sicht bleiben unberührt. Die Präsentations-DOM-Updates werden in einer Funktion `renderPresent(snap)` gebündelt, die `onSnapshot` (bei jedem Server-Snapshot) und `refreshLanguage` (bei Sprachwechsel) aufrufen.

**Tech Stack:** Vanilla HTML/CSS/JS. Helfer aus `common.js` (`renderQR`, `formatCode`, `esc`) und `i18n.js` (`t`).

## Global Constraints

- **Zero-Dependency**: keine neuen Pakete, kein Test-Runner, kein CDN.
- **Kein Servereingriff**: `server.js` bleibt unverändert; Beitritts-Bühne ist rein präsentator-lokal.
- **Design-System strikt**: nur bestehende Tokens/Klassen; Rot `--primary #E60000` nur Akzent; Radius `var(--radius)` 2px; kein Verlauf; kein ALL-CAPS. Ausnahme: die Beitritts-**Bühne** darf zentriert sein (Bühnen-Kontext), sonst linksbündig.
- **Zweisprachig**: jeder neue sichtbare Text als i18n-Key mit **DE + EN**.
- **Beitritts-URL** unverändert wie heute: QR-Text `` `${publicBase}/${pres.code}` ``, Join-Text `publicBase.replace(/^https?:\/\//, '')`.

## Verifikationsmodell (kein Test-Runner)

Zero-Dependency-Projekt ohne Test-Framework. Verifikation **browser-getrieben** am laufenden Server (`node server.js`, Port 3000; wird zentral vom Controller bereitgestellt — **nicht** selbst starten). Präsentationsmodus braucht eine Präsentation mit Folien + Admin-Token. Werkzeuge: `node --check` auf dem extrahierten Inline-Script, chrome-devtools/Playwright-MCP zum Öffnen des Präsentationsmodus + Screenshots. „Erwartet" = im Browser sichtbares Ergebnis.

Inline-Script-Syntaxcheck (in jeder Task nutzbar):
```
node -e 'const fs=require("fs");const h=fs.readFileSync("public/presenter.html","utf8");const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync(".superpowers/sdd/_pres_inline.js",m.map(x=>x[1]).join("\n;\n"))' && node --check .superpowers/sdd/_pres_inline.js && echo SYNTAX_OK
```
(Es gibt genau ein attributloses `<script>` in presenter.html — das Präsentations-Script; die übrigen sind `<script src=…>`.)

## File Structure

- `public/i18n.js` — Modify: neue `presenter.join.*` / Chip- / Hints- / Toggle-Label-Keys.
- `public/presenter.html` — Modify: Markup `#presentMode` (`presenter.html:212–247`) + Präsentations-Script (`enterPresent` :722, `onSnapshot` :760, Toggle-Wiring :717–720, `keydown` :834, `refreshLanguage` :843).
- `public/app.css` — Modify: Präsentations-CSS (`public/app.css:143–167`): Beitritts-Bühne, Join-Leiste, Toggles, Status-Chips, Zentrierung + Skalierung, Hints.

---

### Task 1: i18n-Keys (DE + EN)

**Files:**
- Modify: `public/i18n.js` (Einfügen direkt nach `'presenter.access.joinAt'`, aktuell Zeile 136)

**Interfaces:**
- Produces: Keys `presenter.join.heading|start|counter|barLabel`, `presenter.present.hints|statusLocked|statusResultsHidden|resultsLabel|votingLabel`, abrufbar via `t()`; `presenter.join.counter` als Plural-Objekt via `t(key,{n})`.

- [ ] **Step 1: Keys einfügen**

In `public/i18n.js` unmittelbar nach der Zeile `'presenter.access.joinAt': { … },` einfügen:

```js
  'presenter.join.heading': { de: 'Machen Sie mit — am eigenen Gerät:', en: 'Join in — on your own device:' },
  'presenter.join.start': { de: "Los geht's →", en: "Let's go →" },
  'presenter.join.counter': {
    de: { one: '{{n}} Person ist schon dabei', other: '{{n}} Personen sind schon dabei' },
    en: { one: '{{n}} person has joined', other: '{{n}} people have joined' },
  },
  'presenter.join.barLabel': { de: 'Beitritt', en: 'Join' },
  'presenter.present.hints': { de: '← → Folie · Esc beenden', en: '← → slide · Esc to exit' },
  'presenter.present.statusLocked': { de: 'Abstimmung gesperrt', en: 'Voting locked' },
  'presenter.present.statusResultsHidden': { de: 'Ergebnisse ausgeblendet', en: 'Results hidden' },
  'presenter.present.resultsLabel': { de: 'Ergebnisse', en: 'Results' },
  'presenter.present.votingLabel': { de: 'Abstimmung', en: 'Voting' },
```

- [ ] **Step 2: Verifizieren**

`node --check public/i18n.js` → exit 0. Und:
```
node -e 'const fs=require("fs");const s=fs.readFileSync("public/i18n.js","utf8");for(const k of ["presenter.join.heading","presenter.join.start","presenter.join.counter","presenter.join.barLabel","presenter.present.hints","presenter.present.statusLocked","presenter.present.statusResultsHidden","presenter.present.resultsLabel","presenter.present.votingLabel"]) if(!s.includes("\x27"+k+"\x27")) throw new Error("fehlt: "+k); console.log("ALLE KEYS DA")'
```
Erwartet: `ALLE KEYS DA`. Sichtprüfung: jeder Key hat `de` und `en`.

- [ ] **Step 3: Commit**

```bash
git add public/i18n.js
git commit -m "i18n: add presenter join-stage, status-chip, hints and toggle-label keys (DE+EN)"
```

---

### Task 2: Beitritts-Bühne + Dauer-Join-Leiste (P1)

**Files:**
- Modify: `public/presenter.html` (Markup `#presentMode` :212–247; Script: `enterPresent` :722–738, `onSnapshot` :760–788, `keydown` :834–839; neue Helfer)
- Modify: `public/app.css` (neue Regeln im Präsentations-Block)

**Interfaces:**
- Consumes: `renderQR`, `formatCode`, `esc`, `t`, `publicBase`, `pres`, `lastSnapshot`, `presenting`.
- Produces:
  - Modul-Variable `let joinStage = false;`
  - `renderPresent(snap)` — bündelt alle Präsentations-DOM-Updates (ersetzt den `presenting`-Zweig von `onSnapshot`); aktualisiert Bühne (Code/QR-Text/Zähler/Labels), Join-Leiste, Frage, Ergebnisse, Position, Zuschauerzahl, `btnPrev/btnNext.disabled`; ruft `applyStagePresence()`.
  - `applyStagePresence()` — schaltet Sichtbarkeit `#presentJoinStage` vs. `#presentBody`/`#presentFooter` und `#presentJoinBar` nach `joinStage`.
  - `showSlides()` / `showJoinStage()` — setzen `joinStage` und rufen `applyStagePresence()`.
  - Neue Element-IDs: `#presentJoinStage`, `#pjsCode`, `#pjsAt`, `#pjsQr`, `#pjsCounter`, `#pjsHeading`, `#btnStartSlides`, `#presentBody`, `#presentFooter`, `#presentJoinBar`, `#pjbCode`, `#pjbQr`. **Entfernt**: `#presentJoinLine`, `#presentQr` (alter 64-px-Footer-QR).

- [ ] **Step 1: Markup `#presentMode` ersetzen**

In `public/presenter.html` den Block `<div class="present-topbar"> … </div>` bis zum Ende von `<div class="present-footer"> … </div>` (aktuell Zeilen 221–246) durch dieses Markup ersetzen (die `.present-reactions`/`.moderation-panel` davor bleiben unverändert):

```html
  <div class="present-topbar">
    <div style="display:flex; align-items:center; gap:0.75rem;">
      <img id="presentBrandLogo" class="brand-logo" hidden alt="">
      <button type="button" class="present-join-bar" id="presentJoinBar" hidden>
        <span class="pjb-label" id="pjbLabel"></span>
        <span class="pjb-code" id="pjbCode"></span>
        <span class="pjb-qr" id="pjbQr"></span>
      </button>
    </div>
    <div style="display:flex; align-items:center; gap:1.25rem;">
      <span class="audience-count" id="audienceCount"></span>
      <button class="ds-btn" id="btnExitPresent" data-i18n="presenter.present.exit">Beenden (Esc)</button>
    </div>
  </div>

  <div class="present-join-stage" id="presentJoinStage" hidden>
    <div class="pjs-heading" id="pjsHeading"></div>
    <div class="pjs-code" id="pjsCode"></div>
    <div class="pjs-at" id="pjsAt"></div>
    <div class="pjs-qr" id="pjsQr"></div>
    <div class="pjs-counter" id="pjsCounter"></div>
    <button class="ds-btn ds-btn-primary ds-btn-lg" id="btnStartSlides"></button>
  </div>

  <div class="present-body" id="presentBody">
    <div class="present-status" id="presentStatus"></div>
    <div class="present-question" id="presentQuestion"></div>
    <div class="present-results" id="presentResults"></div>
  </div>

  <div class="present-footer" id="presentFooter">
    <div class="hints" id="presentHints"></div>
    <div class="nav">
      <button class="ds-btn" id="btnPrev" data-i18n="presenter.present.prev">← Zurück</button>
      <span class="pos" id="presentPos"></span>
      <button class="ds-btn" id="btnNext" data-i18n="presenter.present.next">Weiter →</button>
    </div>
    <div class="present-toggles">
      <button class="ds-btn present-toggle" id="btnToggleResults" aria-pressed="false"></button>
      <button class="ds-btn present-toggle" id="btnToggleLock" aria-pressed="false"></button>
    </div>
  </div>
```

- [ ] **Step 2: `enterPresent` anpassen + Join-Stage-Helfer einführen**

In `public/presenter.html` die Funktion `enterPresent()` (aktuell :722–738) ersetzen durch die folgende Version (setzt `joinStage=true`, rendert beide QR-Größen, ersetzt die alten `#presentJoinLine`/`#presentQr`-Zeilen), und direkt danach die Helfer einfügen. Außerdem ganz oben bei den Modul-Variablen (`let presenting = false;` etc.) `let joinStage = false;` ergänzen:

```js
async function enterPresent() {
  await saveNow();
  presenting = true;
  joinStage = true;
  $('presentMode').hidden = false;
  document.body.style.overflow = 'hidden';
  const joinUrl = publicBase.replace(/^https?:\/\//, '');
  $('pjsAt').innerHTML = `${esc(t('presenter.access.joinAt'))} <b>${esc(joinUrl)}</b>`;
  renderQR($('pjsQr'), `${publicBase}/${pres.code}`, 240);
  renderQR($('pjbQr'), `${publicBase}/${pres.code}`, 44);
  lastReactionTs = Date.now();
  $('presentReactions').innerHTML = '';
  applyBrand(pres.brand, PRES_ID, [$('presentBrandLogo')]);
  applyStagePresence();
  if (lastSnapshot) onSnapshot(lastSnapshot);
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function applyStagePresence() {
  $('presentJoinStage').hidden = !joinStage;
  $('presentBody').hidden = joinStage;
  $('presentFooter').hidden = joinStage;
  $('presentJoinBar').hidden = joinStage; // Leiste nur während der Folien
}

function showSlides() { joinStage = false; applyStagePresence(); }
function showJoinStage() { joinStage = true; applyStagePresence(); }
```

- [ ] **Step 3: `onSnapshot` auf `renderPresent` umstellen**

In `public/presenter.html` den `presenting`-Zweig von `onSnapshot` (aktuell :763–787, ab `lastReactionTs = animateReactions(...)` bis `refreshModeration(snap);`) so umbauen, dass er an `renderPresent(snap)` delegiert. Ersetze in `onSnapshot` den Codeblock ab `if (!presenting) return;` durch:

```js
  if (!presenting) return;
  renderPresent(snap);
}

function renderPresent(snap) {
  lastReactionTs = animateReactions($('presentReactions'), snap.reactions, lastReactionTs);
  applyBrand(snap.brand, PRES_ID, [$('presentBrandLogo')]);

  // Beitritts-Bühne + Dauer-Leiste
  $('pjsHeading').textContent = t('presenter.join.heading');
  $('pjsCode').textContent = formatCode(pres.code);
  $('pjsCounter').textContent = t('presenter.join.counter', { n: snap.audience });
  $('btnStartSlides').textContent = t('presenter.join.start');
  $('pjbLabel').textContent = t('presenter.join.barLabel');
  $('pjbCode').textContent = formatCode(pres.code);

  // Fußleiste / Navigation
  $('presentPos').textContent = snap.slideCount ? `${snap.activeIndex + 1} / ${snap.slideCount}` : '0 / 0';
  $('audienceCount').textContent = t('presenter.present.audience', { n: snap.audience });
  $('btnToggleResults').textContent = snap.resultsHidden ? t('presenter.present.showResults') : t('presenter.present.hideResults');
  $('btnToggleLock').textContent = snap.votingLocked ? t('presenter.present.unlockVoting') : t('presenter.present.lockVoting');
  $('btnPrev').disabled = snap.activeIndex <= 0;
  $('btnNext').disabled = snap.activeIndex >= snap.slideCount - 1;

  const q = $('presentQuestion');
  if (!snap.slide) {
    q.textContent = t('presenter.present.noSlides');
    $('presentResults').innerHTML = '';
    refreshModeration(snap);
    return;
  }
  q.textContent = snap.slide.question || typeMeta(snap.slide.type).label || '';
  let correctIndex = -1;
  if (snap.slide.type === 'quiz' && pres) {
    const full = pres.slides.find((s) => s.id === snap.slide.id);
    if (full && Number.isInteger(full.correct)) correctIndex = full.correct;
  }
  renderResults($('presentResults'), snap.slide, snap.results, { leaderboard: snap.leaderboard, correctIndex });
  refreshModeration(snap);
}
```

(Damit ist die alte Präsentations-Logik unverändert in `renderPresent` übernommen und um Bühne/Leiste erweitert. `onSnapshot` behält davor `lastSnapshot = snap;` und `scheduleResultsRefresh();`.)

- [ ] **Step 4: Buttons/Leiste verdrahten + `keydown` erweitern**

In `public/presenter.html` bei den bestehenden Event-Wirings (nahe `$('btnPresent').addEventListener('click', enterPresent);` :713) ergänzen:

```js
$('btnStartSlides').addEventListener('click', showSlides);
$('presentJoinBar').addEventListener('click', showJoinStage);
```

Und den `keydown`-Handler (aktuell :834–839) ersetzen durch:

```js
document.addEventListener('keydown', (e) => {
  if (!presenting) return;
  if (e.key === 'Escape') { exitPresent(); return; }
  if (joinStage) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') showSlides();
    return;
  }
  if (e.key === 'ArrowRight' || e.key === 'PageDown') navigate(1);
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    if (lastSnapshot && lastSnapshot.activeIndex === 0) showJoinStage();
    else navigate(-1);
  }
});
```

- [ ] **Step 5: CSS für Bühne + Leiste**

In `public/app.css` im Präsentations-Block (nach Zeile 152, vor `.present-body`) einfügen:

```css
/* Mockup C — Beitritts-Bühne (Startzustand) */
.present-join-stage {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.75rem; padding: 2rem; text-align: center;
}
.present-join-stage[hidden] { display: none; }
.pjs-heading { font-size: clamp(1rem, 2vw, 1.5rem); color: var(--grey-5); }
.pjs-code { font-size: clamp(3.5rem, 12vw, 9rem); font-weight: 300; color: var(--black); font-variant-numeric: tabular-nums; letter-spacing: 0.06em; line-height: 1.05; }
.pjs-at { font-size: clamp(1rem, 2vw, 1.5rem); color: var(--grey-5); }
.pjs-at b { color: var(--black); }
.pjs-qr { margin: 0.5rem 0; }
.pjs-qr svg { width: clamp(180px, 22vw, 260px); height: clamp(180px, 22vw, 260px); display: block; }
.pjs-counter { font-size: clamp(0.9rem, 1.6vw, 1.2rem); color: var(--grey-4); font-variant-numeric: tabular-nums; }
#btnStartSlides { margin-top: 0.75rem; }

/* Dauer-Join-Leiste in der Topbar */
.present-join-bar {
  display: inline-flex; align-items: center; gap: 0.6rem;
  background: none; border: 1px solid var(--grey-1); border-radius: var(--radius);
  padding: 0.25rem 0.6rem; cursor: pointer; color: var(--grey-5); font: inherit;
}
.present-join-bar[hidden] { display: none; }
.present-join-bar:hover { border-color: var(--grey-3); }
.pjb-label { font-size: 0.8rem; color: var(--grey-4); }
.pjb-code { font-size: 1.15rem; color: var(--black); font-variant-numeric: tabular-nums; letter-spacing: 0.05em; }
.pjb-qr svg { display: block; width: 44px; height: 44px; }
```

- [ ] **Step 6: Verifizieren (Browser)**

Server läuft bereits auf http://localhost:3000. Syntaxcheck (Rezept oben) → SYNTAX_OK. Dann per chrome-devtools/Playwright-MCP:
1. Eine Präsentation mit ≥2 Folien anlegen (POST /api/presentations + PUT …/slides oder über die UI), Moderationslink öffnen, „Präsentieren".
2. Erwartet: **Beitritts-Bühne** zentriert — Kopfzeile, großer Code, „Beitreten auf <host>", **großer gerenderter QR**, Live-Zähler, „Los geht's →". Screenshot + Read.
3. „Los geht's →" klicken → Folien erscheinen; oben die kompakte **Join-Leiste** (Label + Code + Mini-QR). Screenshot.
4. Pfeil-links auf Folie 1 **und** Klick auf die Join-Leiste → große Bühne kommt zurück (`#presentJoinStage` sichtbar). Per `evaluate` prüfen: `!document.getElementById('presentJoinStage').hidden` nach Klick = true.
5. Keine Konsolenfehler; `#presentJoinLine`/`#presentQr` existieren nicht mehr (per evaluate: beide `null`).

- [ ] **Step 7: Commit**

```bash
git add public/presenter.html public/app.css
git commit -m "P1: dedicated join stage as start state + persistent readable join bar"
```

---

### Task 3: Echte Toggles + Status-Chips (P2)

**Files:**
- Modify: `public/presenter.html` (`renderPresent` — Toggle-State + Chips ergänzen)
- Modify: `public/app.css` (Toggle- + Chip-Styles)

**Interfaces:**
- Consumes: `renderPresent(snap)` (Task 2), `#btnToggleResults`/`#btnToggleLock` (jetzt `.present-toggle` mit `aria-pressed`), `#presentStatus`, `t`, `snap.resultsHidden`, `snap.votingLocked`.
- Produces: sichtbarer An/Aus-Zustand der Toggles; Status-Chips auf der Bühne.

- [ ] **Step 1: Toggle-Label + Zustand in `renderPresent` setzen**

In `public/presenter.html` in `renderPresent(snap)` die beiden Zeilen, die heute nur `btnToggleResults.textContent`/`btnToggleLock.textContent` setzen, ersetzen durch (konstantes Label + Zustands-Suffix + `aria-pressed`/`is-active`):

```js
  const rHidden = !!snap.resultsHidden, vLocked = !!snap.votingLocked;
  const tr = $('btnToggleResults'), tl = $('btnToggleLock');
  tr.textContent = t('presenter.present.resultsLabel') + (rHidden ? ' ●' : ' ○');
  tr.setAttribute('aria-pressed', String(rHidden));
  tr.classList.toggle('is-active', rHidden);
  tl.textContent = t('presenter.present.votingLabel') + (vLocked ? ' ●' : ' ○');
  tl.setAttribute('aria-pressed', String(vLocked));
  tl.classList.toggle('is-active', vLocked);

  // Status-Chips auf der Bühne (publikumsseitig)
  const st = $('presentStatus');
  st.innerHTML = '';
  if (vLocked) st.appendChild(el(`<span class="present-chip">${esc(t('presenter.present.statusLocked'))}</span>`));
  if (rHidden) st.appendChild(el(`<span class="present-chip">${esc(t('presenter.present.statusResultsHidden'))}</span>`));
```

(Entferne die alten `$('btnToggleResults').textContent = snap.resultsHidden ? … ` und `$('btnToggleLock').textContent = …`-Zeilen aus `renderPresent`.)

- [ ] **Step 2: CSS für Toggles + Chips**

In `public/app.css` im Präsentations-Block einfügen (z. B. nach den `.present-footer`-Regeln):

```css
/* Mockup C — Zustands-Toggles + Status-Chips */
.present-toggles { display: flex; gap: 0.5rem; align-items: center; }
.present-toggle[aria-pressed="true"], .present-toggle.is-active {
  background: var(--primary); border-color: var(--primary); color: var(--white);
}
.present-toggle.is-active:hover { background: var(--primary-dark); border-color: var(--primary-dark); }
.present-status { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 1rem; min-height: 0; }
.present-status:empty { display: none; }
.present-chip {
  display: inline-block; padding: 0.3rem 0.8rem; border-radius: var(--radius);
  background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger);
  font-size: clamp(0.8rem, 1.4vw, 1.05rem); font-weight: 600;
}
```

- [ ] **Step 3: Verifizieren (Browser)**

Syntaxcheck → SYNTAX_OK. Im Präsentationsmodus (Folien-Zustand):
1. „Abstimmung"-Toggle klicken → Button wird rot/aktiv (`aria-pressed="true"`), auf der Bühne erscheint der Chip „Abstimmung gesperrt". Erneut klicken → zurück. Screenshot.
2. „Ergebnisse"-Toggle klicken → Button aktiv + Chip „Ergebnisse ausgeblendet"; beide Chips können gleichzeitig stehen. Per `evaluate` prüfen: `document.getElementById('btnToggleLock').getAttribute('aria-pressed')` und `document.querySelectorAll('#presentStatus .present-chip').length`.

- [ ] **Step 4: Commit**

```bash
git add public/presenter.html public/app.css
git commit -m "P2: stateful voting/results toggles + audience-facing status chips"
```

---

### Task 4: Bühne zentriert + skaliert (P3)

**Files:**
- Modify: `public/app.css` (`.present-body`, `.present-question`, `.present-results` und Balken-Größen)

**Interfaces:**
- Consumes: bestehendes Ergebnis-Markup (`.barchart`, `.bar-track`, `.bar-label`, `.bar-value`).
- Produces: vertikal zentrierte, größer skalierte Bühne. Rein CSS.

- [ ] **Step 1: `.present-body` zentrieren + Frage skalieren**

In `public/app.css` die Regeln für `.present-body`, `.present-question` und `.present-results .barchart` (aktuell :154, :156, :158) ersetzen durch:

```css
.present-body { flex: 1; overflow: auto; padding: 2.5rem 4rem; display: flex; flex-direction: column; justify-content: center; }
@media (max-width: 760px) { .present-body { padding: 1.5rem; } }
.present-question { font-size: clamp(2rem, 4.5vw, 4rem); font-weight: 300; color: var(--black); line-height: 1.15; margin-bottom: 2rem; }
.present-results { flex: 0 0 auto; }
.present-results .barchart { max-width: min(1100px, 90vw); margin: 0 auto; width: 100%; }
```

- [ ] **Step 2: Balken-/Ergebnis-Größen anheben**

In `public/app.css` die bestehenden Präsentations-Ergebnisregeln (`.present-results .bar-label` :375, `.bar-track` :376, `.bar-value` :377) ersetzen durch skalierte Varianten:

```css
.present-results .bar-label { font-size: clamp(1.1rem, 1.8vw, 1.6rem); }
.present-results .bar-track { height: clamp(2.4rem, 4vw, 3.4rem); }
.present-results .bar-value { font-size: clamp(1.3rem, 2vw, 1.8rem); }
```

- [ ] **Step 3: Verifizieren (Browser)**

Syntaxcheck nicht nötig (CSS). Im Präsentationsmodus mit einer Folie mit Ergebnissen (z. B. Multiple Choice mit einigen Stimmen):
1. Erwartet: Frage + Balken **vertikal zentriert** auf der Bühne, deutlich größer, Balken breiter (bis ~90vw/1100px, zentriert). Screenshot bei Beamer-Größe (z. B. 1440×900) + Read.
2. Kein horizontaler Überlauf; bei sehr vielen Optionen wird innerhalb der Bühne vertikal gescrollt (mit einer Folie mit vielen Optionen prüfen).

- [ ] **Step 4: Commit**

```bash
git add public/app.css
git commit -m "P3: vertically center presentation stage and scale question + bars to fill it"
```

---

### Task 5: Tastatur-Hinweise (P4) + Sprach-Refresh + End-to-End

**Files:**
- Modify: `public/presenter.html` (`renderPresent` — Hints setzen; `refreshLanguage` — Präsentation nachziehen)

**Interfaces:**
- Consumes: `renderPresent(snap)`, `#presentHints`, `refreshLanguage` (:843), `presenting`, `lastSnapshot`, `t`.
- Produces: sichtbarer Fußzeilen-Hinweis; live Sprachwechsel im Präsentationsmodus.

- [ ] **Step 1: Hints in `renderPresent` setzen**

In `public/presenter.html` in `renderPresent(snap)` (nahe den Fußleisten-Updates) ergänzen:

```js
  $('presentHints').textContent = t('presenter.present.hints');
```

- [ ] **Step 2: `refreshLanguage` zieht die Präsentation nach**

In `public/presenter.html` in `refreshLanguage()` (:843) am Ende ergänzen, damit Bühne/Chips/Hints/Toggles/Frage bei Sprachwechsel live neu gerendert werden:

```js
  if (presenting && lastSnapshot) renderPresent(lastSnapshot);
```

(Der bestehende `if (pres && !presenting) { renderSlideList(); renderSlideEditor(); }`-Zweig bleibt; im Präsentationsmodus greift nun der neue Aufruf.)

- [ ] **Step 3: Verifizieren (Browser)**

Syntaxcheck → SYNTAX_OK. Im Präsentationsmodus:
1. Fußzeile zeigt „← → Folie · Esc beenden". Screenshot.
2. **Sprach-Refresh:** DE/EN im Kopf umschalten (a) auf der Beitritts-Bühne → Kopfzeile/Zähler/„Los geht's" wechseln; (b) im Folien-Zustand → Hints, Toggle-Label, aktive Status-Chips, Frage-Fallback-Label wechseln. Per `evaluate` Textinhalte vor/nach prüfen.

- [ ] **Step 4: End-to-End-Durchlauf**

Kompletter Ablauf in einem Rutsch: „Präsentieren" → Beitritts-Bühne (großer Code/QR/Zähler) → „Los geht's →" → Folien (zentriert, große Balken, Join-Leiste, Hints) → „Abstimmung"/„Ergebnisse" togglen (rot aktiv + Chips) → Pfeil-links auf Folie 1 zurück zur Bühne → Klick auf Join-Leiste → „Beenden" (Esc). Erwartet: keine Konsolenfehler, `server.js` per `git status` unverändert.

- [ ] **Step 5: Commit**

```bash
git add public/presenter.html
git commit -m "P4: visible keyboard hints + live language refresh for present mode"
```

---

## Self-Review

**Spec-Abdeckung:**
- P1 (Beitritts-Bühne + Dauer-Leiste) → Task 2 (Markup, `joinStage`, `renderPresent`, `applyStagePresence`, Übergänge, Rückkehr per Klick + Pfeil-links auf Folie 1, CSS). ✓
- P2 (echte Toggles + Status-Chips) → Task 3. ✓
- P3 (zentriert + skaliert mit Deckeln) → Task 4. ✓
- P4 (Tastatur-Hinweise) → Task 5 Step 1–2. ✓
- i18n DE+EN → Task 1; Sprach-Refresh → Task 5 Step 2. ✓
- Kein Servereingriff, Zero-Dependency, Design-System, präsentator-lokal → Global Constraints; `server.js` nirgends in „Files". ✓
- Randfälle: `joinStage` in `enterPresent` gesetzt (Task 2); `onSnapshot`/`renderPresent` bei `joinStage` aktualisiert Bühne (Task 2 Step 3); `publicBase` beim Öffnen genutzt (Task 2 Step 2); noSlides-Pfad in `renderPresent` (Task 2 Step 3); 0-Zuschauer-Plural über `presenter.join.counter` one/other (Task 1). ✓

**Platzhalter-Scan:** kein TBD/TODO; jeder Code-Schritt zeigt vollständigen Code. ✓

**Typ-Konsistenz:** `joinStage`, `renderPresent(snap)`, `applyStagePresence()`, `showSlides()`/`showJoinStage()`, IDs `presentJoinStage/pjsCode/pjsAt/pjsQr/pjsCounter/pjsHeading/btnStartSlides/presentBody/presentFooter/presentJoinBar/pjbCode/pjbQr/presentStatus/presentHints` durchgängig gleich benannt und in Tasks 2/3/5 konsistent verwendet. Entfernte IDs `presentJoinLine`/`presentQr` werden nach Task 2 nirgends mehr referenziert (alte `enterPresent`-Zeilen ersetzt). ✓
