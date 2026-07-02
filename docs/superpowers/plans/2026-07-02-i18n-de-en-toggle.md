# DE/EN Language Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live DE/EN language toggle to all three PULS frontend pages (`index.html`, `presenter.html`, `vote.html`), switching instantly without a page reload.

**Architecture:** One new shared module `public/i18n.js` holds a flat translation dictionary (`{de, en}` per key, with `{one, other}` sub-objects for pluralized entries), a `t(key, vars)` lookup/interpolation function, `getLang()`/`setLang()` backed by `localStorage['puls.lang']`, `applyStaticTranslations()` for `[data-i18n]`-tagged markup, and `initLangToggle()` for the header switcher widget. Each page wires the toggle to its own `refreshLanguage()` function that re-renders whatever dynamic content is currently on screen. `common.js`'s shared result renderers and `TYPE_META` become translation-aware. `server.js` is untouched — it already returns language-neutral error codes.

**Tech Stack:** Vanilla JS (no build step, no framework, no npm packages — see `Global Constraints`), served as static files by the existing zero-dependency `server.js`.

## Global Constraints

- Zero dependencies: no npm packages, no build step, no bundler. Plain `<script src>` tags only.
- Design system rules (from `public/design-system.css` / `public/app.css`): `--radius: 2px` max (no rounded corners), Corporate Red (`--primary`) used only as an accent, no gradients/3D effects.
- `localStorage` keys already follow a `puls.*` prefix convention (`puls.participantId`, `puls.mine`, `puls.voted.*`, `puls.upvoted`); the new language key must follow it: `puls.lang`.
- `server.js` returns language-neutral error codes (`not_found`, `limit_reached`, …) already — it must **not** be modified for this feature.
- Out of scope (per approved spec `docs/superpowers/specs/2026-07-02-i18n-de-en-toggle-design.md`): server console logs, user-generated content (titles/questions/options), the server-side default-title fallback, README, and the generated export file *content* — both the server-rendered `.xlsx` (would require a `server.js` change — excluded by the same "server.js unverändert" boundary) and the client-rendered `.pptx` built by `public/pptx-export.js` (a self-contained generator with its own fixed strings, kept consistent with the `.xlsx` generator rather than arbitrarily making only one of the two export formats bilingual). Only the *button chrome* around these exports (labels, in-progress state text, failure alert) is in scope.
- No automated test framework exists in this project (no `test` script, no test folder). Verification is manual/browser-driven: `node --check` for JS syntax sanity, and the Playwright MCP browser tools (`mcp__plugin_playwright_playwright__*`) for real behavioral checks against the running `node server.js`.
- The language toggle must **not** appear in the fullscreen presentation mode (`#presentMode` in `presenter.html`) — only in the editor header, the landing page header, and the vote page header.
- `public/presenter.html` was extended by a separate, now-committed Excel/PowerPoint-export feature (commit `dd372d6`): an "Excel-Export" link, a "PowerPoint-Export" button with an in-progress label swap, and a live "Ergebnisse dieser Folie" results panel in the editor. This plan's presenter.html task (Task 4) edits around that existing content and adds `data-i18n` coverage for its button chrome, but does not touch `server.js`'s export logic or `public/pptx-export.js`'s generated slide content.

---

### Task 1: Create the `i18n.js` engine and dictionary

**Files:**
- Create: `public/i18n.js`

**Interfaces:**
- Produces (used by every later task):
  - `t(key: string, vars?: object): string`
  - `getLang(): 'de' | 'en'`
  - `setLang(lang: 'de' | 'en'): void`
  - `applyStaticTranslations(root?: Element | Document): void`
  - `initLangToggle(container: Element, onChange?: () => void): void`
  - `SLIDE_TYPES: string[]` (not part of i18n per se, but needed by `common.js`/Task 3 to replace `Object.entries(TYPE_META)` iteration)

- [ ] **Step 1: Write `public/i18n.js`**

