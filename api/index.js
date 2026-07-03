/**
 * PULS — serverlose Vercel-Variante.
 *
 * Alle /api/*-Routen laufen über diese eine Funktion (vercel.json leitet
 * /api/(.*) hierher). Unterschiede zum Hetzner-Server (server.js):
 *   - Speicher: Upstash Redis (per REST/fetch, keine Dependency) statt Datei.
 *     Fällt ohne konfigurierte Env-Variablen auf einen In-Memory-Speicher
 *     zurück (nur für lokale Tests, nicht dauerhaft).
 *   - Kein SSE: der Client (common.js) fällt automatisch auf Polling zurück.
 *   - Ablauf/Obergrenze über Redis-TTL statt Prune-Schleife.
 *
 * Die Domänenlogik (Ergebnisse, Validierung, XLSX) kommt aus lib/domain.mjs
 * und ist mit dem Hetzner-Server identisch.
 */

import crypto from 'node:crypto';
import {
  SLIDE_TYPES, MAX_PARTICIPANTS_PER_SLIDE,
  clampText, sanitizeSlide, publicSlide, computeResults, applyAnswer, exportWorkbook,
  pendingQuestions, moderateQuestion, leaderboard, publicQuizResult,
} from '../lib/domain.mjs';

const TTL_SECONDS = 60 * 24 * 60 * 60;   // 60 Tage Inaktivität → automatischer Ablauf
const CREATE_MAX = 30;                    // Neuanlagen pro Stunde je IP
const REACTIONS = ['👍', '❤️', '👏', '😂', '😮', '🎉']; // erlaubte Emoji-Reaktionen
const REACTION_WINDOW_MS = 6000;          // Reaktionen sind ephemer (letzte Sekunden)
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_BYTES = 90 * 1024;

function brandOf(pres) {
  return {
    color: HEX_COLOR.test(pres.brandColor || '') ? pres.brandColor : null,
    logo: !!pres.brandLogo,
  };
}

// ---------------------------------------------------------------------------
// Speicher: Upstash Redis (REST) mit In-Memory-Fallback
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const hasRedis = !!(REDIS_URL && REDIS_TOKEN);

// In-Memory-Fallback (überlebt keine Kaltstarts — nur für lokale Entwicklung)
const mem = (globalThis.__pulsMem = globalThis.__pulsMem || new Map());
const memExp = (globalThis.__pulsMemExp = globalThis.__pulsMemExp || new Map());

async function redis(...cmd) {
  if (!hasRedis) return memCommand(cmd);
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`redis_${res.status}`);
  const data = await res.json();
  return data.result;
}

function memCommand(cmd) {
  const [op, key, value] = cmd;
  const flags = cmd.slice(3); // z. B. ['NX','PX',5000] oder ['EX',TTL]
  const now = Date.now();
  // abgelaufene Schlüssel bereinigen
  const exp = memExp.get(key);
  if (exp && exp <= now) { mem.delete(key); memExp.delete(key); }
  const flagVal = (name) => { const i = flags.indexOf(name); return i !== -1 ? Number(flags[i + 1]) : 0; };
  switch (op) {
    case 'GET': return mem.has(key) ? mem.get(key) : null;
    case 'SET': {
      if (flags.includes('NX') && mem.has(key)) return null; // NX: nur setzen, wenn frei (Lock)
      mem.set(key, value);
      const ex = flagVal('EX'), px = flagVal('PX');
      if (ex) memExp.set(key, now + ex * 1000);
      else if (px) memExp.set(key, now + px);
      else memExp.delete(key);
      return 'OK';
    }
    case 'DEL': { const had = mem.delete(key); memExp.delete(key); return had ? 1 : 0; }
    case 'INCR': { const n = (Number(mem.get(key)) || 0) + 1; mem.set(key, String(n)); return n; }
    case 'EXPIRE': memExp.set(key, now + Number(value) * 1000); return 1;
    default: return null;
  }
}

const presKey = (id) => `puls:pres:${id}`;
const codeKey = (code) => `puls:code:${code}`;

