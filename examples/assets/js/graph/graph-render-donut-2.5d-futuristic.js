/**
 * @description Futuristic 2.5D donut chart renderer with configurable perspective angle, output size, title/subtitle/footer, top categories, percentage labels and stats panel.
 * @input json file with following structure:
 * {
 *   "title"    : "string",
 *   "subtitle" : "string",
 *   "footer"   : "string",
 *   "data"     : [ { "label": "string", "value": number } ],
 *   "options"  : {
 *     "dpi"       : number,  // optional, default 96. Scales the default canvas size.
 *     "width"     : number,  // optional, explicit output width in pixels
 *     "height"    : number,  // optional, explicit output height in pixels
 *     "viewAngle" : number,  // optional, degrees from 5 to 85. Higher = more face camera. Default 25
 *     "depth"     : number   // optional, donut thickness in layout units. Default 1.8
 *   }
 * }
 * @output png file
 */
const { createCanvas } = require('canvas');

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + percent));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + percent));
  const b = Math.max(0, Math.min(255, (num & 0xFF) + percent));

  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

const inputFile = globalThis.inputFile;

const input = JSON.parse(
  typeof inputFile === 'string'
    ? inputFile
    : Buffer.from(inputFile.base64, 'base64').toString('utf8')
);

const titleText = input.title || 'Répartition par catégorie';
const subtitleText = input.subtitle || 'Top 6 — Donut 2.5D';
const footerText = input.footer || 'Généré par Agent Kroki';
const data = Array.isArray(input.data)
  ? input.data.filter(r => r && r.label && !isNaN(r.value))
  : [];

const opt = input.options || {};

const BASE_DPI = 96;
const BASE_W = 48 * 32;
const BASE_H = 33 * 32;

const dpi = isFiniteNumber(opt.dpi) && opt.dpi > 0 ? opt.dpi : BASE_DPI;
const dpiScale = dpi / BASE_DPI;

const W = Math.max(
  320,
  Math.round(isFiniteNumber(opt.width) ? opt.width : BASE_W * dpiScale)
);

const H = Math.max(
  240,
  Math.round(isFiniteNumber(opt.height) ? opt.height : BASE_H * dpiScale)
);

const scale = Math.min(W / BASE_W, H / BASE_H);
const unit = 32 * scale;
const g = m => m * unit;

const viewAngle = clamp(
  isFiniteNumber(opt.viewAngle) ? opt.viewAngle : 35,
  5,
  90
);

const viewAngleRad = (viewAngle * Math.PI) / 180;
const tilt = Math.max(0.12, Math.sin(viewAngleRad));

const baseDepthUnits = isFiniteNumber(opt.depth) ? Math.max(0, opt.depth) : 1.8;

const colors = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
];

// Aggregate by label
const byKey = {};
for (const r of data) {
  if (!byKey[r.label]) {
    byKey[r.label] = 0;
  }

  byKey[r.label] += Number(r.value);
}

const keys = Object.entries(byKey).sort((a, b) => b[1] - a[1]);
const topKeys = keys.slice(0, 6);
const totalReq = topKeys.reduce((a, k) => a + k[1], 0);

const slices = totalReq > 0
  ? topKeys.map(([name, val], i) => {
    const pct = val / totalReq;
    return { name, value: val, pct, color: colors[i % colors.length] };
  })
  : [];

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

const PAD = g(1.5);
const cardX = PAD;
const cardY = PAD;
const cardW = W - PAD * 2;
const cardH = H - PAD * 2;

const titleH = g(4.5);
const footerH = g(2);
const gapH = g(0.5);
const contentH = cardH - titleH - footerH - gapH * 2;

const Z = {
  title: {
    x: cardX,
    y: cardY,
    w: cardW,
    h: titleH,
  },
  content: {
    x: cardX,
    y: cardY + titleH + gapH,
    w: cardW,
    h: contentH,
  },
  footer: {
    x: cardX,
    y: cardY + cardH - footerH,
    w: cardW,
    h: footerH,
  },
};

Z.chart = {
  x: Z.content.x,
  y: Z.content.y,
  w: Z.content.w * 0.65,
  h: Z.content.h,
};