```js
/* PULS — i18n: DE/EN-Wörterbuch, Übersetzungs-Helfer, Sprachumschalter */
'use strict';

const LANG_KEY = 'puls.lang';
let currentLang = null;

const DICT = {
  // --- Startseite -----------------------------------------------------------
  'landing.brand': { de: 'Live-Umfragen', en: 'Live Polling' },
  'landing.subtitle': { de: 'Interaktive Präsentationen mit Live-Abstimmung', en: 'Interactive presentations with live polling' },
  'landing.hero.line1': { de: 'Fragen stellen.', en: 'Ask questions.' },
  'landing.hero.line2': { de: 'Antworten live sehen.', en: 'See answers live.' },
  'landing.hero.desc': {
    de: 'Erstellen Sie interaktive Folien — Multiple Choice, Wortwolken, Skalen, offene Fragen und Q&A. Das Publikum stimmt per Code auf dem eigenen Gerät ab, die Ergebnisse erscheinen in Echtzeit.',
    en: 'Create interactive slides — multiple choice, word clouds, scales, open questions, and Q&A. The audience votes via code on their own device, results appear in real time.',
  },
  'landing.join.title': { de: 'An einer Präsentation teilnehmen', en: 'Join a presentation' },
  'landing.join.codeLabel': { de: 'Zugangscode', en: 'Access code' },
  'landing.join.codeAria': { de: 'Sechsstelliger Zugangscode', en: 'Six-digit access code' },
  'landing.join.submit': { de: 'Teilnehmen', en: 'Join' },
  'landing.join.errInvalid': { de: 'Bitte einen sechsstelligen Code eingeben.', en: 'Please enter a six-digit code.' },
  'landing.join.errNotFound': { de: 'Kein aktives Event mit diesem Code gefunden.', en: 'No active event found with this code.' },
  'landing.create.title': { de: 'Neue Präsentation erstellen', en: 'Create a new presentation' },
  'landing.create.titlePlaceholder': { de: 'z. B. Team-Meeting Juli', en: 'e.g. Team meeting July' },
  'landing.create.help': { de: 'Sie erhalten einen Moderationslink und einen sechsstelligen Code für das Publikum.', en: "You'll get a presenter link and a six-digit code for your audience." },
  'landing.create.submit': { de: 'Erstellen', en: 'Create' },
  'landing.create.errFailed': { de: 'Erstellen fehlgeschlagen — läuft der Server noch?', en: 'Creation failed — is the server still running?' },
  'landing.mine.title': { de: 'Meine Präsentationen', en: 'My presentations' },
  'landing.mine.moderate': { de: 'Moderieren', en: 'Manage' },
  'landing.footer': { de: 'PULS läuft vollständig auf diesem Server — keine externen Dienste, keine Datenübertragung nach außen.', en: 'PULS runs entirely on this server — no external services, no data leaves your network.' },
  'landing.pageTitle': { de: 'PULS — Live-Umfragen', en: 'PULS — Live Polling' },

  // --- Gemeinsame Felder ------------------------------------------------------
  'field.title.label': { de: 'Titel', en: 'Title' },
  'common.slideFallback': { de: 'Folie', en: 'Slide' },
  'common.slidePosition': { de: 'Folie {{n}} von {{total}}', en: 'Slide {{n}} of {{total}}' },
  'common.send': { de: 'Senden', en: 'Send' },

  // --- Moderation (Presenter) -------------------------------------------------
  'presenter.brand': { de: 'Moderation', en: 'Presenter Console' },
  'presenter.resetAll': { de: 'Alle Antworten zurücksetzen', en: 'Reset all answers' },
  'presenter.present': { de: 'Präsentieren', en: 'Present' },
  'presenter.export': { de: 'Excel-Export', en: 'Excel Export' },
  'presenter.pptxExport': { de: 'PowerPoint-Export', en: 'PowerPoint Export' },
  'presenter.pptxExporting': { de: 'Erstelle PPTX …', en: 'Creating PPTX…' },
  'presenter.pptxFailed': { de: 'PowerPoint-Export fehlgeschlagen: ', en: 'PowerPoint export failed: ' },
  'presenter.accessCard.title': { de: 'Zugang für das Publikum', en: 'Audience access' },
  'presenter.slides.title': { de: 'Folien', en: 'Slides' },
  'presenter.slides.add': { de: '+ Neue Folie', en: '+ New slide' },
  'presenter.details.title': { de: 'Präsentation', en: 'Presentation' },
  'presenter.slide.moveUp': { de: 'Nach oben', en: 'Move up' },
  'presenter.slide.moveDown': { de: 'Nach unten', en: 'Move down' },
  'presenter.slide.resetAnswers': { de: 'Antworten zurücksetzen', en: 'Reset answers' },
  'presenter.slide.delete': { de: 'Löschen', en: 'Delete' },
  'presenter.field.type': { de: 'Folientyp', en: 'Slide type' },
  'presenter.field.question': { de: 'Frage / Überschrift', en: 'Question / heading' },
  'presenter.field.questionPlaceholder': { de: 'Ihre Frage an das Publikum', en: 'Your question for the audience' },
  'presenter.field.options': { de: 'Antwortoptionen (max. 8)', en: 'Answer options (max. 8)' },
  'presenter.field.addOption': { de: '+ Option', en: '+ Option' },
  'presenter.field.allowMultiple': { de: 'Mehrfachauswahl erlauben', en: 'Allow multiple selection' },
  'presenter.field.wordsPerPerson': { de: 'Begriffe pro Person', en: 'Terms per person' },
  'presenter.field.scaleUpTo': { de: 'Skala von 1 bis …', en: 'Scale from 1 to …' },
  'presenter.field.minLabel': { de: 'Beschriftung links (1)', en: 'Left label (1)' },
  'presenter.field.minLabelPlaceholder': { de: 'trifft nicht zu', en: 'strongly disagree' },
  'presenter.field.maxLabel': { de: 'Beschriftung rechts (Maximum)', en: 'Right label (maximum)' },
  'presenter.field.maxLabelPlaceholder': { de: 'trifft voll zu', en: 'strongly agree' },
  'presenter.field.infoText': { de: 'Text', en: 'Text' },
  'presenter.field.optionPlaceholder': { de: 'Option {{n}}', en: 'Option {{n}}' },
  'presenter.field.removeOption': { de: 'Option entfernen', en: 'Remove option' },
  'presenter.empty.title': { de: 'Noch keine Folien', en: 'No slides yet' },
  'presenter.empty.desc': { de: 'Fügen Sie links die erste Folie hinzu.', en: 'Add your first slide on the left.' },
  'presenter.results.title': { de: 'Ergebnisse dieser Folie', en: 'Results for this slide' },
  'presenter.results.subtitle': { de: 'aktualisiert sich live — bleibt auch nach der Präsentation erhalten', en: 'updates live — stays available after the presentation' },
  'presenter.results.empty': { de: 'Noch keine Antworten.', en: 'No answers yet.' },
  'presenter.present.exit': { de: 'Beenden (Esc)', en: 'Exit (Esc)' },
  'presenter.present.prev': { de: '← Zurück', en: '← Back' },
  'presenter.present.next': { de: 'Weiter →', en: 'Next →' },
  'presenter.present.showResults': { de: 'Ergebnisse einblenden', en: 'Show results' },
  'presenter.present.hideResults': { de: 'Ergebnisse ausblenden', en: 'Hide results' },
  'presenter.present.unlockVoting': { de: 'Abstimmung freigeben', en: 'Unlock voting' },
  'presenter.present.lockVoting': { de: 'Abstimmung sperren', en: 'Lock voting' },
  'presenter.present.noSlides': { de: 'Keine Folien vorhanden.', en: 'No slides available.' },
  'presenter.present.audience': {
    de: { one: '{{n}} Person verbunden', other: '{{n}} Personen verbunden' },
    en: { one: '{{n}} person connected', other: '{{n}} people connected' },
  },
  'presenter.access.joinAt': { de: 'Beitreten auf', en: 'Join at' },
  'presenter.invalidLink.title': { de: 'Ungültiger Link', en: 'Invalid link' },
  'presenter.invalidLink.desc': { de: 'Moderationslinks enthalten eine ID und ein Token.', en: 'Presenter links contain an ID and a token.' },
  'presenter.noAccess.title': { de: 'Kein Zugriff', en: 'Access denied' },
  'presenter.noAccess.desc': { de: 'Das Moderations-Token ist ungültig.', en: 'The presenter token is invalid.' },
  'presenter.notFound.title': { de: 'Präsentation nicht gefunden', en: 'Presentation not found' },
  'presenter.notFound.desc': { de: 'Sie wurde möglicherweise gelöscht.', en: 'It may have been deleted.' },
  'presenter.save.saving': { de: 'Speichert …', en: 'Saving…' },
  'presenter.save.saved': { de: 'Gespeichert', en: 'Saved' },
  'presenter.save.failed': { de: 'Speichern fehlgeschlagen', en: 'Save failed' },
  'presenter.confirm.deleteSlide': { de: 'Diese Folie und ihre Antworten löschen?', en: 'Delete this slide and its answers?' },
  'presenter.confirm.resetSlide': { de: 'Alle Antworten dieser Folie löschen?', en: 'Delete all answers for this slide?' },
  'presenter.confirm.resetAll': { de: 'Antworten aller Folien löschen? (z. B. nach einem Probelauf)', en: 'Delete answers for all slides? (e.g. after a test run)' },
  'presenter.pageTitle': { de: 'PULS — Moderation', en: 'PULS — Presenter Console' },

  // --- Publikum (Vote) --------------------------------------------------------
  'vote.pageTitle': { de: 'PULS — Abstimmen', en: 'PULS — Vote' },
  'vote.connecting': { de: 'Verbinde …', en: 'Connecting…' },
  'vote.noEvent.title': { de: 'Kein aktives Event', en: 'No active event' },
  'vote.noEvent.desc': { de: 'Unter dem Code {{code}} wurde nichts gefunden.', en: 'No event found with code {{code}}.' },
  'vote.noEvent.homeLink': { de: 'Zur Startseite', en: 'Back to home' },
  'vote.waitingStart': { de: 'Warten auf den Start der Präsentation …', en: 'Waiting for the presentation to start…' },
  'vote.locked': { de: 'Die Abstimmung ist derzeit gesperrt.', en: 'Voting is currently locked.' },
  'vote.results.title': { de: 'Live-Ergebnis', en: 'Live results' },
  'vote.choice.submit': { de: 'Abstimmen', en: 'Vote' },
  'vote.choice.recorded': { de: 'Stimme erfasst. Sie können Ihre Auswahl ändern und erneut abstimmen.', en: 'Vote recorded. You can change your selection and vote again.' },
  'vote.wordcloud.placeholder': { de: 'Ihr Begriff', en: 'Your word' },
  'vote.wordcloud.remaining': {
    de: { one: 'Noch {{n}} Begriff möglich.', other: 'Noch {{n}} Begriffe möglich.' },
    en: { one: '{{n}} term left.', other: '{{n}} terms left.' },
  },
  'vote.wordcloud.done': { de: 'Vielen Dank — Ihre Begriffe sind in der Wolke.', en: 'Thank you — your words are in the cloud.' },
  'vote.open.placeholder': { de: 'Ihre Antwort', en: 'Your answer' },
  'vote.open.help': { de: 'Bis zu 5 Antworten pro Person.', en: 'Up to 5 answers per person.' },
  'vote.open.sent': { de: 'Antwort gesendet.', en: 'Answer sent.' },
  'vote.open.limitReached': { de: 'Limit erreicht — maximal 5 Antworten pro Person.', en: 'Limit reached — maximum 5 answers per person.' },
  'vote.scale.recorded': { de: 'Bewertung erfasst. Tippen Sie erneut, um sie zu ändern.', en: 'Rating recorded. Tap again to change it.' },
  'vote.qa.placeholder': { de: 'Ihre Frage an die Moderation', en: 'Your question for the host' },
  'vote.qa.submit': { de: 'Frage einreichen', en: 'Submit question' },
  'vote.qa.sent': { de: 'Frage eingereicht.', en: 'Question submitted.' },
  'vote.qa.limitReached': { de: 'Limit erreicht — maximal 5 Fragen pro Person.', en: 'Limit reached — maximum 5 questions per person.' },

  // --- Ergebnis-Rendering (common.js) ------------------------------------------
  'results.hidden': { de: 'Ergebnisse sind ausgeblendet.', en: 'Results are hidden.' },
  'results.choice.aria': { de: 'Abstimmungsergebnis', en: 'Voting result' },
  'results.choice.voters': {
    de: { one: '{{n}} Stimme', other: '{{n}} Stimmen' },
    en: { one: '{{n}} vote', other: '{{n}} votes' },
  },
  'results.wordcloud.empty': { de: 'Noch keine Begriffe — die Wolke entsteht live.', en: 'No terms yet — the cloud builds live.' },
  'results.wordcloud.meta': { de: '{{voters}} Teilnehmende · {{words}} Begriffe', en: '{{voters}} participants · {{words}} terms' },
  'results.open.empty': { de: 'Noch keine Antworten.', en: 'No answers yet.' },
  'results.open.count': {
    de: { one: '{{n}} Antwort', other: '{{n}} Antworten' },
    en: { one: '{{n}} answer', other: '{{n}} answers' },
  },
  'results.scale.avgLabel': { de: 'Durchschnitt von {{min}} bis {{max}}', en: 'Average from {{min}} to {{max}}' },
  'results.scale.count': {
    de: { one: '{{n}} Bewertung', other: '{{n}} Bewertungen' },
    en: { one: '{{n}} rating', other: '{{n}} ratings' },
  },
  'results.qa.empty': { de: 'Noch keine Fragen aus dem Publikum.', en: 'No questions from the audience yet.' },
  'results.qa.upvoteAria': { de: 'Frage hochwählen', en: 'Upvote question' },
  'results.qa.count': {
    de: { one: '{{n}} Frage', other: '{{n}} Fragen' },
    en: { one: '{{n}} question', other: '{{n}} questions' },
  },

  // --- Folientypen (TYPE_META) -------------------------------------------------
  'type.choice.label': { de: 'Multiple Choice', en: 'Multiple Choice' },
  'type.choice.hint': { de: 'Teilnehmende wählen eine oder mehrere Optionen.', en: 'Participants choose one or more options.' },
  'type.wordcloud.label': { de: 'Wortwolke', en: 'Word Cloud' },
  'type.wordcloud.hint': { de: 'Begriffe der Teilnehmenden bilden eine Wolke.', en: 'Participant terms form a cloud.' },
  'type.open.label': { de: 'Offene Frage', en: 'Open Question' },
  'type.open.hint': { de: 'Freitext-Antworten erscheinen als Antwort-Wand.', en: 'Free-text answers appear as an answer wall.' },
  'type.scale.label': { de: 'Skala', en: 'Scale' },
  'type.scale.hint': { de: 'Bewertung auf einer Zahlenskala, mit Durchschnitt.', en: 'Rating on a numeric scale, with average.' },
  'type.qa.label': { de: 'Q&A', en: 'Q&A' },
  'type.qa.hint': { de: 'Publikum stellt Fragen und stimmt darüber ab.', en: 'Audience asks questions and votes on them.' },
  'type.info.label': { de: 'Infofolie', en: 'Info Slide' },
  'type.info.hint': { de: 'Statische Folie ohne Interaktion.', en: 'Static slide with no interaction.' },
};

const SLIDE_TYPES = ['choice', 'wordcloud', 'open', 'scale', 'qa', 'info'];

// ---------------------------------------------------------------------------
// Sprachwahl
// ---------------------------------------------------------------------------

function detectDefaultLang() {
  const nav = String(navigator.language || navigator.userLanguage || '').toLowerCase();
  return nav.startsWith('en') ? 'en' : 'de';
}

function getLang() {
  if (currentLang) return currentLang;
  const saved = localStorage.getItem(LANG_KEY);
  currentLang = (saved === 'de' || saved === 'en') ? saved : detectDefaultLang();
  return currentLang;
}

function setLang(lang) {
  currentLang = lang === 'en' ? 'en' : 'de';
  localStorage.setItem(LANG_KEY, currentLang);
  document.documentElement.lang = currentLang;
}

// ---------------------------------------------------------------------------
// Übersetzen
// ---------------------------------------------------------------------------

function t(key, vars) {
  const entry = DICT[key];
  if (!entry) return key;
  let val = entry[getLang()] ?? entry.de;
  if (val && typeof val === 'object') {
    const n = vars && typeof vars.n === 'number' ? vars.n : 0;
    val = n === 1 ? val.one : val.other;
  }
  if (vars) {
    Object.keys(vars).forEach((k) => {
      val = val.replace(new RegExp(`{{${k}}}`, 'g'), String(vars[k]));
    });
  }
  return val;
}

function applyStaticTranslations(root) {
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach((elm) => {
    elm.textContent = t(elm.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((elm) => {
    elm.placeholder = t(elm.getAttribute('data-i18n-placeholder'));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((elm) => {
    elm.title = t(elm.getAttribute('data-i18n-title'));
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((elm) => {
    elm.setAttribute('aria-label', t(elm.getAttribute('data-i18n-aria-label')));
  });
}

// ---------------------------------------------------------------------------
// Umschalter-Widget
// ---------------------------------------------------------------------------

function initLangToggle(container, onChange) {
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('lang-toggle');
  const options = [['de', 'Deutsch'], ['en', 'English']];
  const buttons = options.map(([code, name]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = code.toUpperCase();
    btn.setAttribute('aria-label', name);
    btn.addEventListener('click', () => {
      if (getLang() === code) return;
      setLang(code);
      paint();
      applyStaticTranslations();
      if (onChange) onChange();
    });
    container.appendChild(btn);
    return btn;
  });
  paint();
  function paint() {
    buttons.forEach((btn, i) => btn.classList.toggle('active', options[i][0] === getLang()));
  }
}

// Initiale Sprache setzen und statische Texte sofort übersetzen — dieses
// Skript wird nach dem übrigen HTML der Seite geladen, alle [data-i18n]
// Elemente existieren also bereits im DOM.
document.documentElement.lang = getLang();
applyStaticTranslations();
```

- [ ] **Step 2: Syntax-check the file**

Run: `node --check public/i18n.js`
Expected: no output, exit code 0 (this only validates JS syntax — `document`/`localStorage`/`navigator` calls at the bottom aren't executed by `--check`, so behavior is verified in Task 2 once it's loaded in a real page).

- [ ] **Step 3: Commit**

```bash
git add public/i18n.js
git commit -m "$(cat <<'EOF'
Add i18n.js: DE/EN dictionary, t(), language toggle widget

Central translation engine for the upcoming language toggle. Not yet
wired into any page.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire the language toggle into `index.html`

**Files:**
- Modify: `public/app.css`
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `t()`, `initLangToggle()`, `applyStaticTranslations()` from Task 1's `public/i18n.js`.
- Produces: `refreshLanguage()` (local to `index.html`'s inline script — not consumed elsewhere).

- [ ] **Step 1: Add `.lang-toggle` styles to `public/app.css`**

Add after the `/* --- Header-Ergänzungen ---------------------------------------------------- */` block (after the existing `.ds-header a.brand:hover` rule, around line 18):

```css
.lang-toggle { display: inline-flex; border: 1px solid var(--grey-2); border-radius: var(--radius); overflow: hidden; }
.lang-toggle button {
  font-family: var(--font-sans); font-size: 0.72rem; font-weight: 600;
  padding: 0.3rem 0.55rem; background: var(--white); color: var(--grey-4);
  border: none; cursor: pointer; letter-spacing: 0.02em;
}
.lang-toggle button + button { border-left: 1px solid var(--grey-2); }
.lang-toggle button:hover { color: var(--grey-6); }
.lang-toggle button.active { color: var(--white); background: var(--primary); }
```

- [ ] **Step 2: Add `data-i18n` attributes and the toggle container to `public/index.html`**

Replace:
```html
<header class="ds-header">
  <a class="brand ds-title" href="/"><b>PULS</b> Live-Umfragen</a>
  <div class="ds-header-controls">
    <span class="ds-subtitle">Interaktive Präsentationen mit Live-Abstimmung</span>
  </div>
</header>
```
with:
```html
<header class="ds-header">
  <a class="brand ds-title" href="/"><b>PULS</b> <span data-i18n="landing.brand">Live-Umfragen</span></a>
  <div class="ds-header-controls">
    <span class="ds-subtitle" data-i18n="landing.subtitle">Interaktive Präsentationen mit Live-Abstimmung</span>
    <span id="langToggle"></span>
  </div>
