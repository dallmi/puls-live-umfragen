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

// ---------------------------------------------------------------------------
// XLSX-Export ohne Abhängigkeiten
// Ein .xlsx ist ein ZIP-Archiv mit XML-Dateien. Wir schreiben das ZIP selbst
// (Methode STORE, ohne Kompression) — dafür reichen CRC32 + die Header-Formate.
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
    local.writeUInt16LE(20, 4);          // Version
    local.writeUInt16LE(0x0800, 6);      // Flags: UTF-8
    local.writeUInt16LE(0, 8);           // Methode: STORE
    local.writeUInt32LE(0, 10);          // Zeit/Datum (fix)
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
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

/*
 * Zellstil-Indizes (siehe styles.xml in buildXlsx) — Formatierung nach dem
 * Corporate-Designsystem, §7 Tabellenformatierung:
 * Kopfzeile ohne Füllung, Arial 9 fett, 0,75pt schwarze Linie oben+unten;
 * keine vertikalen Gitterlinien; Zebrastreifen Pastel I #ECEBE4;
 * Summenzeilen fett mit 1pt-Linien; Zahlen rechtsbündig.
 */
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

/**
 * Arbeitsblatt-XML aus einem strukturierten Blatt:
 * { pre: [[Titel],[Untertitel]], headers: [...], data: [[...]], totals: [[...]] }
 * Mit fixierter Kopfzeile, Autofilter und automatischen Spaltenbreiten.
 */
function sheetXml(sheet) {
  const pre = sheet.pre || [];
  const headers = sheet.headers || [];
  const data = sheet.data || [];
  const totals = sheet.totals || [];
  const numCols = Math.max(headers.length, ...data.map((r) => r.length), ...totals.map((r) => r.length), ...pre.map((r) => r.length), 1);

  // Zahlenspalten erkennen (für Kopf- und Fußzeilen-Ausrichtung)
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
  if (pre.length) { r++; xmlRows.push(`<row r="${r}"/>`); } // Leerzeile nach Titelblock

  const headerRow = headers.length ? r + 1 : 0;
  if (headers.length) {
    r++;
    xmlRows.push(`<row r="${r}" ht="20" customHeight="1">${headers.map((v, c) =>
      cellXml(colName(c) + r, v, isNumCol[c] ? XF.headNum : XF.headText)).join('')}</row>`);
  }
  data.forEach((row, i) => {
    r++;
    const alt = i % 2 === 1;              // Zebrastreifen Pastel I
    const foot = i === data.length - 1;   // Tabellenfuß: 0,75pt-Linie unten
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

  // Spaltenbreiten aus dem Inhalt ableiten (max. 50 Zeichen)
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

/** Arbeitsmappe aus [{name, rows}] bauen. */
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
  // Stile nach Corporate-Designsystem §7:
  // Fonts:  0 Arial 10 (Body) · 1 Arial 9 fett (Kopf) · 2 Arial 10 fett (Total)
  //         3 Arial 12 fett (Titel) · 4 Arial 9 grau #7A7870 (Untertitel)
  // Fills:  0 none · 1 gray125 (Pflicht-Platzhalter) · 2 Pastel I #ECEBE4
  // Borders:0 keine · 1 Kopf (dünn schwarz oben+unten) · 2 Fuß (dünn schwarz unten)
  //         3 Total (1pt/medium schwarz oben+unten)
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
      xf(0, 0, 0, 'left') +   /*  0 bodyText    */
      xf(0, 0, 0, 'right') +  /*  1 bodyNum     */
      xf(0, 2, 0, 'left') +   /*  2 bodyTextAlt */
      xf(0, 2, 0, 'right') +  /*  3 bodyNumAlt  */
      xf(1, 0, 1, 'left') +   /*  4 headText    */
      xf(1, 0, 1, 'right') +  /*  5 headNum     */
      xf(3, 0, 0, 'left') +   /*  6 title       */
      xf(4, 0, 0, 'left') +   /*  7 subtitle    */
      xf(2, 0, 3, 'left') +   /*  8 totalText   */
      xf(2, 0, 3, 'right') +  /*  9 totalNum    */
      xf(0, 0, 2, 'left') +   /* 10 footText    */
      xf(0, 0, 2, 'right') +  /* 11 footNum     */
      xf(0, 2, 2, 'left') +   /* 12 footTextAlt */
      xf(0, 2, 2, 'right') +  /* 13 footNumAlt  */
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
function exportWorkbook(pres) {
  const sheets = [];
  const overviewData = [];
  pres.slides.forEach((slide, i) => {
    const results = computeResults(slide);
    const label = { choice: 'Multiple Choice', wordcloud: 'Wortwolke', open: 'Offene Frage', scale: 'Skala', qa: 'Q&A', info: 'Infofolie' }[slide.type] || slide.type;
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
        sheet = {
          headers: ['Antwort', 'Zeitpunkt'],
          data: [...results.texts].reverse().map((t) => [t.text, formatTs(t.ts)]),
          totals: [['Antworten', results.texts.length]],
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
      case 'qa':
        sheet = {
          headers: ['Frage', 'Stimmen', 'Zeitpunkt'],
          data: results.questions.map((q) => [q.text, q.votes, formatTs(q.ts)]),
          totals: [['Fragen', results.questions.length]],
        };
        break;
    }
    if (sheet) {
      sheet.name = `${i + 1} ${slide.question || label}`;
      sheet.pre = [[slide.question || label], [label]];
      sheets.push(sheet);
    }
  });
  sheets.unshift({
    name: 'Übersicht',
    pre: [[pres.title], [`Code ${pres.code} — exportiert ${formatTs(Date.now())}`]],
    headers: ['Folie', 'Typ', 'Frage', 'Teilnehmende'],
    data: overviewData,
    totals: [],
  });
  return buildXlsx(sheets);
}

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
