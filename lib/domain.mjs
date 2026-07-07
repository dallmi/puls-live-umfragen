/**
 * PULS — gemeinsame, speicher-/transport-freie Domänenlogik.
 *
 * Reine Funktionen ohne Zugriff auf Store, Dateisystem oder HTTP — daher von
 * beiden Laufzeiten nutzbar:
 *   - server.js         (Hetzner / lokal: In-Memory + Datei, SSE)
 *   - api/index.js      (Vercel: serverlos, Key-Value-Speicher, Polling)
 *
 * So bleibt die Ergebnis-Berechnung, Validierung und der XLSX-Export an EINER
 * Stelle und kann zwischen den Deployments nicht auseinanderlaufen.
 */

import crypto from 'node:crypto';

export const MAX_TEXT_LEN = 500;
export const MAX_OPEN_ANSWERS_PER_USER = 5;
export const MAX_PARTICIPANTS_PER_SLIDE = 5000;
export const SLIDE_TYPES = ['choice', 'wordcloud', 'open', 'scale', 'ranking', 'points', 'quiz', 'qa', 'info'];

export function clampText(v, max = MAX_TEXT_LEN) {
  if (typeof v !== 'string') return '';
  // XML-1.0-unzulässige Steuerzeichen entfernen (Tab \t, Zeilenumbruch \n, \r
  // bleiben erlaubt) — sonst zerstört ein einzelnes eingefügtes Zeichen den
  // späteren XLSX-Export (ungültiges XML → „Datei beschädigt" in Excel).
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

export function sanitizeSlide(input) {
  const type = SLIDE_TYPES.includes(input.type) ? input.type : 'choice';
  const slide = {
    id: input.id || crypto.randomUUID(),
    type,
    question: clampText(input.question, 250),
    answers: input.answers && typeof input.answers === 'object' ? input.answers : {},
  };
  if (type === 'choice') {
    slide.options = (Array.isArray(input.options) ? input.options : [])
      .map((o) => clampText(String(o), 120))
      .filter(Boolean)
      .slice(0, 8);
    slide.multiple = !!input.multiple;
  }
  if (type === 'wordcloud') {
    slide.maxWords = Math.min(Math.max(parseInt(input.maxWords, 10) || 1, 1), 3);
  }
  if (type === 'scale') {
    slide.min = 1;
    slide.max = Math.min(Math.max(parseInt(input.max, 10) || 5, 2), 10);
    // Leer lassen, wenn nicht gesetzt — der Client rendert einen lokalisierten
    // Default (H6), statt hier eine feste deutsche Beschriftung zu erzwingen.
    slide.minLabel = clampText(input.minLabel, 40);
    slide.maxLabel = clampText(input.maxLabel, 40);
  }
  if (type === 'info') {
    slide.text = clampText(input.text, 2000);
  }
  if (type === 'qa') {
    slide.moderated = !!input.moderated; // Fragen erst nach Freigabe öffentlich
  }
  if (type === 'ranking' || type === 'points' || type === 'quiz') {
    slide.options = (Array.isArray(input.options) ? input.options : [])
      .map((o) => clampText(String(o), 120))
      .filter(Boolean)
      .slice(0, 8);
  }
  if (type === 'points') {
    slide.total = 100; // feste Gesamtpunktzahl je Teilnehmer
  }
  if (type === 'quiz') {
    const n = slide.options.length;
    const c = parseInt(input.correct, 10);
    slide.correct = (Number.isInteger(c) && c >= 0 && c < n) ? c : 0; // Index der richtigen Antwort
    if (Number.isFinite(input.startedAt)) slide.startedAt = input.startedAt; // Timer-Start (Geschwindigkeitsbonus)
  }
  return slide;
}

/**
 * Bleiben die zuvor gespeicherten Antworten nach einer Editor-Bearbeitung
 * gültig? Antworten sind indexbasiert (choice/ranking/points/quiz) bzw. an
 * Typ und Skalenbereich gebunden — ändert sich die Struktur, zeigten alte
 * Indizes auf falsche/entfernte Optionen (verfälschte Live-Ergebnisse). Dann
 * lieber verwerfen als falsche Zahlen anzeigen. Reine Label-Korrekturen bei
 * gleicher Optionsanzahl bleiben erhalten (Position → Zählung unverändert).
 * Beide Runtimes rufen dies im PUT /slides-Merge auf.
 */
export function answersRemainValid(prev, next) {
  if (!prev || prev.type !== next.type) return false;
  if (['choice', 'ranking', 'points', 'quiz'].includes(next.type)) {
    if ((prev.options || []).length !== (next.options || []).length) return false;
  }
  if (next.type === 'quiz' && prev.correct !== next.correct) return false; // Antwortschlüssel geändert → Wertung ungültig
  if (next.type === 'scale' && (prev.min !== next.min || prev.max !== next.max)) return false;
  return true;
}

/**
 * Signierter Teilnehmer-Token (H23) gegen frei erfundene Teilnehmer-IDs
 * (Ballot-Stuffing / Ergebnis-Manipulation). Der Server stellt beim Beitritt einen
 * Token `<pid>.<sig>` aus; der Client kann keine neuen gültigen Tokens erzeugen,
 * weil er das Secret nicht kennt. `secret` liefert die jeweilige Laufzeit.
 */
function partSig(pid, secret) {
  return crypto.createHmac('sha256', String(secret || '')).update(pid).digest('hex').slice(0, 24);
}
export function issueParticipant(secret) {
  const pid = crypto.randomBytes(8).toString('hex');
  return pid + '.' + partSig(pid, secret);
}
export function verifyParticipant(token, secret) {
  if (typeof token !== 'string') return null;
  const i = token.indexOf('.');
  if (i <= 0) return null;
  const pid = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (!/^[0-9a-f]{16}$/.test(pid)) return null;
  const expected = partSig(pid, secret);
  if (sig.length !== expected.length) return null;
  let d = 0;
  for (let k = 0; k < sig.length; k++) d |= sig.charCodeAt(k) ^ expected.charCodeAt(k);
  return d === 0 ? pid : null;
}

/** Öffentliche Sicht auf eine Folie (ohne Antworten-Rohdaten). */
export function publicSlide(slide) {
  if (!slide) return null;
  const { answers, ...rest } = slide;
  // Quiz: Antwortschlüssel + Timer nie an Clients ausliefern (Betrugsschutz).
  // Die richtige Antwort hebt nur der Moderator aus seinen authentifizierten Daten hervor.
  if (rest.type === 'quiz') { delete rest.correct; delete rest.startedAt; }
  return rest;
}

/**
 * Öffentliche Quiz-Ergebnisse: der Antwortschlüssel (correct) wird NIE an Clients
 * ausgeliefert. withCounts=false blendet zusätzlich die Verteilung aus (Self-paced).
 */
export function publicQuizResult(res, withCounts) {
  if (!res || res.kind !== 'quiz') return res;
  return { kind: 'quiz', voters: res.voters, correct: -1, counts: withCounts ? res.counts : null };
}

/** Ergebnisse einer Folie berechnen. */
export function computeResults(slide, showNames = false) {
  if (!slide) return null;
  const entries = Object.entries(slide.answers || {}); // [participantId, value]
  // Namen sind am jeweiligen Beitrag gespeichert (zum Zeitpunkt der Abgabe),
  // damit zuvor anonym abgegebene Beiträge nie nachträglich benannt werden.
  const shownName = (item) => (showNames && item && item.name) ? String(item.name) : '';
  switch (slide.type) {
    case 'choice': {
      const counts = new Array((slide.options || []).length).fill(0);
      let voters = 0;
      for (const [, value] of entries) {
        const picks = Array.isArray(value) ? value : [value];
        let voted = false;
        for (const idx of picks) {
          if (Number.isInteger(idx) && idx >= 0 && idx < counts.length) {
            counts[idx]++;
            voted = true;
          }
        }
        if (voted) voters++;
      }
      return { kind: 'choice', counts, voters };
    }
    case 'wordcloud': {
      const freq = {};
      let voters = 0;
      for (const [, words] of entries) {
        if (!Array.isArray(words) || !words.length) continue;
        voters++;
        for (const w of words) {
          const key = String(w).trim().toLowerCase().slice(0, 40);
          if (!key) continue;
          freq[key] = (freq[key] || 0) + 1;
        }
      }
      const words = Object.entries(freq)
        .map(([text, count]) => ({ text, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 80);
      return { kind: 'wordcloud', words, voters };
    }
    case 'open': {
      const texts = [];
      for (const [, list] of entries) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
          if (item && item.text) texts.push({ text: item.text, ts: item.ts || 0, name: shownName(item) });
        }
      }
      texts.sort((a, b) => b.ts - a.ts);
      return { kind: 'open', texts: texts.slice(0, 200), voters: entries.filter(([, l]) => Array.isArray(l) && l.length).length };
    }
    case 'scale': {
      const dist = {};
      let sum = 0;
      let n = 0;
      for (const [, v] of entries) {
        const num = Number(v);
        if (!Number.isFinite(num) || num < slide.min || num > slide.max) continue;
        dist[num] = (dist[num] || 0) + 1;
        sum += num;
        n++;
      }
      return { kind: 'scale', dist, avg: n ? sum / n : 0, voters: n, min: slide.min, max: slide.max };
    }
    case 'points': {
      const n = (slide.options || []).length;
      const totals = new Array(n).fill(0);
      let voters = 0;
      for (const [, arr] of entries) {
        if (!Array.isArray(arr)) continue;
        let any = false;
        for (let i = 0; i < n; i++) {
          const v = Number(arr[i]) || 0;
          if (v > 0) { totals[i] += v; any = true; }
        }
        if (any) voters++;
      }
      return { kind: 'points', totals, voters, total: slide.total || 100 };
    }
    case 'ranking': {
      const n = (slide.options || []).length;
      const score = new Array(n).fill(0);   // Borda: beste Position (0) → n-1 Punkte
      const rankSum = new Array(n).fill(0); // Summe der 1-basierten Positionen (für Ø-Rang)
      let voters = 0;
      for (const [, arr] of entries) {
        if (!Array.isArray(arr) || arr.length !== n) continue;
        voters++;
        arr.forEach((optIdx, pos) => {
          if (Number.isInteger(optIdx) && optIdx >= 0 && optIdx < n) {
            score[optIdx] += (n - 1 - pos);
            rankSum[optIdx] += (pos + 1);
          }
        });
      }
      const items = [];
      for (let i = 0; i < n; i++) {
        items.push({ index: i, score: score[i], avgRank: voters ? rankSum[i] / voters : 0 });
      }
      items.sort((a, b) => b.score - a.score || a.avgRank - b.avgRank);
      return { kind: 'ranking', items, voters };
    }
    case 'quiz': {
      const counts = new Array((slide.options || []).length).fill(0);
      let voters = 0;
      for (const [, ans] of entries) {
        if (ans && Number.isInteger(ans.choice) && ans.choice >= 0 && ans.choice < counts.length) {
          counts[ans.choice]++;
          voters++;
        }
      }
      return { kind: 'quiz', counts, voters, correct: Number.isInteger(slide.correct) ? slide.correct : -1 };
    }
    case 'qa': {
      const questions = [];
      for (const [, list] of entries) {
        if (!Array.isArray(list)) continue;
        for (const q of list) {
          if (!q || !q.text) continue;
          if (slide.moderated && q.approved === false) continue; // moderiert: nur Freigegebene öffentlich
          questions.push({ id: q.id, text: q.text, votes: Object.keys(q.upvotes || {}).length, ts: q.ts || 0, name: shownName(q) });
        }
      }
      questions.sort((a, b) => b.votes - a.votes || a.ts - b.ts);
      return { kind: 'qa', questions: questions.slice(0, 100), voters: entries.length };
    }
    case 'info':
      return { kind: 'info' };
    default:
      return null;
  }
}

/**
 * Antwort eines Teilnehmers auf eine Folie anwenden (mutiert slide.answers).
 * name = Anzeigename zum Zeitpunkt der Abgabe ('' = anonym); wird am Beitrag
 * gespeichert, damit anonyme Beiträge nie nachträglich benannt werden.
 */
export function applyAnswer(slide, pid, body, name = '') {
  switch (slide.type) {
    case 'choice': {
      let picks = Array.isArray(body.value) ? body.value : [body.value];
      picks = [...new Set(picks.filter((i) => Number.isInteger(i) && i >= 0 && i < slide.options.length))];
      if (!picks.length) return { ok: false, error: 'no_option' };
      if (!slide.multiple) picks = picks.slice(0, 1);
      slide.answers[pid] = picks; // erneutes Abstimmen ersetzt die vorherige Wahl
      return { ok: true };
    }
    case 'wordcloud': {
      const words = (Array.isArray(body.value) ? body.value : [body.value])
        .map((w) => clampText(String(w), 40))
        .filter(Boolean)
        .slice(0, slide.maxWords);
      if (!words.length) return { ok: false, error: 'no_words' };
      const prev = slide.answers[pid] || [];
      if (prev.length >= slide.maxWords) return { ok: false, error: 'limit_reached' };
      slide.answers[pid] = [...prev, ...words].slice(0, slide.maxWords);
      return { ok: true };
    }
    case 'open': {
      const text = clampText(String(body.value || ''), MAX_TEXT_LEN);
      if (!text) return { ok: false, error: 'empty' };
      const list = slide.answers[pid] || [];
      if (list.length >= MAX_OPEN_ANSWERS_PER_USER) return { ok: false, error: 'limit_reached' };
      list.push({ text, ts: Date.now(), name });
      slide.answers[pid] = list;
      return { ok: true };
    }
    case 'scale': {
      const num = Number(body.value);
      if (!Number.isFinite(num) || num < slide.min || num > slide.max) return { ok: false, error: 'out_of_range' };
      slide.answers[pid] = num;
      return { ok: true };
    }
    case 'points': {
      const n = (slide.options || []).length;
      const arr = Array.isArray(body.value) ? body.value : [];
      const pts = [];
      let sum = 0;
      for (let i = 0; i < n; i++) {
        let v = Math.round(Number(arr[i]));
        if (!Number.isFinite(v) || v < 0) v = 0;
        pts.push(v);
        sum += v;
      }
      if (sum <= 0) return { ok: false, error: 'no_points' };
      if (sum > (slide.total || 100)) return { ok: false, error: 'too_many_points' };
      slide.answers[pid] = pts; // erneutes Abstimmen ersetzt die vorherige Verteilung
      return { ok: true };
    }
    case 'ranking': {
      const n = (slide.options || []).length;
      const arr = Array.isArray(body.value) ? body.value.map((x) => parseInt(x, 10)) : [];
      if (arr.length !== n) return { ok: false, error: 'bad_ranking' };
      const seen = new Set();
      for (const idx of arr) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= n || seen.has(idx)) return { ok: false, error: 'bad_ranking' };
        seen.add(idx);
      }
      slide.answers[pid] = arr; // erneutes Abstimmen ersetzt die vorherige Reihenfolge
      return { ok: true };
    }
    case 'quiz': {
      if (pid in slide.answers) return { ok: false, error: 'already_answered' }; // Quiz-Antwort ist endgültig
      const nOpts = (slide.options || []).length;
      const choice = Number(body.value);
      if (!Number.isInteger(choice) || choice < 0 || choice >= nOpts) return { ok: false, error: 'no_option' };
      const correct = choice === slide.correct;
      const points = correct ? quizPoints(slide.startedAt) : 0;
      slide.answers[pid] = { choice, ts: Date.now(), correct, points, name };
      return { ok: true, quiz: { correct, points } };
    }
    case 'qa': {
      const text = clampText(String(body.value || ''), MAX_TEXT_LEN);
      if (!text) return { ok: false, error: 'empty' };
      const list = slide.answers[pid] || [];
      if (list.length >= MAX_OPEN_ANSWERS_PER_USER) return { ok: false, error: 'limit_reached' };
      list.push({ id: crypto.randomUUID(), text, ts: Date.now(), upvotes: {}, name, approved: !slide.moderated });
      slide.answers[pid] = list;
      return { ok: true };
    }
    default:
      return { ok: false, error: 'not_votable' };
  }
}

