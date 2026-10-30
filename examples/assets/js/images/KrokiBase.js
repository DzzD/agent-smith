
var KrokiBase = (function() {
"use strict";

// === SVG PARSER ===

function extractDimensions(svg) {
  var w = 800, h = 600;
  var wm = svg.match(/\swidth="([\d.]+)"/);
  var hm = svg.match(/\sheight="([\d.]+)"/);
  if (wm) w = parseFloat(wm[1]);
  if (hm) h = parseFloat(hm[1]);
  var vm = svg.match(/viewBox="([\d.\s]+)"/);
  if (vm) { var p = vm[1].trim().split(/\s+/); if (p.length === 4) { w = parseFloat(p[2]); h = parseFloat(p[3]); } }
  return { width: w, height: h };
}

function extractStyle(str) {
  var fill = null, stroke = null, sw = null, color = null;
  var sm = str.match(/style="([^"]*)"/);
  if (sm) {
    var s = sm[1];
    var f = s.match(/fill:([^;!]+)/); if (f) fill = f[1].trim();
    var st = s.match(/stroke:([^;!]+)/); if (st) stroke = st[1].trim();
    var swm = s.match(/stroke-width:([^;!]+)/); if (swm) sw = parseFloat(swm[1]);
    var cm = s.match(/color:([^;!]+)/); if (cm) color = cm[1].trim();
  }
  var fa = str.match(/\sfill="([^"]*)"/); var sa = str.match(/\sstroke="([^"]*)"/);
  if (!fill && fa) fill = fa[1]; if (!stroke && sa) stroke = sa[1];
  return { fill: fill, stroke: stroke, strokeWidth: sw, color: color };
}

function resolveClassStyle(str, cs) {
  var cm = str.match(/class="([^"]*)"/); if (!cm) return {};
  var classes = cm[1].split(/\s+/);
  var r = { fill: null, stroke: null, strokeWidth: null, color: null };
  for (var i = 0; i < classes.length; i++) {
    var s = cs[classes[i]];
    if (s) { if (s.fill) r.fill = s.fill; if (s.stroke) r.stroke = s.stroke; if (s.strokeWidth) r.strokeWidth = s.strokeWidth; if (s.color) r.color = s.color; }
  }
  return r;
}

function parseCssStyles(svg) {
  var styles = {};
  var sb = svg.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!sb) return styles;
  var cr = /\.([\w-]+)\s*(?:(?:>|&gt;)\s*\*)?\s*\{([^}]*)\}/g;
  var m;
  while ((m = cr.exec(sb[1])) !== null) {
    var n = m[1], p = m[2];
    if (styles[n] && styles[n].fill) continue;
    var f = p.match(/fill:([^;!]+)/);
    var st = p.match(/stroke:([^;!]+)/);
    var sw = p.match(/stroke-width:([^;!]+)/);
    var c = p.match(/(?:^|;)color:([^;!]+)/);
    styles[n] = { fill: f ? f[1].trim() : null, stroke: st ? st[1].trim() : null, strokeWidth: sw ? parseFloat(sw[1]) : null, color: c ? c[1].trim() : null };
  }
  return styles;
}

function extractLabel(str) {
  var pm = str.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  if (pm) return pm[1].replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').trim();
  var sm = str.match(/<span[^>]*>([\s\S]*?)<\/span>/);
  if (sm) return sm[1].replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').trim();
  return null;
}

function decodePoints(b64) {
  try { return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); } catch (e) { return null; }
}// === SVG PATH PARSER ===

function parseSvgPath(d) {
  var cmds = [];
  var re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  var m;
  while ((m = re.exec(d)) !== null) {
    var args = m[2].trim().match(/[-+]?[\d.]+(?:e[-+]?\d+)?/gi) || [];
    cmds.push({ cmd: m[1], args: args.map(parseFloat) });
  }
  return cmds;
}