async function getPres(id) {
  if (!/^[0-9a-f-]{36}$/.test(id || '')) return null;
  const raw = await redis('GET', presKey(id));
  return raw ? JSON.parse(raw) : null;
}
async function putPres(pres) {
  await redis('SET', presKey(pres.id), JSON.stringify(pres), 'EX', TTL_SECONDS);
  await redis('SET', codeKey(pres.code), pres.id, 'EX', TTL_SECONDS);
}
async function delPres(pres) {
  await redis('DEL', presKey(pres.id));
  await redis('DEL', codeKey(pres.code));
}
async function idByCode(code) {
  return await redis('GET', codeKey(code));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Per-Präsentation-Lock gegen verlorene Updates: getPres→mutieren→putPres ist
 * nicht atomar, gleichzeitige Schreibvorgänge (z. B. zwei Upvotes) würden sich
 * sonst gegenseitig überschreiben. SET NX als kurzlebiges Lock; fn muss die
 * Präsentation INNERHALB des Locks frisch lesen (getPres), ändern, putPres.
 * Notausgang nach begrenzten Versuchen → best effort statt Blockade.
 */
async function withPresLock(id, fn, tries = 14) {
  const lockKey = `puls:lock:${id}`;
  for (let i = 0; i < tries; i++) {
    let got = null;
    try { got = await redis('SET', lockKey, '1', 'NX', 'PX', 5000); } catch { got = null; }
    if (got) {
      try { return await fn(); }
      finally { await redis('DEL', lockKey).catch(() => {}); }
    }
    await sleep(15 + i * 8); // ansteigender Backoff (~0,7 s gesamt)
  }
  return fn(); // Lock nicht bekommen → trotzdem ausführen (seltener verlorener Schreibvorgang > Hänger)
}

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return xff ? String(xff).split(',')[0].trim() : (req.socket?.remoteAddress || 'unknown');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function isAdmin(pres, req, url) {
  const token = req.headers['x-admin-token'] || url.searchParams.get('token');
  return !!(pres && token && safeEqual(token, pres.adminToken));
}

/** Ergebnis der aktiven Folie für den öffentlichen Snapshot (Quiz: ohne Antwortschlüssel). */
function publicResultFor(slide, resultsHidden, showNames) {
  if (!slide) return null;
  const raw = resultsHidden ? null : computeResults(slide, showNames);
  return (raw && slide.type === 'quiz') ? publicQuizResult(raw, true) : raw;
}

function snapshot(pres) {
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
    audience: 0, // serverlos: keine dauerhaften Verbindungen zum Zählen
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

async function newJoinCode() {
  for (let i = 0; i < 50; i++) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!(await idByCode(code))) return code;
  }
  throw new Error('no_code');
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { return {}; } }
    return req.body;
  }
  return await new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 100 * 1024) { d = ''; req.destroy(); resolve({}); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const method = req.method;

  try {
    if (p === '/api/server-info' && method === 'GET') {
      return json(res, 200, { port: null, urls: [] });
    }

    // POST /api/presentations — neue Präsentation (Redis-atomares Rate-Limit)
    if (p === '/api/presentations' && method === 'POST') {
      const rlKey = `puls:rl:create:${clientIp(req)}`;
      const n = await redis('INCR', rlKey);
      if (n === 1) await redis('EXPIRE', rlKey, 3600);
      if (n > CREATE_MAX) return json(res, 429, { error: 'rate_limited' });

      const body = await readJson(req);
      const now = Date.now();
      const pres = {
        id: crypto.randomUUID(),
        code: await newJoinCode(),
        adminToken: crypto.randomBytes(24).toString('hex'),
        title: clampText(body.title, 120) || 'Unbenannte Präsentation',
        slides: [], activeIndex: 0, votingLocked: false, resultsHidden: false,
        collectNames: false, selfPaced: false, names: {},
        brandColor: null, brandLogo: null,
        createdAt: now, lastActivity: now,
      };
      await putPres(pres);
      return json(res, 201, { id: pres.id, code: pres.code, adminToken: pres.adminToken, title: pres.title });
    }

    // GET /api/join/:code
    let m = p.match(/^\/api\/join\/(\d{6})$/);
    if (m && method === 'GET') {
      const id = await idByCode(m[1]);
      const pres = id ? await getPres(id) : null;
      if (!pres) return json(res, 404, { error: 'code_unknown' });
      return json(res, 200, { id: pres.id, ...snapshot(pres) });
    }

    // /api/presentations/:id/...
    m = p.match(/^\/api\/presentations\/([0-9a-f-]{36})(\/.*)?$/);
    if (!m) return json(res, 404, { error: 'not_found' });
    const pres = await getPres(m[1]);
    if (!pres) return json(res, 404, { error: 'not_found' });
    const sub = m[2] || '';

    // Kein SSE auf Vercel — Client fällt auf Polling zurück
    if (sub === '/stream' && method === 'GET') return json(res, 501, { error: 'sse_unsupported' });

    if (sub === '' && method === 'GET') {
      if (isAdmin(pres, req, url)) {
        return json(res, 200, {
          id: pres.id, code: pres.code, title: pres.title,
          slides: pres.slides.map((s) => ({
            ...publicSlide(s),
            results: computeResults(s, !!pres.collectNames),
            ...(s.type === 'qa' && s.moderated ? { pending: pendingQuestions(s) } : {}),
            ...(s.type === 'quiz' ? { correct: s.correct } : {}), // Admin darf den Antwortschlüssel sehen
          })),
          activeIndex: pres.activeIndex, votingLocked: pres.votingLocked, resultsHidden: pres.resultsHidden,
          collectNames: !!pres.collectNames,
          selfPaced: !!pres.selfPaced,
          leaderboard: pres.slides.some((s) => s.type === 'quiz') ? leaderboard(pres, 1000) : undefined,
          brand: brandOf(pres),
        });
      }
      return json(res, 200, snapshot(pres));
    }

    if (sub === '/answers' && method === 'POST') {
      const body = await readJson(req);
      const pid = clampText(String(body.participantId || ''), 64);
      if (!pid) return json(res, 400, { error: 'participant_missing' });
      // Unter Lock frisch lesen → mutieren → schreiben (verhindert verlorene Updates).
      const out = await withPresLock(pres.id, async () => {
        const p = await getPres(pres.id);
        if (!p) return { s: 404, j: { error: 'not_found' } };
        const slide = p.slides.find((s) => s.id === body.slideId);
        if (!slide) return { s: 404, j: { error: 'slide_unknown' } };
        if (p.votingLocked) return { s: 423, j: { error: 'voting_locked' } };
        if (!(pid in slide.answers) && Object.keys(slide.answers).length >= MAX_PARTICIPANTS_PER_SLIDE) {
          return { s: 429, j: { error: 'slide_full' } };
        }
        const name = p.collectNames ? ((p.names && p.names[pid]) || '') : '';
        const ok = applyAnswer(slide, pid, body, name);
        if (!ok.ok) return { s: ok.error === 'already_answered' ? 409 : 400, j: { error: ok.error } };
        p.lastActivity = Date.now();
        await putPres(p);
        return { s: 200, j: { ok: true, ...(ok.quiz ? { quiz: ok.quiz } : {}) } };
      });
      return json(res, out.s, out.j);
    }

    if (sub === '/upvote' && method === 'POST') {
      const body = await readJson(req);
      const pid = clampText(String(body.participantId || ''), 64);
      if (!pid) return json(res, 400, { error: 'participant_missing' });
      const out = await withPresLock(pres.id, async () => {
        const p = await getPres(pres.id);
        if (!p) return { s: 404, j: { error: 'not_found' } };
        const slide = p.slides.find((s) => s.id === body.slideId);
        if (!slide || slide.type !== 'qa') return { s: 404, j: { error: 'slide_unknown' } };
        let found = false;
        for (const list of Object.values(slide.answers)) {
          if (!Array.isArray(list)) continue; // z. B. von einer früheren Skala-Antwort (Zahl)
          for (const q of list) {
            if (q && q.id === body.questionId) {
              q.upvotes = q.upvotes || {};
              if (q.upvotes[pid]) delete q.upvotes[pid];
              else {
                // Obergrenze der Upvoter je Frage (verhindert unbegrenztes Wachstum)
                if (Object.keys(q.upvotes).length >= MAX_PARTICIPANTS_PER_SLIDE) return { s: 429, j: { error: 'too_many_upvotes' } };
                q.upvotes[pid] = 1;
              }
              found = true;
            }
          }
        }
        if (!found) return { s: 404, j: { error: 'question_unknown' } };
        p.lastActivity = Date.now();
        await putPres(p);
        return { s: 200, j: { ok: true } };
      });
      return json(res, out.s, out.j);
    }

    // POST /api/presentations/:id/react — Emoji-Reaktion (Publikum, ephemer)
    if (sub === '/react' && method === 'POST') {
      const body = await readJson(req);
      const emoji = String(body.emoji || '');
      if (!REACTIONS.includes(emoji)) return json(res, 400, { error: 'bad_emoji' });
      const now = Date.now();
      pres.reactions = (pres.reactions || []).filter((r) => r.ts > now - REACTION_WINDOW_MS);
      pres.reactions.push({ emoji, ts: now });
      if (pres.reactions.length > 60) pres.reactions = pres.reactions.slice(-60);
      await putPres(pres); // serverlos: muss persistiert werden, sonst sieht der Presenter nichts
      return json(res, 200, { ok: true });
    }

    // GET /api/presentations/:id/logo — Marken-Logo (öffentlich)
    if (sub === '/logo' && method === 'GET') {
      const dm = /^data:([\w/+.-]+);base64,(.+)$/.exec(pres.brandLogo || '');
      if (!dm) { res.statusCode = 404; return res.end(); }
      res.statusCode = 200;
      res.setHeader('Content-Type', dm[1]);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-cache');
      return res.end(Buffer.from(dm[2], 'base64'));
    }

    // POST /api/presentations/:id/identify — Anzeigenamen setzen (Publikum, nur wenn aktiviert)
    if (sub === '/identify' && method === 'POST') {
      const body = await readJson(req);
      if (!pres.collectNames) return json(res, 409, { error: 'names_disabled' });
      const pid = clampText(String(body.participantId || ''), 64);
      if (!pid) return json(res, 400, { error: 'participant_missing' });
      const name = clampText(String(body.name || ''), 40);
      if (!name) return json(res, 400, { error: 'name_missing' });
      if (!pres.names) pres.names = {};
      if (!(pid in pres.names) && Object.keys(pres.names).length >= MAX_PARTICIPANTS_PER_SLIDE) {
        return json(res, 429, { error: 'full' });
      }
      pres.names[pid] = name;
      pres.lastActivity = Date.now();
      await putPres(pres);
      return json(res, 200, { ok: true, name });
    }

    // Ab hier: nur Admin
    if (!isAdmin(pres, req, url)) return json(res, 403, { error: 'forbidden' });

    if (sub === '/export.xlsx' && method === 'GET') {
      const buf = exportWorkbook(pres);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="puls-${pres.code}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end(buf);
    }

    if (sub === '' && method === 'PUT') {
      const body = await readJson(req);
      if (body.title !== undefined) pres.title = clampText(body.title, 120) || pres.title;
      pres.lastActivity = Date.now();
      await putPres(pres);
      return json(res, 200, { ok: true });
    }

    // POST /api/presentations/:id/brand — Akzentfarbe + Logo (Admin)
    if (sub === '/brand' && method === 'POST') {
      const body = await readJson(req);
      if (body.color === null || body.color === '') pres.brandColor = null;
      else if (typeof body.color === 'string' && HEX_COLOR.test(body.color)) pres.brandColor = body.color;
      if (body.logo === null || body.logo === '') pres.brandLogo = null;
      // Nur Raster-Formate — SVG könnte bei direktem /logo-Aufruf Skripte ausführen (XSS).
      else if (typeof body.logo === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,/.test(body.logo)) {
        if (body.logo.length > MAX_LOGO_BYTES) return json(res, 413, { error: 'logo_too_large' });
        pres.brandLogo = body.logo;
      }
      pres.lastActivity = Date.now();
      await putPres(pres);
      return json(res, 200, { ok: true, brand: brandOf(pres) });
    }

    // GET /api/presentations/:id/moderation — ausstehende Q&A-Fragen der aktiven Folie (Admin)
    if (sub === '/moderation' && method === 'GET') {
      const slide = pres.slides[pres.activeIndex] || null;
      const moderated = !!(slide && slide.type === 'qa' && slide.moderated);
      return json(res, 200, {
        slideId: slide ? slide.id : null,
        moderated,
        pending: moderated ? pendingQuestions(slide) : [],
      });
    }

    // POST /api/presentations/:id/moderate — Frage freigeben/entfernen (Admin)
    if (sub === '/moderate' && method === 'POST') {
      const body = await readJson(req);
      const slide = pres.slides.find((s) => s.id === body.slideId) || pres.slides[pres.activeIndex];
      if (!slide || slide.type !== 'qa') return json(res, 404, { error: 'slide_unknown' });
      const action = body.action === 'approve' || body.action === 'reject' ? body.action : null;
      if (!action) return json(res, 400, { error: 'bad_action' });
      if (!moderateQuestion(slide, String(body.itemId || ''), action)) {
        return json(res, 404, { error: 'question_unknown' });
      }
      pres.lastActivity = Date.now();
      await putPres(pres);
      return json(res, 200, { ok: true, pending: pendingQuestions(slide) });
    }

    if (sub === '' && method === 'DELETE') {
      await delPres(pres);
      return json(res, 200, { ok: true });
    }

    if (sub === '/slides' && method === 'PUT') {
      const body = await readJson(req);
      if (!Array.isArray(body.slides)) return json(res, 400, { error: 'slides_missing' });
      const existing = new Map(pres.slides.map((s) => [s.id, s]));
      pres.slides = body.slides.slice(0, 50).map((input) => {
        const slide = sanitizeSlide(input);
        const prev = existing.get(slide.id);
        slide.answers = prev ? prev.answers : {};
        if (prev && prev.startedAt && slide.type === 'quiz') slide.startedAt = prev.startedAt;
        return slide;
      });
      pres.activeIndex = Math.min(pres.activeIndex, Math.max(0, pres.slides.length - 1));
      pres.lastActivity = Date.now();
      await putPres(pres);
      return json(res, 200, { ok: true, slides: pres.slides.map(publicSlide) });
    }

    if (sub === '/state' && method === 'POST') {
      const body = await readJson(req);
      if (Number.isInteger(body.activeIndex)) {
        pres.activeIndex = Math.min(Math.max(0, body.activeIndex), Math.max(0, pres.slides.length - 1));
        const act = pres.slides[pres.activeIndex];
        if (act && act.type === 'quiz') {
          act.startedAt = Date.now();   // Quiz-Timer starten
          pres.resultsHidden = true;    // Quiz startet verdeckt
        }
      }
      if (typeof body.votingLocked === 'boolean') pres.votingLocked = body.votingLocked;
      if (typeof body.resultsHidden === 'boolean') pres.resultsHidden = body.resultsHidden;
      if (typeof body.collectNames === 'boolean') {
        pres.collectNames = body.collectNames;
        if (!body.collectNames) pres.names = {}; // Namen beim Abschalten löschen
      }
      if (typeof body.selfPaced === 'boolean') pres.selfPaced = body.selfPaced;
      pres.lastActivity = Date.now();
      await putPres(pres);
      return json(res, 200, { ok: true });
    }

    if (sub === '/reset' && method === 'POST') {
      const body = await readJson(req);
      if (body.slideId) {
        const slide = pres.slides.find((s) => s.id === body.slideId);
        if (slide) slide.answers = {};
      } else {
        for (const slide of pres.slides) slide.answers = {};
        pres.names = {}; // vollständiger Reset löscht auch die erfassten Namen
      }
      pres.lastActivity = Date.now();
      await putPres(pres);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'not_found' });
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: 'server_error' });
  }
}
