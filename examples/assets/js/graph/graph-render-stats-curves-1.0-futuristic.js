/**
 * @description Generic multi-series line chart renderer with dual Y axes, inline legend, epoch divisions, epoch averages, markers and stats box.
 * @input json file with following structure:
 * {
 *   "title"    : "string",
 *   "series"   : [
 *     {
 *       "label"         : "string",
 *       "values"        : [number | null],  // data points
 *       "smooth"        : boolean,           // apply moving average (window=5)
 *       "color"         : "string",           // CSS color
 *       "yAxis"         : number,             // 1 or 2
 *       "scatter"       : boolean,            // semi-transparent scatter dots
 *       "showPoints"    : boolean,            // small circles on values (default true)
 *       "lineWidth"     : number,             // default 2.5
 *       "scatterRadius" : number,             // default 1.8
 *       "pointRadius"   : number              // default 0.8
 *     }
 *   ],
 *   "xAxis"    : { "label": "string", "tickValues": [number] },
 *   "yAxis"    : [
 *     { "label": "string", "min": number, "max": number, "tickValues": [number] },
 *     { "label": "string", "min": number, "max": number, "color": "string", "tickValues": [number] }
 *   ],
 *   "epochs"   : [
 *     { "seriesIndex": number, "boundaries": [number], "averages": [number], "color": "string" }
 *   ],
 *   "markers"  : [ { "at": number, "label": "string", "color": "string", "size": number, "seriesIndex": number, "values": [number] } ],
 *   "statsBox" : [ { "label": "string", "value": "string", "color": "string" } ],
 *   "options"  : { "width": number, "height": number }
 * }
 * @output png file
 */
const { createCanvas } = require('canvas');
const DEFAULTS = { width: 1344, height: 840 };
const i0 = globalThis.inputFile;
const raw = JSON.parse(
  typeof i0 === 'string'
    ? i0
    : Buffer.from(i0.base64, 'base64').toString('utf8')
);
const opt = { ...DEFAULTS, ...(raw.options || {}) };
const W = opt.width, H = opt.height;
const M = { top: 80, left: 80, right: 85, bottom: 65 };
const pw = W - M.left - M.right;
const ph = H - M.top - M.bottom;
const series = raw.series || [];
const yd = raw.yAxis || [];
const xd = raw.xAxis || { label: 'Steps', tickValues: [] };
const S = series.length > 0 ? series[0].values.length : 0;
const C = {
  bg: '#0F172A', pb: '#1E293B',
  gr: 'rgba(255,255,255,0.08)',
  g2: 'rgba(255,255,255,0.15)',
  ax: '#94A3B8', ti: '#FFFFFF', su: '#94A3B8',
  sb: 'rgba(15,23,42,0.75)',
  lt: '#CBD5E1', wh: '#FFFFFF'
};const F = {
  ax: '12px Inter', ti: 'bold 22px Inter', st: '13px Inter',
  la: '12px Inter', va: 'bold 12px Inter', tk: '11px Inter'
};

function xPos(i) {
  return M.left + (i / Math.max(S - 1, 1)) * pw;
}

function yPos(axis) {
  return v => M.top + ph - ((v - axis.min) / (axis.max - axis.min)) * ph;
}

const yFns = yd.map(yPos);

function drawGrid(yPoints, xPoints) {
  const c = ctx;
  c.strokeStyle = C.gr; c.lineWidth = 1; c.setLineDash([4, 4]);
  for (const y of yPoints) { c.beginPath(); c.moveTo(M.left, y); c.lineTo(M.left + pw, y); c.stroke(); }
  c.setLineDash([3, 4]);
  for (const x of xPoints) { c.beginPath(); c.moveTo(x, M.top); c.lineTo(x, M.top + ph); c.stroke(); }
  c.setLineDash([]);
}

