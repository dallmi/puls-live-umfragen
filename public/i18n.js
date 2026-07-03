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
  'landing.footer': { de: 'Keine Konten, keine Cookies, keine Tracker.', en: 'No accounts, no cookies, no trackers.' },
  'landing.privacy': { de: 'Datenschutz', en: 'Privacy' },
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
  'presenter.details.collectNames': { de: 'Namen erfassen (Teilnehmende geben beim Beitritt ihren Namen ein)', en: 'Collect names (participants enter their name when joining)' },
  'presenter.details.collectNamesHelp': { de: 'Namen erscheinen bei Q&A und offenen Antworten. Ausgeschaltet bleibt alles anonym.', en: 'Names appear on Q&A and open answers. When off, everything stays anonymous.' },
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
  'vote.name.prompt': { de: 'Wie heißen Sie?', en: 'What is your name?' },
  'vote.name.placeholder': { de: 'Ihr Name', en: 'Your name' },
  'vote.name.submit': { de: 'Weiter', en: 'Continue' },
  'vote.name.err': { de: 'Konnte nicht gespeichert werden — bitte erneut versuchen.', en: 'Could not be saved — please try again.' },
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
  'results.wordcloud.metaVoters': {
    de: { one: '{{n}} Teilnehmende', other: '{{n}} Teilnehmende' },
    en: { one: '{{n}} participant', other: '{{n}} participants' },
  },
  'results.wordcloud.metaWords': {
    de: { one: '{{n}} Begriff', other: '{{n}} Begriffe' },
    en: { one: '{{n}} term', other: '{{n}} terms' },
  },
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
  if (saved === 'de' || saved === 'en') {
    currentLang = saved;
  } else {
    currentLang = detectDefaultLang();
    localStorage.setItem(LANG_KEY, currentLang);
  }
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

/* Kompakte, lokal eingebettete Flaggen-SVGs — keine Emoji (rendern auf
   Windows-Firmenrechnern inkonsistent, teils nur als Buchstabencode) und
   kein Icon-Font/CDN, passend zur Zero-Dependency-Vorgabe. */
const FLAG_SVG = {
  de: '<svg viewBox="0 0 5 3" width="20" height="14" aria-hidden="true"><rect width="5" height="3" fill="#000"/><rect width="5" height="2" y="1" fill="#D00"/><rect width="5" height="1" y="2" fill="#FFCE00"/></svg>',
  en: '<svg viewBox="0 0 60 30" width="20" height="14" aria-hidden="true"><rect width="60" height="30" fill="#00247d"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#cf142b" stroke-width="2"/><path d="M30,0 V30 M0,15 H60" stroke="#fff" stroke-width="10"/><path d="M30,0 V30 M0,15 H60" stroke="#cf142b" stroke-width="6"/></svg>',
};

function initLangToggle(container, onChange) {
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('lang-toggle');
  const options = [['de', 'Deutsch'], ['en', 'English']];
  const buttons = options.map(([code, name]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = FLAG_SVG[code];
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
