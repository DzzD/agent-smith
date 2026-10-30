/**
 * @description Generic 2.5D pie chart renderer with exploded slices, labels and legend from normalized JSON series.
 * @input json file with following structure:
 * {
 *   "title"   : "string",
 *   "data"    : [ { "label": "string", "value": number, "color": "string" } ],
 *   "items"   : [ { "name": "string", "amount": number, "hex": "string" } ],
 *   "width"   : number,
 *   "height"  : number
 * }
 * @output png file
 */
const { createCanvas } = require('canvas');

const input = globalThis.inputFile;
if (!input) throw new Error('Missing input JSON file');

const DEFAULT_COLORS = ['#2563eb', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#d97706'];

function parseInputJson(inputFile) {
  const text = Buffer.from(inputFile.base64, 'base64').toString('utf8').trim();

  if (!text) {
    throw new Error('Input JSON is empty');
  }

  try {
    return JSON.parse(text);
  }
  catch (error) {
    throw new Error(`Invalid JSON input: ${error.message}`);
  }
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
  }

  return undefined;
}

function parseNumeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\s/g, '').replace(/€/g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  return NaN;
}

function normalizeHexColor(color) {
  if (typeof color !== 'string') {
    return null;
  }

  const trimmed = color.trim();

  if (/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  }

  if (/^#?[0-9a-fA-F]{3}$/.test(trimmed)) {
    const raw = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }

  return null;
}

function rgbFromHex(hex) {
  const n = hex.replace('#', '');
  return {
    r: Number.parseInt(n.slice(0, 2), 16),
    g: Number.parseInt(n.slice(2, 4), 16),
    b: Number.parseInt(n.slice(4, 6), 16),
  };
}

function shade(hex, amount) {
  const { r, g, b } = rgbFromHex(hex);
  const clamp = value => Math.max(0, Math.min(255, Math.round(value + amount)));
  return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
}

function extractSeries(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }

  if (payload && Array.isArray(payload.items)) {
    return payload.items;
  }

  throw new Error('Input JSON must be an array or an object containing data/items array');
}

function normalizeEntries(series) {
  const result = [];

  series.forEach((item, index) => {
    const labelRaw = pick(item, ['libelle', 'label', 'name', 'region']);
    const valueRaw = pick(item, ['valeur', 'value', 'amount', 'ca', 'y']);
    const colorRaw = pick(item, ['couleur', 'color', 'hex']);

    const label = typeof labelRaw === 'string' ? labelRaw.trim() : '';
    const value = parseNumeric(valueRaw);

    if (!label) {
      return;
    }

    if (!Number.isFinite(value) || value <= 0) {
      return;
    }

    const color = normalizeHexColor(colorRaw) || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    result.push({ label, value, color });
  });

  if (!result.length) {
    throw new Error('No valid data points found. Expected entries with label/libelle and positive value/valeur');
  }

  return result;
}

const payload = parseInputJson(input);
const entries = normalizeEntries(extractSeries(payload));
const total = entries.reduce((sum, entry) => sum + entry.value, 0);

if (!Number.isFinite(total) || total <= 0) {
  throw new Error('Total value must be greater than 0');
}

const W = Number.isFinite(payload.width) ? Math.max(900, Math.floor(payload.width)) : 1500;
const H = Number.isFinite(payload.height) ? Math.max(650, Math.floor(payload.height)) : 980;
const title = typeof payload.title === 'string' && payload.title.trim()
  ? payload.title.trim()
  : 'Camembert 2.5D';

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#f8fafc';
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#0f172a';
ctx.font = 'bold 36px sans-serif';
ctx.textAlign = 'center';
ctx.fillText(title, W / 2, 60);

const cx = 560;
const cy = 560;
const R = 320;
const depth = 42;
const explode = 14;

let current = -Math.PI / 2;
const slices = entries.map(entry => {
  const angle = (entry.value / total) * 2 * Math.PI;
  const a1 = current;
  const a2 = current + angle;
  const mid = (a1 + a2) / 2;
  current = a2;

  return {
    label: entry.label,
    value: entry.value,
    a1,
    a2,
    mid,
    color: entry.color,
    pct: (entry.value / total) * 100,
  };
});

function explodedCenter(slice) {
  return { cx: cx + Math.cos(slice.mid) * explode, cy: cy + Math.sin(slice.mid) * explode };
}