function parseSvgPathBBox(d) {
  var cmds = parseSvgPath(d);
  if (cmds.length === 0) return null;
  var cx = 0, cy = 0, startX = 0, startY = 0;
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  function track(x, y) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  for (var i = 0; i < cmds.length; i++) {
    var c = cmds[i], a = c.args;
    switch (c.cmd) {
      case 'M': cx=a[0]; cy=a[1]; startX=cx; startY=cy; track(cx,cy); break;
      case 'm': cx+=a[0]; cy+=a[1]; startX=cx; startY=cy; track(cx,cy); break;
      case 'L': cx=a[0]; cy=a[1]; track(cx,cy); break;
      case 'l': cx+=a[0]; cy+=a[1]; track(cx,cy); break;
      case 'H': cx=a[0]; track(cx,cy); break;
      case 'h': cx+=a[0]; track(cx,cy); break;
      case 'V': cy=a[0]; track(cx,cy); break;
      case 'v': cy+=a[0]; track(cx,cy); break;
      case 'C': cx=a[4]; cy=a[5]; track(cx,cy); break;
      case 'c': cx+=a[4]; cy+=a[5]; track(cx,cy); break;
      case 'Q': cx=a[2]; cy=a[3]; track(cx,cy); break;
      case 'q': cx+=a[2]; cy+=a[3]; track(cx,cy); break;
      case 'A': cx=a[5]; cy=a[6]; track(cx,cy); break;
      case 'a': cx+=a[5]; cy+=a[6]; track(cx,cy); break;
      case 'Z': case 'z': cx=startX; cy=startY; break;
    }
  }
  if (minX === Infinity) return null;
  return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, cx: (minX+maxX)/2, cy: (minY+maxY)/2 };
}// === STYLE JSON ===

function parseStyleJson(data) {
  if (!data) return { map: null, default: null };
  try {
    var json = JSON.parse(data.toString('utf8'));
    var map = {};
    if (json.nodes) { for (var nk in json.nodes) map[nk.toLowerCase()] = json.nodes[nk]; }
    return { map: map, default: json.default || null };
  } catch (e) { return { map: null, default: null }; }
}

function getStyleForNode(node, styleMap, styleDefault) {
  if (!styleMap) return null;
  var key = (node.label || '').toLowerCase();
  if (styleMap[key]) return styleMap[key];
  var idKey = (node.id || '').toLowerCase();
  if (styleMap[idKey]) return styleMap[idKey];
  if (node.id) {
    var parts = node.id.split('-');
    for (var i = 1; i < parts.length - 1; i++) {
      var pk = parts[i].toLowerCase();
      if (styleMap[pk]) return styleMap[pk];
    }
  }
  return styleDefault;
}

// === COLOR UTILS ===

function computeLuminance(hex) {
  var h = hex.replace('#', '');
  var r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
  return (0.299*r + 0.587*g + 0.114*b) / 255;
}

function tint(hex, factor) {
  var h = hex.replace('#', '');
  var r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
  var lr = Math.round(r+(255-r)*factor), lg = Math.round(g+(255-g)*factor), lb = Math.round(b+(255-b)*factor);
  return '#' + lr.toString(16).padStart(2,'0') + lg.toString(16).padStart(2,'0') + lb.toString(16).padStart(2,'0');
}// === ICON SYSTEM ===

var ICON_MAP = [
  { keys: ['début','start','démarrage','déclaration'], icon: 'play' },
  { keys: ['fin','end','terminer'], icon: 'square' },
  { keys: ['réception','reception','recevoir','demande','request'], icon: 'inbox' },
  { keys: ['valide','valid','validation','check','vérif','conforme'], icon: 'check-circle' },
  { keys: ['manquant','missing','incomplet','incomplète','erreur','error','anomalie'], icon: 'alert-triangle' },
  { keys: ['traitement','process','traiter','automatique'], icon: 'settings' },
  { keys: ['envoi','send','envoyer','message','soumission','gestionnaire'], icon: 'send' },
  { keys: ['base','data','données','database','stockage','bdd','traçabilité','tracabilité'], icon: 'database' },
  { keys: ['utilisateur','user','client','personne','jeune'], icon: 'user' },
  { keys: ['document','fichier','file','rapport','cerfa','commentaire'], icon: 'file-text' },
  { keys: ['sécurité','security','auth','connexion','login'], icon: 'lock' },
  { keys: ['notification','alerte','alert','attente','retour'], icon: 'clock' },
  { keys: ['complexe','cas'], icon: 'alert-circle' },
  { keys: ['liste','pixpay','bic'], icon: 'search' },
  { keys: ['suspendu','suspend','pause'], icon: 'pause' },
];

