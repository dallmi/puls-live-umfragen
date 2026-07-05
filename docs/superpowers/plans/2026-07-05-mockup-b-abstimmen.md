# Mockup B — Abstimmen vereinheitlicht Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Publikums-Abstimmen (`public/vote.html`) auf ein einheitliches Modell bringen: Single-Choice/Skala senden sofort und morphen an Ort und Stelle zu Balken; mehrwertige Typen bestätigen über eine feste Leiste; Quiz bleibt endgültig; gesperrt bleibt sichtbar (V1–V5, Ü1).

**Architecture:** Rein clientseitig. `renderVote` baut den Folientyp künftig auch im gesperrten Zustand und legt danach einen Sperr-Modus über (`applyLock`). Gemeinsame Muster als kleine Helfer: `voteBar()` (feste 48-px-Bestätigen-Leiste), `paintChoiceResults`/`paintScaleResults` (Options-/Skala-Buttons werden zu antippbaren Ergebnis-Balken), `morphBoard()` (Balken read-only + „Ändern" für Punkte/Ranking). Der Server bleibt unverändert — er ersetzt Antworten desselben Teilnehmers bereits.

**Tech Stack:** Vanilla HTML/CSS/JS. Helfer aus `common.js` (`renderResults`, `el`, `esc`, `t`, `markVoted`/`votedStore`), Pointer-Events fürs Drag-Ranking, `<input type=range>` für Punkte.

## Global Constraints

- **Zero-Dependency**: keine neuen Pakete, kein Test-Runner, kein CDN.
- **Kein Servereingriff**: `server.js` bleibt unverändert. `applyAnswer` ersetzt Antworten desselben Teilnehmers für choice/scale/points/ranking bereits; Quiz ist einmalig (`already_answered`).
- **Design-System strikt**: nur bestehende Tokens/Klassen; Rot `--primary #E60000` nur Akzent; Radius `var(--radius)` 2px; kein Verlauf; kein ALL-CAPS.
- **Zweisprachig**: jeder neue sichtbare Text als i18n-Key mit **DE + EN**.
- **Touch-Ziele ≥ 44 px**; Bestätigen-Leiste ≥ 48 px; Publikums-Meta-/Hilfetexte ≥ ~13 px (~0.82 rem).
- **Sende-Modell**: sofort = Single-Choice + Skala (Server ersetzt); feste Leiste = Mehrfachauswahl, Punkte, Ranking, Wortwolke, offener Text; Quiz = bestätigen + endgültig.

## Verifikationsmodell (kein Test-Runner)

Zero-Dependency, kein Test-Framework — Verifikation **browser-getrieben** am laufenden Server (zentral vom Controller bereitgestellt auf Port 3000; **nicht** selbst starten). Als Publikum abstimmen setzt eine Präsentation mit Folien voraus. Inline-Syntaxcheck (in jeder Task nutzbar):
```
node -e 'const fs=require("fs");const h=fs.readFileSync("public/vote.html","utf8");const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync(".superpowers/sdd/_vote_inline.js",m.map(x=>x[1]).join("\n;\n"))' && node --check .superpowers/sdd/_vote_inline.js && echo SYNTAX_OK
```
**Test-Präsentation mit einer Folie je Typ (per API):** eine Präsentation anlegen (`POST /api/presentations`), dann `PUT /api/presentations/:id/slides` mit dem Admin-Token und einer Folienliste. Beispiel-Body (nutzbar für alle folgenden Tasks):
```
[
 {"id":"s1","type":"choice","question":"Einfachauswahl","options":["A","B","C"],"multiple":false},
 {"id":"s2","type":"choice","question":"Mehrfachauswahl","options":["A","B","C"],"multiple":true},
 {"id":"s3","type":"scale","question":"Skala","min":1,"max":5,"minLabel":"unklar","maxLabel":"klar"},
 {"id":"s4","type":"points","question":"Punkte","options":["A","B","C"],"total":100},
 {"id":"s5","type":"ranking","question":"Ranking","options":["A","B","C","D"]},
 {"id":"s6","type":"quiz","question":"Quiz","options":["A","B","C"],"correct":0},
 {"id":"s7","type":"wordcloud","question":"Wortwolke","maxWords":2},
 {"id":"s8","type":"open","question":"Offen"}
]
```
Als Publikum über `http://localhost:3000/vote.html?code=<code>` teilnehmen; der Moderator (presenter mit Token) wechselt die aktive Folie über `POST /api/presentations/:id/state {"activeIndex":N}` und sperrt über `{"votingLocked":true}`. Für Live-Balken ein zweites Fenster/`participantId` nutzen.

## File Structure

- `public/i18n.js` — Modify: neue `vote.*`-Keys (Ändern, Sperr-Chip, Slider/Budget, Quiz-Einmalig).
- `public/app.css` — Modify: Bestätigen-Leiste, Options-als-Balken, Punkte-Slider + Budget-Balken, Ranking-Drag, Sperr-Chip/-Overlay, Schriftgrößen (Ü1).
- `public/common.js` — Modify (additiv): `opts.own` in `renderResults`→`renderChoice/renderScale/renderPoints/renderRanking`, um die eigene Wahl im Board zu markieren.
- `public/vote.html` — Modify (Kern): `renderVote`-Restrukturierung, `applyLock`, `voteBar`, `paintChoiceResults`/`paintScaleResults`, `morphBoard`, und Umbau der `build*`-Funktionen.

---

### Task 1: i18n-Keys + größere Schrift (Ü1)

**Files:**
- Modify: `public/i18n.js` (neue Keys nach dem letzten `'vote.*'`-Eintrag)
- Modify: `public/app.css` (Schriftgrößen `.field .help` u. a.)

**Interfaces:**
- Produces: Keys `vote.change`, `vote.locked.chip`, `vote.points.slider`, `vote.points.budget`, `vote.quiz.once`, `vote.ranking.dragHint`, abrufbar via `t()`.

- [ ] **Step 1: i18n-Keys einfügen**

In `public/i18n.js` nach dem letzten Key, der mit `'vote.` beginnt, einfügen:
```js
  'vote.change': { de: 'Ändern', en: 'Change' },
  'vote.thanks': { de: 'Danke — deine Stimme zählt.', en: 'Thanks — your vote counts.' },
  'vote.locked.chip': { de: 'Abstimmung gesperrt', en: 'Voting locked' },
  'vote.points.budget': { de: '{{n}} von {{total}} Punkten übrig', en: '{{n}} of {{total}} points left' },
  'vote.points.slider': { de: 'Punkte für {{opt}}', en: 'Points for {{opt}}' },
  'vote.quiz.once': { de: 'Einmalige Antwort — kann nicht geändert werden.', en: 'One-time answer — cannot be changed.' },
  'vote.ranking.dragHint': { de: 'Zum Sortieren ziehen (oder ▲▼).', en: 'Drag to reorder (or ▲▼).' },
```

- [ ] **Step 2: Schriftgrößen anheben (Ü1)**

In `public/app.css` die Regel `.field .help` (Zeile 53) ersetzen durch:
```css
.field .help { font-size: 0.82rem; color: var(--grey-4); margin-top: 0.25rem; }
```
Und die zu kleinen Vote-Metazeilen anheben — ersetze `.ranking-hint` (:309), `.ranking-avg` (:343), `.points-remaining` (Blockstart :302) Größen `0.8rem`/`0.8rem`/(vorhandene) auf mindestens `0.85rem`:
```css
.ranking-hint { font-size: 0.85rem; color: var(--grey-4); margin-bottom: 0.6rem; }
.ranking-avg { flex-shrink: 0; font-size: 0.85rem; color: var(--grey-4); font-variant-numeric: tabular-nums; }
```
(Falls `.results-meta`/`.vote-board-hint` unter 0.8rem liegen, ebenfalls auf 0.82rem anheben — per `grep -n "results-meta\|vote-board-hint" public/app.css` prüfen und angleichen.)

- [ ] **Step 3: Verifizieren**

`node --check public/i18n.js` → exit 0. Presence-Check:
```
node -e 'const fs=require("fs");const s=fs.readFileSync("public/i18n.js","utf8");for(const k of ["vote.change","vote.locked.chip","vote.points.budget","vote.points.slider","vote.quiz.once","vote.ranking.dragHint"]) if(!s.includes("\x27"+k+"\x27")) throw new Error("fehlt "+k);console.log("KEYS OK")'
```
Erwartet `KEYS OK`. Server läuft; Startseite laden und prüfen, dass `.field .help` nun ~13 px ist (DevTools computed font-size ≥ 13px).

- [ ] **Step 4: Commit**
```bash
git add public/i18n.js public/app.css
git commit -m "B: add vote i18n keys (change/lock/slider/quiz-once) and bump small audience fonts (Ü1)"
```

---

### Task 2: `renderVote`-Restrukturierung + Sperr-Modus (V5) + gemeinsame Helfer

**Files:**
- Modify: `public/vote.html` (`renderVote` ~:205–214; neue Funktionen `applyLock`, `voteBar`; Script)
- Modify: `public/app.css` (Bestätigen-Leiste, Sperr-Chip/-Overlay)

**Interfaces:**
- Consumes: `el`, `esc`, `t`, `curSlide`, `snap`.
- Produces:
  - `renderVote` baut den Typ **immer** (auch bei `votingLocked`); danach `applyLock(form)` wenn gesperrt.
  - `applyLock(form)` — deaktiviert alle `button`/`input`/`textarea`/`[role=slider]` in `form`, ergänzt Overlay-Klasse `.is-locked` und einen Chip `<div class="vote-lock-chip">…</div>`.
  - `voteBar({ label, onConfirm }) → { el, setEnabled(bool) }` — feste Bestätigen-Leiste (Element `.vote-confirm-bar` mit Primär-Button); `setEnabled` schaltet den Button. Wird von den Bestätigen-Typen (Tasks 4–7) genutzt und **einmal** pro Render an `root` angehängt.

- [ ] **Step 1: `renderVote` umbauen (immer bauen + Sperr-Pass)**

In `public/vote.html` den Block (aktuell :198–214) ersetzen:
```js
  const form = el('<div id="voteForm"></div>');
  root.appendChild(form);

  switch (slide.type) {
    case 'choice':    buildChoice(form, slide); break;
    case 'wordcloud': buildWordcloud(form, slide); break;
    case 'open':      buildOpen(form, slide); break;
    case 'scale':     buildScale(form, slide); break;
    case 'points':    buildPoints(form, slide); break;
    case 'ranking':   buildRanking(form, slide); break;
    case 'quiz':      buildQuiz(form, slide); break;
    case 'qa':        buildQa(form, slide); break;
  }

  if (snap.votingLocked && slide.type !== 'info') applyLock(form);
```
(Die alte `if (snap.votingLocked …) { .vote-locked note }` und `if (!snap.votingLocked) { switch }` entfallen — der Typ wird immer gebaut, dann gesperrt.)

- [ ] **Step 2: `applyLock` + `voteBar` einfügen**

In `public/vote.html` (z. B. vor `buildChoice`) einfügen:
```js
function applyLock(form) {
  form.classList.add('is-locked');
  form.querySelectorAll('button, input, textarea, [role="slider"], .rank-handle').forEach((e) => {
    e.setAttribute('disabled', '');
    e.classList.add('locked-el');
    e.style.pointerEvents = 'none';
  });
  // feste Bestätigen-Leiste, falls vorhanden, ebenfalls sperren
  const bar = document.getElementById('voteConfirmBar');
  if (bar) bar.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  if (!form.querySelector('.vote-lock-chip')) {
    form.insertBefore(el(`<div class="vote-lock-chip">${esc(t('vote.locked.chip'))}</div>`), form.firstChild);
  }
}

function voteBar({ label, onConfirm }) {
  const barEl = el(`
    <div class="vote-confirm-bar" id="voteConfirmBar">
      <button class="ds-btn ds-btn-primary ds-btn-lg" id="voteConfirmBtn" disabled>${esc(label)}</button>
    </div>`);
  const btn = barEl.querySelector('#voteConfirmBtn');
  btn.addEventListener('click', () => { if (!btn.disabled) onConfirm(); });
  document.querySelector('.container, main, body').appendChild(barEl);
  return { el: barEl, setEnabled: (b) => { btn.disabled = !b; } };
}
```
(Die Leiste wird an den Seiten-Container gehängt; sie ist `position: sticky/fixed` per CSS. `renderVote` muss zu Beginn eine evtl. alte Leiste entfernen — siehe Step 3.)

- [ ] **Step 3: alte Bestätigen-Leiste vor jedem Render entfernen**

In `public/vote.html` am Anfang von `renderVote` (direkt nachdem `root` geleert/neu aufgebaut wird — dort wo `renderedKey` gesetzt wird) einfügen:
```js
  const oldBar = document.getElementById('voteConfirmBar');
  if (oldBar) oldBar.remove();
```

- [ ] **Step 4: CSS für Leiste + Sperr-Zustand**

In `public/app.css` ans Ende anhängen:
```css
/* Mockup B — feste Bestätigen-Leiste + Sperr-Zustand */
.vote-confirm-bar {
  position: sticky; bottom: 0; z-index: 20;
  display: flex; gap: 0.5rem; padding: 0.6rem 0;
  background: var(--bg); border-top: 1px solid var(--grey-1);
  margin-top: 1rem;
}
.vote-confirm-bar .ds-btn { flex: 1; min-height: 48px; }
.vote-lock-chip {
  display: inline-block; margin-bottom: 0.75rem; padding: 0.3rem 0.8rem;
  border-radius: var(--radius); background: var(--warning-bg); color: var(--warning);
  border: 1px solid var(--warning); font-size: 0.85rem; font-weight: 600;
}
.is-locked { opacity: 0.7; }
.is-locked .locked-el { cursor: not-allowed; }
```

- [ ] **Step 5: Verifizieren (Browser)**

Syntaxcheck → SYNTAX_OK. Test-Präsentation anlegen (siehe Verifikationsmodell), als Publikum die Single-Choice-Folie öffnen: Optionen erscheinen (wie bisher, noch altes Sende-Verhalten). Moderator sperrt (`state {"votingLocked":true}`): Optionen bleiben **sichtbar, ausgegraut**, Chip „Abstimmung gesperrt" oben; kein Verschwinden. Entsperren: wieder bedienbar. Keine Konsolenfehler.

- [ ] **Step 6: Commit**
```bash
git add public/vote.html public/app.css
git commit -m "B (V5): always build the vote form and overlay a visible locked state; add shared confirm-bar helper"
```

---

### Task 3: Sofort-Typen — Single-Choice + Skala (V1/V2, sofort + Morph + Ändern)

**Files:**
- Modify: `public/vote.html` (`buildChoice`, `buildScale`; neue Helfer `paintChoiceResults`, `paintScaleResults`)
- Modify: `public/app.css` (Options-/Skala-Button als Balken)

**Interfaces:**
- Consumes: `submit`, `markVoted`/`votedStore`, `curResults`, `snap.resultsHidden`, `el`, `esc`, `t`.
- Produces: `paintChoiceResults(box, slide, ownIndices)` / `paintScaleResults(picker, slide, ownValue)` — zeichnen den Anteils-Balken + Zahl in die vorhandenen Buttons und markieren `.own`/`.leader`; Buttons bleiben klickbar.

- [ ] **Step 1: `buildChoice` (Single) auf Sofort-Senden + Morph umbauen**

Ersetze in `public/vote.html` die Funktion `buildChoice` (aktuell :303–346) durch:
```js
function buildChoice(form, slide) {
  if (slide.multiple) return buildChoiceMulti(form, slide); // Mehrfachauswahl: Task 4
  const prevArr = votedStore()[slide.id];
  let chosen = Array.isArray(prevArr) && prevArr.length ? prevArr[0] : null;

  const box = el('<div class="vote-options"></div>');
  (slide.options || []).forEach((opt, i) => {
    const btn = el(`<button class="vote-option${chosen === i ? ' selected' : ''}"><span class="mark"></span><span class="vo-label">${esc(opt)}</span><span class="vo-count"></span></button>`);
    btn.addEventListener('click', () => {
      chosen = i;
      box.querySelectorAll('.vote-option').forEach((b, j) => b.classList.toggle('selected', j === i));
      submit([i], () => { markVoted(slide.id, [i]); paintChoiceResults(box, slide, [i]); });
    });
    box.appendChild(btn);
  });
  form.appendChild(box);
  if (chosen !== null) paintChoiceResults(box, slide, [chosen]);
}

function paintChoiceResults(box, slide, ownIndices) {
  const results = curResults();
  const btns = [...box.querySelectorAll('.vote-option')];
  if (snap.resultsHidden || !results || results.kind !== 'choice') {
    btns.forEach((b, i) => b.classList.toggle('own', ownIndices.includes(i)));
    return; // Ergebnis ausgeblendet: nur eigene Wahl markieren, keine Balken
  }
  const counts = results.counts || [];
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts, 1);
  btns.forEach((b, i) => {
    const c = counts[i] || 0;
    const pct = total ? Math.round((c / total) * 100) : 0;
    b.classList.add('as-bar');
    b.classList.toggle('own', ownIndices.includes(i));
    b.classList.toggle('leader', c > 0 && c === max);
    b.style.setProperty('--fill', (max ? (c / max) * 100 : 0) + '%');
    b.querySelector('.vo-count').textContent = `${c} · ${pct}%`;
  });
}
```

- [ ] **Step 2: `buildScale` auf Morph + Ändern umbauen**

Ersetze `buildScale` (aktuell :485–516) durch:
```js
function buildScale(form, slide) {
  const prev = votedStore()[slide.id];
  let chosen = typeof prev === 'number' ? prev : null;

  const picker = el('<div class="scale-picker"></div>');
  for (let v = slide.min; v <= slide.max; v++) {
    const b = el(`<button class="scale-btn${chosen === v ? ' selected' : ''}"><span class="sb-num">${v}</span><span class="sb-count"></span></button>`);
    b.addEventListener('click', () => {
      chosen = v;
      picker.querySelectorAll('.scale-btn').forEach((x, idx) => x.classList.toggle('selected', idx + slide.min === v));
      submit(v, () => { markVoted(slide.id, v); paintScaleResults(picker, slide, v); });
    });
    picker.appendChild(b);
  }
  form.appendChild(picker);
  form.appendChild(el(`<div class="scale-labels"><span>${esc(slide.minLabel || '')}</span><span>${esc(slide.maxLabel || '')}</span></div>`));
  if (chosen !== null) paintScaleResults(picker, slide, chosen);
}

function paintScaleResults(picker, slide, ownValue) {
  const results = curResults();
  const btns = [...picker.querySelectorAll('.scale-btn')];
  if (snap.resultsHidden || !results || results.kind !== 'scale') {
    btns.forEach((b, idx) => b.classList.toggle('own', idx + slide.min === ownValue));
    return;
  }
  const counts = results.counts || [];
  const max = Math.max(...counts, 1);
  btns.forEach((b, idx) => {
    const v = idx + slide.min;
    const c = counts[idx] || 0;
    b.classList.add('as-bar');
    b.classList.toggle('own', v === ownValue);
    b.classList.toggle('leader', c > 0 && c === max);
    b.style.setProperty('--fill', (max ? (c / max) * 100 : 0) + '%');
    b.querySelector('.sb-count').textContent = c ? String(c) : '';
  });
}
```
(Hinweis: `curResults()` liefert für Skala `{ kind:'scale', counts:[…] }` indexiert ab `slide.min`. Falls die Skala-Ergebnisform abweicht, im Browser prüfen und die Index-Zuordnung anpassen — Step 4 verifiziert das live.)

- [ ] **Step 3: CSS — Buttons als Balken**

In `public/app.css` ans Ende anhängen:
```css
/* Mockup B — Options-/Skala-Buttons als Ergebnis-Balken (antippbar) */
.vote-option { position: relative; min-height: 48px; overflow: hidden; }
.vote-option .vo-label { position: relative; z-index: 1; }
.vote-option .vo-count { position: relative; z-index: 1; margin-left: auto; font-size: 0.85rem; color: var(--grey-5); font-variant-numeric: tabular-nums; }
.vote-option.as-bar::before {
  content: ""; position: absolute; inset: 0 auto 0 0; width: var(--fill, 0%);
  background: var(--surface); transition: width 0.4s ease; z-index: 0;
}
.vote-option.as-bar.leader::before { background: var(--surface-alt); }
.vote-option.own { border-left: 3px solid var(--primary); }
.scale-btn { position: relative; min-width: 48px; min-height: 48px; overflow: hidden; }
.scale-btn .sb-num { position: relative; z-index: 1; }
.scale-btn .sb-count { position: absolute; bottom: 2px; left: 0; right: 0; text-align: center; font-size: 0.7rem; z-index: 1; color: var(--grey-5); }
.scale-btn.as-bar::before { content:""; position:absolute; inset:auto 0 0 0; height: var(--fill,0%); background: var(--surface); z-index:0; transition: height 0.4s ease; }
.scale-btn.own { outline: 2px solid var(--primary); outline-offset: -2px; }
```

- [ ] **Step 4: Verifizieren (Browser via Playwright/chrome-devtools MCP)**

Syntaxcheck → SYNTAX_OK. Test-Präsentation, Single-Choice-Folie als Publikum:
1. Eine Option antippen → sofort gesendet (kein Button); die Option-Buttons zeigen sofort Balken + Zahl, eigene Wahl links rot markiert (`.own`). Kein separater Ergebnisblock, kein Scrollen.
2. Andere Option antippen → Stimme ändert sich (Balken/Markierung aktualisieren); über einen zweiten `participantId` prüfen, dass die Gesamtzahl **nicht** doppelt zählt (Server ersetzt).
3. Skala-Folie: Zahl antippen → sofort + Balken in den Skala-Buttons; Ändern per anderem Tap.
4. Moderator „Ergebnisse ausblenden": keine Balken, nur eigene Wahl markiert.

- [ ] **Step 5: Commit**
```bash
git add public/vote.html public/app.css
git commit -m "B (V1/V2): single-choice & scale send instantly and morph options into tappable result bars"
```

---

### Task 4: Bestätigen-Typen über die Leiste — Mehrfachauswahl + Wortwolke + Offen

**Files:**
- Modify: `public/vote.html` (neue `buildChoiceMulti`; `buildWordcloud`, `buildOpen` auf `voteBar` umstellen)

**Interfaces:**
- Consumes: `voteBar` (Task 2), `paintChoiceResults` (Task 3), `submit`, `markVoted`/`votedStore`, `showResults`.
- Produces: `buildChoiceMulti(form, slide)`.

- [ ] **Step 1: `buildChoiceMulti` (Mehrfachauswahl) mit fester Leiste + Morph**

In `public/vote.html` einfügen:
```js
function buildChoiceMulti(form, slide) {
  const prev = votedStore()[slide.id];
  let selection = Array.isArray(prev) ? [...prev] : [];
  let submitted = Array.isArray(prev);

  const box = el('<div class="vote-options"></div>');
  (slide.options || []).forEach((opt, i) => {
    const btn = el(`<button class="vote-option multi${selection.includes(i) ? ' selected' : ''}"><span class="mark"></span><span class="vo-label">${esc(opt)}</span><span class="vo-count"></span></button>`);
    btn.addEventListener('click', () => {
      selection = selection.includes(i) ? selection.filter((x) => x !== i) : [...selection, i];
      box.querySelectorAll('.vote-option').forEach((b, j) => b.classList.toggle('selected', selection.includes(j)));
      bar.setEnabled(selection.length > 0);
    });
    box.appendChild(btn);
  });
  form.appendChild(box);

  const bar = voteBar({ label: t('vote.choice.submit'), onConfirm: () => {
    submit(selection, () => {
      markVoted(slide.id, selection);
      submitted = true;
      paintChoiceResults(box, slide, selection);
      bar.el.querySelector('#voteConfirmBtn').textContent = t('vote.change');
      bar.setEnabled(true);
    });
  }});
  bar.setEnabled(selection.length > 0);
  if (submitted) { paintChoiceResults(box, slide, selection); bar.el.querySelector('#voteConfirmBtn').textContent = t('vote.change'); bar.setEnabled(true); }
}
```
(„Ändern" nach dem Senden: der Leisten-Button wechselt auf „Ändern" — erneutes Bestätigen sendet die geänderte Auswahl; da der Server ersetzt, ist das idempotent. Die Optionen bleiben klickbar.)

- [ ] **Step 2: `buildWordcloud` auf die Leiste umstellen**

Ersetze in `buildWordcloud` (aktuell :404–451) den lokalen `btn` und dessen Anhängen durch die feste Leiste. Konkret: entferne `const btn = el(...)`, `btn.addEventListener('click', send)` und `form.appendChild(btn)`; ersetze durch:
```js
  const bar = voteBar({ label: t('common.send'), onConfirm: send });
  input.addEventListener('input', () => bar.setEnabled(input.value.trim().length > 0 && remaining() > 0));
```
und ersetze innerhalb von `refresh()` die Zeilen `btn.disabled = done;` durch `bar.setEnabled(!done && input.value.trim().length > 0);`. `input.disabled = done;` bleibt. `send()` bleibt inhaltlich gleich (nutzt weiter `showResults` — Wortwolke behält ihr Board).

- [ ] **Step 3: `buildOpen` auf die Leiste umstellen**

Ersetze in `buildOpen` (aktuell :454–482) `const btn = el(...)`, dessen Listener und `form.appendChild(btn)` durch:
```js
  const bar = voteBar({ label: t('common.send'), onConfirm: sendOpen });
  ta.addEventListener('input', () => bar.setEnabled(ta.value.trim().length > 0));
```
und ziehe die bisherige Klick-Logik in eine benannte Funktion `sendOpen()` (Inhalt unverändert: trim, `submit(text, …)`, Board via `showResults`). `bar.setEnabled(false)` initial.

- [ ] **Step 4: Verifizieren (Browser)**

Syntaxcheck → SYNTAX_OK. Als Publikum:
1. Mehrfachauswahl-Folie: mehrere Optionen wählen → feste 48-px-Leiste unten aktiv → „Abstimmen" → Optionen morphen zu Balken (eigene Wahlen markiert), Button wird „Ändern"; Auswahl ändern + „Ändern" → aktualisiert, keine Doppelzählung.
2. Wortwolke: Wort eingeben → Leiste „Senden" → Board zeigt Wortwolke; Rest-Zähler korrekt; nach maxWords deaktiviert.
3. Offen: Text → Leiste „Senden" → Bestätigung/Board.
4. Sperren während Auswahl (vor Senden): Optionen + Leiste gesperrt, Chip sichtbar (Task 2 `applyLock` greift auch auf die Leiste).

- [ ] **Step 5: Commit**
```bash
git add public/vote.html
git commit -m "B (V1): multi-choice, wordcloud and open text confirm via the fixed bottom bar; multi-choice morphs"
```

---

### Task 5: Punkte-Slider (V4) + Bestätigen-Leiste + Morph

**Files:**
- Modify: `public/vote.html` (`buildPoints`)
- Modify: `public/app.css` (Slider + Budget-Balken)

**Interfaces:**
- Consumes: `voteBar`, `submit`, `markVoted`/`votedStore`, `morphBoard` (siehe Step 2), `renderResults`.
- Produces: `morphBoard(form, slide, own)` — ersetzt die Eingabe durch das Ergebnis-Board (via `renderResults`, `opts.own`) + „Ändern"-Button, der die Eingabe neu baut.

- [ ] **Step 1: `buildPoints` auf Slider + Budget-Balken + Leiste umbauen**

Ersetze `buildPoints` (aktuell :519–584) durch:
```js
function buildPoints(form, slide) {
  const total = slide.total || 100;
  const opts = slide.options || [];
  const prev = votedStore()[slide.id];
  const pts = Array.isArray(prev) && prev.length === opts.length ? [...prev] : opts.map(() => 0);

  const box = el('<div class="points-list"></div>');
  const budget = el('<div class="points-budget"><div class="pb-track"><div class="pb-fill"></div></div><div class="pb-text"></div></div>');
  const rows = [];
  const used = () => pts.reduce((a, b) => a + (b || 0), 0);
  const remaining = () => total - used();

  function refresh() {
    const rem = remaining();
    budget.querySelector('.pb-fill').style.width = (used() / total * 100) + '%';
    budget.querySelector('.pb-text').textContent = t('vote.points.budget', { n: rem, total });
    budget.classList.toggle('none-left', rem <= 0);
    rows.forEach((r, i) => { r.valueEl.textContent = pts[i]; r.range.max = String((pts[i] || 0) + Math.max(0, rem)); });
    bar.setEnabled(used() > 0);
  }

  opts.forEach((opt, i) => {
    const row = el(`
      <div class="points-row slider-row">
        <span class="points-label">${esc(opt)}</span>
        <input type="range" class="points-range" min="0" step="5" value="${pts[i] || 0}" aria-label="${esc(t('vote.points.slider', { opt }))}">
        <span class="points-value">${pts[i] || 0}</span>
      </div>`);
    const range = row.querySelector('.points-range');
    const valueEl = row.querySelector('.points-value');
    range.addEventListener('input', () => {
      let v = Math.round(Number(range.value) / 5) * 5;
      const others = used() - (pts[i] || 0);
      v = Math.min(v, total - others);   // Budget hart begrenzen
      pts[i] = Math.max(0, v);
      range.value = String(pts[i]);
      refresh();
    });
    rows.push({ valueEl, range });
    box.appendChild(row);
  });

  form.appendChild(box);
  form.appendChild(budget);
  const bar = voteBar({ label: t('vote.points.submit'), onConfirm: () => {
    if (used() <= 0) return;
    submit(pts, () => { markVoted(slide.id, pts); morphBoard(form, slide, null); });
  }});
  refresh();
  if (Array.isArray(prev)) morphBoard(form, slide, null);
}
```

- [ ] **Step 2: `morphBoard` einfügen**

In `public/vote.html` (z. B. neben `voteBar`) einfügen:
```js
function morphBoard(form, slide, own) {
  const oldBar = document.getElementById('voteConfirmBar');
  if (oldBar) oldBar.remove();
  form.innerHTML = '';
  if (snap.resultsHidden || !curResults()) {
    form.appendChild(submittedNote(t('vote.thanks')));
  } else {
    const box = el('<div></div>');
    renderResults(box, slide, curResults(), own != null ? { own } : {});
    form.appendChild(box);
  }
  const change = el(`<button class="ds-btn ds-btn-lg" style="margin-top:1rem;">${esc(t('vote.change'))}</button>`);
  change.addEventListener('click', () => {
    form.innerHTML = '';
    if (slide.type === 'points') buildPoints(form, slide);
    else if (slide.type === 'ranking') buildRanking(form, slide);
  });
  form.appendChild(change);
}
```
(`vote.thanks` wird in Task 1 angelegt.)

- [ ] **Step 3: CSS — Slider + Budget-Balken**

In `public/app.css` ans Ende anhängen:
```css
/* Mockup B — Punkte-Slider (V4) */
.points-row.slider-row { display: flex; align-items: center; gap: 0.75rem; }
.points-range { flex: 1; min-height: 44px; accent-color: var(--primary); }
.points-budget { margin-top: 0.75rem; }
.points-budget .pb-track { height: 0.6rem; background: var(--surface); border-radius: var(--radius); overflow: hidden; }
.points-budget .pb-fill { height: 100%; background: var(--primary); width: 0%; transition: width 0.2s ease; }
.points-budget .pb-text { font-size: 0.85rem; color: var(--grey-5); margin-top: 0.3rem; font-variant-numeric: tabular-nums; }
.points-budget.none-left .pb-text { color: var(--primary); font-weight: 600; }
```

- [ ] **Step 4: Verifizieren (Browser)**

Syntaxcheck → SYNTAX_OK. Punkte-Folie als Publikum: Slider je Option (≥44 px), Budget-Balken zeigt „X von 100 übrig" und füllt sich; ein Slider kann das Budget nicht überschreiten (harte Grenze); Leiste „Abstimmen" sendet; danach Board + „Ändern" öffnet die Eingabe wieder mit den gespeicherten Werten.

- [ ] **Step 5: Commit**
```bash
git add public/vote.html public/app.css
git commit -m "B (V4): points as sliders with a live budget bar; confirm via bar; morph to board with Change"
```

---

### Task 6: Ranking per Drag (V3) + Bestätigen-Leiste + Morph

**Files:**
- Modify: `public/vote.html` (`buildRanking`)
- Modify: `public/app.css` (Drag-Handle, 44-px-Ziele)

**Interfaces:**
- Consumes: `voteBar`, `morphBoard` (Task 5), `submit`, `markVoted`/`votedStore`.
- Produces: —

- [ ] **Step 1: `buildRanking` mit Drag-Handle (Pointer) + ▲▼-Fallback + Leiste**

Ersetze `buildRanking` (aktuell :587–629) durch:
```js
function buildRanking(form, slide) {
  const opts = slide.options || [];
  const prev = votedStore()[slide.id];
  let order = Array.isArray(prev) && prev.length === opts.length ? [...prev] : opts.map((_, i) => i);

  form.appendChild(el(`<div class="ranking-hint">${esc(t('vote.ranking.dragHint'))}</div>`));
  const list = el('<ol class="ranking-input"></ol>');

  function render() {
    list.innerHTML = '';
    order.forEach((optIdx, pos) => {
      const row = el(`
        <li class="ranking-item" draggable="false">
          <span class="rank-handle" role="button" aria-label="${esc(t('vote.ranking.dragHint'))}">⠿</span>
          <span class="ranking-num">${pos + 1}</span>
          <span class="ranking-text">${esc(opts[optIdx])}</span>
          <span class="ranking-moves">
            <button type="button" class="ranking-move up" aria-label="${esc(t('vote.ranking.up'))}" ${pos === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" class="ranking-move down" aria-label="${esc(t('vote.ranking.down'))}" ${pos === order.length - 1 ? 'disabled' : ''}>▼</button>
          </span>
        </li>`);
      row.querySelector('.up').addEventListener('click', () => { if (pos > 0) { [order[pos - 1], order[pos]] = [order[pos], order[pos - 1]]; render(); } });
      row.querySelector('.down').addEventListener('click', () => { if (pos < order.length - 1) { [order[pos + 1], order[pos]] = [order[pos], order[pos + 1]]; render(); } });
      attachDrag(row, pos);
      list.appendChild(row);
    });
  }

  function attachDrag(row, pos) {
    const handle = row.querySelector('.rank-handle');
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const startY = e.clientY;
      const rowH = row.getBoundingClientRect().height + 6; // gap ~0.4rem
      let curPos = pos;
      row.classList.add('dragging');
      function move(ev) {
        const delta = Math.round((ev.clientY - startY) / rowH);
        let target = Math.max(0, Math.min(order.length - 1, pos + delta));
        if (target !== curPos) {
          const item = order.splice(curPos, 1)[0];
          order.splice(target, 0, item);
          curPos = target;
          render();
          // Nach render ist row weg; Drag über neues Handle fortsetzen wäre komplex —
          // hier reicht Neuaufbau; der Nutzer greift ggf. neu. Handle-Release beendet.
        }
      }
      function up() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  render();
  form.appendChild(list);
  const bar = voteBar({ label: t('vote.ranking.submit'), onConfirm: () => {
    submit(order, () => { markVoted(slide.id, order); morphBoard(form, slide, null); });
  }});
  bar.setEnabled(true);
  if (Array.isArray(prev)) morphBoard(form, slide, null);
}
```
(Hinweis: Der Drag ordnet beim Überschreiten einer Zeilenhöhe um und baut die Liste neu; die ▲▼-Buttons bleiben als präziser Fallback. Falls das Neu-Rendern mitten im Drag zu ruckelig wirkt, im Review als Minor vermerken — der Fallback deckt Barrierefreiheit/Präzision ab.)

- [ ] **Step 2: CSS — Drag-Handle + 44-px-Ziele**

In `public/app.css` ans Ende anhängen:
```css
/* Mockup B — Ranking-Drag (V3) */
.ranking-item { align-items: center; }
.rank-handle { flex-shrink: 0; width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center;
  font-size: 1.2rem; color: var(--grey-4); cursor: grab; touch-action: none; user-select: none; }
.ranking-item.dragging { background: var(--surface-alt); }
.ranking-move { min-width: 44px; min-height: 22px; }
```

- [ ] **Step 3: Verifizieren (Browser)**

Syntaxcheck → SYNTAX_OK. Ranking-Folie als Publikum: Zeilen per Drag-Handle (≥44 px) neu sortierbar; ▲▼ funktionieren weiter; Leiste „Abstimmen" sendet die Reihenfolge; danach Board (Ø-Ränge) + „Ändern". Reihenfolge kommt beim Server an (Live-Balken über zweites Fenster).

- [ ] **Step 4: Commit**
```bash
git add public/vote.html public/app.css
git commit -m "B (V3): ranking reorder via drag handle (44px) with arrow fallback; confirm via bar; morph to board"
```

---

### Task 7: Quiz + Q&A ans Modell angleichen + eigene Wahl im Board (common.js) + End-to-End

**Files:**
- Modify: `public/vote.html` (`buildQuiz`, `buildQa` auf `voteBar`)
- Modify: `public/common.js` (`renderChoice`/`renderScale`/`renderPoints`/`renderRanking`: `opts.own` markieren)

**Interfaces:**
- Consumes: `voteBar`, alle vorigen Helfer.
- Produces: `opts.own` in den `render*`-Funktionen (Array/Index/Wert der eigenen Wahl) → CSS-Klasse `.own` an der passenden Zeile.

- [ ] **Step 1: `renderChoice`/`renderScale`/`renderPoints`/`renderRanking` um `opts.own` erweitern (common.js)**

In `public/common.js` in `renderChoice` (:228) die Zeile, die `row` baut, um eine `own`-Klasse ergänzen: berechne `const isOwn = Array.isArray(opts.own) ? opts.own.includes(i) : opts.own === i;` und füge `${isOwn ? ' own' : ''}` in die `class="bar-row…"` ein. Analog in `renderScale` (eigener Wert), `renderPoints`/`renderRanking` (Index) — jeweils defensiv (`opts.own` kann fehlen). Ergänze in `public/app.css` die Regel:
```css
.bar-row.own .bar-label { font-weight: 700; }
.bar-row.own .bar-label::after { content: " ·"; color: var(--primary); }
```
(Exakte Klassen-Einfügung je Funktion im Review prüfen; rein additiv, kein bestehendes Verhalten ändern.)

- [ ] **Step 2: `buildQuiz` an die Leiste (bewusst endgültig) angleichen**

In `public/vote.html` `buildQuiz` (:355–401) den Inline-`submitBtn` durch die feste Leiste ersetzen und den Einmalig-Hinweis ergänzen: entferne `const submitBtn = el(...)`, dessen Listener und `form.appendChild(submitBtn)`; ergänze nach dem Options-`box` einen Hinweis `form.appendChild(el(\`<div class="ranking-hint">${esc(t('vote.quiz.once'))}</div>\`));` und:
```js
  const bar = voteBar({ label: t('vote.quiz.submit'), onConfirm: () => {
    if (chosen == null) return;
    submit(chosen, (resp) => {
      const info = (resp && resp.quiz) || { correct: false, points: 0 };
      markVoted(slide.id, { choice: chosen, correct: info.correct, points: info.points });
      const b = document.getElementById('voteConfirmBar'); if (b) b.remove();
      box.querySelectorAll('.vote-option').forEach((x) => { x.disabled = true; });
      note.innerHTML = ''; note.appendChild(quizFeedback(info)); showResults(slide.id);
    }, (e) => { if (e.message === 'already_answered') { const b=document.getElementById('voteConfirmBar'); if(b) b.remove(); note.innerHTML=''; note.appendChild(submittedNote(t('vote.quiz.alreadyAnswered'))); } });
  }});
```
Im Options-Click-Handler `submitBtn.disabled = false;` durch `bar.setEnabled(true);` ersetzen. Im `answered`-Zweig statt `submitBtn.hidden = true;` die Leiste entfernen (`const b=document.getElementById('voteConfirmBar'); if(b) b.remove();`). Quiz **morpht nicht** und bleibt endgültig.

- [ ] **Step 3: `buildQa` — Senden in die Leiste**

In `public/vote.html` `buildQa` (:632 ff.): den Inline-Senden-Button analog zu Task 4 durch `voteBar({ label: t('common.send'), onConfirm: sendQa })` ersetzen und das Eingabefeld per `input`-Event die Leiste aktivieren lassen. Board (Q&A-Liste) bleibt unverändert.

- [ ] **Step 4: End-to-End-Verifizierung (alle Typen)**

Syntaxcheck → SYNTAX_OK. Test-Präsentation mit allen 8 Folien; als Publikum je Folie durchspielen:
- Single-Choice/Skala: sofort + Morph + Ändern.
- Mehrfachauswahl/Wortwolke/Offen/Punkte/Ranking/Q&A: feste Leiste; Punkte-Slider/Budget; Ranking-Drag; Board + „Ändern" (wo vorgesehen).
- Quiz: einmalig, endgültig, Hinweis sichtbar; kein „Ändern".
- Jede Folie sperren → Optionen/Balken bleiben ausgegraut sichtbar + Chip.
- Eigene Wahl im Board markiert (`.own`).
- Meta-/Hilfetexte ≥ ~13 px.
- Keine Konsolenfehler; `git status` zeigt `server.js` unverändert.

- [ ] **Step 5: Commit**
```bash
git add public/vote.html public/common.js public/app.css
git commit -m "B: quiz & Q&A adopt the confirm bar (quiz stays final), mark own choice in result boards"
```

---

## Self-Review

**Spec-Abdeckung:**
- V1 (einheitliches Modell) → Task 3 (sofort: single-choice/scale), Task 4 (Leiste: multi/wortcloud/open), Task 5 (points), Task 6 (ranking), Task 7 (quiz/qa). ✓
- V2 (In-Place-Morph) → Task 3 (Options-als-Balken), Task 4 (multi-choice), Task 5/6 (`morphBoard`), Task 7 (`opts.own`). ✓
- V3 (Ranking-Drag, 44 px) → Task 6. ✓
- V4 (Punkte-Slider + Budget) → Task 5. ✓
- V5 (sichtbarer Sperr-Zustand) → Task 2 (`applyLock` + Chip; immer bauen). ✓
- Ü1 (größere Schrift) → Task 1. ✓
- Kein Servereingriff / Zero-Dependency / Design-System / DE+EN → Global Constraints; `server.js` nirgends in „Files". ✓
- Randfälle: `resultsHidden` (Task 3/5 `morphBoard`), Sperren während Eingabe (Task 2 greift auf `voteBar`), Quiz endgültig (Task 7). ✓

**Platzhalter-Scan:** Code in jedem Schritt vollständig; wo exakte Zeilen im Zielcode variieren können (common.js `own`-Einfügung, buildQa), ist die Änderung präzise beschrieben mit vollständigem einzufügendem Code und einer Review-Notiz — kein „TBD".

**Typ-Konsistenz:** `voteBar({label,onConfirm})→{el,setEnabled}`, `applyLock(form)`, `paintChoiceResults(box,slide,ownIndices)`, `paintScaleResults(picker,slide,ownValue)`, `morphBoard(form,slide,own)`, `buildChoiceMulti(form,slide)` durchgängig gleich benannt und genutzt. IDs `voteConfirmBar`/`voteConfirmBtn`/`voteForm` konsistent.
