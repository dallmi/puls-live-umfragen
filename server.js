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
import {
  clampText, sanitizeSlide, answersRemainValid, publicSlide, publicQuizResult,
  computeResults, applyAnswer, exportWorkbook, pendingQuestions, moderateQuestion,
  leaderboard, archiveSession, issueParticipant, verifyParticipant,
  MAX_TEXT_LEN, MAX_OPEN_ANSWERS_PER_USER, MAX_PARTICIPANTS_PER_SLIDE, SLIDE_TYPES,
} from './lib/domain.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const MAX_BODY = 100 * 1024; // 100 KB

// Ressourcengrenzen — verhindern, dass anonyme Nutzung Speicher/Platte des
// (mit anderen Projekten geteilten) Servers erschöpft.
const MAX_PRESENTATIONS = 2000;              // globale Obergrenze; älteste inaktive werden verdrängt
const PRESENTATION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 Tage ohne Aktivität → Aufräumen
const CREATE_RATE = { windowMs: 60 * 60 * 1000, max: 30 }; // Neuanlage: 30 pro Stunde je IP
// Öffentliche Endpunkte (join/answers/upvote/react/identify): grobes Limit je IP
// und Endpunkt. Bremst Code-Brute-Force und Skript-Fluten, bleibt aber großzügig,
// weil ganze Publika hinter EINER NAT-IP hängen können. Polling-Snapshot bleibt frei.
const PUBLIC_RATE = { windowMs: 10 * 1000, max: 60 };

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
  // Stabiles Secret für signierte Teilnehmer-Tokens (H23), einmalig erzeugt & persistiert.
  if (!store.secret) { store.secret = crypto.randomBytes(32).toString('hex'); saveStore(); }
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
// Rate-Limiting & Client-IP (der Server läuft hinter nginx, das X-Forwarded-For setzt)
// ---------------------------------------------------------------------------

// Client-IP fürs Rate-Limiting. ACHTUNG beim Self-Hosting: Der erste x-forwarded-for-
// Eintrag ist vom Client fälschbar, wenn KEIN vertrauenswürdiger Proxy davor sitzt.
// Hinter nginx sollte nginx x-forwarded-for selbst setzen/überschreiben; je nach
// Setup ist dann der letzte Eintrag bzw. x-real-ip die vertrauenswürdige Quelle.
// (Die öffentliche Vercel-Instanz nutzt api/index.js, wo die Plattform Spoofing
// bereits verhindert.)
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/** Einfacher In-Memory-Sliding-Window-Zähler je Schlüssel. */
const rateBuckets = new Map();
function rateLimit(key, windowMs, max) {
  const now = Date.now();
  let hits = rateBuckets.get(key);
  if (!hits) { hits = []; rateBuckets.set(key, hits); }
  // abgelaufene Einträge entfernen
  while (hits.length && hits[0] <= now - windowMs) hits.shift();
  if (hits.length >= max) return false;
  hits.push(now);
  return true;
}
// Speicher des Rate-Limiters periodisch bereinigen
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of rateBuckets) {
    while (hits.length && hits[0] <= now - CREATE_RATE.windowMs) hits.shift();
    if (!hits.length) rateBuckets.delete(key);
  }
}, 10 * 60 * 1000).unref?.();

/** Alte, inaktive Präsentationen entfernen (TTL) und globale Obergrenze wahren. */
function prunePresentations() {
  const now = Date.now();
  const entries = Object.values(store.presentations);
  let removed = false;
  for (const p of entries) {
    const last = p.lastActivity || p.createdAt || 0;
    if (now - last > PRESENTATION_TTL_MS) { delete store.presentations[p.id]; removed = true; }
  }
  // Falls trotzdem über der Grenze: älteste (nach lastActivity) verdrängen
  const remaining = Object.values(store.presentations);
  if (remaining.length > MAX_PRESENTATIONS) {
    remaining
      .sort((a, b) => (a.lastActivity || a.createdAt || 0) - (b.lastActivity || b.createdAt || 0))
      .slice(0, remaining.length - MAX_PRESENTATIONS)
      .forEach((p) => { delete store.presentations[p.id]; removed = true; });
  }
  if (removed) saveStore();
}
setInterval(prunePresentations, 60 * 60 * 1000).unref?.();