function findIconForLabel(label) {
  if (!label) return null;
  var lower = label.toLowerCase();
  for (var i = 0; i < ICON_MAP.length; i++) {
    for (var j = 0; j < ICON_MAP[i].keys.length; j++) {
      if (lower.indexOf(ICON_MAP[i].keys[j]) !== -1) return ICON_MAP[i].icon;
    }
  }
  return null;
}

// === STATE COLORS (ASP-inspired) ===

var STATE_COLORS = [
  { fill:'#F8F9FF', stroke:'#6A78F0', icon:'#6A78F0', accent:'#FF3B30' },
  { fill:'#F0F9FF', stroke:'#0EA5E9', icon:'#0EA5E9', accent:'#FF3B30' },
  { fill:'#F0FDF4', stroke:'#22C55E', icon:'#22C55E', accent:'#FF3B30' },
  { fill:'#FFF7ED', stroke:'#F97316', icon:'#F97316', accent:'#FF3B30' },
  { fill:'#FDF4FF', stroke:'#A855F7', icon:'#A855F7', accent:'#FF3B30' },
  { fill:'#FEF2F2', stroke:'#EF4444', icon:'#EF4444', accent:'#FF3B30' },
  { fill:'#F0FDFA', stroke:'#14B8A6', icon:'#14B8A6', accent:'#FF3B30' },
  { fill:'#FEFCE8', stroke:'#CA8A04', icon:'#CA8A04', accent:'#FF3B30' },
];

function getStateColor(label, type, idx) {
  if (type === 'startEnd') return { fill:'#0038B8', stroke:'#0038B8', icon:'#FFFFFF', accent:'#FFB3AD' };
  if (type === 'decision') return { fill:'#FFFFFF', stroke:'#FF3B30', icon:'#FF3B30', accent:'#FF3B30' };
  if (type === 'warning') return { fill:'#FFF2F1', stroke:'#FF3B30', icon:'#FF3B30', accent:'#FF3B30' };
  var l = (label||'').toLowerCase();
  if (l.indexOf('anomal')!==-1||l.indexOf('erreur')!==-1||l.indexOf('rejet')!==-1||l.indexOf('abandon')!==-1) return STATE_COLORS[5];
  if (l.indexOf('valid')!==-1||l.indexOf('archive')!==-1||l.indexOf('termine')!==-1||l.indexOf('fin')!==-1) return STATE_COLORS[2];
  if (l.indexOf('attente')!==-1||l.indexOf('pause')!==-1||l.indexOf('suspend')!==-1) return STATE_COLORS[3];
  if (l.indexOf('cours')!==-1||l.indexOf('traitement')!==-1||l.indexOf('demarr')!==-1) return STATE_COLORS[0];
  if (l.indexOf('verif')!==-1||l.indexOf('controle')!==-1||l.indexOf('check')!==-1) return STATE_COLORS[7];
  return STATE_COLORS[idx % STATE_COLORS.length];
}// === CANVAS RENDER CONTEXT ===

function createRenderContext(canvas, scale, padding, dims) {
  var ctx = canvas.getContext('2d');
  var W = Math.ceil(dims.width * scale) + padding * 2;
  var H = Math.ceil(dims.height * scale) + padding * 2;
  var offsetX = padding, offsetY = padding;
  function sx(x) { return x * scale + offsetX; }
  function sy(y) { return y * scale + offsetY; }
  function sw(w) { return w * scale; }
  return { ctx: ctx, sx: sx, sy: sy, sw: sw, W: W, H: H, scale: scale, padding: padding };
}// === DRAWING HELPERS ===

function drawRoundedRect(ctx, sx, sy, sw, scale, x, y, w, h, r, fill, stroke, strokeWidth, shadow) {
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r); ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h); ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r); ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
  if (shadow) { ctx.save(); ctx.shadowColor='rgba(106,120,240,0.22)'; ctx.shadowBlur=12*scale; ctx.shadowOffsetY=4*scale; ctx.fillStyle=fill; ctx.fill(); ctx.restore(); }
  else { ctx.fillStyle=fill; ctx.fill(); }
  if (stroke && strokeWidth>0) { ctx.strokeStyle=stroke; ctx.lineWidth=strokeWidth; ctx.stroke(); }
}