</header>
```

Replace:
```html
    <section class="hero">
      <h1>Fragen stellen.<br><b>Antworten live sehen.</b></h1>
      <p>Erstellen Sie interaktive Folien — Multiple Choice, Wortwolken, Skalen, offene Fragen und Q&amp;A.
         Das Publikum stimmt per Code auf dem eigenen Gerät ab, die Ergebnisse erscheinen in Echtzeit.</p>
    </section>
```
with:
```html
    <section class="hero">
      <h1><span data-i18n="landing.hero.line1">Fragen stellen.</span><br><b data-i18n="landing.hero.line2">Antworten live sehen.</b></h1>
      <p data-i18n="landing.hero.desc">Erstellen Sie interaktive Folien — Multiple Choice, Wortwolken, Skalen, offene Fragen und Q&amp;A.
         Das Publikum stimmt per Code auf dem eigenen Gerät ab, die Ergebnisse erscheinen in Echtzeit.</p>
    </section>
```

Replace:
```html
      <div class="ds-card accent-primary">
        <div class="ds-card-title">An einer Präsentation teilnehmen</div>
        <form id="joinForm">
          <div class="field">
            <label for="joinCode">Zugangscode</label>
            <input class="code-input" id="joinCode" inputmode="numeric" autocomplete="off"
                   maxlength="7" placeholder="000 000" aria-label="Sechsstelliger Zugangscode">
          </div>
          <button class="ds-btn ds-btn-primary ds-btn-lg" type="submit">Teilnehmen</button>
          <div class="error-note" id="joinError"></div>
        </form>
      </div>
```
with:
```html
      <div class="ds-card accent-primary">
        <div class="ds-card-title" data-i18n="landing.join.title">An einer Präsentation teilnehmen</div>
        <form id="joinForm">
          <div class="field">
            <label for="joinCode" data-i18n="landing.join.codeLabel">Zugangscode</label>
            <input class="code-input" id="joinCode" inputmode="numeric" autocomplete="off"
                   maxlength="7" placeholder="000 000" data-i18n-aria-label="landing.join.codeAria" aria-label="Sechsstelliger Zugangscode">
          </div>
          <button class="ds-btn ds-btn-primary ds-btn-lg" type="submit" data-i18n="landing.join.submit">Teilnehmen</button>
          <div class="error-note" id="joinError"></div>
        </form>
      </div>
```

Replace:
```html
      <div class="ds-card accent-neutral">
        <div class="ds-card-title">Neue Präsentation erstellen</div>
        <form id="createForm">
          <div class="field">
            <label for="presTitle">Titel</label>
            <input type="text" id="presTitle" maxlength="120" placeholder="z. B. Team-Meeting Juli"
                   autocomplete="off">
            <div class="help">Sie erhalten einen Moderationslink und einen sechsstelligen Code für das Publikum.</div>
          </div>
          <button class="ds-btn ds-btn-lg" type="submit">Erstellen</button>
          <div class="error-note" id="createError"></div>
        </form>
      </div>
```
with:
```html
      <div class="ds-card accent-neutral">
        <div class="ds-card-title" data-i18n="landing.create.title">Neue Präsentation erstellen</div>
        <form id="createForm">
          <div class="field">
            <label for="presTitle" data-i18n="field.title.label">Titel</label>
            <input type="text" id="presTitle" maxlength="120" placeholder="z. B. Team-Meeting Juli"
                   data-i18n-placeholder="landing.create.titlePlaceholder" autocomplete="off">
            <div class="help" data-i18n="landing.create.help">Sie erhalten einen Moderationslink und einen sechsstelligen Code für das Publikum.</div>
          </div>
          <button class="ds-btn ds-btn-lg" type="submit" data-i18n="landing.create.submit">Erstellen</button>
          <div class="error-note" id="createError"></div>
        </form>
      </div>
```

Replace:
```html
    <div class="ds-card my-presentations" id="mineCard" hidden>
      <div class="ds-card-title">Meine Präsentationen</div>
      <div id="mineList"></div>
    </div>
```
with:
```html
    <div class="ds-card my-presentations" id="mineCard" hidden>
      <div class="ds-card-title" data-i18n="landing.mine.title">Meine Präsentationen</div>
      <div id="mineList"></div>
    </div>
```

Replace:
```html
<footer class="footer-note">
  PULS läuft vollständig auf diesem Server — keine externen Dienste, keine Datenübertragung nach außen.
</footer>
```
with:
```html
<footer class="footer-note" data-i18n="landing.footer">
  PULS läuft vollständig auf diesem Server — keine externen Dienste, keine Datenübertragung nach außen.
</footer>
```

- [ ] **Step 3: Load `i18n.js`, wire the toggle, translate the inline script's strings**

Replace:
```html
<script src="/common.js"></script>
<script>
'use strict';

// --- Beitreten -------------------------------------------------------------
document.getElementById('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('joinError');
  errEl.textContent = '';
  const code = document.getElementById('joinCode').value.replace(/\D/g, '');
  if (code.length !== 6) {
    errEl.textContent = 'Bitte einen sechsstelligen Code eingeben.';
    return;
  }
  try {
    await api('GET', `/api/join/${code}`);
    location.href = `/vote.html?code=${code}`;
  } catch {
    errEl.textContent = 'Kein aktives Event mit diesem Code gefunden.';
  }
});
```
with:
```html
<script src="/i18n.js"></script>
<script src="/common.js"></script>
<script>
'use strict';

document.title = t('landing.pageTitle');
initLangToggle(document.getElementById('langToggle'), refreshLanguage);