function touch(pres) {
  pres.lastActivity = Date.now();
}

// ---------------------------------------------------------------------------
// Domänenlogik
// ---------------------------------------------------------------------------

const REACTIONS = ['👍', '❤️', '👏', '😂', '😮', '🎉']; // erlaubte Emoji-Reaktionen
const REACTION_WINDOW_MS = 6000; // Reaktionen sind ephemer: nur die letzten Sekunden werden gezeigt
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_BYTES = 90 * 1024; // Data-URI-Länge (passt in MAX_BODY 100 KB)

/** Öffentliche Branding-Info (ohne die Logo-Rohdaten). */
function brandOf(pres) {
  return {
    color: HEX_COLOR.test(pres.brandColor || '') ? pres.brandColor : null,
    logo: !!pres.brandLogo,
  };
}

function newJoinCode() {
  for (let i = 0; i < 200; i++) {
    const code = String(crypto.randomInt(100000, 1000000));
    const taken = Object.values(store.presentations).some((p) => p.code === code);
    if (!taken) return code;
  }
  throw new Error('Kein freier Code verfügbar');
}

function createPresentation(title) {
  // Vor dem Anlegen aufräumen, damit die Obergrenze eingehalten wird
  if (Object.keys(store.presentations).length >= MAX_PRESENTATIONS) prunePresentations();
  const id = crypto.randomUUID();
  const now = Date.now();
  const pres = {
    id,
    code: newJoinCode(),
    adminToken: crypto.randomBytes(24).toString('hex'),
    title: clampText(title, 120) || 'Unbenannte Präsentation',
    slides: [],
    activeIndex: 0,
    votingLocked: false,
    resultsHidden: false,
    collectNames: false,
    selfPaced: false,
    names: {},
    brandColor: null,
    brandLogo: null,
    createdAt: now,
    lastActivity: now,
  };
  store.presentations[id] = pres;
  saveStore();
  return pres;
}

