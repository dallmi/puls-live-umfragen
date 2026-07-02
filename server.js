/**
 * PULS — Live-Umfragen
 *
 * Zero-Dependency Node.js Server: nur Built-ins (http, fs, crypto, path).
 * Echtzeit über Server-Sent Events (SSE) — funktioniert hinter Corporate-Proxies.
 * Persistenz als JSON-Datei (./data/store.json).
 *
 * Start:  node server.js  [PORT=3000]
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const MAX_BODY = 100 * 1024; // 100 KB
const MAX_TEXT_LEN = 500;
const MAX_OPEN_ANSWERS_PER_USER = 5;

// ---------------------------------------------------------------------------
// Store & Persistenz
// ---------------------------------------------------------------------------

/** @type {{ presentations: Record<string, any> }} */
let store = { presentations: {} };

function loadStore() {
  try {
    store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (!store.presentations) store = { presentations: {} };
  } catch {
    store = { presentations: {} };
  }
}

let saveTimer = null;
function saveStore() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = STORE_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(store));
      fs.renameSync(tmp, STORE_FILE);
    } catch (err) {
      console.error('Persistenz fehlgeschlagen:', err.message);
    }
  }, 400);
}

loadStore();

// ---------------------------------------------------------------------------
// Domänenlogik
// ---------------------------------------------------------------------------

const SLIDE_TYPES = ['choice', 'wordcloud', 'open', 'scale', 'qa', 'info'];

function newJoinCode() {
  for (let i = 0; i < 200; i++) {
    const code = String(crypto.randomInt(100000, 1000000));
    const taken = Object.values(store.presentations).some((p) => p.code === code);
    if (!taken) return code;
  }
  throw new Error('Kein freier Code verfügbar');
}

function createPresentation(title) {
  const id = crypto.randomUUID();
  const pres = {
    id,
    code: newJoinCode(),
    adminToken: crypto.randomBytes(24).toString('hex'),
    title: clampText(title, 120) || 'Unbenannte Präsentation',
    slides: [],
    activeIndex: 0,
    votingLocked: false,
    resultsHidden: false,
    createdAt: Date.now(),
  };
  store.presentations[id] = pres;
  saveStore();
  return pres;
}

function clampText(v, max = MAX_TEXT_LEN) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function sanitizeSlide(input) {
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
    slide.minLabel = clampText(input.minLabel, 40) || 'trifft nicht zu';
    slide.maxLabel = clampText(input.maxLabel, 40) || 'trifft voll zu';
  }
  if (type === 'info') {
    slide.text = clampText(input.text, 2000);
  }
  return slide;
}

/** Öffentliche Sicht auf eine Folie (ohne Antworten-Rohdaten). */
function publicSlide(slide) {
  if (!slide) return null;
  const { answers, ...rest } = slide;
  return rest;
}

