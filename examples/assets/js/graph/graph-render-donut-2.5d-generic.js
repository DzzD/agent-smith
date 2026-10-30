/**
 * @description Generic 2.5D donut chart renderer with optional smoothing-ready series normalization and legend output.
 * @input json file with following structure:
 * {
 *   "title"    : "string",
 *   "data"     : [ { "label": "string", "value": number, "color": "string" } ],
 *   "items"    : [ { "name": "string", "amount": number, "hex": "string" } ],
 *   "width"    : number,
 *   "height"   : number,
 *   "innerRatio": number
 * }
 * @output png file
 */
const { createCanvas } = require('canvas');
const input = globalThis.inputFile;
if (!input) throw new Error('Missing input JSON file');

const DEFAULT_COLORS = ['#2563eb', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#d97706'];

function parseInputJson(f) {
  const t = Buffer.from(f.base64, 'base64').toString('utf8').trim();
  if (!t) throw new Error('Input JSON is empty');
  return JSON.parse(t);
}
function pick(o, k) {
  for (const x of k) { if (o && Object.prototype.hasOwnProperty.call(o, x)) return o[x]; }
}
function parseNumeric(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v.replace(/\s/g, '').replace(/€/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}
function normalizeHexColor(color) {
  if (typeof color !== 'string') return null;
  const t = color.trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(t)) return t.startsWith('#') ? t : `#${t}`;
  if (/^#?[0-9a-fA-F]{3}$/.test(t)) {
    const r = t.startsWith('#') ? t.slice(1) : t;
    return `#${r[0]}${r[0]}${r[1]}${r[1]}${r[2]}${r[2]}`;
  }
  return null;
}
function rgbFromHex(hex) {
  const n = hex.replace('#', '');
  return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) };
}
function shade(hex, amount) {
  const { r, g, b } = rgbFromHex(hex);
  const clamp = v => Math.max(0, Math.min(255, Math.round(v + amount)));
  return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
}
function extractSeries(p) {
  if (Array.isArray(p)) return p;
  if (p && Array.isArray(p.data)) return p.data;
  if (p && Array.isArray(p.items)) return p.items;
  throw new Error('Input JSON must be an array or an object with data/items');
}
function normalizeEntries(series) {
  const res = [];
  series.forEach((it, idx) => {
    const label = String(pick(it, ['libelle', 'label', 'name', 'region']) ?? '').trim();
    const value = parseNumeric(pick(it, ['valeur', 'value', 'amount', 'ca', 'y']));
    const color = normalizeHexColor(pick(it, ['couleur', 'color', 'hex'])) || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
    if (!label || !Number.isFinite(value) || value <= 0) return;
    res.push({ label, value, color });
  });
  if (!res.length) throw new Error('No valid data points found');
  return res;
}

// --- Parse input ---
const payload = parseInputJson(input);
const entries = normalizeEntries(extractSeries(payload));
const total = entries.reduce((s, e) => s + e.value, 0);
if (!Number.isFinite(total) || total <= 0) throw new Error('Total value must be > 0');

const W = Number.isFinite(payload.width) ? Math.max(900, Math.floor(payload.width)) : 1500;
const H = Number.isFinite(payload.height) ? Math.max(650, Math.floor(payload.height)) : 980;
const title = (typeof payload.title === 'string' && payload.title.trim()) ? payload.title.trim() : 'Donut 2.5D';
const innerRatio = Number.isFinite(payload.innerRatio) ? Math.min(Math.max(payload.innerRatio, 0.2), 0.85) : 0.6;

// --- Canvas setup ---
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#f8fafc';
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#0f172a';
ctx.font = 'bold 36px sans-serif';
ctx.textAlign = 'center';
ctx.fillText(title, W / 2, 60);

// --- Geometry ---
const cx = 560, cy = 560, R = 320, r = Math.round(R * innerRatio), depth = 42, explode = 14;

let current = -Math.PI / 2;
const slices = entries.map(e => {
  const ang = (e.value / total) * 2 * Math.PI;
  const a1 = current, a2 = current + ang;
  current = a2;
  return { label: e.label, value: e.value, a1, a2, mid: (a1 + a2) / 2, color: e.color, pct: (e.value / total) * 100 };
});

// All faces of a slice use the SAME explode — guarantees connectivity
function sliceCenter(s) {
  return { cx: cx + Math.cos(s.mid) * explode, cy: cy + Math.sin(s.mid) * explode };
}
function pt(s, angle, radius, zOff) {
  const c = sliceCenter(s);
  return { x: c.cx + Math.cos(angle) * radius, y: c.cy + Math.sin(angle) * radius + zOff };
}