function drawDiamond(ctx, sx, sy, scale, cx, cy, halfW, halfH, fill, stroke, strokeWidth, shadow) {
  ctx.beginPath();
  ctx.moveTo(sx(cx), sy(cy-halfH)); ctx.lineTo(sx(cx+halfW), sy(cy));
  ctx.lineTo(sx(cx), sy(cy+halfH)); ctx.lineTo(sx(cx-halfW), sy(cy));
  ctx.closePath();
  if (shadow) { ctx.save(); ctx.shadowColor='rgba(255,59,48,0.18)'; ctx.shadowBlur=12*scale; ctx.shadowOffsetY=4*scale; ctx.fillStyle=fill; ctx.fill(); ctx.restore(); }
  else { ctx.fillStyle=fill; ctx.fill(); }
  if (stroke && strokeWidth>0) { ctx.strokeStyle=stroke; ctx.lineWidth=strokeWidth; ctx.stroke(); }
}

function drawCircle(ctx, sx, sy, sw, scale, cx, cy, r, fill, stroke, strokeWidth, shadow) {
  ctx.beginPath(); ctx.arc(sx(cx), sy(cy), sw(r), 0, 6.2832); ctx.closePath();
  if (shadow) { ctx.save(); ctx.shadowColor='rgba(106,120,240,0.22)'; ctx.shadowBlur=10*scale; ctx.shadowOffsetY=3*scale; ctx.fillStyle=fill; ctx.fill(); ctx.restore(); }
  else { ctx.fillStyle=fill; ctx.fill(); }
  if (stroke && strokeWidth>0) { ctx.strokeStyle=stroke; ctx.lineWidth=strokeWidth; ctx.stroke(); }
}