/** Quiz-Punkte für eine richtige Antwort. Mit Timer (startedAt) 1000→500 nach Zeit, ohne Timer flach 1000. */
export function quizPoints(startedAt) {
  if (!startedAt) return 1000; // z. B. Selbststeuerung: kein gemeinsamer Start → voller Basiswert
  const WINDOW_MS = 20000; // nach 20 s nur noch der halbe Wert
  const frac = Math.max(0, 1 - (Date.now() - startedAt) / WINDOW_MS);
  return Math.round(500 + 500 * frac);
}

/** Rangliste über alle Quiz-Folien: Punkte je Teilnehmer, mit Namen. */
export function leaderboard(pres, limit = 20) {
  const totals = {}; // pid -> { points, correct }
  for (const s of pres.slides || []) {
    if (s.type !== 'quiz') continue;
    for (const [pid, ans] of Object.entries(s.answers || {})) {
      if (!ans || typeof ans !== 'object') continue;
      const t = totals[pid] || (totals[pid] = { points: 0, correct: 0 });
      t.points += Number(ans.points) || 0;
      if (ans.correct) t.correct++;
    }
  }
  const names = pres.names || {};
  const rows = Object.entries(totals).map(([pid, t]) => ({
    pid, points: t.points, correct: t.correct,
    name: names[pid] || ('Gast ' + String(pid).slice(0, 4)),
  }));
  rows.sort((a, b) => b.points - a.points || b.correct - a.correct);
  return rows.slice(0, limit);
}