/** Ergebnis der aktiven Folie für den öffentlichen Snapshot (Quiz: ohne Antwortschlüssel). */
function publicResultFor(slide, resultsHidden, showNames) {
  if (!slide) return null;
  const raw = resultsHidden ? null : computeResults(slide, showNames);
  return (raw && slide.type === 'quiz') ? publicQuizResult(raw, true) : raw;
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
  const selfPaced = !!pres.selfPaced;
  const snap = {
    title: pres.title,
    code: pres.code,
    slideCount: pres.slides.length,
    activeIndex: pres.activeIndex,
    votingLocked: pres.votingLocked,
    resultsHidden: pres.resultsHidden,
    collectNames: !!pres.collectNames,
    selfPaced,
    brand: brandOf(pres),
    slide: publicSlide(slide),
    results: publicResultFor(slide, pres.resultsHidden, !!pres.collectNames),
    audience: audienceCount(presId),
    reactions: (pres.reactions || []).filter((r) => r.ts > Date.now() - REACTION_WINDOW_MS),
  };
  // Selbststeuerung: Teilnehmende blättern selbst → sie brauchen alle Folien (+ Ergebnisse).
  if (selfPaced) {
    snap.slides = pres.slides.map(publicSlide);
    snap.resultsList = pres.resultsHidden ? null : pres.slides.map((s) =>
      s.type === 'quiz' ? publicQuizResult(computeResults(s, !!pres.collectNames), false) // Self-paced: keine Quiz-Verteilung
        : computeResults(s, !!pres.collectNames));
  }
  // Rangliste erscheint zusammen mit den (aufgelösten) Ergebnissen.
  if (!pres.resultsHidden && pres.slides.some((s) => s.type === 'quiz')) {
    snap.leaderboard = leaderboard(pres, 10);
  }
  return snap;
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

/** Konstant-zeitiger Vergleich, um Timing-Seitenkanäle zu vermeiden. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function requireAdmin(pres, req, url) {
  const token = req.headers['x-admin-token'] || url.searchParams.get('token');
  return !!(pres && token && safeEqual(token, pres.adminToken));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(res, urlPath) {
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const abs = path.join(PUBLIC_DIR, filePath);
  // Grenze mit Trennzeichen prüfen, damit Geschwister-Verzeichnisse mit gleichem
  // Präfix (z. B. /opt/puls/public-x) nicht erreichbar sind.
  if (abs !== PUBLIC_DIR && !abs.startsWith(PUBLIC_DIR + path.sep)) {
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
  const ips = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue; // Link-Local (kein echtes Netz)
      ips.push(a.address);
    }
  }
  // Reihenfolge so, dass die wahrscheinlich echte WLAN-/LAN-Adresse zuerst kommt
  // (der QR-Code nutzt die erste). Docker-Default-Bridges und VPN nach hinten (H2).
  const dockerish = (ip) => /^172\.1[78]\./.test(ip); // 172.17/172.18 = Docker-Default
  const rank = (ip) =>
    ip.startsWith('192.168.') ? 0                        // typisches Heim-/Büro-WLAN
      : /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ? 1    // u.a. Hotspot-Tethering
        : ip.startsWith('10.') ? 2                       // oft VPN/Firmennetz
          : 3;
  ips.sort((a, b) => (dockerish(a) - dockerish(b)) || (rank(a) - rank(b)) || a.localeCompare(b));
  return ips.map((ip) => `http://${ip}:${PORT}`);
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
    if (!rateLimit(`create:${clientIp(req)}`, CREATE_RATE.windowMs, CREATE_RATE.max)) {
      return sendJSON(res, 429, { error: 'rate_limited' });
    }
    const body = await readBody(req);
    const pres = createPresentation(body.title);
    return sendJSON(res, 201, { id: pres.id, code: pres.code, adminToken: pres.adminToken, title: pres.title });
  }

  // GET /api/join/:code — Präsentation per Code finden (Publikum)
  let m = p.match(/^\/api\/join\/(\d{6})$/);
  if (m && method === 'GET') {
    if (!rateLimit(`join:${clientIp(req)}`, PUBLIC_RATE.windowMs, PUBLIC_RATE.max)) return sendJSON(res, 429, { error: 'rate_limited' });
    const pres = Object.values(store.presentations).find((x) => x.code === m[1]);
    if (!pres) return sendJSON(res, 404, { error: 'code_unknown' });
    const jSnap = snapshot(pres.id);
    jSnap.participant = issueParticipant(store.secret); // signierter Teilnehmer-Token (H23)
    return sendJSON(res, 200, { id: pres.id, ...jSnap });
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
        slides: pres.slides.map((s) => ({
          ...publicSlide(s),
          results: computeResults(s, !!pres.collectNames),
          ...(s.type === 'qa' && s.moderated ? { pending: pendingQuestions(s) } : {}),
          ...(s.type === 'quiz' ? { correct: s.correct } : {}), // Admin darf den Antwortschlüssel sehen
        })),
        activeIndex: pres.activeIndex,
        votingLocked: pres.votingLocked,
        resultsHidden: pres.resultsHidden,
        collectNames: !!pres.collectNames,
        selfPaced: !!pres.selfPaced,
        leaderboard: pres.slides.some((s) => s.type === 'quiz') ? leaderboard(pres, 1000) : undefined,
        sessions: pres.sessions || [],
        brand: brandOf(pres),
      });
    }
    return sendJSON(res, 200, snapshot(pres.id));
  }

  // POST /api/presentations/:id/answers — Antwort abgeben (Publikum)
  if (sub === '/answers' && method === 'POST') {
    if (!rateLimit(`answers:${clientIp(req)}`, PUBLIC_RATE.windowMs, PUBLIC_RATE.max)) return sendJSON(res, 429, { error: 'rate_limited' });
    const body = await readBody(req);
    const slide = pres.slides.find((s) => s.id === body.slideId);
    if (!slide) return sendJSON(res, 404, { error: 'slide_unknown' });
    if (pres.votingLocked) return sendJSON(res, 423, { error: 'voting_locked' });
    const pid = verifyParticipant(String(body.participantId || ''), store.secret);
    if (!pid) return sendJSON(res, 400, { error: 'bad_participant' });
    // Obergrenze für verschiedene Teilnehmer je Folie (verhindert unbegrenztes Wachstum)
    if (!(pid in slide.answers) && Object.keys(slide.answers).length >= MAX_PARTICIPANTS_PER_SLIDE) {
      return sendJSON(res, 429, { error: 'slide_full' });
    }

    const name = pres.collectNames ? ((pres.names && pres.names[pid]) || '') : '';
    const ok = applyAnswer(slide, pid, body, name);
    if (!ok.ok) return sendJSON(res, ok.error === 'already_answered' ? 409 : 400, { error: ok.error });
    touch(pres);
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true, ...(ok.quiz ? { quiz: ok.quiz } : {}) });
  }

  // POST /api/presentations/:id/upvote — Q&A-Frage hochwählen
  if (sub === '/upvote' && method === 'POST') {
    if (!rateLimit(`upvote:${clientIp(req)}`, PUBLIC_RATE.windowMs, PUBLIC_RATE.max)) return sendJSON(res, 429, { error: 'rate_limited' });
    const body = await readBody(req);
    const slide = pres.slides.find((s) => s.id === body.slideId);
    if (!slide || slide.type !== 'qa') return sendJSON(res, 404, { error: 'slide_unknown' });
    const pid = verifyParticipant(String(body.participantId || ''), store.secret);
    if (!pid) return sendJSON(res, 400, { error: 'bad_participant' });
    let found = false;
    let capped = false;
    for (const list of Object.values(slide.answers)) {
      if (!Array.isArray(list)) continue; // z. B. von einer früheren Skala-Antwort (Zahl)
      for (const q of list) {
        if (q && q.id === body.questionId) {
          q.upvotes = q.upvotes || {};
          if (q.upvotes[pid]) delete q.upvotes[pid];
          else if (Object.keys(q.upvotes).length >= MAX_PARTICIPANTS_PER_SLIDE) { capped = true; }
          else q.upvotes[pid] = 1;
          found = true;
        }
      }
    }
    if (capped) return sendJSON(res, 429, { error: 'too_many_upvotes' });
    if (!found) return sendJSON(res, 404, { error: 'question_unknown' });
    touch(pres);
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true });
  }

  // POST /api/presentations/:id/react — Emoji-Reaktion (Publikum, ephemer, nicht persistiert)
  if (sub === '/react' && method === 'POST') {
    if (!rateLimit(`react:${clientIp(req)}`, PUBLIC_RATE.windowMs, PUBLIC_RATE.max)) return sendJSON(res, 429, { error: 'rate_limited' });
    const body = await readBody(req);
    const emoji = String(body.emoji || '');
    if (!REACTIONS.includes(emoji)) return sendJSON(res, 400, { error: 'bad_emoji' });
    const now = Date.now();
    pres.reactions = (pres.reactions || []).filter((r) => r.ts > now - REACTION_WINDOW_MS);
    pres.reactions.push({ emoji, ts: now });
    if (pres.reactions.length > 60) pres.reactions = pres.reactions.slice(-60);
    broadcast(pres.id); // absichtlich kein saveStore — Reaktionen sind flüchtig
    return sendJSON(res, 200, { ok: true });
  }

  // GET /api/presentations/:id/logo — Marken-Logo (öffentlich, aus gespeicherter Data-URI)
  if (sub === '/logo' && method === 'GET') {
    const dm = /^data:([\w/+.-]+);base64,(.+)$/.exec(pres.brandLogo || '');
    if (!dm) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': dm[1], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    return res.end(Buffer.from(dm[2], 'base64'));
  }

  // POST /api/presentations/:id/identify — Anzeigenamen setzen (Publikum, nur wenn aktiviert)
  if (sub === '/identify' && method === 'POST') {
    if (!rateLimit(`identify:${clientIp(req)}`, PUBLIC_RATE.windowMs, PUBLIC_RATE.max)) return sendJSON(res, 429, { error: 'rate_limited' });
    const body = await readBody(req);
    if (!pres.collectNames) return sendJSON(res, 409, { error: 'names_disabled' });
    const pid = verifyParticipant(String(body.participantId || ''), store.secret);
    if (!pid) return sendJSON(res, 400, { error: 'bad_participant' });
    const name = clampText(String(body.name || ''), 40);
    if (!name) return sendJSON(res, 400, { error: 'name_missing' });
    if (!pres.names) pres.names = {};
    // Obergrenze für verschiedene Namen (verhindert unbegrenztes Wachstum)
    if (!(pid in pres.names) && Object.keys(pres.names).length >= MAX_PARTICIPANTS_PER_SLIDE) {
      return sendJSON(res, 429, { error: 'full' });
    }
    pres.names[pid] = name;
    touch(pres);
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true, name });
  }

  // Ab hier: nur Admin
  if (!requireAdmin(pres, req, url)) return sendJSON(res, 403, { error: 'forbidden' });

  // POST /rotate-token — neuen Moderations-Token erzeugen, alten sofort ungültig machen (H22)
  if (sub === '/rotate-token' && method === 'POST') {
    pres.adminToken = crypto.randomBytes(24).toString('hex');
    touch(pres);
    saveStore();
    return sendJSON(res, 200, { ok: true, adminToken: pres.adminToken });
  }

  // GET /api/presentations/:id/export.xlsx — Ergebnisse als Excel-Datei
  if (sub === '/export.xlsx' && method === 'GET') {
    const buf = exportWorkbook(pres);
    const fname = `puls-${pres.code}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Cache-Control': 'no-store',
    });
    return res.end(buf);
  }

  // PUT /api/presentations/:id — Titel ändern
  if (sub === '' && method === 'PUT') {
    const body = await readBody(req);
    if (body.title !== undefined) pres.title = clampText(body.title, 120) || pres.title;
    touch(pres);
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true });
  }

  // POST /api/presentations/:id/brand — Akzentfarbe + Logo (Admin)
  if (sub === '/brand' && method === 'POST') {
    const body = await readBody(req);
    if (body.color === null || body.color === '') pres.brandColor = null;
    else if (typeof body.color === 'string' && HEX_COLOR.test(body.color)) pres.brandColor = body.color;
    if (body.logo === null || body.logo === '') pres.brandLogo = null;
    // Nur Raster-Formate — SVG könnte bei direktem /logo-Aufruf Skripte ausführen (XSS).
    else if (typeof body.logo === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,/.test(body.logo)) {
      if (body.logo.length > MAX_LOGO_BYTES) return sendJSON(res, 413, { error: 'logo_too_large' });
      pres.brandLogo = body.logo;
    }
    touch(pres);
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true, brand: brandOf(pres) });
  }

  // GET /api/presentations/:id/moderation — ausstehende Q&A-Fragen der aktiven Folie (Admin)
  if (sub === '/moderation' && method === 'GET') {
    const slide = pres.slides[pres.activeIndex] || null;
    const moderated = !!(slide && slide.type === 'qa' && slide.moderated);
    return sendJSON(res, 200, {
      slideId: slide ? slide.id : null,
      moderated,
      pending: moderated ? pendingQuestions(slide) : [],
    });
  }

  // POST /api/presentations/:id/moderate — Frage freigeben/entfernen (Admin)
  if (sub === '/moderate' && method === 'POST') {
    const body = await readBody(req);
    const slide = pres.slides.find((s) => s.id === body.slideId) || pres.slides[pres.activeIndex];
    if (!slide || slide.type !== 'qa') return sendJSON(res, 404, { error: 'slide_unknown' });
    const action = body.action === 'approve' || body.action === 'reject' ? body.action : null;
    if (!action) return sendJSON(res, 400, { error: 'bad_action' });
    if (!moderateQuestion(slide, String(body.itemId || ''), action)) {
      return sendJSON(res, 404, { error: 'question_unknown' });
    }
    touch(pres);
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true, pending: pendingQuestions(slide) });
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
    const prevActiveId = (pres.slides[pres.activeIndex] || {}).id;
    pres.slides = body.slides.slice(0, 50).map((input) => {
      const slide = sanitizeSlide(input);
      // Vorhandene Antworten (und Quiz-Timer) behalten, wenn die Folie schon existierte
      const prev = existing.get(slide.id);
      // Antworten nur behalten, wenn nach der Bearbeitung noch gültig (sonst
      // zeigten indexbasierte Stimmen auf falsche Optionen → verfälschte Zahlen).
      slide.answers = (prev && answersRemainValid(prev, slide)) ? prev.answers : {};
      if (prev && prev.startedAt && slide.type === 'quiz') slide.startedAt = prev.startedAt;
      return slide;
    });
    // Aktive Folie anhand ihrer ID neu auflösen (nach Umsortieren/Löschen), nicht nur den Index kappen (H24).
    const _ai = prevActiveId ? pres.slides.findIndex((s) => s.id === prevActiveId) : -1;
    pres.activeIndex = _ai >= 0 ? _ai : Math.min(pres.activeIndex, Math.max(0, pres.slides.length - 1));
    touch(pres);
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true, slides: pres.slides.map(publicSlide) });
  }

  // POST /api/presentations/:id/state — Steuerung (aktive Folie, Sperren, Ergebnisse)
  if (sub === '/state' && method === 'POST') {
    const body = await readBody(req);
    if (Number.isInteger(body.activeIndex)) {
      pres.activeIndex = Math.min(Math.max(0, body.activeIndex), Math.max(0, pres.slides.length - 1));
      const act = pres.slides[pres.activeIndex];
      if (act && act.type === 'quiz') {
        act.startedAt = Date.now();   // Quiz-Timer beim Aktivieren starten
        pres.resultsHidden = true;    // Quiz startet verdeckt; Moderator löst mit „Ergebnisse einblenden" auf
      }
    }
    if (typeof body.votingLocked === 'boolean') pres.votingLocked = body.votingLocked;
    if (typeof body.resultsHidden === 'boolean') pres.resultsHidden = body.resultsHidden;
    if (typeof body.collectNames === 'boolean') {
      pres.collectNames = body.collectNames;
      if (!body.collectNames) pres.names = {}; // Namen beim Abschalten löschen (Datensparsamkeit)
    }
    if (typeof body.selfPaced === 'boolean') pres.selfPaced = body.selfPaced;
    touch(pres);
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
      pres.names = {}; // vollständiger Reset löscht auch die erfassten Namen
    }
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true });
  }

  // POST /api/presentations/:id/archive — aktuelle Sitzung archivieren & Antworten leeren
  if (sub === '/archive' && method === 'POST') {
    const body = await readBody(req);
    archiveSession(pres, body.label);
    touch(pres);
    saveStore();
    broadcast(pres.id);
    return sendJSON(res, 200, { ok: true, sessions: pres.sessions.length });
  }

  return sendJSON(res, 404, { error: 'not_found' });
}

// ---------------------------------------------------------------------------

server.listen(PORT, HOST, () => {
  console.log(`PULS läuft auf http://localhost:${PORT}`);
  console.log(`Publikum tritt bei über: http://<diese-maschine>:${PORT}`);
});