Z.stats = {
  x: Z.content.x + Z.content.w * 0.65 + g(1),
  y: Z.content.y,
  w: Z.content.w * 0.35 - g(1),
  h: Z.content.h,
};

// Background
ctx.fillStyle = '#0f172a';
ctx.fillRect(0, 0, W, H);

// Card
ctx.save();
ctx.shadowColor = 'rgba(0,0,0,0.5)';
ctx.shadowBlur = 20 * scale;
ctx.shadowOffsetY = 4 * scale;
ctx.beginPath();
ctx.roundRect(cardX, cardY, cardW, cardH, Math.max(8, 16 * scale));
ctx.fillStyle = 'rgba(30,41,59,0.85)';
ctx.fill();
ctx.strokeStyle = 'rgba(148,163,184,0.15)';
ctx.lineWidth = Math.max(1, scale);
ctx.stroke();
ctx.restore();

// Title box
ctx.save();
ctx.fillStyle = 'rgba(59,130,246,0.10)';
ctx.beginPath();
ctx.roundRect(
  Z.title.x + 4 * scale,
  Z.title.y + 4 * scale,
  Z.title.w - 8 * scale,
  Z.title.h - 8 * scale,
  Math.max(6, 12 * scale)
);
ctx.fill();
ctx.restore();

// Title text
ctx.fillStyle = '#f1f5f9';
ctx.font = `bold ${Math.max(18, Math.round(34 * scale))}px Arial`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(
  titleText,
  Z.title.x + Z.title.w / 2,
  Z.title.y + Z.title.h / 2 - 12 * scale
);

ctx.fillStyle = '#64748b';
ctx.font = `${Math.max(12, Math.round(20 * scale))}px Arial`;
ctx.fillText(
  subtitleText,
  Z.title.x + Z.title.w / 2,
  Z.title.y + Z.title.h / 2 + 22 * scale
);

ctx.strokeStyle = 'rgba(59,130,246,0.12)';
ctx.lineWidth = Math.max(1, scale);
ctx.beginPath();
ctx.moveTo(cardX + g(1), Z.title.y + Z.title.h);
ctx.lineTo(cardX + cardW - g(1), Z.title.y + Z.title.h);
ctx.stroke();

// Chart geometry
const cx = Z.chart.x + Z.chart.w / 2;
const cy = Z.chart.y + Z.chart.h / 2;
const rx = Math.min(Z.chart.w * 0.48, g(9));
const ry = rx * tilt;
const rxIn = rx * 0.52;
const ryIn = ry * 0.52;
const depth = g(baseDepthUnits * (1.15 - tilt * 0.35));

function drawFlatDonut(offsetY) {
  let currentAngle = -Math.PI / 2;
  const isTopLayer = offsetY === 0;

  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    const angle = s.pct * Math.PI * 2;
    const endAngle = currentAngle + angle;

    ctx.beginPath();
    ctx.ellipse(cx, cy + offsetY, rx, ry, 0, currentAngle, endAngle);
    ctx.ellipse(cx, cy + offsetY, rxIn, ryIn, 0, endAngle, currentAngle, true);
    ctx.closePath();

    if (isTopLayer) {
      const grad = ctx.createRadialGradient(
        cx - rx * 0.2,
        cy + offsetY - ry * 0.3,
        rxIn,
        cx,
        cy + offsetY,
        rx
      );
      grad.addColorStop(0, shadeColor(s.color, 20));
      grad.addColorStop(0.6, s.color);
      grad.addColorStop(1, shadeColor(s.color, -25));
      ctx.fillStyle = grad;
    } else {
      const darkness = Math.min(1, (offsetY / Math.max(depth, 1)) * 0.6);
      ctx.fillStyle = shadeColor(s.color, -Math.round(60 * darkness));
    }

    ctx.fill();
    currentAngle = endAngle;
  }
}