/** Ergebnisse einer Folie berechnen. */
function computeResults(slide) {
  if (!slide) return null;
  const entries = Object.entries(slide.answers || {}); // [participantId, value]
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
          if (item && item.text) texts.push({ text: item.text, ts: item.ts || 0 });
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
    case 'qa': {
      const questions = [];
      for (const [, list] of entries) {
        if (!Array.isArray(list)) continue;
        for (const q of list) {
          if (q && q.text) questions.push({ id: q.id, text: q.text, votes: Object.keys(q.upvotes || {}).length, ts: q.ts || 0 });
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

// ---------------------------------------------------------------------------
// SSE — Echtzeit-Verteilung
// ---------------------------------------------------------------------------

/** presentationId -> Set<{res, role}> */
const streams = new Map();

function addStream(presId, res, role) {
  if (!streams.has(presId)) streams.set(presId, new Set());
  const client = { res, role };
  streams.get(presId).add(client);
  return client;
}

function audienceCount(presId) {
  const set = streams.get(presId);
  if (!set) return 0;
  let n = 0;
  for (const c of set) if (c.role === 'audience') n++;
  return n;
}

/** Aktuellen öffentlichen Zustand an alle Clients einer Präsentation senden. */
function broadcast(presId) {
  const set = streams.get(presId);
  if (!set || !set.size) return;
  const payload = JSON.stringify(snapshot(presId));
  for (const { res } of set) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {
      /* Verbindung tot — wird beim close-Event entfernt */
    }
  }
}

function snapshot(presId) {
  const pres = store.presentations[presId];
  if (!pres) return { error: 'not_found' };
  const slide = pres.slides[pres.activeIndex] || null;
  return {
    title: pres.title,
    code: pres.code,
    slideCount: pres.slides.length,
    activeIndex: pres.activeIndex,
    votingLocked: pres.votingLocked,
    resultsHidden: pres.resultsHidden,
    slide: publicSlide(slide),
    results: pres.resultsHidden ? null : computeResults(slide),
    audience: audienceCount(presId),
  };
}

// Heartbeat, damit Proxies die Verbindungen nicht kappen
setInterval(() => {
  for (const set of streams.values()) {
    for (const { res } of set) {
      try {
        res.write(': ping\n\n');
      } catch { /* ignorieren */ }
    }
  }
}, 25000);

// ---------------------------------------------------------------------------
// HTTP-Helfer
// ---------------------------------------------------------------------------

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function requireAdmin(pres, req, url) {
  const token = req.headers['x-admin-token'] || url.searchParams.get('token');
  return pres && token && token === pres.adminToken;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(res, urlPath) {
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const abs = path.join(PUBLIC_DIR, filePath);
  if (!abs.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(abs, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Nicht gefunden');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  try {
    if (p.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }
    // Kurz-URL: /123456 → Abstimmungsseite
    if (/^\/\d{6}$/.test(p)) {
      res.writeHead(302, { Location: `/vote.html?code=${p.slice(1)}` });
      return res.end();
    }
    return serveStatic(res, p);
  } catch (err) {
    const msg = err.message === 'invalid_json' || err.message === 'body_too_large' ? err.message : 'server_error';
    if (msg === 'server_error') console.error(err);
    return sendJSON(res, msg === 'server_error' ? 500 : 400, { error: msg });
  }
});

/** Erreichbare LAN-Adressen dieses Rechners (für QR-Code/Beitritt per Handy). */
function lanUrls() {
  const urls = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${PORT}`);
    }
  }
  return urls;
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  // GET /api/server-info — LAN-Adressen für den Beitritt per Handy
  if (p === '/api/server-info' && method === 'GET') {
    return sendJSON(res, 200, { port: PORT, urls: lanUrls() });
  }

  // POST /api/presentations — neue Präsentation
  if (p === '/api/presentations' && method === 'POST') {
    const body = await readBody(req);
    const pres = createPresentation(body.title);
    return sendJSON(res, 201, { id: pres.id, code: pres.code, adminToken: pres.adminToken, title: pres.title });
  }

  // GET /api/join/:code — Präsentation per Code finden (Publikum)
  let m = p.match(/^\/api\/join\/(\d{6})$/);
  if (m && method === 'GET') {
    const pres = Object.values(store.presentations).find((x) => x.code === m[1]);
    if (!pres) return sendJSON(res, 404, { error: 'code_unknown' });
    return sendJSON(res, 200, { id: pres.id, ...snapshot(pres.id) });
  }

  // Alles Weitere: /api/presentations/:id/...
  m = p.match(/^\/api\/presentations\/([0-9a-f-]{36})(\/.*)?$/);
  if (!m) return sendJSON(res, 404, { error: 'not_found' });
  const pres = store.presentations[m[1]];
  if (!pres) return sendJSON(res, 404, { error: 'not_found' });
  const sub = m[2] || '';

  // GET /api/presentations/:id/stream — SSE (Publikum & Presenter)
  if (sub === '/stream' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const role = url.searchParams.get('role') === 'audience' ? 'audience' : 'presenter';
    const client = addStream(pres.id, res, role);
    res.write(`data: ${JSON.stringify(snapshot(pres.id))}\n\n`);
    if (role === 'audience') broadcast(pres.id); // Teilnehmerzähler aktualisieren
    req.on('close', () => {
      streams.get(pres.id)?.delete(client);
      broadcast(pres.id);
    });
    return;
  }

  // GET /api/presentations/:id — Vollansicht (Admin) oder öffentlicher Snapshot
  if (sub === '' && method === 'GET') {
    if (requireAdmin(pres, req, url)) {
      return sendJSON(res, 200, {
        id: pres.id,
        code: pres.code,
        title: pres.title,
        slides: pres.slides.map((s) => ({ ...publicSlide(s), results: computeResults(s) })),
        activeIndex: pres.activeIndex,
        votingLocked: pres.votingLocked,
        resultsHidden: pres.resultsHidden,
      });
    }
    return sendJSON(res, 200, snapshot(pres.id));
  }

  // POST /api/presentations/:id/answers — Antwort abgeben (Publikum)
  if (sub === '/answers' && method === 'POST') {
    const body = await readBody(req);
    const slide = pres.slides.find((s) => s.id === body.slideId);
    if (!slide) return sendJSON(res, 404, { error: 'slide_unknown' });
    if (pres.votingLocked) return sendJSON(res, 423, { error: 'voting_locked' });
    const pid = clampText(String(body.participantId || ''), 64);
    if (!pid) return sendJSON(res, 400, { error: 'participant_missing' });

    const ok = applyAnswer(slide, pid, body);
    if (!ok.ok) return sendJSON(res, 400, { error: ok.error });
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true });
  }

  // POST /api/presentations/:id/upvote — Q&A-Frage hochwählen
  if (sub === '/upvote' && method === 'POST') {
    const body = await readBody(req);
    const slide = pres.slides.find((s) => s.id === body.slideId);
    if (!slide || slide.type !== 'qa') return sendJSON(res, 404, { error: 'slide_unknown' });
    const pid = clampText(String(body.participantId || ''), 64);
    if (!pid) return sendJSON(res, 400, { error: 'participant_missing' });
    let found = false;
    for (const list of Object.values(slide.answers)) {
      for (const q of list) {
        if (q.id === body.questionId) {
          q.upvotes = q.upvotes || {};
          if (q.upvotes[pid]) delete q.upvotes[pid];
          else q.upvotes[pid] = 1;
          found = true;
        }
      }
    }
    if (!found) return sendJSON(res, 404, { error: 'question_unknown' });
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true });
  }

  // Ab hier: nur Admin
  if (!requireAdmin(pres, req, url)) return sendJSON(res, 403, { error: 'forbidden' });

  // PUT /api/presentations/:id — Titel ändern
  if (sub === '' && method === 'PUT') {
    const body = await readBody(req);
    if (body.title !== undefined) pres.title = clampText(body.title, 120) || pres.title;
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true });
  }

  // DELETE /api/presentations/:id
  if (sub === '' && method === 'DELETE') {
    delete store.presentations[pres.id];
    saveStore();
    return sendJSON(res, 200, { ok: true });
  }

  // PUT /api/presentations/:id/slides — komplette Folienliste ersetzen (Editor speichert)
  if (sub === '/slides' && method === 'PUT') {
    const body = await readBody(req);
    if (!Array.isArray(body.slides)) return sendJSON(res, 400, { error: 'slides_missing' });
    const existing = new Map(pres.slides.map((s) => [s.id, s]));
    pres.slides = body.slides.slice(0, 50).map((input) => {
      const slide = sanitizeSlide(input);
      // Vorhandene Antworten behalten, wenn die Folie schon existierte
      const prev = existing.get(slide.id);
      slide.answers = prev ? prev.answers : {};
      return slide;
    });
    pres.activeIndex = Math.min(pres.activeIndex, Math.max(0, pres.slides.length - 1));
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true, slides: pres.slides.map(publicSlide) });
  }

  // POST /api/presentations/:id/state — Steuerung (aktive Folie, Sperren, Ergebnisse)
  if (sub === '/state' && method === 'POST') {
    const body = await readBody(req);
    if (Number.isInteger(body.activeIndex)) {
      pres.activeIndex = Math.min(Math.max(0, body.activeIndex), Math.max(0, pres.slides.length - 1));
    }
    if (typeof body.votingLocked === 'boolean') pres.votingLocked = body.votingLocked;
    if (typeof body.resultsHidden === 'boolean') pres.resultsHidden = body.resultsHidden;
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true });
  }

  // POST /api/presentations/:id/reset — Antworten einer Folie/aller Folien löschen
  if (sub === '/reset' && method === 'POST') {
    const body = await readBody(req);
    if (body.slideId) {
      const slide = pres.slides.find((s) => s.id === body.slideId);
      if (slide) slide.answers = {};
    } else {
      for (const slide of pres.slides) slide.answers = {};
    }
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 404, { error: 'not_found' });
}

/** Antwort eines Teilnehmers auf eine Folie anwenden. */
function applyAnswer(slide, pid, body) {
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
      list.push({ text, ts: Date.now() });
      slide.answers[pid] = list;
      return { ok: true };
    }
    case 'scale': {
      const num = Number(body.value);
      if (!Number.isFinite(num) || num < slide.min || num > slide.max) return { ok: false, error: 'out_of_range' };
      slide.answers[pid] = num;
      return { ok: true };
    }
    case 'qa': {
      const text = clampText(String(body.value || ''), MAX_TEXT_LEN);
      if (!text) return { ok: false, error: 'empty' };
      const list = slide.answers[pid] || [];
      if (list.length >= MAX_OPEN_ANSWERS_PER_USER) return { ok: false, error: 'limit_reached' };
      list.push({ id: crypto.randomUUID(), text, ts: Date.now(), upvotes: {} });
      slide.answers[pid] = list;
      return { ok: true };
    }
    default:
      return { ok: false, error: 'not_votable' };
  }
}

// ---------------------------------------------------------------------------

server.listen(PORT, HOST, () => {
  console.log(`PULS läuft auf http://localhost:${PORT}`);
  console.log(`Publikum tritt bei über: http://<diese-maschine>:${PORT}`);
});