/** Kompakte, vergleichbare Zusammenfassung einer Folie zum Archivieren einer Sitzung. */
export function sessionSummary(slide) {
  const r = computeResults(slide) || {};
  const base = { type: slide.type, question: slide.question || '', voters: r.voters || 0 };
  switch (slide.type) {
    case 'choice':
    case 'quiz':
      return { ...base, options: (slide.options || []).slice(), counts: r.counts || [] };
    case 'points':
      return { ...base, options: (slide.options || []).slice(), totals: r.totals || [] };
    case 'ranking':
      return { ...base, options: (slide.options || []).slice(), scores: (r.items || []).map((it) => ({ index: it.index, score: it.score })) };
    case 'scale':
      return { ...base, avg: r.avg || 0, min: slide.min, max: slide.max };
    case 'wordcloud':
      return { ...base, words: (r.words || []).slice(0, 10) };
    default: // open, qa, info
      return base;
  }
}

/** Aktuelle Ergebnisse als Sitzung archivieren und Antworten für einen neuen Durchlauf leeren. */
export function archiveSession(pres, label, now) {
  const results = {};
  for (const s of pres.slides || []) results[s.id] = sessionSummary(s);
  pres.sessions = pres.sessions || [];
  pres.sessions.push({ ts: now || Date.now(), label: String(label || '').slice(0, 60), results });
  if (pres.sessions.length > 20) pres.sessions = pres.sessions.slice(-20); // Wachstum begrenzen
  for (const s of pres.slides || []) s.answers = {};
  pres.names = {};
}

