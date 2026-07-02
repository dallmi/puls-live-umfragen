/*
 * PULS — PowerPoint-Export (nutzt PptxGenJS, lokal gevendort)
 *
 * Formatierung nach dem Corporate-Designsystem, analog zum Roadmap-Export:
 * 16:9 (13,33″ × 7,5″), Frutiger 45 Light, roter Akzentbalken oben, Titel 22pt fett
 * schwarz, Untertitel grau, Balken einfarbig Bordeaux (Führender in Rot),
 * 1pt schwarze Achslinie, keine Gitterlinien, warme Grautöne, Seitenzahl
 * unten rechts, Quellzeile unten links.
 *
 * Läuft im Browser (window.buildPulsPptx) und in Node (module.exports) —
 * Letzteres für automatisierte Tests.
 */
(function (root) {
  'use strict';

  const C = {
    red: 'E60000', bordeaux: '8A000A', black: '000000', dark: '404040',
    med: '7A7870', light: 'CCCABC', pastel: 'ECEBE4', white: 'FFFFFF',
  };
  /* Hausschrift laut Designsystem („the only permitted font“). Office kennt
     keine Fallback-Stacks — auf Rechnern ohne Frutiger substituiert
     PowerPoint selbst. Der Excel-Export bleibt bewusst bei Arial (xlsx-Standard). */
  const FONT = 'Frutiger 45 Light';
  /* Wortwolken-Farbreihenfolge: Markenfarb-Sequenz (Bordeaux → Grau → Bronze …) */
  const CLOUD_SEQ = ['8A000A', '7A7870', 'B98E2C', '5A5D5C', '946F29', '8E8D83', '6C5312', '404040'];

  const W = 13.33, H = 7.5, ML = 0.45, MR = 0.45, CW = W - ML - MR;
  const CONTENT_TOP = 1.5, CONTENT_BOTTOM = 6.9;

  const TYPE_LABEL = {
    choice: 'Multiple Choice', wordcloud: 'Wortwolke', open: 'Offene Frage',
    scale: 'Skala', qa: 'Q&A', info: 'Infofolie',
  };

  function stampNow() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function fmtCode(code) {
    return String(code || '').replace(/^(\d{3})(\d{3})$/, '$1 $2');
  }

  function clip(text, max) {
    const s = String(text || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  /**
   * Baut die Präsentation.
   * @param PptxGenJS  Konstruktor (window.PptxGenJS oder require(...))
   * @param pres       { title, code, slides: [...] }
   * @param resultsMap slideId -> results (wie /api/presentations/:id liefert)
   * @returns pptx-Instanz (Aufrufer ruft writeFile/write auf)
   */
  function buildPulsPptx(PptxGenJS, pres, resultsMap) {
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'WIDE', width: W, height: H });
    pptx.layout = 'WIDE';
    const stamp = stampNow();
    let pageNo = 0;

    const T = (opts) => Object.assign({ fontFace: FONT }, opts);

    function newSlide(title, subtitle) {
      pageNo++;
      const s = pptx.addSlide();
      s.background = { color: C.white };
      s.addShape('rect', { x: 0, y: 0, w: W, h: 0.06, fill: { color: C.red } });
      s.addText(clip(title, 120), T({ x: ML, y: 0.22, w: CW - 2.5, h: 0.55, fontSize: 22, bold: true, color: C.black }));
      if (subtitle) s.addText(subtitle, T({ x: ML, y: 0.76, w: CW - 2.5, h: 0.3, fontSize: 11, color: C.med }));
      s.addText(`Exportiert ${stamp}`, T({ x: W - MR - 2.4, y: 0.28, w: 2.4, h: 0.3, fontSize: 10, color: C.med, align: 'right' }));
      s.addText(`${clip(pres.title, 60)} — Code ${fmtCode(pres.code)}`, T({ x: ML, y: 7.1, w: 8, h: 0.28, fontSize: 8, color: C.med }));
      s.addText(String(pageNo), T({ x: W - MR - 0.8, y: 7.1, w: 0.8, h: 0.28, fontSize: 10, color: C.med, align: 'right' }));
      return s;
    }

    // --- Titel- und Übersichtsfolie -----------------------------------------
    {
      const s = newSlide(pres.title, `Live-Umfrage · Code ${fmtCode(pres.code)} · ${pres.slides.length} Folien`);
      const B_NONE = { type: 'none' };
      const B_RULE = { type: 'solid', color: C.black, pt: 0.75 };
      const th = { color: C.black, bold: true, fontSize: 10, fontFace: FONT, valign: 'top', fill: { color: C.white }, border: [B_RULE, B_NONE, B_RULE, B_NONE] };
      const rows = [[
        Object.assign({ text: 'Folie' }, { options: th }),
        Object.assign({ text: 'Typ' }, { options: th }),
        Object.assign({ text: 'Frage' }, { options: th }),
        Object.assign({ text: 'Teilnehmende' }, { options: Object.assign({}, th, { align: 'right' }) }),
      ]];
      pres.slides.forEach((sl, i) => {
        const res = resultsMap[sl.id];
        const alt = i % 2 === 1;
        const td = { color: C.dark, fontSize: 10, fontFace: FONT, valign: 'top', border: [B_NONE, B_NONE, B_NONE, B_NONE], fill: { color: alt ? C.pastel : C.white } };
        if (i === pres.slides.length - 1) td.border = [B_NONE, B_NONE, B_RULE, B_NONE]; // Tabellenfuß
        rows.push([
          { text: String(i + 1), options: Object.assign({}, td, { align: 'right' }) },
          { text: TYPE_LABEL[sl.type] || sl.type, options: td },
          { text: clip(sl.question || '', 90), options: td },
          { text: res && res.voters !== undefined ? String(res.voters) : '–', options: Object.assign({}, td, { align: 'right' }) },
        ]);
      });
      s.addTable(rows, { x: ML, y: CONTENT_TOP, w: 10.4, colW: [0.8, 1.9, 6.1, 1.6], rowH: 0.32 });
    }

    // --- Eine Folie pro Frage ------------------------------------------------
    pres.slides.forEach((sl) => {
      const res = resultsMap[sl.id];
      const label = TYPE_LABEL[sl.type] || sl.type;
      const voters = res && res.voters !== undefined ? res.voters : 0;
      const sub = sl.type === 'info' ? label : `${label} · ${voters} Teilnehmende`;
      const s = newSlide(sl.question || label, sub);

      switch (sl.type) {
        case 'choice':    addChoice(s, sl, res); break;
        case 'wordcloud': addWordcloud(s, res); break;
        case 'open':      addOpen(s, res); break;
        case 'scale':     addScale(s, sl, res); break;
        case 'qa':        addQa(s, res); break;
        case 'info':
          if (sl.text) s.addText(sl.text, T({ x: ML, y: CONTENT_TOP, w: CW - 2, h: 4.5, fontSize: 14, color: C.dark, valign: 'top' }));
          break;
      }
    });

    function empty(s, text) {
      s.addText(text, T({ x: ML, y: 3.2, w: CW, h: 0.5, fontSize: 13, color: C.med }));
    }

    // Balkendiagramm: einfarbig Bordeaux, Führender Rot, 1pt schwarze Achse
    function addChoice(s, sl, res) {
      const opts = sl.options || [];
      if (!res || !opts.length) return empty(s, 'Keine Antwortoptionen.');
      const counts = res.counts || [];
      const total = counts.reduce((a, b) => a + b, 0);
      const max = Math.max.apply(null, counts.concat([1]));
      const rowH = Math.min(0.95, (CONTENT_BOTTOM - CONTENT_TOP - 0.4) / opts.length);
      const barH = Math.min(0.5, rowH * 0.55);
      const labelW = 3.1, valueW = 1.9;
      const barX = ML + labelW + 0.2;
      const barW = CW - labelW - valueW - 0.6;
      // 1pt schwarze Achslinie links der Balken
      s.addShape('line', {
        x: barX - 0.08, y: CONTENT_TOP, w: 0.001, h: rowH * opts.length,
        line: { color: C.black, width: 1 },
      });
      opts.forEach((opt, i) => {
        const y = CONTENT_TOP + i * rowH + (rowH - barH) / 2;
        const n = counts[i] || 0;
        const leader = n > 0 && n === max;
        const pct = total ? Math.round((n / total) * 100) : 0;
        s.addText(clip(opt, 70), T({ x: ML, y: y - 0.08, w: labelW, h: barH + 0.16, fontSize: 13, color: C.black, valign: 'middle' }));
        s.addShape('rect', { x: barX, y: y, w: barW, h: barH, fill: { color: C.pastel } });
        if (n > 0) {
          s.addShape('rect', { x: barX, y: y, w: Math.max(barW * (n / max), 0.03), h: barH, fill: { color: leader ? C.red : C.bordeaux } });
        }
        s.addText([
          { text: String(n), options: { bold: true, color: C.black, fontSize: 14 } },
          { text: `  ${pct} %`, options: { color: C.med, fontSize: 11 } },
        ], T({ x: barX + barW + 0.12, y: y - 0.08, w: valueW, h: barH + 0.16, valign: 'middle' }));
      });
      s.addText(`${res.voters} ${res.voters === 1 ? 'Stimme' : 'Stimmen'}`, T({ x: ML, y: CONTENT_BOTTOM - 0.3, w: 4, h: 0.3, fontSize: 10, color: C.med }));
    }

    // Wortwolke: Größe = Häufigkeit, Farben aus der Markenfarb-Sequenz
    function addWordcloud(s, res) {
      if (!res || !res.words || !res.words.length) return empty(s, 'Keine Begriffe eingereicht.');
      const words = res.words.slice(0, 40);
      const maxC = words[0].count;
      const runs = [];
      // Größte Begriffe in die Mitte mischen (wie in der Web-Ansicht)
      const arranged = [];
      words.forEach((w, i) => (i % 2 === 0 ? arranged.push(w) : arranged.unshift(w)));
      arranged.forEach((w) => {
        const rank = words.indexOf(w);
        const scale = maxC > 1 ? (w.count - 1) / (maxC - 1) : 0;
        runs.push({
          text: w.text,
          options: {
            fontSize: Math.round(14 + scale * 28),
            color: CLOUD_SEQ[Math.min(rank, CLOUD_SEQ.length - 1)],
            bold: true, breakLine: false,
          },
        });
        runs.push({ text: '   ', options: { fontSize: 14, breakLine: false } });
      });
      s.addText(runs, T({ x: ML + 0.5, y: CONTENT_TOP, w: CW - 1, h: CONTENT_BOTTOM - CONTENT_TOP - 0.4, align: 'center', valign: 'middle' }));
      s.addText(`${res.voters} Teilnehmende · ${res.words.length} Begriffe`, T({ x: ML, y: CONTENT_BOTTOM - 0.3, w: 5, h: 0.3, fontSize: 10, color: C.med }));
    }

    // Offene Frage: Antwortliste (chronologisch), bei Überlänge gekürzt
    function addOpen(s, res) {
      if (!res || !res.texts || !res.texts.length) return empty(s, 'Keine Antworten eingegangen.');
      const texts = res.texts.slice().reverse(); // älteste zuerst
      const MAX = 12;
      const shown = texts.slice(0, MAX);
      const step = Math.min(0.44, (CONTENT_BOTTOM - CONTENT_TOP - 0.4) / shown.length);
      shown.forEach((t, i) => {
        s.addText(`–  ${clip(t.text, 150)}`, T({
          x: ML, y: CONTENT_TOP + i * step, w: CW - 1, h: step,
          fontSize: 12, color: C.dark, valign: 'top',
        }));
      });
      const note = texts.length > MAX ? `${texts.length} Antworten insgesamt — ${texts.length - MAX} weitere in der Excel-Datei` : `${texts.length} ${texts.length === 1 ? 'Antwort' : 'Antworten'}`;
      s.addText(note, T({ x: ML, y: CONTENT_BOTTOM - 0.3, w: 8, h: 0.3, fontSize: 10, color: C.med }));
    }

    // Skala: großer Durchschnittswert + Verteilung mit schwarzer Grundlinie
    function addScale(s, sl, res) {
      if (!res) return empty(s, 'Keine Bewertungen.');
      const avgText = res.voters ? (Math.round(res.avg * 10) / 10).toFixed(1) : '–';
      s.addText(avgText, T({ x: ML, y: CONTENT_TOP - 0.1, w: 3, h: 1.1, fontSize: 54, color: C.black }));
      s.addText(`Durchschnitt von ${sl.min} bis ${sl.max} · ${res.voters} ${res.voters === 1 ? 'Bewertung' : 'Bewertungen'}`,
        T({ x: ML, y: CONTENT_TOP + 1.0, w: 6, h: 0.3, fontSize: 11, color: C.med }));

      const n = sl.max - sl.min + 1;
      const maxN = Math.max.apply(null, Object.values(res.dist || {}).concat([1]));
      const areaTop = CONTENT_TOP + 1.7;
      const baseY = CONTENT_BOTTOM - 0.75;
      const chartH = baseY - areaTop;
      const gap = 0.18;
      const colW = Math.min(1.3, (CW - (n - 1) * gap) / n);
      const totalW = n * colW + (n - 1) * gap;
      const x0 = ML + (CW - totalW) / 2;
      for (let v = sl.min; v <= sl.max; v++) {
        const i = v - sl.min;
        const x = x0 + i * (colW + gap);
        const cnt = (res.dist || {})[v] || 0;
        const h = maxN ? (cnt / maxN) * (chartH - 0.35) : 0;
        if (cnt > 0) {
          s.addText(String(cnt), T({ x, y: baseY - h - 0.32, w: colW, h: 0.28, fontSize: 11, color: C.black, align: 'center' }));
          s.addShape('rect', { x, y: baseY - h, w: colW, h: Math.max(h, 0.02), fill: { color: C.bordeaux } });
        }
        s.addText(String(v), T({ x, y: baseY + 0.08, w: colW, h: 0.28, fontSize: 10, color: C.dark, align: 'center' }));
      }
      // 1pt schwarze Grundlinie
      s.addShape('line', { x: x0 - 0.1, y: baseY, w: totalW + 0.2, h: 0.001, line: { color: C.black, width: 1 } });
      if (sl.minLabel) s.addText(sl.minLabel, T({ x: x0 - 0.1, y: baseY + 0.38, w: 3, h: 0.28, fontSize: 9, color: C.med }));
      if (sl.maxLabel) s.addText(sl.maxLabel, T({ x: x0 + totalW - 2.9, y: baseY + 0.38, w: 3, h: 0.28, fontSize: 9, color: C.med, align: 'right' }));
    }

    // Q&A: Fragen sortiert nach Stimmen
    function addQa(s, res) {
      if (!res || !res.questions || !res.questions.length) return empty(s, 'Keine Fragen aus dem Publikum.');
      const MAX = 10;
      const shown = res.questions.slice(0, MAX);
      const step = Math.min(0.52, (CONTENT_BOTTOM - CONTENT_TOP - 0.4) / shown.length);
      shown.forEach((q, i) => {
        const y = CONTENT_TOP + i * step;
        s.addText(String(q.votes), T({ x: ML, y, w: 0.7, h: step, fontSize: 14, bold: true, color: C.bordeaux, align: 'right', valign: 'top' }));
        s.addText(clip(q.text, 160), T({ x: ML + 0.95, y, w: CW - 2, h: step, fontSize: 12, color: C.dark, valign: 'top' }));
      });
      const note = res.questions.length > MAX
        ? `${res.questions.length} Fragen insgesamt — ${res.questions.length - MAX} weitere in der Excel-Datei`
        : `${res.questions.length} ${res.questions.length === 1 ? 'Frage' : 'Fragen'} · Zahl = Stimmen aus dem Publikum`;
      s.addText(note, T({ x: ML, y: CONTENT_BOTTOM - 0.3, w: 8, h: 0.3, fontSize: 10, color: C.med }));
    }

    return pptx;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { buildPulsPptx };
  root.buildPulsPptx = buildPulsPptx;
})(typeof window !== 'undefined' ? window : globalThis);