if (slices.length > 0) {
  for (let dy = depth; dy >= 1; dy--) {
    drawFlatDonut(dy);
  }

  drawFlatDonut(0);

  // Slice borders
  let currentAngle = -Math.PI / 2;
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    const angle = s.pct * Math.PI * 2;
    const endAngle = currentAngle + angle;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, currentAngle, endAngle);
    ctx.strokeStyle = 'rgba(10,15,30,0.4)';
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx, cy, rxIn, ryIn, 0, currentAngle, endAngle);
    ctx.stroke();

    const sx = cx + rx * Math.cos(endAngle);
    const sy = cy + ry * Math.sin(endAngle);
    const ix = cx + rxIn * Math.cos(endAngle);
    const iy = cy + ryIn * Math.sin(endAngle);

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ix, iy);
    ctx.stroke();

    currentAngle = endAngle;
  }

  // Center text
  ctx.fillStyle = '#f1f5f9';
  ctx.font = `bold ${Math.max(16, Math.round(30 * scale))}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(totalReq.toLocaleString(), cx, cy - 10 * scale);

  ctx.fillStyle = '#64748b';
  ctx.font = `${Math.max(11, Math.round(18 * scale))}px Arial`;
  ctx.fillText('total', cx, cy + 18 * scale);

  // Percentage labels
  currentAngle = -Math.PI / 2;
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    const angle = s.pct * Math.PI * 2;
    const midAngle = currentAngle + angle / 2;

    if (s.pct > 0.03) {
      const midRx = (rx + rxIn) / 2;
      const midRy = (ry + ryIn) / 2;
      const lx = cx + midRx * Math.cos(midAngle);
      const ly = cy + midRy * Math.sin(midAngle);

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(10, Math.round(18 * scale))}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4 * scale;
      ctx.fillText((s.pct * 100).toFixed(1) + '%', lx, ly);
      ctx.shadowBlur = 0;
    }

    currentAngle += angle;
  }
} else {
  ctx.fillStyle = '#f1f5f9';
  ctx.font = `bold ${Math.max(16, Math.round(28 * scale))}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('No data', cx, cy);
}

// Stats
if (slices.length > 0) {
  const statY = Z.stats.y + g(0.5);
  const statH = (Z.stats.h - g(1)) / slices.length;

  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    const sy = statY + i * statH;

    ctx.fillStyle = s.color;
    ctx.shadowColor = s.color + '40';
    ctx.shadowBlur = 4 * scale;
    ctx.beginPath();
    ctx.roundRect(
      Z.stats.x,
      sy + 8 * scale,
      Math.max(3, 6 * scale),
      statH - 16 * scale,
      Math.max(2, 3 * scale)
    );
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#e2e8f0';
    ctx.font = `${Math.max(12, Math.round(24 * scale))}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const maxLen = 28;
    const sn = s.name.length > maxLen ? s.name.substring(0, maxLen - 2) + '...' : s.name;
    ctx.fillText(sn, Z.stats.x + 16 * scale, sy + 6 * scale);

    ctx.fillStyle = '#64748b';
    ctx.font = `${Math.max(10, Math.round(20 * scale))}px Arial`;
    ctx.fillText(
      s.value.toLocaleString() + '  ·  ' + (s.pct * 100).toFixed(1) + '%',
      Z.stats.x + 16 * scale,
      sy + 38 * scale
    );

    const barX = Z.stats.x + 16 * scale;
    const barW = Z.stats.w - 22 * scale;
    const barY = sy + statH - 12 * scale;

    ctx.fillStyle = 'rgba(148,163,184,0.1)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, Math.max(4, 6 * scale), Math.max(2, 3 * scale));
    ctx.fill();

    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * s.pct, Math.max(4, 6 * scale), Math.max(2, 3 * scale));
    ctx.fill();
  }
}

// Footer
ctx.save();
ctx.fillStyle = 'rgba(59,130,246,0.06)';
ctx.beginPath();
ctx.roundRect(
  Z.footer.x + 4 * scale,
  Z.footer.y + 2 * scale,
  Z.footer.w - 8 * scale,
  Z.footer.h - 4 * scale,
  Math.max(5, 10 * scale)
);
ctx.fill();
ctx.restore();

ctx.fillStyle = '#475569';
ctx.font = `${Math.max(10, Math.round(17 * scale))}px Arial`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(
  footerText,
  Z.footer.x + Z.footer.w / 2,
  Z.footer.y + Z.footer.h / 2
);

process.stdout.write(canvas.toBuffer('image/png').toString('base64'));