function drawEllipse(ctx, sx, sy, sw, scale, cx, cy, rx2, ry2, fill, stroke, strokeWidth, shadow) {
  ctx.beginPath(); ctx.ellipse(sx(cx), sy(cy), sw(rx2), sw(ry2), 0, 0, 6.2832); ctx.closePath();
  if (shadow) { ctx.save(); ctx.shadowColor='rgba(106,120,240,0.22)'; ctx.shadowBlur=10*scale; ctx.shadowOffsetY=3*scale; ctx.fillStyle=fill; ctx.fill(); ctx.restore(); }
  else { ctx.fillStyle=fill; ctx.fill(); }
  if (stroke && strokeWidth>0) { ctx.strokeStyle=stroke; ctx.lineWidth=strokeWidth; ctx.stroke(); }
}function drawPolygonPath(ctx, sx, sy, sw, scale, pts, nodeX, nodeY, fill, stroke, strokeWidth, shadow) {
  if (!pts || pts.length < 6) return;
  var off = pts._offset || { tx: 0, ty: 0 };
  var ox = off.tx + nodeX, oy = off.ty + nodeY;
  ctx.beginPath(); ctx.moveTo(sx(pts[0]+ox), sy(pts[1]+oy));
  for (var i = 2; i < pts.length; i += 2) ctx.lineTo(sx(pts[i]+ox), sy(pts[i+1]+oy));
  ctx.closePath();
  if (shadow) { ctx.save(); ctx.shadowColor='rgba(106,120,240,0.22)'; ctx.shadowBlur=10*scale; ctx.shadowOffsetY=3*scale; ctx.fillStyle=fill; ctx.fill(); ctx.restore(); }
  else { ctx.fillStyle=fill; ctx.fill(); }
  if (stroke && strokeWidth>0) { ctx.strokeStyle=stroke; ctx.lineWidth=strokeWidth; ctx.stroke(); }
}function drawSvgPath(ctx, sx, sy, sw, scale, d, offset, nodeX, nodeY, fill, stroke, strokeWidth, shadow) {
  var cmds = parseSvgPath(d);
  if (cmds.length === 0) return;
  var cx = 0, cy = 0, startX = 0, startY = 0;
  var otx = (offset ? offset.tx : 0) + nodeX;
  var oty = (offset ? offset.ty : 0) + nodeY;
  if (shadow) { ctx.save(); ctx.shadowColor='rgba(106,120,240,0.22)'; ctx.shadowBlur=10*scale; ctx.shadowOffsetY=3*scale; }
  ctx.beginPath();
  for (var i = 0; i < cmds.length; i++) {
    var c = cmds[i], a = c.args;
    switch (c.cmd) {
      case 'M': cx=a[0]+otx; cy=a[1]+oty; startX=cx; startY=cy; ctx.moveTo(sx(cx),sy(cy)); break;
      case 'm': cx+=a[0]; cy+=a[1]; startX=cx; startY=cy; ctx.moveTo(sx(cx),sy(cy)); break;
      case 'L': cx=a[0]+otx; cy=a[1]+oty; ctx.lineTo(sx(cx),sy(cy)); break;
      case 'l': cx+=a[0]; cy+=a[1]; ctx.lineTo(sx(cx),sy(cy)); break;
      case 'H': cx=a[0]+otx; ctx.lineTo(sx(cx),sy(cy)); break;
      case 'h': cx+=a[0]; ctx.lineTo(sx(cx),sy(cy)); break;
      case 'V': cy=a[0]+oty; ctx.lineTo(sx(cx),sy(cy)); break;
      case 'v': cy+=a[0]; ctx.lineTo(sx(cx),sy(cy)); break;
      case 'C': ctx.bezierCurveTo(sx(a[0]+otx),sy(a[1]+oty),sx(a[2]+otx),sy(a[3]+oty),sx(a[4]+otx),sy(a[5]+oty)); cx=a[4]+otx; cy=a[5]+oty; break;
      case 'c': ctx.bezierCurveTo(sx(cx+a[0]),sy(cy+a[1]),sx(cx+a[2]),sy(cy+a[3]),sx(cx+a[4]),sy(cy+a[5])); cx+=a[4]; cy+=a[5]; break;
      case 'Q': ctx.quadraticCurveTo(sx(a[0]+otx),sy(a[1]+oty),sx(a[2]+otx),sy(a[3]+oty)); cx=a[2]+otx; cy=a[3]+oty; break;
      case 'q': ctx.quadraticCurveTo(sx(cx+a[0]),sy(cy+a[1]),sx(cx+a[2]),sy(cy+a[3])); cx+=a[2]; cy+=a[3]; break;
      case 'Z': case 'z': ctx.closePath(); cx=startX; cy=startY; break;
    }
  }
  if (shadow) { ctx.fillStyle=fill; ctx.fill(); ctx.restore(); }
  else { ctx.fillStyle=fill; ctx.fill(); }
  if (stroke && strokeWidth>0) { ctx.strokeStyle=stroke; ctx.lineWidth=strokeWidth; ctx.stroke(); }
}function drawArrowPath(ctx, sx, sy, scale, points, stroke, strokeWidth) {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(sx(points[0].x), sy(points[0].y));
  if (points.length === 2) { ctx.lineTo(sx(points[1].x), sy(points[1].y)); }
  else if (points.length === 3) { ctx.quadraticCurveTo(sx(points[1].x), sy(points[1].y), sx(points[2].x), sy(points[2].y)); }
  else {
    for (var i = 1; i < points.length - 1; i++) {
      var cp1x = sx(points[i].x), cp1y = sy(points[i].y);
      var nextX = sx(points[i+1].x), nextY = sy(points[i+1].y);
      ctx.quadraticCurveTo(cp1x, cp1y, (cp1x+nextX)/2, (cp1y+nextY)/2);
    }
    var last = points[points.length-1];
    ctx.lineTo(sx(last.x), sy(last.y));
  }
  ctx.stroke();
  var lastPt = points[points.length-1], prevPt = points[points.length-2];
  var angle = Math.atan2(sy(lastPt.y)-sy(prevPt.y), sx(lastPt.x)-sx(prevPt.x));
  var arrowSize = 10 * scale;
  ctx.beginPath();
  ctx.moveTo(sx(lastPt.x), sy(lastPt.y));
  ctx.lineTo(sx(lastPt.x)-arrowSize*Math.cos(angle-Math.PI/6), sy(lastPt.y)-arrowSize*Math.sin(angle-Math.PI/6));
  ctx.lineTo(sx(lastPt.x)-arrowSize*Math.cos(angle+Math.PI/6), sy(lastPt.y)-arrowSize*Math.sin(angle+Math.PI/6));
  ctx.closePath();
  ctx.fillStyle = stroke; ctx.fill();
  ctx.restore();
}function drawText(ctx, sx, sy, scale, text, cx, cy, color, fontSize, fontWeight) {
  ctx.fillStyle = color;
  ctx.font = fontWeight + ' ' + fontSize + 'px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  var lines = text.split('\n');
  if (lines.length === 1) { ctx.fillText(text, sx(cx), sy(cy)); return; }
  var lh = fontSize * 1.0;
  var startY = cy - lh * lines.length / 2 + lh / 2;
  for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], sx(cx), sy(startY + i * lh));
}