// --- Beitreten -------------------------------------------------------------
document.getElementById('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('joinError');
  errEl.textContent = '';
  const code = document.getElementById('joinCode').value.replace(/\D/g, '');
  if (code.length !== 6) {
    errEl.textContent = t('landing.join.errInvalid');
    return;
  }
  try {
    await api('GET', `/api/join/${code}`);
    location.href = `/vote.html?code=${code}`;
  } catch {
    errEl.textContent = t('landing.join.errNotFound');
  }
});
```

Replace:
```js
    location.href = `/presenter.html?id=${pres.id}&token=${pres.adminToken}`;
  } catch {
    errEl.textContent = 'Erstellen fehlgeschlagen — läuft der Server noch?';
  }
});
```
with:
```js
    location.href = `/presenter.html?id=${pres.id}&token=${pres.adminToken}`;
  } catch {
    errEl.textContent = t('landing.create.errFailed');
  }
});
```

Replace:
```js
// --- Meine Präsentationen -------------------------------------------------
(function renderMine() {
  const mine = JSON.parse(localStorage.getItem('puls.mine') || '[]');
  if (!mine.length) return;
  const card = document.getElementById('mineCard');
  const list = document.getElementById('mineList');
  card.hidden = false;
  mine.forEach((p) => {
    const row = el(`
      <div class="item">
        <div>
          <div class="t">${esc(p.title)}</div>
          <div class="c">Code ${formatCode(p.code)}</div>
        </div>
        <div style="display:flex; gap:0.4rem;">
          <a class="ds-btn" href="/presenter.html?id=${encodeURIComponent(p.id)}&token=${encodeURIComponent(p.adminToken)}">Moderieren</a>
        </div>
      </div>`);
    list.appendChild(row);
  });
})();
```
with:
```js
// --- Meine Präsentationen -------------------------------------------------
function renderMine() {
  const mine = JSON.parse(localStorage.getItem('puls.mine') || '[]');
  const card = document.getElementById('mineCard');
  const list = document.getElementById('mineList');
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
          <a class="ds-btn" href="/presenter.html?id=${encodeURIComponent(p.id)}&token=${encodeURIComponent(p.adminToken)}">${t('landing.mine.moderate')}</a>
        </div>
      </div>`);
    list.appendChild(row);
  });
}
renderMine();

function refreshLanguage() {
  document.title = t('landing.pageTitle');
  renderMine();
}
```

Note: `Code ${formatCode(p.code)}` keeps the literal word `Code` — it's identical in German and English, so it is intentionally not routed through `t()`.

- [ ] **Step 2: Start the server for manual verification**

Run: `PORT=4173 node server.js &` then wait ~1s for it to be ready.

- [ ] **Step 4: Verify in the browser with Playwright MCP**

Use `mcp__plugin_playwright_playwright__browser_navigate` to open `http://localhost:4173/`, then use `mcp__plugin_playwright_playwright__browser_snapshot` to confirm:
- A "DE"/"EN" toggle is visible in the header.
- Click the button showing "EN" (`mcp__plugin_playwright_playwright__browser_click`). Re-snapshot: the hero heading now reads "Ask questions." / "See answers live.", the join button reads "Join", the create button reads "Create".
- Type `123` into the access-code field and submit; confirm the error text reads "Please enter a six-digit code."
- Click "DE" again; confirm the heading reverts to "Fragen stellen." / "Antworten live sehen." and the error area is back to blank (new submit not yet retried) or shows the German message if you resubmit.

Expected: all text switches correctly in both directions, no leftover German text visible while "EN" is active, no browser console errors (check with `mcp__plugin_playwright_playwright__browser_console_messages`).

- [ ] **Step 5: Stop the server**

Run: `kill %1` (or find the PID via `lsof -i :4173` and `kill` it).

- [ ] **Step 6: Commit**

```bash
git add public/app.css public/index.html
git commit -m "$(cat <<'EOF'
Wire DE/EN language toggle into index.html

Adds the toggle widget to the landing page header and translates all
static and dynamic text (hero, join/create forms, my-presentations list,
error messages) via i18n.js.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Make `common.js`'s result renderers and `TYPE_META` translation-aware

**Files:**
- Modify: `public/common.js`

**Interfaces:**
- Consumes: `t()` from `public/i18n.js`, `SLIDE_TYPES` from `public/i18n.js`.
- Produces: `typeMeta(type: string): { label: string, hint: string }` — replaces the old `TYPE_META` object; consumed by `presenter.html` (Task 4) and `vote.html` (Task 5).

- [ ] **Step 1: Replace `TYPE_META` with `typeMeta()`**

Replace:
```js
const TYPE_META = {
  choice:    { label: 'Multiple Choice', hint: 'Teilnehmende wählen eine oder mehrere Optionen.' },
  wordcloud: { label: 'Wortwolke',       hint: 'Begriffe der Teilnehmenden bilden eine Wolke.' },
  open:      { label: 'Offene Frage',    hint: 'Freitext-Antworten erscheinen als Antwort-Wand.' },
  scale:     { label: 'Skala',           hint: 'Bewertung auf einer Zahlenskala, mit Durchschnitt.' },
  qa:        { label: 'Q&A',             hint: 'Publikum stellt Fragen und stimmt darüber ab.' },
  info:      { label: 'Infofolie',       hint: 'Statische Folie ohne Interaktion.' },
};
```
with:
```js
function typeMeta(type) {
  return { label: t(`type.${type}.label`), hint: t(`type.${type}.hint`) };
}
```

- [ ] **Step 2: Translate `renderResults()` and its sub-renderers**

Replace:
```js
function renderResults(container, slide, results, opts = {}) {
  container.innerHTML = '';
  if (!slide) return;

  if (!results) {
    container.appendChild(el('<p class="results-hidden">Ergebnisse sind ausgeblendet.</p>'));
    return;
  }
```
with:
```js
function renderResults(container, slide, results, opts = {}) {
  container.innerHTML = '';
  if (!slide) return;

  if (!results) {
    container.appendChild(el(`<p class="results-hidden">${t('results.hidden')}</p>`));
    return;
  }
```

Replace:
```js
function renderChoice(container, slide, results, opts) {
  const total = results.counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...results.counts, 1);
  const chart = el('<div class="barchart" role="img" aria-label="Abstimmungsergebnis"></div>');
```
with:
```js
function renderChoice(container, slide, results, opts) {
  const total = results.counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...results.counts, 1);
  const chart = el(`<div class="barchart" role="img" aria-label="${t('results.choice.aria')}"></div>`);
```

Replace:
```js
  container.appendChild(chart);
  container.appendChild(el(`<p class="results-meta">${results.voters} ${results.voters === 1 ? 'Stimme' : 'Stimmen'}</p>`));
}
```
with:
```js
  container.appendChild(chart);
  container.appendChild(el(`<p class="results-meta">${t('results.choice.voters', { n: results.voters })}</p>`));
}
```

Replace:
```js
function renderWordcloud(container, results, opts) {
  if (!results.words.length) {
    container.appendChild(el('<p class="results-empty">Noch keine Begriffe — die Wolke entsteht live.</p>'));
    return;
  }
```
with:
```js
function renderWordcloud(container, results, opts) {
  if (!results.words.length) {
    container.appendChild(el(`<p class="results-empty">${t('results.wordcloud.empty')}</p>`));
    return;
  }
```

Replace:
```js
  container.appendChild(cloud);
  container.appendChild(el(`<p class="results-meta">${results.voters} Teilnehmende · ${results.words.length} Begriffe</p>`));
}
```
with:
```js
  container.appendChild(cloud);
  container.appendChild(el(`<p class="results-meta">${t('results.wordcloud.meta', { voters: results.voters, words: results.words.length })}</p>`));
}
```

Replace:
```js
function renderOpen(container, results, opts) {
  if (!results.texts.length) {
    container.appendChild(el('<p class="results-empty">Noch keine Antworten.</p>'));
    return;
  }
  const wall = el('<div class="answer-wall"></div>');
  results.texts.forEach((t) => {
    wall.appendChild(el(`<div class="answer-card">${esc(t.text)}</div>`));
  });
  container.appendChild(wall);
  container.appendChild(el(`<p class="results-meta">${results.texts.length} ${results.texts.length === 1 ? 'Antwort' : 'Antworten'}</p>`));
}
```
with:
```js
function renderOpen(container, results, opts) {
  if (!results.texts.length) {
    container.appendChild(el(`<p class="results-empty">${t('results.open.empty')}</p>`));
    return;
  }
  const wall = el('<div class="answer-wall"></div>');
  results.texts.forEach((item) => {
    wall.appendChild(el(`<div class="answer-card">${esc(item.text)}</div>`));
  });
  container.appendChild(wall);
  container.appendChild(el(`<p class="results-meta">${t('results.open.count', { n: results.texts.length })}</p>`));
}
```

Note: the loop variable was renamed from `t` to `item` because `t` now refers to the global translation function — the original code shadowed it locally, which would silently break every `t()` call inside that `forEach` callback.

Replace:
```js
function renderScale(container, slide, results, opts) {
  const wrap = el('<div class="scale-result"></div>');
  const avg = el(`
    <div class="scale-avg">
      <div class="scale-avg-value">${results.voters ? results.avg.toFixed(1) : '–'}</div>
      <div class="scale-avg-label">Durchschnitt von ${slide.min} bis ${slide.max}</div>
    </div>`);
  wrap.appendChild(avg);
```
with:
```js
function renderScale(container, slide, results, opts) {
  const wrap = el('<div class="scale-result"></div>');
  const avg = el(`
    <div class="scale-avg">
      <div class="scale-avg-value">${results.voters ? results.avg.toFixed(1) : '–'}</div>
      <div class="scale-avg-label">${t('results.scale.avgLabel', { min: slide.min, max: slide.max })}</div>
    </div>`);
  wrap.appendChild(avg);
```

Replace:
```js
  wrap.appendChild(dist);
  wrap.appendChild(el(`
    <div class="scale-endlabels">
      <span>${esc(slide.minLabel || '')}</span><span>${esc(slide.maxLabel || '')}</span>
    </div>`));
  container.appendChild(wrap);
  container.appendChild(el(`<p class="results-meta">${results.voters} ${results.voters === 1 ? 'Bewertung' : 'Bewertungen'}</p>`));
}
```
with:
```js
  wrap.appendChild(dist);
  wrap.appendChild(el(`
    <div class="scale-endlabels">
      <span>${esc(slide.minLabel || '')}</span><span>${esc(slide.maxLabel || '')}</span>
    </div>`));
  container.appendChild(wrap);
  container.appendChild(el(`<p class="results-meta">${t('results.scale.count', { n: results.voters })}</p>`));
}
```

Replace:
```js
function renderQA(container, results, opts) {
  if (!results.questions.length) {
    container.appendChild(el('<p class="results-empty">Noch keine Fragen aus dem Publikum.</p>'));
    return;
  }
  const list = el('<div class="qa-list"></div>');
  results.questions.forEach((q) => {
    const upvoted = opts.upvoted && opts.upvoted.has(q.id);
    const row = el(`
      <div class="qa-item">
        <button class="qa-vote${upvoted ? ' voted' : ''}" ${opts.onUpvote ? '' : 'disabled'} aria-label="Frage hochwählen">
          <span class="qa-vote-count">${q.votes}</span>
          <span class="qa-vote-arrow">▲</span>
        </button>
        <div class="qa-text">${esc(q.text)}</div>
      </div>`);
    if (opts.onUpvote) {
      row.querySelector('.qa-vote').addEventListener('click', () => opts.onUpvote(q.id));
    }
    list.appendChild(row);
  });
  container.appendChild(list);
  container.appendChild(el(`<p class="results-meta">${results.questions.length} ${results.questions.length === 1 ? 'Frage' : 'Fragen'}</p>`));
}
```
with:
```js
function renderQA(container, results, opts) {
  if (!results.questions.length) {
    container.appendChild(el(`<p class="results-empty">${t('results.qa.empty')}</p>`));
    return;
  }
  const list = el('<div class="qa-list"></div>');
  results.questions.forEach((q) => {
    const upvoted = opts.upvoted && opts.upvoted.has(q.id);
    const row = el(`
      <div class="qa-item">
        <button class="qa-vote${upvoted ? ' voted' : ''}" ${opts.onUpvote ? '' : 'disabled'} aria-label="${t('results.qa.upvoteAria')}">
          <span class="qa-vote-count">${q.votes}</span>
          <span class="qa-vote-arrow">▲</span>
        </button>
        <div class="qa-text">${esc(q.text)}</div>
      </div>`);
    if (opts.onUpvote) {
      row.querySelector('.qa-vote').addEventListener('click', () => opts.onUpvote(q.id));
    }
    list.appendChild(row);
  });
  container.appendChild(list);
  container.appendChild(el(`<p class="results-meta">${t('results.qa.count', { n: results.questions.length })}</p>`));
}
```

- [ ] **Step 3: Syntax-check the file**

Run: `node --check public/common.js`
Expected: no output, exit code 0. Full behavioral verification happens in Task 4 and Task 5, once `common.js` is actually loaded after `i18n.js` on a real page.

- [ ] **Step 4: Commit**

```bash
git add public/common.js
git commit -m "$(cat <<'EOF'
Translate common.js result renderers and slide-type metadata

Replaces the static German TYPE_META object with a typeMeta() function
that resolves labels/hints through t(), and routes every hardcoded
string in the shared result renderers through t() as well.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire the language toggle into `presenter.html`

**Files:**
- Modify: `public/presenter.html`

**Interfaces:**
- Consumes: `t()`, `initLangToggle()` from `public/i18n.js`; `typeMeta()`, `SLIDE_TYPES` from Task 3's `public/common.js`.
- Produces: `refreshLanguage()` (local to `presenter.html`'s inline script).

`public/presenter.html` currently (uncommitted, pre-existing work) includes an Excel-export button and a live "results for this slide" panel in the editor — both need `data-i18n` coverage too. Re-read the file before starting if it has changed further since this plan was written.

- [ ] **Step 1: Header — brand suffix, toggle container, existing buttons**

Replace:
```html
<header class="ds-header" id="editorHeader">
  <a class="brand ds-title" href="/"><b>PULS</b> Moderation</a>
  <div class="ds-header-controls">
    <span class="save-state" id="saveState"></span>
    <button class="ds-btn" id="btnResetAll">Alle Antworten zurücksetzen</button>
    <a class="ds-btn" id="btnExport" download>Excel-Export</a>
    <button class="ds-btn" id="btnPptx">PowerPoint-Export</button>
    <button class="ds-btn ds-btn-primary" id="btnPresent">Präsentieren</button>
  </div>
</header>
```
with:
```html
<header class="ds-header" id="editorHeader">
  <a class="brand ds-title" href="/"><b>PULS</b> <span data-i18n="presenter.brand">Moderation</span></a>
  <div class="ds-header-controls">
    <span class="save-state" id="saveState"></span>
    <span id="langToggle"></span>
    <button class="ds-btn" id="btnResetAll" data-i18n="presenter.resetAll">Alle Antworten zurücksetzen</button>
    <a class="ds-btn" id="btnExport" download data-i18n="presenter.export">Excel-Export</a>
    <button class="ds-btn" id="btnPptx" data-i18n="presenter.pptxExport">PowerPoint-Export</button>
    <button class="ds-btn ds-btn-primary" id="btnPresent" data-i18n="presenter.present">Präsentieren</button>
  </div>
</header>
```

- [ ] **Step 2: Aside — access card, slides card**

Replace:
```html
      <aside>
        <div class="ds-card" style="margin-bottom: 1rem;">
          <div class="ds-card-title">Zugang für das Publikum</div>
          <div class="join-info-card">
            <div>
              <div class="join-code-big" id="joinCodeBig">— — —</div>
              <div class="join-url" id="joinUrl"></div>
            </div>
            <div class="qr" id="qrBox"></div>
          </div>
        </div>

        <div class="ds-card">
          <div class="ds-card-title">
            Folien
            <button class="ds-btn" id="btnAddSlide">+ Neue Folie</button>
          </div>
          <div class="slide-list" id="slideList"></div>
        </div>
      </aside>
```
with:
```html
      <aside>
        <div class="ds-card" style="margin-bottom: 1rem;">
          <div class="ds-card-title" data-i18n="presenter.accessCard.title">Zugang für das Publikum</div>
          <div class="join-info-card">
            <div>
              <div class="join-code-big" id="joinCodeBig">— — —</div>
              <div class="join-url" id="joinUrl"></div>
            </div>
            <div class="qr" id="qrBox"></div>
          </div>
        </div>

        <div class="ds-card">
          <div class="ds-card-title">
            <span data-i18n="presenter.slides.title">Folien</span>
            <button class="ds-btn" id="btnAddSlide" data-i18n="presenter.slides.add">+ Neue Folie</button>
          </div>
          <div class="slide-list" id="slideList"></div>
        </div>
      </aside>
```

- [ ] **Step 3: Section — presentation title, slide editor fields, empty state, results panel**

Replace:
```html
      <section>
        <div class="ds-card" style="margin-bottom: 1rem;">
          <div class="ds-card-title">Präsentation</div>
          <div class="field">
            <label for="presTitle">Titel</label>
            <input type="text" id="presTitle" maxlength="120">
          </div>
        </div>

        <div class="ds-card" id="slideEditor" hidden>
          <div class="ds-card-title">
            <span id="slideEditorTitle">Folie</span>
            <span style="display:flex; gap:0.4rem;">
              <button class="ds-btn" id="btnMoveUp" title="Nach oben">↑</button>
              <button class="ds-btn" id="btnMoveDown" title="Nach unten">↓</button>
              <button class="ds-btn" id="btnResetSlide">Antworten zurücksetzen</button>
              <button class="ds-btn ds-btn-danger" id="btnDeleteSlide">Löschen</button>
            </span>
          </div>

          <div class="field">
            <label for="slideType">Folientyp</label>
            <select id="slideType"></select>
            <div class="help" id="typeHint"></div>
          </div>

          <div class="field" id="fieldQuestion">
            <label for="slideQuestion">Frage / Überschrift</label>
            <input type="text" id="slideQuestion" maxlength="250" placeholder="Ihre Frage an das Publikum">
          </div>

          <!-- Multiple Choice -->
          <div id="editChoice" hidden>
            <div class="field">
              <label>Antwortoptionen (max. 8)</label>
              <div id="optionRows"></div>
              <button class="ds-btn" id="btnAddOption" type="button">+ Option</button>
            </div>
            <div class="field">
              <label style="display:flex; align-items:center; gap:0.5rem; font-weight:400;">
                <input type="checkbox" id="optMultiple" style="width:auto;"> Mehrfachauswahl erlauben
              </label>
            </div>
          </div>

          <!-- Wortwolke -->
          <div id="editWordcloud" hidden>
            <div class="field">
              <label for="optMaxWords">Begriffe pro Person</label>
              <select id="optMaxWords">
                <option value="1">1</option><option value="2">2</option><option value="3">3</option>
              </select>
            </div>
          </div>

          <!-- Skala -->
          <div id="editScale" hidden>
            <div class="field">
              <label for="optScaleMax">Skala von 1 bis …</label>
              <select id="optScaleMax">
                <option value="5">5</option><option value="6">6</option><option value="7">7</option>
                <option value="10">10</option>
              </select>
            </div>
            <div class="field">
              <label for="optMinLabel">Beschriftung links (1)</label>
              <input type="text" id="optMinLabel" maxlength="40" placeholder="trifft nicht zu">
            </div>
            <div class="field">
              <label for="optMaxLabel">Beschriftung rechts (Maximum)</label>
              <input type="text" id="optMaxLabel" maxlength="40" placeholder="trifft voll zu">
            </div>
          </div>

          <!-- Infofolie -->
          <div id="editInfo" hidden>
            <div class="field">
              <label for="optInfoText">Text</label>
              <textarea id="optInfoText" rows="6" maxlength="2000"></textarea>
            </div>
          </div>
        </div>

        <div class="ds-empty" id="noSlides" hidden>
          <h3>Noch keine Folien</h3>
          <p>Fügen Sie links die erste Folie hinzu.</p>
        </div>

        <div class="ds-card" id="resultsCard" style="margin-top: 1rem;" hidden>
          <div class="ds-card-title">
            Ergebnisse dieser Folie
            <span class="ds-card-subtitle">aktualisiert sich live — bleibt auch nach der Präsentation erhalten</span>
          </div>
          <div id="editorResults"></div>
        </div>
      </section>
```
with:
```html
      <section>
        <div class="ds-card" style="margin-bottom: 1rem;">
          <div class="ds-card-title" data-i18n="presenter.details.title">Präsentation</div>
          <div class="field">
            <label for="presTitle" data-i18n="field.title.label">Titel</label>
            <input type="text" id="presTitle" maxlength="120">
          </div>
        </div>

        <div class="ds-card" id="slideEditor" hidden>
          <div class="ds-card-title">
            <span id="slideEditorTitle" data-i18n="common.slideFallback">Folie</span>
            <span style="display:flex; gap:0.4rem;">
              <button class="ds-btn" id="btnMoveUp" data-i18n-title="presenter.slide.moveUp" title="Nach oben">↑</button>
              <button class="ds-btn" id="btnMoveDown" data-i18n-title="presenter.slide.moveDown" title="Nach unten">↓</button>
              <button class="ds-btn" id="btnResetSlide" data-i18n="presenter.slide.resetAnswers">Antworten zurücksetzen</button>
              <button class="ds-btn ds-btn-danger" id="btnDeleteSlide" data-i18n="presenter.slide.delete">Löschen</button>
            </span>
          </div>

          <div class="field">
            <label for="slideType" data-i18n="presenter.field.type">Folientyp</label>
            <select id="slideType"></select>
            <div class="help" id="typeHint"></div>
          </div>

          <div class="field" id="fieldQuestion">
            <label for="slideQuestion" data-i18n="presenter.field.question">Frage / Überschrift</label>
            <input type="text" id="slideQuestion" maxlength="250" placeholder="Ihre Frage an das Publikum" data-i18n-placeholder="presenter.field.questionPlaceholder">
          </div>

          <!-- Multiple Choice -->
          <div id="editChoice" hidden>
            <div class="field">
              <label data-i18n="presenter.field.options">Antwortoptionen (max. 8)</label>
              <div id="optionRows"></div>
              <button class="ds-btn" id="btnAddOption" type="button" data-i18n="presenter.field.addOption">+ Option</button>
            </div>
            <div class="field">
              <label style="display:flex; align-items:center; gap:0.5rem; font-weight:400;">
                <input type="checkbox" id="optMultiple" style="width:auto;"> <span data-i18n="presenter.field.allowMultiple">Mehrfachauswahl erlauben</span>
              </label>
            </div>
          </div>

          <!-- Wortwolke -->
          <div id="editWordcloud" hidden>
            <div class="field">
              <label for="optMaxWords" data-i18n="presenter.field.wordsPerPerson">Begriffe pro Person</label>
              <select id="optMaxWords">
                <option value="1">1</option><option value="2">2</option><option value="3">3</option>
              </select>
            </div>
          </div>

          <!-- Skala -->
          <div id="editScale" hidden>
            <div class="field">
              <label for="optScaleMax" data-i18n="presenter.field.scaleUpTo">Skala von 1 bis …</label>
              <select id="optScaleMax">
                <option value="5">5</option><option value="6">6</option><option value="7">7</option>
                <option value="10">10</option>
              </select>
            </div>
            <div class="field">
              <label for="optMinLabel" data-i18n="presenter.field.minLabel">Beschriftung links (1)</label>
              <input type="text" id="optMinLabel" maxlength="40" placeholder="trifft nicht zu" data-i18n-placeholder="presenter.field.minLabelPlaceholder">
            </div>
            <div class="field">
              <label for="optMaxLabel" data-i18n="presenter.field.maxLabel">Beschriftung rechts (Maximum)</label>
              <input type="text" id="optMaxLabel" maxlength="40" placeholder="trifft voll zu" data-i18n-placeholder="presenter.field.maxLabelPlaceholder">
            </div>
          </div>

          <!-- Infofolie -->
          <div id="editInfo" hidden>
            <div class="field">
              <label for="optInfoText" data-i18n="presenter.field.infoText">Text</label>
              <textarea id="optInfoText" rows="6" maxlength="2000"></textarea>
            </div>
          </div>
        </div>

        <div class="ds-empty" id="noSlides" hidden>
          <h3 data-i18n="presenter.empty.title">Noch keine Folien</h3>
          <p data-i18n="presenter.empty.desc">Fügen Sie links die erste Folie hinzu.</p>
        </div>

        <div class="ds-card" id="resultsCard" style="margin-top: 1rem;" hidden>
          <div class="ds-card-title">
            <span data-i18n="presenter.results.title">Ergebnisse dieser Folie</span>
            <span class="ds-card-subtitle" data-i18n="presenter.results.subtitle">aktualisiert sich live — bleibt auch nach der Präsentation erhalten</span>
          </div>
          <div id="editorResults"></div>
        </div>
      </section>
```

- [ ] **Step 4: Present-mode topbar/footer buttons**

Replace:
```html
<div class="present-mode" id="presentMode" hidden>
  <div class="present-topbar">
    <div class="join-line" id="presentJoinLine"></div>
    <div style="display:flex; align-items:center; gap:1.25rem;">
      <span class="audience-count" id="audienceCount"></span>
      <button class="ds-btn" id="btnExitPresent">Beenden (Esc)</button>
    </div>
  </div>
  <div class="present-body">
    <div class="present-question" id="presentQuestion"></div>
    <div class="present-results" id="presentResults"></div>
  </div>
  <div class="present-footer">
    <div class="qr-small" id="presentQr"></div>
    <div class="nav">
      <button class="ds-btn" id="btnPrev">← Zurück</button>
      <span class="pos" id="presentPos"></span>
      <button class="ds-btn" id="btnNext">Weiter →</button>
    </div>
    <div style="display:flex; gap:0.5rem; align-items:center;">
      <button class="ds-btn" id="btnToggleResults"></button>
      <button class="ds-btn" id="btnToggleLock"></button>
    </div>
  </div>
</div>
```
with:
```html
<div class="present-mode" id="presentMode" hidden>
  <div class="present-topbar">
    <div class="join-line" id="presentJoinLine"></div>
    <div style="display:flex; align-items:center; gap:1.25rem;">
      <span class="audience-count" id="audienceCount"></span>
      <button class="ds-btn" id="btnExitPresent" data-i18n="presenter.present.exit">Beenden (Esc)</button>
    </div>
  </div>
  <div class="present-body">
    <div class="present-question" id="presentQuestion"></div>
    <div class="present-results" id="presentResults"></div>
  </div>
  <div class="present-footer">
    <div class="qr-small" id="presentQr"></div>
    <div class="nav">
      <button class="ds-btn" id="btnPrev" data-i18n="presenter.present.prev">← Zurück</button>
      <span class="pos" id="presentPos"></span>
      <button class="ds-btn" id="btnNext" data-i18n="presenter.present.next">Weiter →</button>
    </div>
    <div style="display:flex; gap:0.5rem; align-items:center;">
      <button class="ds-btn" id="btnToggleResults"></button>
      <button class="ds-btn" id="btnToggleLock"></button>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Script includes, initial setup, invalid-link error**

Replace:
```html
<script src="/vendor/qrcode.js"></script>
<script src="/vendor/pptxgen.bundle.js"></script>
<script src="/pptx-export.js"></script>
<script src="/common.js"></script>
<script>
'use strict';

const params = new URLSearchParams(location.search);
const PRES_ID = params.get('id');
const TOKEN = params.get('token');

if (!PRES_ID || !TOKEN) {
  document.getElementById('editorRoot').innerHTML =
    '<div class="ds-empty"><h3>Ungültiger Link</h3><p>Moderationslinks enthalten eine ID und ein Token.</p></div>';
  throw new Error('missing params');
}
```
with:
```html
<script src="/vendor/qrcode.js"></script>
<script src="/vendor/pptxgen.bundle.js"></script>
<script src="/pptx-export.js"></script>
<script src="/i18n.js"></script>
<script src="/common.js"></script>
<script>
'use strict';

document.title = t('presenter.pageTitle');
initLangToggle(document.getElementById('langToggle'), refreshLanguage);

const params = new URLSearchParams(location.search);
const PRES_ID = params.get('id');
const TOKEN = params.get('token');

if (!PRES_ID || !TOKEN) {
  document.getElementById('editorRoot').innerHTML = `
    <div class="ds-empty"><h3>${t('presenter.invalidLink.title')}</h3><p>${t('presenter.invalidLink.desc')}</p></div>`;
  throw new Error('missing params');
}
```

Note: `i18n.js` must still load before `common.js` (which calls `t()` at parse time is not required, but `typeMeta()` calls `t()` at invocation time — any load order before first use works; placing it directly before `common.js` keeps the convention established on the other two pages). It does **not** need to load before `pptxgen.bundle.js`/`pptx-export.js` since those are out of scope for translation (see Global Constraints) and never call `t()`.

- [ ] **Step 6: `load()` — join line, results-panel empty state**

Replace:
```js
  $('joinUrl').innerHTML = `Beitreten auf <b>${esc(publicBase.replace(/^https?:\/\//, ''))}</b>`;
```
with:
```js
  $('joinUrl').innerHTML = `${t('presenter.access.joinAt')} <b>${esc(publicBase.replace(/^https?:\/\//, ''))}</b>`;
```

Replace:
```js
function renderResultsPanel() {
  const card = $('resultsCard');
  const slide = currentSlide();
  if (!slide || slide.type === 'info') { card.hidden = true; return; }
  card.hidden = false;
  const results = latestResults[slide.id];
  if (!results) {
    $('editorResults').innerHTML = '<p class="results-empty">Noch keine Antworten.</p>';
    return;
  }
  renderResults($('editorResults'), slide, results, {});
}
```
with:
```js
function renderResultsPanel() {
  const card = $('resultsCard');
  const slide = currentSlide();
  if (!slide || slide.type === 'info') { card.hidden = true; return; }
  card.hidden = false;
  const results = latestResults[slide.id];
  if (!results) {
    $('editorResults').innerHTML = `<p class="results-empty">${t('presenter.results.empty')}</p>`;
    return;
  }
  renderResults($('editorResults'), slide, results, {});
}
```

- [ ] **Step 7: Save-state messages**

Replace:
```js
let saveTimer = null;
function scheduleSave() {
  $('saveState').textContent = 'Speichert …';
  $('saveState').classList.remove('saved');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
}

async function saveNow() {
  try {
    await api('PUT', `/api/presentations/${PRES_ID}/slides`, { slides: pres.slides }, TOKEN);
    $('saveState').textContent = 'Gespeichert';
    $('saveState').classList.add('saved');
  } catch {
    $('saveState').textContent = 'Speichern fehlgeschlagen';
  }
}
```
with:
```js
let saveTimer = null;
function scheduleSave() {
  $('saveState').textContent = t('presenter.save.saving');
  $('saveState').classList.remove('saved');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
}

async function saveNow() {
  try {
    await api('PUT', `/api/presentations/${PRES_ID}/slides`, { slides: pres.slides }, TOKEN);
    $('saveState').textContent = t('presenter.save.saved');
    $('saveState').classList.add('saved');
  } catch {
    $('saveState').textContent = t('presenter.save.failed');
  }
}
```

- [ ] **Step 8: `renderSlideList()` and `renderSlideEditor()` — use `typeMeta()`/`SLIDE_TYPES`**

Replace:
```js
function renderSlideList() {
  const list = $('slideList');
  list.innerHTML = '';
  $('noSlides').hidden = pres.slides.length > 0;
  $('slideEditor').hidden = pres.slides.length === 0;
  pres.slides.forEach((s, i) => {
    const item = el(`
      <button class="slide-item${i === selectedIdx ? ' active' : ''}">
        <span class="num">${i + 1}</span>
        <span class="meta">
          <span class="q">${esc(s.question || (TYPE_META[s.type] || {}).label || 'Folie')}</span><br>
          <span class="ty">${(TYPE_META[s.type] || {}).label || s.type}</span>
        </span>
      </button>`);
```
with:
```js
function renderSlideList() {
  const list = $('slideList');
  list.innerHTML = '';
  $('noSlides').hidden = pres.slides.length > 0;
  $('slideEditor').hidden = pres.slides.length === 0;
  pres.slides.forEach((s, i) => {
    const item = el(`
      <button class="slide-item${i === selectedIdx ? ' active' : ''}">
        <span class="num">${i + 1}</span>
        <span class="meta">
          <span class="q">${esc(s.question || typeMeta(s.type).label || t('common.slideFallback'))}</span><br>
          <span class="ty">${typeMeta(s.type).label || s.type}</span>
        </span>
      </button>`);
```

Replace:
```js
function renderSlideEditor() {
  const s = currentSlide();
  if (!s) return;
  $('slideEditorTitle').textContent = `Folie ${selectedIdx + 1} von ${pres.slides.length}`;

  const typeSel = $('slideType');
  typeSel.innerHTML = Object.entries(TYPE_META)
    .map(([v, m]) => `<option value="${v}"${v === s.type ? ' selected' : ''}>${m.label}</option>`)
    .join('');
  $('typeHint').textContent = (TYPE_META[s.type] || {}).hint || '';
  $('slideQuestion').value = s.question || '';
```
with:
```js
function renderSlideEditor() {
  const s = currentSlide();
  if (!s) return;
  $('slideEditorTitle').textContent = t('common.slidePosition', { n: selectedIdx + 1, total: pres.slides.length });

  const typeSel = $('slideType');
  typeSel.innerHTML = SLIDE_TYPES
    .map((v) => `<option value="${v}"${v === s.type ? ' selected' : ''}>${typeMeta(v).label}</option>`)
    .join('');
  $('typeHint').textContent = typeMeta(s.type).hint || '';
  $('slideQuestion').value = s.question || '';
```

- [ ] **Step 9: `renderOptionRows()` placeholders**

Replace:
```js
    const row = el(`
      <div class="option-row">
        <input type="text" maxlength="120" value="${esc(opt)}" placeholder="Option ${i + 1}">
        <button class="ds-btn" type="button" title="Option entfernen">×</button>
      </div>`);
```
with:
```js
    const row = el(`
      <div class="option-row">
        <input type="text" maxlength="120" value="${esc(opt)}" placeholder="${t('presenter.field.optionPlaceholder', { n: i + 1 })}">
        <button class="ds-btn" type="button" title="${t('presenter.field.removeOption')}">×</button>
      </div>`);
```

- [ ] **Step 10: PowerPoint-export button label states and failure alert**

Replace:
```js
// PowerPoint-Export: aktuelle Ergebnisse holen, Präsentation clientseitig bauen
$('btnPptx').addEventListener('click', async () => {
  const btn = $('btnPptx');
  btn.disabled = true;
  btn.textContent = 'Erstelle PPTX …';
  try {
    await saveNow();
    await refreshResults();
    const pptx = buildPulsPptx(PptxGenJS, pres, latestResults);
    await pptx.writeFile({ fileName: `puls-${pres.code}-${new Date().toISOString().slice(0, 10)}.pptx` });
  } catch (e) {
    alert('PowerPoint-Export fehlgeschlagen: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'PowerPoint-Export';
  }
});
```
with:
```js
// PowerPoint-Export: aktuelle Ergebnisse holen, Präsentation clientseitig bauen
$('btnPptx').addEventListener('click', async () => {
  const btn = $('btnPptx');
  btn.disabled = true;
  btn.textContent = t('presenter.pptxExporting');
  try {
    await saveNow();
    await refreshResults();
    const pptx = buildPulsPptx(PptxGenJS, pres, latestResults);
    await pptx.writeFile({ fileName: `puls-${pres.code}-${new Date().toISOString().slice(0, 10)}.pptx` });
  } catch (e) {
    alert(t('presenter.pptxFailed') + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = t('presenter.pptxExport');
  }
});
```

The generated `.pptx` file itself (built by `buildPulsPptx()` in `public/pptx-export.js`) is out of scope — only this button's own label/alert text changes (see Global Constraints).

- [ ] **Step 11: Title-field save-state, confirm dialogs**

Replace:
```js
$('presTitle').addEventListener('input', async (e) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await api('PUT', `/api/presentations/${PRES_ID}`, { title: e.target.value }, TOKEN);
      $('saveState').textContent = 'Gespeichert';
      $('saveState').classList.add('saved');
    } catch { $('saveState').textContent = 'Speichern fehlgeschlagen'; }
  }, 600);
});
```
with:
```js
$('presTitle').addEventListener('input', async (e) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await api('PUT', `/api/presentations/${PRES_ID}`, { title: e.target.value }, TOKEN);
      $('saveState').textContent = t('presenter.save.saved');
      $('saveState').classList.add('saved');
    } catch { $('saveState').textContent = t('presenter.save.failed'); }
  }, 600);
});
```

Replace:
```js
$('btnDeleteSlide').addEventListener('click', () => {
  if (!confirm('Diese Folie und ihre Antworten löschen?')) return;
```
with:
```js
$('btnDeleteSlide').addEventListener('click', () => {
  if (!confirm(t('presenter.confirm.deleteSlide'))) return;
```

Replace:
```js
$('btnResetSlide').addEventListener('click', async () => {
  if (!confirm('Alle Antworten dieser Folie löschen?')) return;
  await api('POST', `/api/presentations/${PRES_ID}/reset`, { slideId: currentSlide().id }, TOKEN);
});
$('btnResetAll').addEventListener('click', async () => {
  if (!confirm('Antworten aller Folien löschen? (z. B. nach einem Probelauf)')) return;
  await api('POST', `/api/presentations/${PRES_ID}/reset`, {}, TOKEN);
});
```
with:
```js
$('btnResetSlide').addEventListener('click', async () => {
  if (!confirm(t('presenter.confirm.resetSlide'))) return;
  await api('POST', `/api/presentations/${PRES_ID}/reset`, { slideId: currentSlide().id }, TOKEN);
});
$('btnResetAll').addEventListener('click', async () => {
  if (!confirm(t('presenter.confirm.resetAll'))) return;
  await api('POST', `/api/presentations/${PRES_ID}/reset`, {}, TOKEN);
});
```

- [ ] **Step 12: `enterPresent()` join line, `onSnapshot()`, final `load().catch()`**

Replace:
```js
  const joinUrl = publicBase.replace(/^https?:\/\//, '');
  $('presentJoinLine').innerHTML =
    `Beitreten auf <b>${esc(joinUrl)}</b> — Code <b>${formatCode(pres.code)}</b>`;
```
with:
```js
  const joinUrl = publicBase.replace(/^https?:\/\//, '');
  $('presentJoinLine').innerHTML =
    `${t('presenter.access.joinAt')} <b>${esc(joinUrl)}</b> — Code <b>${formatCode(pres.code)}</b>`;
```

Replace:
```js
function onSnapshot(snap) {
  lastSnapshot = snap;
  scheduleResultsRefresh(); // Ergebnis-Panel im Editor aktuell halten
  if (!presenting) return;
  $('presentPos').textContent = snap.slideCount ? `${snap.activeIndex + 1} / ${snap.slideCount}` : '0 / 0';
  $('audienceCount').textContent = `${snap.audience} ${snap.audience === 1 ? 'Person' : 'Personen'} verbunden`;
  $('btnToggleResults').textContent = snap.resultsHidden ? 'Ergebnisse einblenden' : 'Ergebnisse ausblenden';
  $('btnToggleLock').textContent = snap.votingLocked ? 'Abstimmung freigeben' : 'Abstimmung sperren';
  $('btnPrev').disabled = snap.activeIndex <= 0;
  $('btnNext').disabled = snap.activeIndex >= snap.slideCount - 1;

  const q = $('presentQuestion');
  if (!snap.slide) {
    q.textContent = 'Keine Folien vorhanden.';
    $('presentResults').innerHTML = '';
    return;
  }
  q.textContent = snap.slide.question || (TYPE_META[snap.slide.type] || {}).label || '';
  renderResults($('presentResults'), snap.slide, snap.results, {});
}
```
with:
```js
function onSnapshot(snap) {
  lastSnapshot = snap;
  scheduleResultsRefresh(); // Ergebnis-Panel im Editor aktuell halten
  if (!presenting) return;
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
    return;
  }
  q.textContent = snap.slide.question || typeMeta(snap.slide.type).label || '';
  renderResults($('presentResults'), snap.slide, snap.results, {});
}
```

Replace:
```js
load().catch((err) => {
  document.getElementById('editorRoot').innerHTML = err.status === 403
    ? '<div class="ds-empty"><h3>Kein Zugriff</h3><p>Das Moderations-Token ist ungültig.</p></div>'
    : '<div class="ds-empty"><h3>Präsentation nicht gefunden</h3><p>Sie wurde möglicherweise gelöscht.</p></div>';
});
```
with:
```js
function refreshLanguage() {
  document.title = t('presenter.pageTitle');
  if (pres && !presenting) {
    renderSlideList();
    renderSlideEditor();
  }
}

load().catch((err) => {
  document.getElementById('editorRoot').innerHTML = err.status === 403
    ? `<div class="ds-empty"><h3>${t('presenter.noAccess.title')}</h3><p>${t('presenter.noAccess.desc')}</p></div>`
    : `<div class="ds-empty"><h3>${t('presenter.notFound.title')}</h3><p>${t('presenter.notFound.desc')}</p></div>`;
});
```

`refreshLanguage()` only re-renders the editor view (`renderSlideList`/`renderSlideEditor`, which internally calls `renderResultsPanel()` too) — the fullscreen presentation mode has no toggle (per Global Constraints), so nothing there needs a language-switch refresh path.

- [ ] **Step 13: Syntax-check the file**

Run: `node --check <(sed -n '/<script>/,/<\/script>/p' public/presenter.html | sed '1d;$d')` — this is awkward for an HTML file with embedded `<script>` blocks; instead just verify via the browser in the next step, which will surface any JS syntax error as a console error immediately on page load.

- [ ] **Step 14: Start the server for manual verification**

Run: `PORT=4173 node server.js &` then wait ~1s.

- [ ] **Step 15: Create a presentation and add a slide of each type, via Playwright MCP**

1. Navigate to `http://localhost:4173/`.
2. Fill the "create" title field with `E2E Test` and submit — this navigates to `presenter.html?id=...&token=...`.
3. Confirm the editor header shows "Moderation" / the DE/EN toggle / "Alle Antworten zurücksetzen" / "Excel-Export" / "PowerPoint-Export" / "Präsentieren".
4. Click "+ Neue Folie" to add a default (`choice`) slide. Confirm the slide-type dropdown shows "Multiple Choice", the type hint reads the German hint text, and the "Antwortoptionen" label/placeholders are correct.
5. Click the "EN" toggle button. Confirm (via `browser_snapshot`):
   - Header brand suffix now reads "Presenter Console".
   - "Alle Antworten zurücksetzen" → "Reset all answers"; "Excel-Export" → "Excel Export"; "PowerPoint-Export" → "PowerPoint Export"; "Präsentieren" → "Present".
   - "Zugang für das Publikum" → "Audience access"; "Folien" → "Slides"; "+ Neue Folie" → "+ New slide".
   - Slide type dropdown now reads "Multiple Choice" (identical), and switching the `<select>` to `wordcloud`/`scale`/`qa`/`info`/`open` shows the correct English labels and hints for each.
   - "Noch keine Folien" empty state is not shown (a slide exists) — remove the slide via "Delete" (confirm dialog — use `mcp__plugin_playwright_playwright__browser_handle_dialog` to accept it, confirm the dialog text reads "Delete this slide and its answers?"), then confirm "No slides yet" / "Add your first slide on the left." appears.
6. Click "DE" again, confirm everything reverts (spot-check 3–4 of the strings changed in step 5).
7. Add a `choice` slide again, enter a question and two options, click "Präsentieren" to enter fullscreen present mode. Confirm the language toggle is **not** present in `#presentMode`, and the footer buttons read "← Zurück" / "Weiter →" / "Ergebnisse ausblenden" / "Abstimmung sperren" (German, since DE was active when entering). Exit with Escape.
8. Check `mcp__plugin_playwright_playwright__browser_console_messages` for errors — expect none.

- [ ] **Step 16: Stop the server**

Run: `kill %1`.

- [ ] **Step 17: Commit**

```bash
git add public/presenter.html
git commit -m "$(cat <<'EOF'
Wire DE/EN language toggle into presenter.html

Adds the toggle to the editor header, translates the editor UI, the
results panel, the confirm dialogs, and the fullscreen presentation
footer (which has no toggle of its own — it inherits whatever language
was active when entering present mode).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire the language toggle into `vote.html`

**Files:**
- Modify: `public/vote.html`

**Interfaces:**
- Consumes: `t()`, `initLangToggle()` from `public/i18n.js`; `typeMeta()` from Task 3's `public/common.js`.
- Produces: `refreshLanguage()` (local to `vote.html`'s inline script).

- [ ] **Step 1: Header toggle container, waiting-state text**

Replace:
```html
<header class="ds-header">
  <a class="brand ds-title" href="/"><b>PULS</b></a>
  <div class="ds-header-controls">
    <span class="ds-subtitle" id="codeLabel"></span>
  </div>
</header>

<main>
  <div class="vote-shell" id="root">
    <div class="vote-waiting">
      <div class="ds-spinner"></div>
      <p>Verbinde …</p>
    </div>
  </div>
</main>
```
with:
```html
<header class="ds-header">
  <a class="brand ds-title" href="/"><b>PULS</b></a>
  <div class="ds-header-controls">
    <span class="ds-subtitle" id="codeLabel"></span>
    <span id="langToggle"></span>
  </div>
</header>

<main>
  <div class="vote-shell" id="root">
    <div class="vote-waiting">
      <div class="ds-spinner"></div>
      <p data-i18n="vote.connecting">Verbinde …</p>
    </div>
  </div>
</main>
```

- [ ] **Step 2: Script includes and init**

Replace:
```html
<script src="/common.js"></script>
<script>
'use strict';

const params = new URLSearchParams(location.search);
const CODE = (params.get('code') || '').replace(/\D/g, '');
const root = document.getElementById('root');
const PID = participantId();
```
with:
```html
<script src="/i18n.js"></script>
<script src="/common.js"></script>
<script>
'use strict';

document.title = t('vote.pageTitle');
initLangToggle(document.getElementById('langToggle'), refreshLanguage);

const params = new URLSearchParams(location.search);
const CODE = (params.get('code') || '').replace(/\D/g, '');
const root = document.getElementById('root');
const PID = participantId();
```

- [ ] **Step 3: `init()` no-active-event error, `updateMeta()`**

Replace:
```js
async function init() {
  try {
    const joined = await api('GET', `/api/join/${CODE}`);
    presId = joined.id;
    connectStream(presId, 'audience', onSnapshot);
  } catch {
    root.innerHTML = `
      <div class="ds-empty">
        <h3>Kein aktives Event</h3>
        <p>Unter dem Code ${esc(formatCode(CODE))} wurde nichts gefunden.</p>
        <p style="margin-top:1rem;"><a class="ds-btn" href="/">Zur Startseite</a></p>
      </div>`;
  }
}
```
with:
```js
async function init() {
  try {
    const joined = await api('GET', `/api/join/${CODE}`);
    presId = joined.id;
    connectStream(presId, 'audience', onSnapshot);
  } catch {
    root.innerHTML = `
      <div class="ds-empty">
        <h3>${t('vote.noEvent.title')}</h3>
        <p>${t('vote.noEvent.desc', { code: esc(formatCode(CODE)) })}</p>
        <p style="margin-top:1rem;"><a class="ds-btn" href="/">${t('vote.noEvent.homeLink')}</a></p>
      </div>`;
  }
}
```

Replace:
```js
function updateMeta() {
  const pos = document.getElementById('posLabel');
  if (pos && snap.slideCount) pos.textContent = `Folie ${snap.activeIndex + 1} von ${snap.slideCount}`;
}
```
with:
```js
function updateMeta() {
  const pos = document.getElementById('posLabel');
  if (pos && snap.slideCount) pos.textContent = t('common.slidePosition', { n: snap.activeIndex + 1, total: snap.slideCount });
}
```

- [ ] **Step 4: `buildSlide()`**

Replace:
```js
function buildSlide() {
  const slide = snap.slide;
  resultsVisible = false;
  root.innerHTML = '';

  if (!slide) {
    root.appendChild(el(`
      <div class="vote-waiting">
        <div class="ds-spinner"></div>
        <p>Warten auf den Start der Präsentation …</p>
      </div>`));
    return;
  }

  root.appendChild(el(`
    <div class="vote-topline">
      <span class="pt">${esc(snap.title)}</span>
      <span class="pos" id="posLabel"></span>
    </div>`));

  const questionText = slide.question || (TYPE_META[slide.type] || {}).label || '';
  if (questionText && slide.type !== 'info') {
    root.appendChild(el(`<div class="vote-question">${esc(questionText)}</div>`));
  }

  if (snap.votingLocked && slide.type !== 'info') {
    root.appendChild(el('<div class="vote-locked">Die Abstimmung ist derzeit gesperrt.</div>'));
  }

  const form = el('<div id="voteForm"></div>');
  root.appendChild(form);

  if (!snap.votingLocked) {
    switch (slide.type) {
      case 'choice':    buildChoice(form, slide); break;
      case 'wordcloud': buildWordcloud(form, slide); break;
      case 'open':      buildOpen(form, slide); break;
      case 'scale':     buildScale(form, slide); break;
      case 'qa':        buildQa(form, slide); break;
    }
  }

  if (slide.type === 'info') {
    if (slide.question) form.appendChild(el(`<div class="vote-question">${esc(slide.question)}</div>`));
    if (slide.text) form.appendChild(el(`<div class="info-text">${esc(slide.text).replace(/\n/g, '<br>')}</div>`));
  }

  root.appendChild(el('<div class="vote-results-block" id="resultsBlock" hidden><h3>Live-Ergebnis</h3><div id="resultsBox"></div></div>'));
  updateMeta();
}
```
with:
```js
function buildSlide() {
  const slide = snap.slide;
  resultsVisible = false;
  root.innerHTML = '';

  if (!slide) {
    root.appendChild(el(`
      <div class="vote-waiting">
        <div class="ds-spinner"></div>
        <p>${t('vote.waitingStart')}</p>
      </div>`));
    return;
  }

  root.appendChild(el(`
    <div class="vote-topline">
      <span class="pt">${esc(snap.title)}</span>
      <span class="pos" id="posLabel"></span>
    </div>`));

  const questionText = slide.question || typeMeta(slide.type).label || '';
  if (questionText && slide.type !== 'info') {
    root.appendChild(el(`<div class="vote-question">${esc(questionText)}</div>`));
  }

  if (snap.votingLocked && slide.type !== 'info') {
    root.appendChild(el(`<div class="vote-locked">${t('vote.locked')}</div>`));
  }

  const form = el('<div id="voteForm"></div>');
  root.appendChild(form);

  if (!snap.votingLocked) {
    switch (slide.type) {
      case 'choice':    buildChoice(form, slide); break;
      case 'wordcloud': buildWordcloud(form, slide); break;
      case 'open':      buildOpen(form, slide); break;
      case 'scale':     buildScale(form, slide); break;
      case 'qa':        buildQa(form, slide); break;
    }
  }

  if (slide.type === 'info') {
    if (slide.question) form.appendChild(el(`<div class="vote-question">${esc(slide.question)}</div>`));
    if (slide.text) form.appendChild(el(`<div class="info-text">${esc(slide.text).replace(/\n/g, '<br>')}</div>`));
  }

  root.appendChild(el(`<div class="vote-results-block" id="resultsBlock" hidden><h3>${t('vote.results.title')}</h3><div id="resultsBox"></div></div>`));
  updateMeta();
}
```

- [ ] **Step 5: `buildChoice()`**

Replace:
```js
  const submitBtn = el(`<button class="ds-btn ds-btn-primary ds-btn-lg" style="margin-top:1rem;" ${selection.length ? '' : 'disabled'}>Abstimmen</button>`);
```
with:
```js
  const submitBtn = el(`<button class="ds-btn ds-btn-primary ds-btn-lg" style="margin-top:1rem;" ${selection.length ? '' : 'disabled'}>${t('vote.choice.submit')}</button>`);
```

Replace:
```js
  function prevNoteText() {
    return 'Stimme erfasst. Sie können Ihre Auswahl ändern und erneut abstimmen.';
  }
```
with:
```js
  function prevNoteText() {
    return t('vote.choice.recorded');
  }
```

- [ ] **Step 6: `buildWordcloud()`**

Replace:
```js
  const field = el(`
    <div class="field">
      <input type="text" maxlength="40" placeholder="Ihr Begriff" autocomplete="off">
      <div class="help" id="wcHelp"></div>
    </div>`);
  const input = field.querySelector('input');
  const help = field.querySelector('#wcHelp');
  const btn = el('<button class="ds-btn ds-btn-primary ds-btn-lg">Senden</button>');
  const note = el('<div></div>');

  function refresh() {
    const r = remaining();
    help.textContent = r > 0
      ? `Noch ${r} ${r === 1 ? 'Begriff' : 'Begriffe'} möglich.`
      : '';
    const done = r <= 0;
    input.disabled = done;
    btn.disabled = done;
    if (done) {
      note.innerHTML = '';
      note.appendChild(submittedNote('Vielen Dank — Ihre Begriffe sind in der Wolke.'));
      showResults();
    }
  }
```
with:
```js
  const field = el(`
    <div class="field">
      <input type="text" maxlength="40" placeholder="${t('vote.wordcloud.placeholder')}" autocomplete="off">
      <div class="help" id="wcHelp"></div>
    </div>`);
  const input = field.querySelector('input');
  const help = field.querySelector('#wcHelp');
  const btn = el(`<button class="ds-btn ds-btn-primary ds-btn-lg">${t('common.send')}</button>`);
  const note = el('<div></div>');

  function refresh() {
    const r = remaining();
    help.textContent = r > 0 ? t('vote.wordcloud.remaining', { n: r }) : '';
    const done = r <= 0;
    input.disabled = done;
    btn.disabled = done;
    if (done) {
      note.innerHTML = '';
      note.appendChild(submittedNote(t('vote.wordcloud.done')));
      showResults();
    }
  }
```

- [ ] **Step 7: `buildOpen()`**

Replace:
```js
function buildOpen(form, slide) {
  const field = el(`
    <div class="field">
      <textarea rows="3" maxlength="500" placeholder="Ihre Antwort"></textarea>
      <div class="help">Bis zu 5 Antworten pro Person.</div>
    </div>`);
  const ta = field.querySelector('textarea');
  const btn = el('<button class="ds-btn ds-btn-primary ds-btn-lg">Senden</button>');
  const note = el('<div></div>');

  btn.addEventListener('click', () => {
    const text = ta.value.trim();
    if (!text) return;
    submit(text, () => {
      ta.value = '';
      note.innerHTML = '';
      note.appendChild(submittedNote('Antwort gesendet.'));
      showResults();
    }, (e) => {
      if (e.message === 'limit_reached') {
        note.innerHTML = '';
        note.appendChild(submittedNote('Limit erreicht — maximal 5 Antworten pro Person.'));
      }
    });
  });
  form.appendChild(field);
  form.appendChild(btn);
  form.appendChild(note);
}
```
with:
```js
function buildOpen(form, slide) {
  const field = el(`
    <div class="field">
      <textarea rows="3" maxlength="500" placeholder="${t('vote.open.placeholder')}"></textarea>
      <div class="help">${t('vote.open.help')}</div>
    </div>`);
  const ta = field.querySelector('textarea');
  const btn = el(`<button class="ds-btn ds-btn-primary ds-btn-lg">${t('common.send')}</button>`);
  const note = el('<div></div>');

  btn.addEventListener('click', () => {
    const text = ta.value.trim();
    if (!text) return;
    submit(text, () => {
      ta.value = '';
      note.innerHTML = '';
      note.appendChild(submittedNote(t('vote.open.sent')));
      showResults();
    }, (e) => {
      if (e.message === 'limit_reached') {
        note.innerHTML = '';
        note.appendChild(submittedNote(t('vote.open.limitReached')));
      }
    });
  });
  form.appendChild(field);
  form.appendChild(btn);
  form.appendChild(note);
}
```

- [ ] **Step 8: `buildScale()`**

Replace:
```js
      submit(v, () => {
        markVoted(slide.id, v);
        note.innerHTML = '';
        note.appendChild(submittedNote('Bewertung erfasst. Tippen Sie erneut, um sie zu ändern.'));
        showResults();
      });
```
with:
```js
      submit(v, () => {
        markVoted(slide.id, v);
        note.innerHTML = '';
        note.appendChild(submittedNote(t('vote.scale.recorded')));
        showResults();
      });
```

Replace:
```js
  if (chosen !== null) {
    note.appendChild(submittedNote('Bewertung erfasst. Tippen Sie erneut, um sie zu ändern.'));
    showResults();
  }
```
with:
```js
  if (chosen !== null) {
    note.appendChild(submittedNote(t('vote.scale.recorded')));
    showResults();
  }
```

- [ ] **Step 9: `buildQa()`**

Replace:
```js
function buildQa(form, slide) {
  const field = el(`
    <div class="field">
      <textarea rows="2" maxlength="500" placeholder="Ihre Frage an die Moderation"></textarea>
    </div>`);
  const ta = field.querySelector('textarea');
  const btn = el('<button class="ds-btn ds-btn-primary ds-btn-lg">Frage einreichen</button>');
  const note = el('<div></div>');

  btn.addEventListener('click', () => {
    const text = ta.value.trim();
    if (!text) return;
    submit(text, () => {
      ta.value = '';
      note.innerHTML = '';
      note.appendChild(submittedNote('Frage eingereicht.'));
    }, (e) => {
      if (e.message === 'limit_reached') {
        note.innerHTML = '';
        note.appendChild(submittedNote('Limit erreicht — maximal 5 Fragen pro Person.'));
      }
    });
  });
  form.appendChild(field);
  form.appendChild(btn);
  form.appendChild(note);
  showResults(); // Fragenliste ist bei Q&A immer sichtbar
}
```
with:
```js
function buildQa(form, slide) {
  const field = el(`
    <div class="field">
      <textarea rows="2" maxlength="500" placeholder="${t('vote.qa.placeholder')}"></textarea>
    </div>`);
  const ta = field.querySelector('textarea');
  const btn = el(`<button class="ds-btn ds-btn-primary ds-btn-lg">${t('vote.qa.submit')}</button>`);
  const note = el('<div></div>');

  btn.addEventListener('click', () => {
    const text = ta.value.trim();
    if (!text) return;
    submit(text, () => {
      ta.value = '';
      note.innerHTML = '';
      note.appendChild(submittedNote(t('vote.qa.sent')));
    }, (e) => {
      if (e.message === 'limit_reached') {
        note.innerHTML = '';
        note.appendChild(submittedNote(t('vote.qa.limitReached')));
      }
    });
  });
  form.appendChild(field);
  form.appendChild(btn);
  form.appendChild(note);
  showResults(); // Fragenliste ist bei Q&A immer sichtbar
}
```

- [ ] **Step 10: Add `refreshLanguage()`, preserving results visibility across a rebuild**

Replace the final line of the file (end of the `<script>` block, right after `updateResults()`'s closing brace):
```js
function updateResults() {
  const block = document.getElementById('resultsBlock');
  const box = document.getElementById('resultsBox');
  if (!block || !box || !snap.slide) return;

  const isQa = snap.slide.type === 'qa';
  if (!resultsVisible && !isQa) { block.hidden = true; return; }
  if (snap.resultsHidden || !snap.results) { block.hidden = true; return; }

  block.hidden = false;
  renderResults(box, snap.slide, snap.results, isQa ? {
    onUpvote: async (qid) => {
      try {
        await api('POST', `/api/presentations/${presId}/upvote`, {
          slideId: snap.slide.id, participantId: PID, questionId: qid,
        });
        if (upvoted.has(qid)) upvoted.delete(qid); else upvoted.add(qid);
        sessionStorage.setItem('puls.upvoted', JSON.stringify([...upvoted]));
      } catch { /* ignorieren */ }
    },
    upvoted,
  } : {});
}
```
with:
```js
function updateResults() {
  const block = document.getElementById('resultsBlock');
  const box = document.getElementById('resultsBox');
  if (!block || !box || !snap.slide) return;

  const isQa = snap.slide.type === 'qa';
  if (!resultsVisible && !isQa) { block.hidden = true; return; }
  if (snap.resultsHidden || !snap.results) { block.hidden = true; return; }

  block.hidden = false;
  renderResults(box, snap.slide, snap.results, isQa ? {
    onUpvote: async (qid) => {
      try {
        await api('POST', `/api/presentations/${presId}/upvote`, {
          slideId: snap.slide.id, participantId: PID, questionId: qid,
        });
        if (upvoted.has(qid)) upvoted.delete(qid); else upvoted.add(qid);
        sessionStorage.setItem('puls.upvoted', JSON.stringify([...upvoted]));
      } catch { /* ignorieren */ }
    },
    upvoted,
  } : {});
}

function refreshLanguage() {
  document.title = t('vote.pageTitle');
  if (!snap) return;
  const wasVisible = resultsVisible;
  buildSlide();
  if (wasVisible) showResults();
}
```

`buildSlide()` always resets `resultsVisible = false` and rebuilds the form from scratch (this is also how a real slide change already behaves). Capturing `wasVisible` beforehand and re-calling `showResults()` afterward restores the results panel to whatever state it was in before the language switch, for every slide type — including `open`, whose results visibility isn't otherwise recoverable from `votedStore()`. A draft (not-yet-submitted) text in a textarea/word-cloud input is still cleared by the rebuild — an accepted, rare-action edge case per the approved design spec.

- [ ] **Step 11: Syntax note**

Same caveat as Task 4 Step 12 — HTML file with embedded script, verified via the browser in the next step rather than `node --check`.

- [ ] **Step 12: Start the server for manual verification**

Run: `PORT=4173 node server.js &` then wait ~1s.

- [ ] **Step 13: End-to-end vote flow via Playwright MCP**

1. Via the presenter flow (as in Task 4 Step 14), create a presentation with one `choice` slide (question "Test?", options "A"/"B") and start presenting so `votingLocked` is false and the slide is active.
2. In a second browser tab/page, navigate to `http://localhost:4173/vote.html?code=<the six-digit code>`.
3. Confirm the question "Test?" and options "A"/"B" are shown, submit button reads "Abstimmen".
4. Click "EN" in the vote page header. Confirm the submit button now reads "Vote", and (if any note was showing) it re-renders in English.
5. Vote for option "A". Confirm the note reads "Vote recorded. You can change your selection and vote again." and the live results block appears below with a bar chart and "1 vote".
6. Click "DE". Confirm the note switches to "Stimme erfasst…" and results meta switches to "1 Stimme", **and the results block stays visible** (this is the specific regression the Step 10 fix targets — confirm it does NOT hide after the switch).
7. Check `mcp__plugin_playwright_playwright__browser_console_messages` for errors — expect none.

- [ ] **Step 14: Stop the server**

Run: `kill %1`.

- [ ] **Step 15: Commit**

```bash
git add public/vote.html
git commit -m "$(cat <<'EOF'
Wire DE/EN language toggle into vote.html

Adds the toggle to the audience page header, translates every slide-type
form (choice/wordcloud/open/scale/qa) and the results block, and
preserves results-panel visibility across a language switch.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: End-to-end verification across all three pages

**Files:** none (verification only).

- [ ] **Step 1: Grep for leftover hardcoded German UI strings**

Run:
```bash
grep -n '[äöüÄÖÜß]' public/index.html public/presenter.html public/vote.html public/common.js | grep -v 'data-i18n\|DICT\|<!--'
```
Expected: no matches outside of comments (`<!-- ... -->`) or the `data-i18n="..."` attribute values themselves (those retain their original German text as the pre-JS fallback, which is correct and expected — only check that no *user-visible, untagged* German string remains, i.e. every remaining umlaut hit should be inside a `data-i18n`-tagged element's fallback text, a `<!-- -->` comment, or absent because `i18n.js` is the only place holding the live strings). Review each hit manually; anything that isn't one of those is a missed translation — go back to the relevant task and fix it.

- [ ] **Step 2: Confirm `server.js` is untouched**

Run: `git diff --stat main -- server.js` (or `git status --short server.js`, depending on how the branch was created) and confirm this feature's commits made no changes to it — the pre-existing Excel-export changes may still show as modified/uncommitted if they haven't been committed separately, which is expected and not part of this feature.

- [ ] **Step 3: Full bilingual walkthrough via Playwright MCP**

Run: `PORT=4173 node server.js &`, wait ~1s, then:
1. Landing page (`/`) in DE (default, or force via `localStorage.setItem('puls.lang','de')` + reload): create a presentation, confirm all copy is German.
2. Switch to EN on the landing page, confirm all copy switches, reload the page (`browser_navigate` again to the same URL) and confirm EN persists (localStorage).
3. Open the presenter console for the created presentation, add one slide of each of the 6 types, and for each: confirm the slide-type label/hint, field labels, and placeholders in both DE and EN (toggle back and forth once per type).
4. Enter presentation mode, step through slides with the "Weiter →"/"Next →" (whichever language was active) buttons and keyboard arrows, confirm the audience counter pluralizes correctly at 0 and 1 connected participants (0 people connected / 1 person connected / n people connected — connect the vote-page tab to get to 1, then note the copy is only observable with the toggle-driven language since present mode has no toggle of its own).
5. Open `/vote.html?code=<code>` in a fresh page, vote on the `choice` slide, submit a word on the `wordcloud` slide, submit text on the `open` slide, pick a value on the `scale` slide, submit a question on the `qa` slide — toggling language before and after each submission, confirming no exceptions in `browser_console_messages` and no stray German/English mixed together in the same view.
6. Kill the server: `kill %1`.

Expected: every check passes; note any residual issue as a new fix commit before considering the feature done (do not silently skip a failing check).

- [ ] **Step 4: Final commit (if Step 1's grep or Step 3's walkthrough required fixes)**

Only needed if Steps 1–3 surfaced something to fix. If everything already passed cleanly in Tasks 2–5, there is nothing to commit here.

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-07-02-i18n-de-en-toggle-design.md` maps to a task — engine (Task 1), landing page + toggle CSS (Task 2), shared renderers (Task 3), presenter incl. present-mode exclusion (Task 4), vote page incl. results-preservation (Task 5), scope/out-of-scope verification (Task 6).
- **Placeholder scan:** no TBD/TODO markers; every step has literal code, not a description of code.
- **Type consistency:** `typeMeta(type)` (Task 3) is defined once and consumed with the same name/shape (`{label, hint}`) in Tasks 4 and 5. `SLIDE_TYPES` is defined once (Task 1, `i18n.js`) and consumed once (Task 4). `t(key, vars)` and `refreshLanguage()` are used consistently by name across all tasks.
- **New consideration found while writing this plan:** `public/presenter.html` had unrelated Excel/PowerPoint-export work in progress while this plan was drafted (now committed as `dd372d6`): an "Excel-Export" link, a "PowerPoint-Export" button with an in-progress label swap, and a live per-slide results panel. Task 4 was re-derived against that committed file content and adds `data-i18n`/`t()` coverage for those new elements' button chrome (`presenter.export`, `presenter.pptxExport/pptxExporting/pptxFailed`, `presenter.results.title/subtitle/empty` keys) without touching `server.js`'s `.xlsx` logic or `public/pptx-export.js`'s generated `.pptx` content, consistent with the spec's "server.js unverändert" boundary and applied symmetrically to both export formats.