/** Ausstehende (noch nicht freigegebene) Q&A-Fragen einer moderierten Folie, älteste zuerst. */
export function pendingQuestions(slide) {
  if (!slide || slide.type !== 'qa') return [];
  const out = [];
  for (const list of Object.values(slide.answers || {})) {
    if (!Array.isArray(list)) continue;
    for (const q of list) {
      if (q && q.text && q.approved === false) out.push({ id: q.id, text: q.text, ts: q.ts || 0, name: q.name || '' });
    }
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/** Q&A-Frage freigeben ('approve') oder entfernen ('reject'). Gibt true bei Erfolg. */
export function moderateQuestion(slide, itemId, action) {
  if (!slide || slide.type !== 'qa') return false;
  for (const [pid, list] of Object.entries(slide.answers || {})) {
    if (!Array.isArray(list)) continue;
    const idx = list.findIndex((q) => q && q.id === itemId);
    if (idx === -1) continue;
    if (action === 'approve') { list[idx].approved = true; return true; }
    if (action === 'reject') {
      list.splice(idx, 1);
      if (!list.length) delete slide.answers[pid];
      return true;
    }
    return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// XLSX-Export ohne Abhängigkeiten (ein .xlsx ist ein ZIP mit XML-Dateien).
// Formatierung nach dem Corporate-Designsystem §7 (siehe styles.xml unten).
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP aus {name, data}-Einträgen bauen (STORE, UTF-8-Dateinamen). */
function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

function xmlEsc(s) {
  return String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

const XF = {
  bodyText: 0, bodyNum: 1, bodyTextAlt: 2, bodyNumAlt: 3,
  headText: 4, headNum: 5, title: 6, subtitle: 7,
  totalText: 8, totalNum: 9,
  footText: 10, footNum: 11, footTextAlt: 12, footNumAlt: 13,
};

function cellXml(ref, v, s) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `<c r="${ref}" s="${s}" t="n"><v>${v}</v></c>`;
  }
  if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${s}"/>`;
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
}

function sheetXml(sheet) {
  const pre = sheet.pre || [];
  const headers = sheet.headers || [];
  const data = sheet.data || [];
  const totals = sheet.totals || [];
  const numCols = Math.max(headers.length, ...data.map((r) => r.length), ...totals.map((r) => r.length), ...pre.map((r) => r.length), 1);

  const isNumCol = [];
  for (let c = 0; c < numCols; c++) {
    isNumCol[c] = data.length > 0 && data.every((r) => r[c] === undefined || r[c] === '' || typeof r[c] === 'number');
  }

  const xmlRows = [];
  let r = 0;
  pre.forEach((row, i) => {
    r++;
    const s = i === 0 ? XF.title : XF.subtitle;
    xmlRows.push(`<row r="${r}">${row.map((v, c) => cellXml(colName(c) + r, v, s)).join('')}</row>`);
  });
  if (pre.length) { r++; xmlRows.push(`<row r="${r}"/>`); }

  const headerRow = headers.length ? r + 1 : 0;
  if (headers.length) {
    r++;
    xmlRows.push(`<row r="${r}" ht="20" customHeight="1">${headers.map((v, c) =>
      cellXml(colName(c) + r, v, isNumCol[c] ? XF.headNum : XF.headText)).join('')}</row>`);
  }
  data.forEach((row, i) => {
    r++;
    const alt = i % 2 === 1;
    const foot = i === data.length - 1;
    xmlRows.push(`<row r="${r}">${Array.from({ length: numCols }, (_, c) => {
      const num = typeof row[c] === 'number';
      const s = foot
        ? (num ? (alt ? XF.footNumAlt : XF.footNum) : (alt ? XF.footTextAlt : XF.footText))
        : (num ? (alt ? XF.bodyNumAlt : XF.bodyNum) : (alt ? XF.bodyTextAlt : XF.bodyText));
      return cellXml(colName(c) + r, row[c], s);
    }).join('')}</row>`);
  });
  totals.forEach((row) => {
    r++;
    xmlRows.push(`<row r="${r}">${Array.from({ length: numCols }, (_, c) =>
      cellXml(colName(c) + r, row[c], typeof row[c] === 'number' ? XF.totalNum : XF.totalText)).join('')}</row>`);
  });

  const widths = [];
  for (let c = 0; c < numCols; c++) {
    let w = 10;
    for (const row of [headers, ...data.slice(0, 100), ...totals]) {
      const v = Array.isArray(row) ? row[c] : undefined;
      if (v !== undefined && v !== null) w = Math.max(w, Math.min(50, String(v).length * 1.1 + 2));
    }
    widths.push(`<col min="${c + 1}" max="${c + 1}" width="${Math.round(w * 10) / 10}" customWidth="1"/>`);
  }

  const lastColRef = colName(numCols - 1);
  const freeze = headerRow
    ? `<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>`;
  const filter = headerRow ? `<autoFilter ref="A${headerRow}:${lastColRef}${headerRow}"/>` : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    freeze +
    `<cols>${widths.join('')}</cols>` +
    `<sheetData>${xmlRows.join('')}</sheetData>` +
    filter +
    `</worksheet>`;
}

function colName(i) {
  let s = '';
  i++;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

function buildXlsx(sheets) {
  const safeNames = [];
  sheets.forEach((s, i) => {
    let n = String(s.name || `Blatt${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Blatt${i + 1}`;
    while (safeNames.includes(n)) n = n.slice(0, 28) + ' ' + (i + 1);
    safeNames.push(n);
  });
  const files = [];
  files.push({
    name: '[Content_Types].xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      `</Types>`,
  });
  files.push({
    name: '_rels/.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  });
  files.push({
    name: 'xl/workbook.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>` +
      sheets.map((_, i) => `<sheet name="${xmlEsc(safeNames[i])}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      `</sheets></workbook>`,
  });
  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  });
  const align = (h) => `<alignment horizontal="${h}" vertical="top" wrapText="1"/>`;
  const xf = (fontId, fillId, borderId, h) =>
    `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" ` +
    `applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align(h)}</xf>`;
  files.push({
    name: 'xl/styles.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="5">` +
      `<font><sz val="10"/><name val="Arial"/><color rgb="FF000000"/></font>` +
      `<font><b/><sz val="9"/><name val="Arial"/><color rgb="FF000000"/></font>` +
      `<font><b/><sz val="10"/><name val="Arial"/><color rgb="FF000000"/></font>` +
      `<font><b/><sz val="12"/><name val="Arial"/><color rgb="FF000000"/></font>` +
      `<font><sz val="9"/><name val="Arial"/><color rgb="FF7A7870"/></font>` +
      `</fonts>` +
      `<fills count="3">` +
      `<fill><patternFill patternType="none"/></fill>` +
      `<fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFECEBE4"/><bgColor rgb="FFECEBE4"/></patternFill></fill>` +
      `</fills>` +
      `<borders count="4">` +
      `<border/>` +
      `<border><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom></border>` +
      `<border><bottom style="thin"><color rgb="FF000000"/></bottom></border>` +
      `<border><top style="medium"><color rgb="FF000000"/></top><bottom style="medium"><color rgb="FF000000"/></bottom></border>` +
      `</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="14">` +
      xf(0, 0, 0, 'left') + xf(0, 0, 0, 'right') + xf(0, 2, 0, 'left') + xf(0, 2, 0, 'right') +
      xf(1, 0, 1, 'left') + xf(1, 0, 1, 'right') + xf(3, 0, 0, 'left') + xf(4, 0, 0, 'left') +
      xf(2, 0, 3, 'left') + xf(2, 0, 3, 'right') + xf(0, 0, 2, 'left') + xf(0, 0, 2, 'right') +
      xf(0, 2, 2, 'left') + xf(0, 2, 2, 'right') +
      `</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`,
  });
  sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }));
  return buildZip(files);
}

function formatTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ergebnisse einer Präsentation als Excel-Arbeitsmappe (ein Blatt pro Folie). */
export function exportWorkbook(pres) {
  const sheets = [];
  const overviewData = [];
  pres.slides.forEach((slide, i) => {
    const results = computeResults(slide, !!pres.collectNames);
    const label = { choice: 'Multiple Choice', wordcloud: 'Wortwolke', open: 'Offene Frage', scale: 'Skala', ranking: 'Ranking', points: '100-Punkte-Verteilung', quiz: 'Quiz', qa: 'Q&A', info: 'Infofolie' }[slide.type] || slide.type;
    overviewData.push([i + 1, label, slide.question || '', results && results.voters !== undefined ? results.voters : '']);

    let sheet = null;
    switch (slide.type) {
      case 'choice': {
        const total = results.counts.reduce((a, b) => a + b, 0);
        sheet = {
          headers: ['Option', 'Stimmen', 'Anteil'],
          data: (slide.options || []).map((opt, j) => {
            const n = results.counts[j] || 0;
            return [opt, n, total ? `${Math.round((n / total) * 1000) / 10} %` : '–'];
          }),
          totals: [['Teilnehmende', results.voters, '']],
        };
        break;
      }
      case 'wordcloud':
        sheet = {
          headers: ['Begriff', 'Anzahl'],
          data: results.words.map((w) => [w.text, w.count]),
          totals: [['Teilnehmende', results.voters]],
        };
        break;
      case 'open':
        sheet = pres.collectNames
          ? {
            headers: ['Name', 'Antwort', 'Zeitpunkt'],
            data: [...results.texts].reverse().map((t) => [t.name || '—', t.text, formatTs(t.ts)]),
            totals: [['Antworten', results.texts.length, ''], ...(results.texts.length >= 200 ? [['Hinweis: Export auf 200 Antworten begrenzt — es können weitere existieren.']] : [])],
          }
          : {
            headers: ['Antwort', 'Zeitpunkt'],
            data: [...results.texts].reverse().map((t) => [t.text, formatTs(t.ts)]),
            totals: [['Antworten', results.texts.length], ...(results.texts.length >= 200 ? [['Hinweis: Export auf 200 Antworten begrenzt — es können weitere existieren.']] : [])],
          };
        break;
      case 'scale': {
        const data = [];
        for (let v = slide.min; v <= slide.max; v++) data.push([v, results.dist[v] || 0]);
        sheet = {
          headers: ['Wert', 'Anzahl'],
          data,
          totals: [
            ['Durchschnitt', results.voters ? Math.round(results.avg * 100) / 100 : '–'],
            ['Bewertungen', results.voters],
          ],
        };
        break;
      }
      case 'points': {
        const grand = results.totals.reduce((a, b) => a + b, 0);
        sheet = {
          headers: ['Option', 'Punkte', 'Ø pro Person', 'Anteil'],
          data: (slide.options || []).map((opt, j) => {
            const p = results.totals[j] || 0;
            return [opt, p, results.voters ? Math.round((p / results.voters) * 10) / 10 : 0, grand ? `${Math.round((p / grand) * 1000) / 10} %` : '–'];
          }),
          totals: [['Teilnehmende', results.voters, '', '']],
        };
        break;
      }
      case 'ranking':
        sheet = {
          headers: ['Rang', 'Option', 'Ø-Position', 'Borda-Punkte'],
          data: results.items.map((it, j) => [j + 1, (slide.options || [])[it.index] || '', results.voters ? Math.round(it.avgRank * 100) / 100 : '–', it.score]),
          totals: [['Teilnehmende', results.voters, '', '']],
        };
        break;
      case 'quiz': {
        const total = results.counts.reduce((a, b) => a + b, 0);
        sheet = {
          headers: ['Option', 'Stimmen', 'Anteil', 'Richtig'],
          data: (slide.options || []).map((opt, j) => {
            const n = results.counts[j] || 0;
            return [opt, n, total ? `${Math.round((n / total) * 1000) / 10} %` : '–', j === results.correct ? '✓' : ''];
          }),
          totals: [['Teilnehmende', results.voters, '', '']],
        };
        break;
      }
      case 'qa':
        sheet = pres.collectNames
          ? {
            headers: ['Name', 'Frage', 'Stimmen', 'Zeitpunkt'],
            data: results.questions.map((q) => [q.name || '—', q.text, q.votes, formatTs(q.ts)]),
            totals: [['Fragen', results.questions.length, '', ''], ...(results.questions.length >= 100 ? [['Hinweis: Export auf 100 Fragen begrenzt — es können weitere existieren.']] : [])],
          }
          : {
            headers: ['Frage', 'Stimmen', 'Zeitpunkt'],
            data: results.questions.map((q) => [q.text, q.votes, formatTs(q.ts)]),
            totals: [['Fragen', results.questions.length], ...(results.questions.length >= 100 ? [['Hinweis: Export auf 100 Fragen begrenzt — es können weitere existieren.']] : [])],
          };
        break;
    }
    if (sheet) {
      sheet.name = `${i + 1} ${slide.question || label}`;
      sheet.pre = [[slide.question || label], [label]];
      sheets.push(sheet);
    }
  });
  // Rangliste als eigenes Blatt, falls es Quiz-Folien gibt
  if ((pres.slides || []).some((s) => s.type === 'quiz')) {
    const board = leaderboard(pres, 1000);
    sheets.push({
      name: 'Rangliste',
      pre: [['Rangliste'], ['Punkte über alle Quiz-Folien']],
      headers: ['Rang', 'Name', 'Punkte', 'Richtig'],
      data: board.map((r, j) => [j + 1, r.name, r.points, r.correct]),
      totals: [['Teilnehmende', board.length, '', '']],
    });
  }
  sheets.unshift({
    name: 'Übersicht',
    pre: [[pres.title], [`Code ${pres.code} — exportiert ${formatTs(Date.now())}`]],
    headers: ['Folie', 'Typ', 'Frage', 'Teilnehmende'],
    data: overviewData,
    totals: [],
  });
  return buildXlsx(sheets);
}