function drawTextFit(ctx, sx, sy, sw, scale, text, cx, cy, color, maxW, fontSize, fontWeight) {
  ctx.font = fontWeight + ' ' + fontSize + 'px Arial, sans-serif';
  var lines = text.split('\n');
  var tw = 0;
  for (var i = 0; i < lines.length; i++) tw = Math.max(tw, ctx.measureText(lines[i]).width / scale);
  while (tw > maxW && fontSize > 9) { fontSize--; ctx.font = fontWeight + ' ' + fontSize + 'px Arial, sans-serif'; tw = 0; for (var j = 0; j < lines.length; j++) tw = Math.max(tw, ctx.measureText(lines[j]).width / scale); }
  drawText(ctx, sx, sy, scale, text, cx, cy, color, fontSize, fontWeight);
}

function wrapText(ctx, sw, scale, text, maxW, fontSize, fontWeight) {
  ctx.font = fontWeight + ' ' + fontSize + 'px Arial, sans-serif';
  var segments = text.split('\n');
  var lines = [];
  for (var s = 0; s < segments.length; s++) {
    var words = segments[s].split(' ');
    var current = '';
    for (var w = 0; w < words.length; w++) {
      var test = current ? current + ' ' + words[w] : words[w];
      if (ctx.measureText(test).width / scale > maxW && current) { lines.push(current); current = words[w]; }
      else { current = test; }
    }
    if (current) lines.push(current.replace(/\n/g, ' '));
  }
  return lines;
}function drawEdgeLabel(ctx, sx, sy, sw, scale, text, cx, cy) {
  ctx.font = '600 ' + (13 * scale) + 'px Arial, sans-serif';
  var metrics = ctx.measureText(text);
  var padX = 8 * scale, th = 24 * scale;
  var tw = metrics.width + padX * 2;
  var tx = sx(cx) - tw / 2, ty = sy(cy) - th / 2;
  drawRoundedRect(ctx, sx, sy, sw, scale, tx, ty, tw, th, th / 2, '#EEF0FF', '#D9DCE8', scale, false);
  ctx.fillStyle = '#596275';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '600 ' + (13 * scale) + 'px Arial, sans-serif';
  ctx.fillText(text, sx(cx), sy(cy));
}function drawFeatherIcon(ctx, sx, sy, scale, FB, name, cx, cy, size, color, accentColor) {
  if (!FB || !FB.has(name)) return;
  ctx.save();
  var sc = size * scale / 24;
  var originX = sx(cx) - 12 * sc;
  var originY = sy(cy) - 12 * sc;
  FB.draw(ctx, name, originX, originY, size * scale, color, accentColor);
  ctx.restore();
}// === EXPORT ===

return {
  extractDimensions: extractDimensions,
  extractStyle: extractStyle,
  resolveClassStyle: resolveClassStyle,
  parseCssStyles: parseCssStyles,
  extractLabel: extractLabel,
  decodePoints: decodePoints,
  parseSvgPath: parseSvgPath,
  parseSvgPathBBox: parseSvgPathBBox,
  parseStyleJson: parseStyleJson,
  getStyleForNode: getStyleForNode,
  computeLuminance: computeLuminance,
  tint: tint,
  ICON_MAP: ICON_MAP,
  findIconForLabel: findIconForLabel,
  STATE_COLORS: STATE_COLORS,
  getStateColor: getStateColor,
  createRenderContext: createRenderContext,
  drawRoundedRect: drawRoundedRect,
  drawDiamond: drawDiamond,
  drawCircle: drawCircle,
  drawEllipse: drawEllipse,
  drawPolygonPath: drawPolygonPath,
  drawSvgPath: drawSvgPath,
  drawArrowPath: drawArrowPath,
  drawText: drawText,
  drawTextFit: drawTextFit,
  wrapText: wrapText,
  drawEdgeLabel: drawEdgeLabel,
  drawFeatherIcon: drawFeatherIcon
};

})();