// --- Draw 3D side faces ---
const drawables = [];
function addQuad(p1, p2, p3, p4, fill, z) {
  drawables.push({ p1, p2, p3, p4, fill, z });
}

for (const s of slices) {
  // OUTER curved wall
  const seg = 80;
  const step = (s.a2 - s.a1) / seg;
  for (let i = 0; i < seg; i++) {
    const a1 = s.a1 + i * step, a2 = s.a1 + (i + 1) * step;
    const p1 = pt(s, a1, R, 0), p2 = pt(s, a2, R, 0);
    const p3 = pt(s, a2, R, depth), p4 = pt(s, a1, R, depth);
    addQuad(p1, p2, p3, p4, shade(s.color, Math.sin((a1 + a2) / 2) * 12 - 10), (p1.y + p2.y + p3.y + p4.y) / 4);
  }

  // INNER curved wall (same explode — connected)
  const innerSeg = 24;
  const innerStep = (s.a2 - s.a1) / innerSeg;
  for (let i = 0; i < innerSeg; i++) {
    const a1 = s.a1 + i * innerStep, a2 = s.a1 + (i + 1) * innerStep;
    const p1 = pt(s, a1, r, 0), p2 = pt(s, a2, r, 0);
    const p3 = pt(s, a2, r, depth), p4 = pt(s, a1, r, depth);
    addQuad(p1, p2, p3, p4, shade(s.color, -18), (p1.y + p2.y + p3.y + p4.y) / 4);
  }

  // Radial walls (start and end) — connect inner and outer
  const a1 = s.a1, a2 = s.a2;
  // Start wall
  const oT1 = pt(s, a1, R, 0), oB1 = pt(s, a1, R, depth);
  const iT1 = pt(s, a1, r, 0), iB1 = pt(s, a1, r, depth);
  addQuad(oT1, iT1, iB1, oB1, shade(s.color, -28), Math.min(oT1.y, iT1.y, iB1.y, oB1.y));
  // End wall
  const oT2 = pt(s, a2, R, 0), oB2 = pt(s, a2, R, depth);
  const iT2 = pt(s, a2, r, 0), iB2 = pt(s, a2, r, depth);
  addQuad(iT2, oT2, oB2, iB2, shade(s.color, -28), Math.min(iT2.y, oT2.y, oB2.y, iB2.y));
}

// Sort by depth and draw
drawables.sort((a, b) => a.z - b.z);
for (const d of drawables) {
  ctx.fillStyle = d.fill;
  ctx.beginPath();
  ctx.moveTo(d.p1.x, d.p1.y);
  ctx.lineTo(d.p2.x, d.p2.y);
  ctx.lineTo(d.p3.x, d.p3.y);
  ctx.lineTo(d.p4.x, d.p4.y);
  ctx.closePath();
  ctx.fill();
}

// --- Draw top faces (colored rings) ---
for (const s of slices) {
  const c = sliceCenter(s);
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.arc(c.cx, c.cy, R, s.a1, s.a2);
  ctx.arc(c.cx, c.cy, r, s.a2, s.a1, true);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// --- Labels ---
ctx.shadowColor = 'rgba(0,0,0,0.18)';
ctx.shadowBlur = 8;
ctx.shadowOffsetY = 4;
for (const s of slices) {
  const c = sliceCenter(s);
  const lx = c.cx + Math.cos(s.mid) * (R + 54);
  const ly = c.cy + Math.sin(s.mid) * (R + 54);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px sans-serif';
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#0f172a';
  ctx.strokeText(s.label, lx, ly - 10);
  ctx.fillText(s.label, lx, ly - 10);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = s.color;
  ctx.strokeText(`${s.pct.toFixed(1)}%`, lx, ly + 18);
  ctx.fillText(`${s.pct.toFixed(1)}%`, lx, ly + 18);
}
ctx.shadowBlur = 0;

// --- Legend ---
const legendX = 980, legendY = 180;
ctx.textAlign = 'left';
ctx.font = '20px sans-serif';
ctx.fillStyle = '#0f172a';
ctx.fillText('Répartition', legendX, legendY - 30);
ctx.font = '18px sans-serif';
slices.forEach((s, i) => {
  const y = legendY + i * 44;
  ctx.fillStyle = s.color;
  ctx.fillRect(legendX, y - 14, 18, 18);
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`${s.label} - ${s.pct.toFixed(1)}%`, legendX + 28, y + 4);
});

process.stdout.write(canvas.toBuffer('image/png').toString('base64'));