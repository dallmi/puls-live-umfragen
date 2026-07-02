/* PULS — gemeinsame Frontend-Logik (API, SSE, Ergebnis-Rendering) */
'use strict';

// ---------------------------------------------------------------------------
// Teilnehmer-Identität (anonym, pro Browser)
// ---------------------------------------------------------------------------

function participantId() {
  let id = localStorage.getItem('puls.participantId');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
    localStorage.setItem('puls.participantId', id);
  }
  return id;
}

// ---------------------------------------------------------------------------
// API-Helfer
// ---------------------------------------------------------------------------

async function api(method, path, body, adminToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (adminToken) headers['X-Admin-Token'] = adminToken;
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'request_failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------------------
// SSE mit automatischem Reconnect
// ---------------------------------------------------------------------------

function connectStream(presId, role, onUpdate, onStatus) {
  let source = null;
  let closed = false;

  function open() {
    if (closed) return;
    source = new EventSource(`/api/presentations/${presId}/stream?role=${role}`);
    source.onmessage = (e) => {
      try {
        onUpdate(JSON.parse(e.data));
        if (onStatus) onStatus('live');
      } catch { /* ignorieren */ }
    };
    source.onerror = () => {
      if (onStatus) onStatus('reconnect');
      // EventSource verbindet selbst neu (retry: 3000 vom Server)
    };
  }
  open();
  return {
    close() {
      closed = true;
      if (source) source.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function formatCode(code) {
  return String(code || '').replace(/^(\d{3})(\d{3})$/, '$1 $2');
}

const TYPE_META = {
  choice:    { label: 'Multiple Choice', hint: 'Teilnehmende wählen eine oder mehrere Optionen.' },
  wordcloud: { label: 'Wortwolke',       hint: 'Begriffe der Teilnehmenden bilden eine Wolke.' },
  open:      { label: 'Offene Frage',    hint: 'Freitext-Antworten erscheinen als Antwort-Wand.' },
  scale:     { label: 'Skala',           hint: 'Bewertung auf einer Zahlenskala, mit Durchschnitt.' },
  qa:        { label: 'Q&A',             hint: 'Publikum stellt Fragen und stimmt darüber ab.' },
  info:      { label: 'Infofolie',       hint: 'Statische Folie ohne Interaktion.' },
};

/* Farbreihenfolge für Wortwolken: Markenfarb-Sequenz (Bordeaux → Grau → Bronze …) */
const BRAND_SEQUENCE = ['#8A000A', '#7A7870', '#B98E2C', '#5A5D5C', '#946F29', '#8E8D83', '#6C5312', '#404040'];

// ---------------------------------------------------------------------------
// Ergebnis-Rendering (Presenter & Publikum teilen sich diese Renderer)
// ---------------------------------------------------------------------------

/**
 * Rendert Ergebnisse einer Folie in einen Container.
 * opts: { compact: bool (Publikums-Ansicht), onUpvote: fn(questionId), upvoted: Set }
 */
function renderResults(container, slide, results, opts = {}) {
  container.innerHTML = '';
  if (!slide) return;

  if (!results) {
    container.appendChild(el('<p class="results-hidden">Ergebnisse sind ausgeblendet.</p>'));
    return;
  }

  switch (results.kind) {
    case 'choice':    return renderChoice(container, slide, results, opts);
    case 'wordcloud': return renderWordcloud(container, results, opts);
    case 'open':      return renderOpen(container, results, opts);
    case 'scale':     return renderScale(container, slide, results, opts);
    case 'qa':        return renderQA(container, results, opts);
    case 'info':      return renderInfo(container, slide);
  }
}

function renderChoice(container, slide, results, opts) {
  const total = results.counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...results.counts, 1);
  const chart = el('<div class="barchart" role="img" aria-label="Abstimmungsergebnis"></div>');
  (slide.options || []).forEach((option, i) => {
    const count = results.counts[i] || 0;
    const pct = total ? Math.round((count / total) * 100) : 0;
    const isLeader = count > 0 && count === max;
    const row = el(`
      <div class="bar-row">
        <div class="bar-label">${esc(option)}</div>
        <div class="bar-track">
          <div class="bar-fill${isLeader ? ' leader' : ''}" style="width:0%"></div>
        </div>
        <div class="bar-value">${count}<span class="bar-pct">${pct}%</span></div>
      </div>`);
    chart.appendChild(row);
    // Übergang animieren (Breite erst nach Einfügen setzen)
    requestAnimationFrame(() => {
      row.querySelector('.bar-fill').style.width = (max ? (count / max) * 100 : 0) + '%';
    });
  });
  container.appendChild(chart);
  container.appendChild(el(`<p class="results-meta">${results.voters} ${results.voters === 1 ? 'Stimme' : 'Stimmen'}</p>`));
}

function renderWordcloud(container, results, opts) {
  if (!results.words.length) {
    container.appendChild(el('<p class="results-empty">Noch keine Begriffe — die Wolke entsteht live.</p>'));
    return;
  }
  const maxCount = results.words[0].count;
  const cloud = el('<div class="wordcloud"></div>');
  // Größte Begriffe in die Mitte mischen, damit die Wolke ausgewogen wirkt
  const words = [...results.words];
  const arranged = [];
  words.forEach((w, i) => (i % 2 === 0 ? arranged.push(w) : arranged.unshift(w)));
  arranged.forEach((w) => {
    const scale = maxCount > 1 ? (w.count - 1) / (maxCount - 1) : 0;
    const size = 0.9 + scale * 2.6; // rem
    const rank = results.words.indexOf(w);
    const color = BRAND_SEQUENCE[Math.min(rank, BRAND_SEQUENCE.length - 1)];
    cloud.appendChild(el(
      `<span class="cloud-word" style="font-size:${size.toFixed(2)}rem;color:${color}" title="${w.count}×">${esc(w.text)}</span>`
    ));
  });
  container.appendChild(cloud);
  container.appendChild(el(`<p class="results-meta">${results.voters} Teilnehmende · ${results.words.length} Begriffe</p>`));
}

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

function renderScale(container, slide, results, opts) {
  const wrap = el('<div class="scale-result"></div>');
  const avg = el(`
    <div class="scale-avg">
      <div class="scale-avg-value">${results.voters ? results.avg.toFixed(1) : '–'}</div>
      <div class="scale-avg-label">Durchschnitt von ${slide.min} bis ${slide.max}</div>
    </div>`);
  wrap.appendChild(avg);

  const dist = el('<div class="scale-dist"></div>');
  const maxN = Math.max(...Object.values(results.dist || {}), 1);
  for (let v = slide.min; v <= slide.max; v++) {
    const n = results.dist[v] || 0;
    const h = (n / maxN) * 100;
    const col = el(`
      <div class="scale-col">
        <div class="scale-col-count">${n || ''}</div>
        <div class="scale-col-track"><div class="scale-col-fill" style="height:0%"></div></div>
        <div class="scale-col-label">${v}</div>
      </div>`);
    dist.appendChild(col);
    requestAnimationFrame(() => {
      col.querySelector('.scale-col-fill').style.height = h + '%';
    });
  }
  wrap.appendChild(dist);
  wrap.appendChild(el(`
    <div class="scale-endlabels">
      <span>${esc(slide.minLabel || '')}</span><span>${esc(slide.maxLabel || '')}</span>
    </div>`));
  container.appendChild(wrap);
  container.appendChild(el(`<p class="results-meta">${results.voters} ${results.voters === 1 ? 'Bewertung' : 'Bewertungen'}</p>`));
}

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

function renderInfo(container, slide) {
  if (slide.text) {
    container.appendChild(el(`<div class="info-text">${esc(slide.text).replace(/\n/g, '<br>')}</div>`));
  }
}

// ---------------------------------------------------------------------------
// QR-Code (nutzt lokal gevendorte qrcode-generator-Bibliothek)
// ---------------------------------------------------------------------------

function renderQR(container, text, sizePx = 160) {
  if (typeof qrcode !== 'function') return;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    container.innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
    const svg = container.querySelector('svg');
    if (svg) {
      svg.style.width = sizePx + 'px';
      svg.style.height = sizePx + 'px';
      svg.style.display = 'block';
    }
  } catch { /* QR optional */ }
}
