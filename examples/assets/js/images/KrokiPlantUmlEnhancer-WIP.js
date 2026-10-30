// V11 + points verts en dernier
async function main(files) {
  const { createCanvas } = require('canvas');
  const svg = files[0].data.toString('utf8');
  if (!svg) throw new Error('No SVG input');

  const C = {
    bg: '#F5F7FA', action: '#FFFFFF', actionBorder: '#6C9BCB', actionText: '#1E293B',
    decisionBorder: '#E6007E', decisionText: '#E6007E', ellipseFill: '#E6007E',
    ellipseStroke: '#E6007E', arrow: '#6C9BCB', arrowHead: '#6C9BCB',
    diamondFill: '#FFFFFF', diamondBorder: '#E6007E', conditionText: '#E6007E'
  };

  const wm = svg.match(/width="(\d+)/);
  const hm = svg.match(/height="(\d+)/);
  const W0 = wm ? parseInt(wm[1]) : 800;
  const H0 = hm ? parseInt(hm[1]) : 600;
  const sc = 2, pad = 30;
  const W = Math.round(W0 * sc + pad * 2);
  const H = Math.round(H0 * sc + pad * 2);
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  function sx(v) { return v * sc + pad; }
  function sy(v) { return v * sc + pad; }
  function sw(v) { return v * sc; }

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

  // === PARSE SVG ===
  const rects = [];
  const rectParts = svg.match(/<rect[^>]*\/>/g) || [];
  for (const part of rectParts) {
    const h = part.match(/height="([\d.]+)"/);
    const w = part.match(/width="([\d.]+)"/);
    const x = part.match(/ x="([\d.]+)"/);
    const y = part.match(/ y="([\d.]+)"/);
    const rx = part.match(/ rx="([\d.]+)"/);
    if (h && w && x && y) {
      rects.push({ h: parseFloat(h[1]), w: parseFloat(w[1]), x: parseFloat(x[1]), y: parseFloat(y[1]), rx: rx ? parseFloat(rx[1]) : 0 });
    }
  }

  const polygons = [];
  const polyParts = svg.match(/<polygon[^>]*fill="#F1F1F1"[^>]*points="([^"]+)"/g) || [];
  for (const part of polyParts) {
    const pts = part.match(/points="([^"]+)"/);
    if (pts) { const p = pts[1].trim().split(/[,\s]+/).map(parseFloat); polygons.push({ points: p }); }
  }

  const ellipses = [];
  const ellParts = svg.match(/<ellipse[^>]*\/>/g) || [];
  for (const part of ellParts) {
    const cx = part.match(/ cx="([\d.]+)"/);
    const cy = part.match(/ cy="([\d.]+)"/);
    const fill = part.match(/ fill="([^"]+)"/);
    const rx = part.match(/ rx="([\d.]+)"/);
    const ry = part.match(/ ry="([\d.]+)"/);
    if (cx && cy && rx && ry) {
      ellipses.push({ cx: parseFloat(cx[1]), cy: parseFloat(cy[1]), fill: fill ? fill[1] : 'none', rx: parseFloat(rx[1]), ry: parseFloat(ry[1]) });
    }
  }

  const texts = [];
  const textParts = svg.match(/<text[^>]*>([^<]+)<\/text>/g) || [];
  for (const part of textParts) {
    const x = part.match(/ x="([\d.]+)"/);
    const y = part.match(/ y="([\d.]+)"/);
    const label = part.match(/>([^<]+)</);
    const tl = part.match(/textLength="([\d.]+)"/);
    if (x && y && label) {
      texts.push({ x: parseFloat(x[1]), y: parseFloat(y[1]), label: label[1].replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c)), textLength: tl ? parseFloat(tl[1]) : 0 });
    }
  }

  const lines = [];
  const lineParts = svg.match(/<line[^>]*\/>/g) || [];
  for (const part of lineParts) {
    const x1 = part.match(/ x1="([\d.]+)"/);
    const y1 = part.match(/ y1="([\d.]+)"/);
    const x2 = part.match(/ x2="([\d.]+)"/);
    const y2 = part.match(/ y2="([\d.]+)"/);
    if (x1 && y1 && x2 && y2) {
      lines.push({ x1: parseFloat(x1[1]), y1: parseFloat(y1[1]), x2: parseFloat(x2[1]), y2: parseFloat(y2[1]) });
    }
  }

  const arrowPolys = [];
  const arrowParts = svg.match(/<polygon[^>]*fill="#181818"[^>]*points="([^"]+)"/g) || [];
  for (const part of arrowParts) {
    const pts = part.match(/points="([^"]+)"/);
    if (pts) { const p = pts[1].trim().split(/[,\s]+/).map(parseFloat); arrowPolys.push({ points: p }); }
  }

  // === DESSIN ===
  ctx.strokeStyle = C.arrow; ctx.lineWidth = 1.5 * sc;
  for (const l of lines) { ctx.beginPath(); ctx.moveTo(sx(l.x1), sy(l.y1)); ctx.lineTo(sx(l.x2), sy(l.y2)); ctx.stroke(); }

  ctx.fillStyle = C.arrowHead;
  for (const ap of arrowPolys) { ctx.beginPath(); ctx.moveTo(sx(ap.points[0]), sy(ap.points[1])); for (let i = 2; i < ap.points.length; i += 2) ctx.lineTo(sx(ap.points[i]), sy(ap.points[i + 1])); ctx.closePath(); ctx.fill(); }

  for (const r of rects) {
    const rx2 = sx(r.x), ry2 = sy(r.y), rw2 = sw(r.w), rh2 = sw(r.h), rad = sw(r.rx || 8);
    ctx.fillStyle = C.action; ctx.strokeStyle = C.actionBorder; ctx.lineWidth = 2 * sc;
    ctx.beginPath();
    ctx.moveTo(rx2 + rad, ry2); ctx.lineTo(rx2 + rw2 - rad, ry2);
    ctx.arcTo(rx2 + rw2, ry2, rx2 + rw2, ry2 + rad, rad);
    ctx.lineTo(rx2 + rw2, ry2 + rh2 - rad);
    ctx.arcTo(rx2 + rw2, ry2 + rh2, rx2 + rw2 - rad, ry2 + rh2, rad);
    ctx.lineTo(rx2 + rad, ry2 + rh2);
    ctx.arcTo(rx2, ry2 + rh2, rx2, ry2 + rh2 - rad, rad);
    ctx.lineTo(rx2, ry2 + rad);
    ctx.arcTo(rx2, ry2, rx2 + rad, ry2, rad);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  ctx.fillStyle = C.diamondFill; ctx.strokeStyle = C.diamondBorder; ctx.lineWidth = 2 * sc;
  for (const p of polygons) {
    ctx.beginPath(); ctx.moveTo(sx(p.points[0]), sy(p.points[1]));
    for (let i = 2; i < p.points.length; i += 2) ctx.lineTo(sx(p.points[i]), sy(p.points[i + 1]));
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  for (const e of ellipses) {
    ctx.fillStyle = e.fill === '#222222' ? C.ellipseFill : '#FFFFFF';
    ctx.strokeStyle = C.ellipseStroke; ctx.lineWidth = 2 * sc;
    ctx.beginPath(); ctx.ellipse(sx(e.cx), sy(e.cy), sw(e.rx), sw(e.ry), 0, 0, Math.PI * 2);
    ctx.fill(); if (e.fill === 'none') ctx.stroke();
  }

  // === TEXTES ===
  ctx.font = '600 11px Arial, sans-serif';
  ctx.textBaseline = 'top';

  for (const t of texts) {
    const isCondition = t.label === 'Oui' || t.label === 'Non' || t.label === 'OK' || t.label === 'KO';

    if (isCondition) {
      // Conditions: centrer sur la zone textLength du SVG
      ctx.fillStyle = C.conditionText;
      ctx.textAlign = 'center';
      const centerX = sx(t.x) + (t.textLength * sc) / 2;
      ctx.fillText(t.label, centerX, sy(t.y));
    } else {
      // Autres textes: centrés dans leurs rectangles
      ctx.textAlign = 'center';
      ctx.fillStyle = C.actionText;
      let tx = sx(t.x);
      let ty = sy(t.y);
      // CERFA valide ? est dans un losange, pas un rectangle
      // Chercher le losange correspondant
      if (t.label === 'CERFA valide ?') {
        // Le texte du losange: utiliser le centre du losange
        // Debug: dessiner la boite englobante du texte
        const textMetrics = ctx.measureText(t.label);
        const textHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
        
        // Losange center = (sommet gauche + sommet droit)/2, (sommet haut + sommet bas)/2
        // On prend les 4 points du losange
        if (polygons.length > 0) {
          const p = polygons[0].points;
          // Points: [x1,y1, x2,y2, x3,y3, x4,y4]
          // Centre du losange
          const cx = (p[0] + p[2] + p[4] + p[6]) / 4;
          const cy = (p[1] + p[3] + p[5] + p[7]) / 4;
          // Centrer le texte en X sur le losange
          tx = sx(cx);
          ty = sy(cy) - textHeight / 2;
          // Dessiner la boite englobante
          ctx.save();
          ctx.strokeStyle = '#0000FF';
          ctx.lineWidth = 2;
          const tw = textMetrics.width;
          const th = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
          ctx.strokeRect(tx - tw/2, ty - th/2, tw, th);
          ctx.restore();
        }
      }
      if (t.textLength > 0) {
        tx = sx(t.x) + (t.textLength * sc) / 2;
      }
      for (const r of rects) {
        if (t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h) {
          tx = sx(r.x) + sw(r.w) / 2;
          ty = sy(r.y) + sw(r.h) / 2;
          break;
        }
      }
      ctx.fillText(t.label, tx, ty);
    }
  }

  // Points verts en dernier
  ctx.fillStyle = '#00FF00';
  [['Oui', 73.5874, 167.3433], ['Non', 198.3438, 167.3433]].forEach(([label, px, py]) => {
    ctx.beginPath();
    ctx.arc(sx(px), sy(py), 10, 0, Math.PI * 2);
    ctx.fill();
  });

  return cv.toBuffer('image/png');
}