function drawEpochDivs() {
  const epa = raw.epochs;
  const ep = Array.isArray(epa) ? epa[0] : epa;
  if (!ep || !ep.boundaries) return;
  const b = ep.boundaries;
  for (let i = 0; i < b.length; i++) {
    if (i % 2 === 0) {
      const x0 = xPos(b[i]);
      const x1 = i + 1 < b.length ? xPos(b[i + 1]) : M.left + pw;
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(x0, M.top, x1 - x0, ph);
    }
  }
  ctx.strokeStyle = C.g2; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
  for (let i = 1; i < b.length; i++) {
    const x = xPos(b[i]);
    ctx.beginPath(); ctx.moveTo(x, M.top); ctx.lineTo(x, M.top + ph); ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawAxes() {
  for (let ai = 0; ai < yd.length; ai++) {
    const a = yd[ai], yp = yFns[ai];
    const cx = ai === 0 ? M.left - 12 : M.left + pw + 10;
    const al = ai === 0 ? 'right' : 'left';
    ctx.fillStyle = a.color || C.ax; ctx.font = F.tk; ctx.textAlign = al; ctx.textBaseline = 'middle';
    for (const v of a.tickValues || []) ctx.fillText(v === 0 ? '0' : v.toExponential(1), cx, yp(v));
    ctx.save(); ctx.translate(ai === 0 ? 18 : W - 15, M.top + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = a.color || C.ax; ctx.font = F.ax; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(a.label, 0, 0); ctx.restore();
  }
  ctx.fillStyle = C.ax; ctx.font = F.tk; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of xd.tickValues || []) ctx.fillText('S' + v, xPos(v), M.top + ph + 10);
  ctx.fillText('S' + (S - 1), xPos(S - 1), M.top + ph + 10);
  ctx.fillStyle = C.ax; ctx.font = F.ax; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(xd.label, W / 2, H - 20);
}

function drawTitleLegend() {
  ctx.fillStyle = C.ti; ctx.font = F.ti; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(raw.title, M.left, 20);
  const y = 50; let cx = M.left;
  ctx.fillStyle = C.su; ctx.font = F.st; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(S + ' steps', cx, y);
  cx += ctx.measureText(S + ' steps').width + 16;
  for (let i = 0; i < series.length; i++) {
    const sq = 8;
    if (i > 0) { ctx.fillStyle = C.su; ctx.fillText(' • ', cx, y); cx += ctx.measureText(' • ').width; }
    ctx.fillStyle = series[i].color;
    ctx.fillRect(cx, y + 4, sq, sq); cx += sq + 5;
    ctx.fillStyle = '#E2E8F0'; ctx.font = F.st;
    ctx.fillText(series[i].label, cx, y);
    cx += ctx.measureText(series[i].label).width + 6;
  }
}

function drawStatsBox() {
  const st = raw.statsBox;
  if (!st || !st.length) return;
  const w = 200, h = 22 * st.length + 14, sx = M.left + 16, sy = M.top + 14;
  const ml = Math.max(...st.map(s => ctx.measureText(s.label).width)) + 10;
  ctx.fillStyle = C.sb; ctx.beginPath(); ctx.roundRect(sx, sy, w, h, 6); ctx.fill();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let i = 0; i < st.length; i++) {
    const y = sy + 14 + i * 22;
    ctx.fillStyle = C.lt; ctx.font = F.la; ctx.fillText(st[i].label, sx + 14, y);
    ctx.fillStyle = st[i].color; ctx.font = F.va; ctx.fillText(st[i].value, sx + 14 + ml, y);
  }
}

function drawMarkers() {
  const mk = raw.markers;
  if (!mk || !yFns.length) return;
  for (const m of mk) {
    const si = m.seriesIndex || 0;
    const yp = yFns[(series[si]?.yAxis || 1) - 1] || yFns[0];
    if (m.at < 0 || m.at >= (m.values||[]).length) continue;
    const x = xPos(m.at), y = yp(m.values[m.at]);
    ctx.fillStyle = m.color || '#FFFFFF';
    ctx.beginPath(); ctx.arc(x, y, m.size || 7, 0, Math.PI * 2); ctx.fill();
    if (m.label) {
      ctx.fillStyle = C.wh; ctx.font = F.va; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(m.label, x, y - (m.size || 7) - 4);
    }
  }
}

function drawEpochAverages() {
  const epa = raw.epochs;
  if (!epa || !yFns.length) return;
  const list = Array.isArray(epa) ? epa : [epa];
  for (const ep of list) {
    const si = ep.seriesIndex || 0;
    const yp = yFns[(series[si]?.yAxis || 1) - 1] || yFns[0];
    const col = ep.color || series[si]?.color || '#FFFFFF';
    const b = ep.boundaries, a = ep.averages;
    for (let i = 0; i < a.length; i++) {
      if (i + 1 >= b.length) break;
      const mid = Math.round((b[i] + b[i + 1]) / 2);
      if (mid < 0 || mid >= S) continue;
      const x = xPos(mid), y = yp(a[i]);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col; ctx.font = 'bold 11px Inter';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(a[i].toFixed(3), x, y - 8);
    }
  }
}

function drawScatter() {
  for (const s of series) {
    if (!s.scatter) continue;
    const yp = yFns[(s.yAxis || 1) - 1] || yFns[0];
    const r = s.scatterRadius || 1.8, col = s.color + '44';
    for (let i = 0; i < S; i++) {
      if (s.values[i] === null) continue;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(xPos(i), yp(s.values[i]), r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawPoints() {
  for (const s of series) {
    if (s.showPoints === false) continue;
    const yp = yFns[(s.yAxis || 1) - 1] || yFns[0];
    const r = s.pointRadius || 0.8;
    for (let i = 0; i < S; i++) {
      if (s.values[i] === null) continue;
      ctx.globalAlpha = 0.35; ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(xPos(i), yp(s.values[i]), r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawCurves() {
  const SW = 5;
  for (const s of series) {
    let cv = s.values;
    if (s.smooth) {
      const arr = s.values, sm = [];
      for (let i = 0; i < arr.length; i++) {
        let sum = 0, cnt = 0;
        for (let j = Math.max(0, i - SW); j <= Math.min(arr.length - 1, i + SW); j++) {
          if (arr[j] !== null && !isNaN(arr[j])) { sum += arr[j]; cnt++; }
        }
        sm.push(cnt > 0 ? sum / cnt : null);
      }
      cv = sm;
    }
    const yp = yFns[(s.yAxis || 1) - 1] || yFns[0];
    ctx.strokeStyle = s.color; ctx.lineWidth = s.lineWidth || 2.5; ctx.beginPath();
    let started = false;
    for (let i = 0; i < S; i++) {
      if (cv[i] === null) continue;
      const x = xPos(i), y = yp(cv[i]);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
ctx.fillStyle = C.pb; ctx.beginPath(); ctx.roundRect(M.left, M.top, pw, ph, 6); ctx.fill();

drawEpochDivs();
const gy = [];
for (const a of yd) for (const v of (a.tickValues || [])) gy.push(yFns[yd.indexOf(a)](v));
const gx = (xd.tickValues || []).map(v => xPos(v)).concat([xPos(S - 1)]);
drawGrid(gy, gx);
drawAxes();
drawTitleLegend();
drawScatter();
drawCurves();
drawPoints();
drawEpochAverages();
drawMarkers();
drawStatsBox();
process.stdout.write(canvas.toBuffer('image/png').toString('base64'));