function pointOnTop(slice, angle) {
  const ec = explodedCenter(slice);
  return { x: ec.cx + Math.cos(angle) * R, y: ec.cy + Math.sin(angle) * R };
}

function pointOnBottom(slice, angle) {
  const ec = explodedCenter(slice);
  return { x: ec.cx + Math.cos(angle) * R, y: ec.cy + Math.sin(angle) * R + depth };
}

const drawables = [];

function addQuad(p1, p2, p3, p4, fill, z) {
  drawables.push({ p1, p2, p3, p4, fill, z });
}

for (const slice of slices) {
  const ec = explodedCenter(slice);
  const centerTop = { x: ec.cx, y: ec.cy };
  const centerBottom = { x: ec.cx, y: ec.cy + depth };
  const topLeft = pointOnTop(slice, slice.a1);
  const topRight = pointOnTop(slice, slice.a2);
  const bottomRight = pointOnBottom(slice, slice.a2);
  const bottomLeft = pointOnBottom(slice, slice.a1);

  const segmentCount = 80;
  const step = (slice.a2 - slice.a1) / segmentCount;

  for (let i = 0; i < segmentCount; i += 1) {
    const a1 = slice.a1 + i * step;
    const a2 = slice.a1 + (i + 1) * step;
    const p1 = pointOnTop(slice, a1);
    const p2 = pointOnTop(slice, a2);
    const p3 = pointOnBottom(slice, a2);
    const p4 = pointOnBottom(slice, a1);
    const z = (p1.y + p2.y + p3.y + p4.y) / 4;
    const lighting = Math.sin((a1 + a2) / 2) * 12 - 10;
    addQuad(p1, p2, p3, p4, shade(slice.color, lighting), z);
  }

  addQuad(
    centerTop,
    topLeft,
    bottomLeft,
    centerBottom,
    shade(slice.color, -35),
    Math.min(centerTop.y + depth, topLeft.y, bottomLeft.y, centerBottom.y),
  );

  addQuad(
    centerTop,
    topRight,
    bottomRight,
    centerBottom,
    shade(slice.color, -35),
    Math.min(centerTop.y + depth, topRight.y, bottomRight.y, centerBottom.y),
  );
}

drawables.sort((a, b) => a.z - b.z);
drawables.forEach(drawable => {
  ctx.fillStyle = drawable.fill;
  ctx.beginPath();
  ctx.moveTo(drawable.p1.x, drawable.p1.y);
  ctx.lineTo(drawable.p2.x, drawable.p2.y);
  ctx.lineTo(drawable.p3.x, drawable.p3.y);
  ctx.lineTo(drawable.p4.x, drawable.p4.y);
  ctx.closePath();
  ctx.fill();
});

for (const slice of slices) {
  const ec = explodedCenter(slice);
  ctx.fillStyle = slice.color;
  ctx.beginPath();
  ctx.moveTo(ec.cx, ec.cy);
  ctx.arc(ec.cx, ec.cy, R, slice.a1, slice.a2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();
}

ctx.shadowColor = 'rgba(0,0,0,0.18)';
ctx.shadowBlur = 8;
ctx.shadowOffsetY = 4;

for (const slice of slices) {
  const ec = explodedCenter(slice);
  const lx = ec.cx + Math.cos(slice.mid) * (R + 48);
  const ly = ec.cy + Math.sin(slice.mid) * (R + 48);
  const labelText = slice.label;
  const pctText = `${slice.pct.toFixed(1)}%`;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px sans-serif';
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#0f172a';
  ctx.strokeText(labelText, lx, ly - 10);
  ctx.fillText(labelText, lx, ly - 10);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.fillStyle = slice.color;
  ctx.strokeText(pctText, lx, ly + 18);
  ctx.fillText(pctText, lx, ly + 18);
}

ctx.shadowBlur = 0;

const legendX = 980;
const legendY = 180;
ctx.textAlign = 'left';
ctx.font = '20px sans-serif';
ctx.fillStyle = '#0f172a';
ctx.fillText('Repartition', legendX, legendY - 30);
ctx.font = '18px sans-serif';

slices.forEach((slice, index) => {
  const y = legendY + index * 44;
  ctx.fillStyle = slice.color;
  ctx.fillRect(legendX, y - 14, 18, 18);
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`${slice.label} - ${slice.pct.toFixed(1)}%`, legendX + 28, y + 4);
});

process.stdout.write(canvas.toBuffer('image/png').toString('base64'));