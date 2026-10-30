const { createCanvas, loadImage } = require('canvas');

// === WRAP TEXT HELPER ===
function wrapText(ctx, text, maxW, scale)
{
  var words = text.split(' ');
  var lines = [];
  var cur = '';
  for (var i = 0; i < words.length; i++)
  {
    var test = cur ? cur + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width / scale > maxW && cur)
    {
      lines.push(cur);
      cur = words[i];
    }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// === GET TEXT BBOX ===
// Returns real bounding box of wrapped text centered at (cx, cy)
function getTextBBox(ctx, lines, cx, cy, lH, scale)
{
  var minY = cy - (lines.length * lH / scale) / 2;
  var maxY = minY + lines.length * lH / scale;
  var minX = Infinity, maxX = -Infinity;
  for (var i = 0; i < lines.length; i++)
  {
    var w = ctx.measureText(lines[i]).width / scale;
    var lx = cx - w / 2;
    var rx = cx + w / 2;
    if (lx < minX) minX = lx;
    if (rx > maxX) maxX = rx;
  }
  if (minX === Infinity) { minX = cx; maxX = cx; }
  return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, cy: (minY + maxY) / 2 };
}

// === DISTANCE TO CONTOUR HELPER ===
function distToContour(node, px, py)
{
  var dx = px - node.cx, dy = py - node.cy;
  var ax = Math.abs(dx), ay = Math.abs(dy);
  if (node.type === 'circle')
  {
    var r = Math.sqrt(dx*dx + dy*dy);
    return Math.abs(r - node.cR);
  }
  if (node.type === 'diamond')
  {
    var hw = node.w / 2, hh = node.h / 2;
    var t = (ax / hw + ay / hh);
    return Math.abs(t - 1) * Math.min(hw, hh);
  }
  // rect, stadium, etc: distance to bounding box edge
  return Math.max(ax - node.w / 2, ay - node.h / 2);
}

// === EXTRACT SHAPE METHODS ===
function extractStadiumPath(nc, nodeId, tx, ty, labelLines, fullLabel, maxTextWidth)
  {
    var pm = nc.match(/<path[^>]*d="([^"]*)"/);
    if (!pm) return null;
    var d = pm[1];
    // Stadium path has curves (C) and looks like a rounded rect with very rounded ends
    if (!/C/i.test(d)) return null;
    // Parse path - only use endpoints, skip curve control points
                                             var toks = d.match(/[MLCQAZmlcqaz]|[-\d.]+/g);
                                             if (!toks) return null;
                                             var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
                                             var p2x=0, p2y=0;
                                             for (var ti=0; ti<toks.length; ti++)
                                             {
                                               var cmd=toks[ti];
                                               if (/[\d.\-]/.test(cmd[0])) { ti--; cmd='L'; }
                                               if (cmd==='M'||cmd==='L'||cmd==='m'||cmd==='l'||cmd==='T'||cmd==='t')
                                               {
                                                 ti++; var vx=parseFloat(toks[ti]); ti++; var vy=parseFloat(toks[ti]);
                                                 if (cmd==='m'||cmd==='l'||cmd==='t') { p2x+=vx; p2y+=vy; } else { p2x=vx; p2y=vy; }
                                                 minX=Math.min(minX,p2x); maxX=Math.max(maxX,p2x);
                                                 minY=Math.min(minY,p2y); maxY=Math.max(maxY,p2y);
                                               }
                                               else if (cmd==='C'||cmd==='c')
                                               {
                                                 ti+=4; ti++; var vx=parseFloat(toks[ti]); ti++; var vy=parseFloat(toks[ti]);
                                                 if (cmd==='c') { p2x+=vx; p2y+=vy; } else { p2x=vx; p2y=vy; }
                                                 minX=Math.min(minX,p2x); maxX=Math.max(maxX,p2x);
                                                 minY=Math.min(minY,p2y); maxY=Math.max(maxY,p2y);
                                               }
                                               else if (cmd==='Q'||cmd==='q')
                                               {
                                                 ti+=2; ti++; var vx=parseFloat(toks[ti]); ti++; var vy=parseFloat(toks[ti]);
                                                 if (cmd==='q') { p2x+=vx; p2y+=vy; } else { p2x=vx; p2y=vy; }
                                                 minX=Math.min(minX,p2x); maxX=Math.max(maxX,p2x);
                                                 minY=Math.min(minY,p2y); maxY=Math.max(maxY,p2y);
                                               }
                                               else if (cmd==='A'||cmd==='a')
                                               {
                                                 ti+=5; ti++; var vx=parseFloat(toks[ti]); ti++; var vy=parseFloat(toks[ti]);
                                                 if (cmd==='a') { p2x+=vx; p2y+=vy; } else { p2x=vx; p2y=vy; }
                                                 minX=Math.min(minX,p2x); maxX=Math.max(maxX,p2x);
                                                 minY=Math.min(minY,p2y); maxY=Math.max(maxY,p2y);
                                               }
                                             }
                                             var w = maxX - minX, h = maxY - minY;
    // Stadium: w > h and the curves create semicircle ends
    // rx = h/2 for stadium
    if (h < 5) return null;
    var ptm = nc.match(/<path[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
    var ptx = ptm ? parseFloat(ptm[1]) : 0;
    var pty = ptm ? parseFloat(ptm[2]) : 0;
    return { id: nodeId, type: 'stadium', labelLines: labelLines, fullLabel: fullLabel,
      maxTextWidth: maxTextWidth, x: tx+ptx+minX, y: ty+pty+minY,
      cx: tx+ptx+(minX+maxX)/2, cy: ty+pty+(minY+maxY)/2,
      w: w, h: h, r: h/2, dx: 0, dy: 0 };
  }

function extractStadium(nc, nodeId, tx, ty, labelLines, fullLabel, maxTextWidth)
{
  var rm = nc.match(/<rect[^>]*x="([\d.\-]+)"[^>]*y="([\d.\-]+)"[^>]*width="([\d.\-]+)"[^>]*height="([\d.\-]+)"[^>]*rx="([\d.\-]+)"/);
  if (!rm) return null;
  var rx = parseFloat(rm[1]), ry = parseFloat(rm[2]);
  var rw = parseFloat(rm[3]), rh = parseFloat(rm[4]);
  var rrx = parseFloat(rm[5]);
  if (rrx < rh / 2) return null; // not a stadium
  return { id: nodeId, type: 'stadium', labelLines: labelLines, fullLabel: fullLabel,
    maxTextWidth: maxTextWidth, x: tx+rx, y: ty+ry,
    cx: tx+rx+rw/2, cy: ty+ry+rh/2, w: rw, h: rh, r: rh/2, dx: 0, dy: 0 };
}

function extractRect(nc, nodeId, tx, ty, labelLines, fullLabel, maxTextWidth)
{
  var rm = nc.match(/<rect[^>]*x="([\d.\-]+)"[^>]*y="([\d.\-]+)"[^>]*width="([\d.\-]+)"[^>]*height="([\d.\-]+)"/);
  if (!rm) return null;
  // Check if it has high rx (stadium)
  var rxM = nc.match(/<rect[^>]*rx="([\d.]+)"/);
  if (rxM && parseFloat(rxM[1]) >= parseFloat(rm[4]) / 2) return null;
  var rx = parseFloat(rm[1]), ry = parseFloat(rm[2]);
  var rw = parseFloat(rm[3]), rh = parseFloat(rm[4]);
  return { id: nodeId, type: 'rect', labelLines: labelLines, fullLabel: fullLabel,
    maxTextWidth: maxTextWidth, x: tx+rx, y: ty+ry,
    cx: tx+rx+rw/2, cy: ty+ry+rh/2, w: rw, h: rh, dx: 0, dy: 0 };
}

function extractDiamond(nc, nodeId, tx, ty, labelLines, fullLabel, maxTextWidth)
{
  var pm = nc.match(/<polygon[^>]*points="([^"]*)"/);
  if (!pm) return null;
  var pts = pm[1].trim().split(/[\s,]+/).map(parseFloat);
  if (pts.length !== 8) return null; // 4 vertices
  // Check if it is a real diamond (one point per extreme: top, right, bottom, left)
  // vs a parallelogram (two points at top, two at bottom)
  var ys = [pts[1], pts[3], pts[5], pts[7]];
  var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  var topCount = 0, botCount = 0;
  for (var yi = 0; yi < 4; yi++)
  {
    if (Math.abs(ys[yi] - minY) < 0.5) topCount++;
    if (Math.abs(ys[yi] - maxY) < 0.5) botCount++;
  }
  if (topCount >= 2 || botCount >= 2) return null; // parallelogram, not diamond
  var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for (var i=0; i<pts.length; i+=2)
  {
    minX=Math.min(minX,pts[i]); maxX=Math.max(maxX,pts[i]);
    minY=Math.min(minY,pts[i+1]); maxY=Math.max(maxY,pts[i+1]);
  }
  var ptm = nc.match(/<polygon[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
  var ptx = ptm ? parseFloat(ptm[1]) : 0;
  var pty = ptm ? parseFloat(ptm[2]) : 0;
  return { id: nodeId, type: 'diamond', labelLines: labelLines, fullLabel: fullLabel,
    maxTextWidth: maxTextWidth, x: tx+ptx+minX, y: ty+pty+minY,
    cx: tx+ptx+(minX+maxX)/2, cy: ty+pty+(minY+maxY)/2,
    w: maxX-minX, h: maxY-minY, dx: 0, dy: 0 };
}

function extractCircle(nc, nodeId, tx, ty, labelLines, fullLabel, maxTextWidth)
  {
    var cm = nc.match(/<circle[^>]*r="([\d.]+)"[^>]*>/);
    if (!cm) return null;
    var r = parseFloat(cm[1]);
    return { id: nodeId, type: 'circle', labelLines: labelLines, fullLabel: fullLabel,
      maxTextWidth: maxTextWidth, x: tx - r, y: ty - r,
      cx: tx, cy: ty, w: r * 2, h: r * 2, r: r, dx: 0, dy: 0 };
  }

function extractParallelogram(nc, nodeId, tx, ty, labelLines, fullLabel, maxTextWidth)
  {
    // Parallelogram in Mermaid uses <polygon> with 4 points (8 coords)
    // Shape: 2 points at top, 2 at bottom, with horizontal offset (skew)
    var pm = nc.match(/<polygon[^>]*points="([^"]*)"/);
    if (!pm) return null;
    var rawPts = pm[1].trim().split(/[\s,]+/).map(parseFloat);
    if (rawPts.length !== 8) return null; // need exactly 4 vertices
// Check it's a parallelogram (2 top, 2 bottom) - diamond check already filtered true diamonds
    var ys = [rawPts[1], rawPts[3], rawPts[5], rawPts[7]];
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var topCount = 0, botCount = 0;
    for (var yi = 0; yi < 4; yi++)
    {
      if (Math.abs(ys[yi] - minY) < 0.5) topCount++;
      if (Math.abs(ys[yi] - maxY) < 0.5) botCount++;
    }
    if (topCount !== 2 || botCount !== 2) return null; // not a parallelogram
    // Get polygon transform
    var ptm = nc.match(/<polygon[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
    var ptx = ptm ? parseFloat(ptm[1]) : 0;
    var pty = ptm ? parseFloat(ptm[2]) : 0;
    // Compute bounding box
    var minX=Infinity,maxX=-Infinity;
    for (var i=0; i<rawPts.length; i+=2)
    {
      minX=Math.min(minX,rawPts[i]); maxX=Math.max(maxX,rawPts[i]);
    }
    // Store the 4 points for drawing (in polygon-local coords)
    var pts = rawPts.slice();
    // Determine skew direction (reversed parallelogram)
    var reversed = false;
    // Top-left x vs bottom-left x: if top-left is more to the left, normal; if more to right, reversed
    var topLeft = Infinity, topRight = -Infinity, botLeft = Infinity, botRight = -Infinity;
    for (var i=0; i<8; i+=2)
    {
      if (Math.abs(rawPts[i+1] - minY) < 0.5) { topLeft = Math.min(topLeft, rawPts[i]); topRight = Math.max(topRight, rawPts[i]); }
      if (Math.abs(rawPts[i+1] - maxY) < 0.5) { botLeft = Math.min(botLeft, rawPts[i]); botRight = Math.max(botRight, rawPts[i]); }
    }
    if (topLeft > botLeft) reversed = true;
    return { id: nodeId, type: 'parallelogram', labelLines: labelLines, fullLabel: fullLabel,
      maxTextWidth: maxTextWidth,
      x: tx+ptx+minX, y: ty+pty+minY,
      cx: tx+ptx+(minX+maxX)/2, cy: ty+pty+(minY+maxY)/2,
      w: maxX-minX, h: maxY-minY,
      pts: pts, ptx: ptx, pty: pty, reversed: reversed, dx: 0, dy: 0 };
  }
  
  function extractSubroutine(nc, nodeId, tx, ty, labelLines, fullLabel, maxTextWidth)
{
  var pm = nc.match(/<polygon[^>]*points="([^"]*)"/);
  if (!pm) return null;
  var pts = pm[1].trim().split(/[\s,]+/).map(parseFloat);
  if (pts.length !== 20) return null; // subroutine = 10 vertices (20 coords)
  var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for (var i=0; i<pts.length; i+=2)
  {
    minX=Math.min(minX,pts[i]); maxX=Math.max(maxX,pts[i]);
    minY=Math.min(minY,pts[i+1]); maxY=Math.max(maxY,pts[i+1]);
  }
  var ptm = nc.match(/<polygon[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
  var ptx = ptm ? parseFloat(ptm[1]) : 0;
  var pty = ptm ? parseFloat(ptm[2]) : 0;
  return { id: nodeId, type: 'subroutine', labelLines: labelLines, fullLabel: fullLabel,
    maxTextWidth: maxTextWidth, x: tx+ptx+minX, y: ty+pty+minY,
    cx: tx+ptx+(minX+maxX)/2, cy: ty+pty+(minY+maxY)/2,
    w: maxX-minX, h: maxY-minY, pts: pts, dx: 0, dy: 0 };
}

function extractCylinder(nc, nodeId, tx, ty, labelLines, fullLabel, maxTextWidth)
{
  var pm = nc.match(/<path[^>]*d="([^"]*)"/);
  if (!pm) return null;
  var d = pm[1];
  // Cylinder has curves (A or C or Q) and looks like a database
  if (!/A|C|Q/i.test(d)) return null;
  // Parse all coordinates to get bounding box
  var ptsm = d.match(/([\d.\-]+)[,\s]+([\d.\-]+)/g);
  if (!ptsm) return null;
  var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for (var i=0; i<ptsm.length; i++)
  {
    var xy = ptsm[i].split(/[,\s]+/).map(parseFloat);
    minX=Math.min(minX,xy[0]); maxX=Math.max(maxX,xy[0]);
    minY=Math.min(minY,xy[1]); maxY=Math.max(maxY,xy[1]);
  }
  var ptm = nc.match(/<path[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
  var ptx = ptm ? parseFloat(ptm[1]) : 0;
  var pty = ptm ? parseFloat(ptm[2]) : 0;
  // Ellipse radius for top/bottom
  var elR = (maxX - minX) / 2;
  var elH = (maxY - minY);
  return { id: nodeId, type: 'cylinder', labelLines: labelLines, fullLabel: fullLabel,
    maxTextWidth: maxTextWidth, x: tx+ptx+minX, y: ty+pty+minY,
    cx: tx+ptx+(minX+maxX)/2, cy: ty+pty+(minY+maxY)/2,
    w: maxX-minX, h: maxY-minY, elR: elR, dx: 0, dy: 0 };
}
// === DRAW SHAPE METHODS ===
function drawStadium(ctx, n, sx, sy, sw, scale, strokeColor, fillColor, r)
{
  var px = sx(n.x + n.dx), py = sy(n.y * 1 + n.dy);
  var pw = sw(n.w), ph = sw(n.h), rr = sw(n.r);
  ctx.strokeStyle = strokeColor; ctx.lineWidth = 2.5 * scale; ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(px + rr, py);
  ctx.lineTo(px + pw - rr, py);
  ctx.arc(px + pw - rr, py + rr, rr, -Math.PI/2, Math.PI/2);
  ctx.lineTo(px + rr, py + ph);
  ctx.arc(px + rr, py + rr, rr, Math.PI/2, Math.PI*3/2);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawRect(ctx, n, sx, sy, sw, scale, strokeColor, fillColor, r)
{
  var px = sx(n.x + n.dx), py = sy(n.y + n.dy);
  var pw = sw(n.w), ph = sw(n.h);
  ctx.strokeStyle = strokeColor; ctx.lineWidth = 2.5 * scale; ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(px + r, py);
  ctx.lineTo(px + pw - r, py); ctx.quadraticCurveTo(px + pw, py, px + pw, py + r);
  ctx.lineTo(px + pw, py + ph - r); ctx.quadraticCurveTo(px + pw, py + ph, px + pw - r, py + ph);
  ctx.lineTo(px + r, py + ph); ctx.quadraticCurveTo(px, py + ph, px, py + ph - r);
  ctx.lineTo(px, py + r); ctx.quadraticCurveTo(px, py, px + r, py);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawDiamond(ctx, n, sx, sy, sw, scale, strokeColor, fillColor)
{
  var dcx = sx(n.cx + n.dx), dcy = sy(n.cy + n.dy);
  var dhw = sw(n.w / 2), dhh = sw(n.h / 2);
  ctx.strokeStyle = strokeColor; ctx.lineWidth = 2.5 * scale; ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(dcx, dcy - dhh);
  ctx.lineTo(dcx + dhw, dcy);
  ctx.lineTo(dcx, dcy + dhh);
  ctx.lineTo(dcx - dhw, dcy);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawCircle(ctx, n, sx, sy, sw, scale, strokeColor, fillColor)
{
  var ccx = sx(n.cx + n.dx), ccy = sy(n.cy + n.dy), cR = sw(n.r);
  ctx.strokeStyle = strokeColor; ctx.lineWidth = 2.5 * scale; ctx.fillStyle = fillColor;
  ctx.beginPath(); ctx.arc(ccx, ccy, cR, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
}

function drawParallelogram(ctx, n, sx, sy, sw, scale, strokeColor, fillColor)
  {
    var dx = n.dx, dy = n.dy;
    var ncx = sx(n.cx + dx), ncy = sy(n.cy + dy);
    var hw = sw(n.w / 2), hh = sw(n.h / 2);
    var slant = 5 * scale;
    ctx.strokeStyle = strokeColor; ctx.lineWidth = 2.5 * scale; ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(ncx - hw + slant, ncy - hh);
    ctx.lineTo(ncx + hw + slant, ncy - hh);
    ctx.lineTo(ncx + hw - slant, ncy + hh);
    ctx.lineTo(ncx - hw - slant, ncy + hh);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    }

function drawSubroutine(ctx, n, sx, sy, sw, scale, strokeColor, fillColor)
{
  var dx = n.dx, dy = n.dy;
  var px = sx(n.x + dx), py = sy(n.y + dy);
  var pw = sw(n.w), ph = sw(n.h);
  var r = 8 * scale;
  ctx.strokeStyle = strokeColor; ctx.lineWidth = 2.5 * scale; ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(px + r, py);
  ctx.lineTo(px + pw - r, py); ctx.quadraticCurveTo(px + pw, py, px + pw, py + r);
  ctx.lineTo(px + pw, py + ph - r); ctx.quadraticCurveTo(px + pw, py + ph, px + pw - r, py + ph);
  ctx.lineTo(px + r, py + ph); ctx.quadraticCurveTo(px, py + ph, px, py + ph - r);
  ctx.lineTo(px, py + r); ctx.quadraticCurveTo(px, py, px + r, py);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  var inset = 5 * scale;
  ctx.beginPath();
  ctx.moveTo(px + inset, py + inset);
  ctx.lineTo(px + inset, py + ph - inset);
  ctx.moveTo(px + pw - inset, py + inset);
  ctx.lineTo(px + pw - inset, py + ph - inset);
  ctx.stroke();
}

function drawCylinder(ctx, n, sx, sy, sw, scale, strokeColor, fillColor)
{
  var cx = sx(n.cx + n.dx), cy = sy(n.cy + n.dy);
  var w = sw(n.w), h = sw(n.h), elR = sw(n.elR);
  var elH = h * 0.12; // ellipse height
  var topY = cy - h/2, botY = cy + h/2;
  ctx.strokeStyle = strokeColor; ctx.lineWidth = 2.5 * scale; ctx.fillStyle = fillColor;
  // Body (rectangle with curved top and bottom)
  ctx.beginPath();
  ctx.moveTo(cx - elR, topY);
  ctx.lineTo(cx - elR, botY);
  ctx.ellipse(cx, botY, elR, elH, 0, Math.PI, 0, true);
  ctx.lineTo(cx + elR, topY);
  ctx.ellipse(cx, topY, elR, elH, 0, 0, Math.PI, false);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Top ellipse line (visible part)
  ctx.beginPath();
  ctx.ellipse(cx, topY, elR, elH, 0, 0, Math.PI, false);
  ctx.stroke();
}

// === GET STYLE FOR NODE ===
// Use KB.getStyleForNode-like logic but with nodeId and label
function getStyleForNode(label, styleMap, styleDefault, nodeId)
{
  if (!styleMap) return null;
  var key = (label || '').toLowerCase().trim();
if (styleMap[key] !== undefined) return styleMap[key];
  if (nodeId)
  {
var idLower = nodeId.toLowerCase();
    if (styleMap[idLower] !== undefined) return styleMap[idLower];
    if (styleMap[nodeId] !== undefined) return styleMap[nodeId];
  }
  return null;
}

function getStateColors(st, styleDefault, nodeType)
{
  var dFill, dStroke, dIcon, dText;
  if (nodeType === 'stadium') { dFill = '#0038B8'; dStroke = '#0038B8'; dIcon = '#FFFFFF'; dText = '#FFFFFF'; }
  else if (nodeType === 'diamond') { dFill = '#FFFFFF'; dStroke = '#FF3B30'; dIcon = '#FF3B30'; dText = '#202124'; }
  else { dFill = '#F8F9FF'; dStroke = '#6A78F0'; dIcon = '#6A78F0'; dText = '#202124'; }
  var color = dStroke;
  var fillColor = dFill;
  var strokeColor = dStroke;
  var textColor = dText;
  var iconColor = dIcon;
  var isSolid = (dText === '#FFFFFF');
  if (st && (st.color || st.stroke))
  {
    color = st.color || st.stroke;
    var tc = st.textColor || st.text || (styleDefault && (styleDefault.text || styleDefault.textColor)) || null;
    if (!tc) tc = '#202124';
    isSolid = (tc === '#FFFFFF' || tc === '#ffffff');
    if (isSolid)
    {
      fillColor = color; strokeColor = color; textColor = '#FFFFFF'; iconColor = '#FFFFFF';
    }
    else
    {
      strokeColor = color;
      var cHex = color.replace('#', '');
      var cr = parseInt(cHex.substr(0, 2), 16);
      var cg = parseInt(cHex.substr(2, 2), 16);
      var cb = parseInt(cHex.substr(4, 2), 16);
      var tr = Math.round(cr + (255 - cr) * 0.90);
      var tg = Math.round(cg + (255 - cg) * 0.90);
      var tb = Math.round(cb + (255 - cb) * 0.90);
      fillColor = '#' + (tr < 16 ? '0' : '') + tr.toString(16) + (tg < 16 ? '0' : '') + tg.toString(16) + (tb < 16 ? '0' : '') + tb.toString(16);
      textColor = '#202124'; iconColor = color;
    }
  }
  if (st && st.fill) fillColor = st.fill;
  if (st && st.textColor) textColor = st.textColor;
  if (st && st.text) textColor = st.text;
  if (st && st.iconColor) iconColor = st.iconColor;
  var iconAccent = (st && st.accentColor) ? st.accentColor : (st && st.iconColor) ? st.iconColor : (isSolid ? '#FFB3AD' : '#FF3B30');
  var iconName = (st && st.icon) ? st.icon : null;
  return { color: color, isSolid: isSolid, fillColor: fillColor, strokeColor: strokeColor,
    textColor: textColor, iconColor: iconColor, iconAccent: iconAccent, iconName: iconName };
}
async function main(files)
{
  var __debugLog = [];
  var svgText = files[0].data.toString('utf8');
  var KB = KrokiBase;
  var FB = (typeof FeatherBicolor !== 'undefined') ? FeatherBicolor : null;

  // === LOAD STYLE JSON ===
  var styleMap = {}, styleDefault = {};
  if (files.length > 1 && files[1])
  {
    try
    {
      var parsed = JSON.parse(files[1].data.toString('utf8'));
var rawMap = parsed.nodes || {};
      var lowerMap = {};
      for (var sk in rawMap) lowerMap[sk.toLowerCase()] = rawMap[sk];
      styleMap = lowerMap;
      styleDefault = parsed.defaults || parsed.default || {};
    }
    catch(e) {}
  }
  var edgeColor = styleDefault && styleDefault.edgeColor || '#333333';
  var edgeLabelColor = styleDefault && styleDefault.edgeLabelColor || '#333333';
  var vCompress = styleDefault && styleDefault.vCompress ? styleDefault.vCompress : 1.0;

  // === EXTRACT NODES ===
  var nodes = [], nodeMap = {};
  var ns = /<g\s+class="node[^"]*"\s+id="([^"]*)"\s+transform="translate\(([\d.\-]+),\s*([\d.\-]+)\)"[^>]*>/g;
  var m;
  while ((m = ns.exec(svgText)) !== null)
  {
    var depth = 1, pos = m.index + m[0].length;
    while (depth > 0 && pos < svgText.length)
    {
      var oi = svgText.indexOf('<g', pos), ci = svgText.indexOf('</g>', pos);
      if (ci === -1) break;
      if (oi !== -1 && oi < ci) { depth++; pos = oi + 2; }
      else { depth--; pos = ci + 4; }
    }
    var nc = svgText.substring(m.index, pos);
    var rawId = m[1]; var nodeId = rawId.replace(/^flowchart-([A-Za-z0-9]+)-\d+$/, "$1").replace(/^flowchart-/, ""); var tx = parseFloat(m[2]), ty = parseFloat(m[3]);
    var svgTypeM = nc.match(/class="node[^\"]*\s(startEnd|standard|decision|warning)/); var svgType = svgTypeM ? svgTypeM[1] : 'standard';
    var lblMatch = nc.match(/<span class="nodeLabel"[^>]*>([\s\S]*?)<\/span>/);
    var mwMatch = nc.match(/max-width:\s*(\d+)px/i);
    var maxTextWidth = mwMatch ? parseInt(mwMatch[1]) : 200;
    var labelLines = [];
    if (lblMatch)
    {
      var raw = lblMatch[1];
      var parts = raw.split(/<p[^>]*>|<br\s*\/?>/i);
      for (var pp = 0; pp < parts.length; pp++)
      {
        var txt = parts[pp].replace(/<\/p>/gi, '').replace(/<[^>]*>/g, '').trim();
        if (txt) labelLines.push(txt);
      }
      if (labelLines.length === 0)
      {
        var t = raw.replace(/<[^>]*>/g, '').trim();
        if (t) labelLines.push(t);
      }
    }
    var fullLabel = labelLines.join(' ');
    var nd = null;
    // Try each shape extractor in order
    var extractors = [extractStadiumPath, extractStadium, extractRect, extractSubroutine, extractParallelogram, extractDiamond, extractCircle];
    for (var ei = 0; ei < extractors.length && !nd; ei++)
    {
      nd = extractors[ei](nc, nodeId, tx, ty, labelLines, fullLabel, maxTextWidth);
    }
    if (!nd)
    {
      // Fallback: extract bounding box from any shape element and draw as rect
      var anyShape = nc.match(/<(rect|circle|polygon|path)[^>]*>/);
      if (anyShape)
      {
        var allCoords = [];
        var rectM = nc.match(/<rect[^>]*x="([\d.\-]+)"[^>]*y="([\d.\-]+)"[^>]*width="([\d.\-]+)"[^>]*height="([\d.\-]+)"/);
        if (rectM)
        {
          var rx = parseFloat(rectM[1]), ry = parseFloat(rectM[2]), rw = parseFloat(rectM[3]), rh = parseFloat(rectM[4]);
          nd = { id: nodeId, type: 'rect', labelLines: labelLines, fullLabel: fullLabel,
            maxTextWidth: maxTextWidth, x: tx + rx, y: ty + ry, cx: tx + rx + rw/2, cy: ty + ry + rh/2,
            w: rw, h: rh, dx: 0, dy: 0 };
        }
        if (!nd)
        {
          var polyM = nc.match(/<polygon[^>]*points="([^"]*)"[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
          if (polyM)
          {
            var ppStr = polyM[1].trim();
            var pp = ppStr.split(/[\s,]+/);
            var ptx = parseFloat(polyM[2]), pty = parseFloat(polyM[3]);
            var xs = [], ys = [];
            for (var pi = 0; pi + 1 < pp.length; pi += 2) { xs.push(parseFloat(pp[pi])); ys.push(parseFloat(pp[pi+1])); }
            var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
            var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
            nd = { id: nodeId, type: 'rect', labelLines: labelLines, fullLabel: fullLabel,
              maxTextWidth: maxTextWidth, x: tx + ptx + minX, y: ty + pty + minY,
              cx: tx + ptx + (minX+maxX)/2, cy: ty + pty + (minY+maxY)/2,
              w: maxX - minX, h: maxY - minY, dx: 0, dy: 0 };
          }
        }
        if (!nd)
        {
          var pathM2 = nc.match(/<path[^>]*d="([^"]*)"/);
          if (pathM2)
          {
            var d2 = pathM2[1];
            var ptm2 = nc.match(/<path[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
            var pt2x = ptm2 ? parseFloat(ptm2[1]) : 0;
            var pt2y = ptm2 ? parseFloat(ptm2[2]) : 0;
            // Proper path parser: track current point, handle relative commands
            // Also track arc radii to expand bounding box for curves
            var toks = d2.match(/([MLmlAaTtHhVvCcSsQqZz]|[-\d.]+)/g);
            var ti = 0, curX = 0, curY = 0;
            var xs2 = [], ys2 = [];
            while (ti < toks.length)
            {
              var tk = toks[ti];
              if (/[MLmlAaTtHhVv]/.test(tk))
              {
                ti++;
                if (tk === 'M' || tk === 'm') {
                  var vx = parseFloat(toks[ti++]), vy = parseFloat(toks[ti++]);
                  if (tk === 'm') { curX += vx; curY += vy; } else { curX = vx; curY = vy; }
                  xs2.push(curX); ys2.push(curY);
                } else if (tk === 'L' || tk === 'l') {
                  var vx = parseFloat(toks[ti++]), vy = parseFloat(toks[ti++]);
                  if (tk === 'l') { curX += vx; curY += vy; } else { curX = vx; curY = vy; }
                  xs2.push(curX); ys2.push(curY);
                } else if (tk === 'A' || tk === 'a') {
                  var arx = parseFloat(toks[ti++]), ary = parseFloat(toks[ti++]);
                  toks[ti++]; toks[ti++]; toks[ti++];
                  var vx = parseFloat(toks[ti++]), vy = parseFloat(toks[ti++]);
                  var startX = curX, startY = curY;
                  if (tk === 'a') { curX += vx; curY += vy; } else { curX = vx; curY = vy; }
                  // Arc curves beyond endpoints by ry in Y and rx in X
                  xs2.push(startX); xs2.push(curX);
                  ys2.push(startY - ary); ys2.push(startY + ary);
                  ys2.push(curY - ary); ys2.push(curY + ary);
                } else if (tk === 'H' || tk === 'h') {
                  var vx = parseFloat(toks[ti++]);
                  if (tk === 'h') curX += vx; else curX = vx;
                  xs2.push(curX); ys2.push(curY);
                } else if (tk === 'V' || tk === 'v') {
                  var vy = parseFloat(toks[ti++]);
                  if (tk === 'v') curY += vy; else curY = vy;
                  xs2.push(curX); ys2.push(curY);
                } else { while (ti < toks.length && !/[MLmlAaTtHhVvCcSsQqZz]/.test(toks[ti])) ti++; }
              } else { ti++; }
            }
            if (xs2.length > 0 && ys2.length > 0)
            {
              var minX2 = Math.min.apply(null, xs2), maxX2 = Math.max.apply(null, xs2);
              var minY2 = Math.min.apply(null, ys2), maxY2 = Math.max.apply(null, ys2);
              nd = { id: nodeId, type: 'rect', labelLines: labelLines, fullLabel: fullLabel,
                maxTextWidth: maxTextWidth, x: tx + pt2x + minX2, y: ty + pt2y + minY2,
                cx: tx + pt2x + (minX2+maxX2)/2, cy: ty + pt2y + (minY2+maxY2)/2,
                w: maxX2 - minX2, h: maxY2 - minY2, dx: 0, dy: 0 };
            }
          }
        }
      }
    }
    if (nd)
    {
      // Store transform offsets for path-based shapes
      var ptm = nc.match(/<path[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
      if (ptm) { nd._ptx = parseFloat(ptm[1]); nd._pty = parseFloat(ptm[2]); }
      var polyTm = nc.match(/<polygon[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
      if (polyTm) { nd._ptx = parseFloat(polyTm[1]); nd._pty = parseFloat(polyTm[2]); }
      nodes.push(nd);
      nd.svgType = svgType;
      nodeMap[nodeId] = nd;
    }
  }

  // === EXTRACT EDGES ===
  var edges = [];
  var edgeRe = /<path[^>]*data-id="([^"]*)"[^>]*data-points="([^"]*)"[^>]*>/g;
  var em;
  while ((em = edgeRe.exec(svgText)) !== null)
  {
    var edgePts = [];
    try
    {
      var decoded = JSON.parse(Buffer.from(em[2], 'base64').toString('utf8'));
      for (var pi = 0; pi < decoded.length; pi++)
        edgePts.push({ x: decoded[pi].x, y: decoded[pi].y });
    }
    catch (e) {}
    if (edgePts.length >= 2)
      edges.push({ id: em[1], points: edgePts, sourceId: null, targetId: null });
  }

  // === EXTRACT EDGE LABELS ===
  var edgeLabels = [];
  var elRe = /<g\s+class="edgeLabel"[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"[^>]*>[\s\S]*?<g class="label"\s+data-id="([^"]*)"[^>]*>[\s\S]*?<span class="edgeLabel"[^>]*>([\s\S]*?)<\/span>/g;
  var elm;
  while ((elm = elRe.exec(svgText)) !== null)
  {
    var elText = elm[4].replace(/<[^>]*>/g, '').trim();
    if (elText)
      edgeLabels.push({ id: elm[3], text: elText, x: parseFloat(elm[1]), y: parseFloat(elm[2]) });
  }

  // === MATCH EDGES TO NODES ===
  for (var ei2 = 0; ei2 < edges.length; ei2++)
  {
    var ed = edges[ei2];
    var srcPt = ed.points[0], tgtPt = ed.points[ed.points.length - 1];
    var bestSrc = null, bestSrcD = Infinity;
    var bestTgt = null, bestTgtD = Infinity;
    for (var ni = 0; ni < nodes.length; ni++)
    {
      var nd2 = nodes[ni];
      var dSrc = distToContour(nd2, srcPt.x, srcPt.y);
      var dTgt = distToContour(nd2, tgtPt.x, tgtPt.y);
      if (dSrc < bestSrcD) { bestSrcD = dSrc; bestSrc = nd2; }
      if (dTgt < bestTgtD) { bestTgtD = dTgt; bestTgt = nd2; }
    }
    ed.sourceId = bestSrc ? bestSrc.id : null;
    ed.targetId = bestTgt ? bestTgt.id : null;
  }

  // === DRAW SCENE ===
  var scale = 4;
  svgW = parseFloat(svgText.match(/width="([\d.]+)"/)[1]);
  svgH = parseFloat(svgText.match(/height="([\d.]+)"/)[1]);
  var canvas = createCanvas(svgW * scale, svgH * scale);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  var sx = function(x) { return x * scale; };
  var sy = function(y) { return y * vCompress * scale; };
  var sw = function(v) { return v * scale; };

  // Draw edges
  for (var ei3 = 0; ei3 < edges.length; ei3++)
  {
    var ed3 = edges[ei3];
    var src3 = nodeMap[ed3.sourceId], tgt3 = nodeMap[ed3.targetId];
    if (!src3 || !tgt3) continue;
    ctx.strokeStyle = edgeColor; ctx.lineWidth = 2.5 * scale;
    ctx.beginPath();
    var pts3 = ed3.points, npts3 = pts3.length, xformed3 = [];
    for (var pi3 = 0; pi3 < npts3; pi3++)
    {
      var ratio3 = npts3 > 1 ? pi3 / (npts3 - 1) : 0;
      var pSrcX = src3.cx + src3.dx + (pts3[pi3].x - src3.cx);
      var pSrcY = src3.cy + src3.dy + (pts3[pi3].y - src3.cy) * vCompress;
      var pTgtX = tgt3.cx + tgt3.dx + (pts3[pi3].x - tgt3.cx);
      var pTgtY = tgt3.cy + tgt3.dy + (pts3[pi3].y - tgt3.cy) * vCompress;
      var fx = pSrcX * (1 - ratio3) + pTgtX * ratio3;
      var fy = pSrcY * (1 - ratio3) + pTgtY * ratio3;
      xformed3.push({ x: fx, y: fy });
    }
    if (xformed3.length === 2)
    {
      ctx.moveTo(sx(xformed3[0].x), sy(xformed3[0].y));
      ctx.lineTo(sx(xformed3[1].x), sy(xformed3[1].y));
    }
    else
    {
      ctx.moveTo(sx(xformed3[0].x), sy(xformed3[0].y));
      for (var si = 1; si < xformed3.length - 1; si++)
      {
        var mx = (xformed3[si].x + xformed3[si+1].x) / 2;
        var my = (xformed3[si].y + xformed3[si+1].y) / 2;
        ctx.quadraticCurveTo(sx(xformed3[si].x), sy(xformed3[si].y), sx(mx), sy(my));
      }
      ctx.lineTo(sx(xformed3[xformed3.length-1].x), sy(xformed3[xformed3.length-1].y));
    }
    ctx.stroke();
    // Arrowhead
    var last = xformed3[xformed3.length-1], prev = xformed3[xformed3.length-2];
    var angle = Math.atan2(sy(last.y) - sy(prev.y), sx(last.x) - sx(prev.x));
    var ah = 10 * scale;
    ctx.beginPath();
    ctx.moveTo(sx(last.x), sy(last.y));
    ctx.lineTo(sx(last.x) - ah * Math.cos(angle - 0.4), sy(last.y) - ah * Math.sin(angle - 0.4));
    ctx.lineTo(sx(last.x) - ah * Math.cos(angle + 0.4), sy(last.y) - ah * Math.sin(angle + 0.4));
    ctx.closePath(); ctx.fillStyle = edgeColor; ctx.fill();
  }

  // Draw edge labels
  for (var eli = 0; eli < edgeLabels.length; eli++)
  {
    var el = edgeLabels[eli];
    var elSrc = null, elTgt = null;
    for (var eli2 = 0; eli2 < edges.length; eli2++)
    {
      if (edges[eli2].id === el.id)
      {
        elSrc = nodeMap[edges[eli2].sourceId];
        elTgt = nodeMap[edges[eli2].targetId];
        break;
      }
    }
    var elX = el.x, elY = el.y * vCompress;
    if (elSrc && elTgt)
    {
      elX = (elSrc.cx + elSrc.dx + (el.x - elSrc.cx)) * 0.5 + (elTgt.cx + elTgt.dx + (el.x - elTgt.cx)) * 0.5;
      elY = ((elSrc.cy + elSrc.dy + (el.y - elSrc.cy) * vCompress) * 0.5 + (elTgt.cy + elTgt.dy + (el.y - elTgt.cy) * vCompress) * 0.5);
    }
    ctx.font = '600 ' + (14 * scale) + 'px "trebuchet ms", verdana, arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var elTw = ctx.measureText(el.text).width;
    var elBw = elTw + 24 * scale, elBh = 28 * scale;
    var elRx = sx(elX) - elBw / 2, elRy = sy(elY / vCompress) - elBh / 2, elR = elBh / 2;
    ctx.fillStyle = 'rgba(230,240,250,0.95)';
    ctx.beginPath();
    ctx.moveTo(elRx + elR, elRy);
    ctx.arcTo(elRx + elBw, elRy, elRx + elBw, elRy + elBh, elR);
    ctx.arcTo(elRx + elBw, elRy + elBh, elRx, elRy + elBh, elR);
    ctx.arcTo(elRx, elRy + elBh, elRx, elRy, elR);
    ctx.arcTo(elRx, elRy, elRx + elBw, elRy, elR);
    ctx.fill();
    ctx.strokeStyle = '#7AB1E8'; ctx.lineWidth = 1.5 * scale; ctx.stroke();
    ctx.fillStyle = edgeLabelColor;
    ctx.fillText(el.text, sx(elX), sy(elY / vCompress));
  }
  // Draw nodes
  for (var ni2=0; ni2<nodes.length; ni2++)
  {
    var n=nodes[ni2];
var st=getStyleForNode(n.fullLabel, styleMap, styleDefault, n.id);
    var v1Type = n.svgType || ((n.type === 'stadium') ? 'startEnd' : (n.type === 'diamond') ? 'decision' : 'standard');
    var scDef = KB.getStateColor(n.fullLabel, v1Type, ni2);
    var strokeColor = scDef.stroke, fillColor = scDef.fill, textColor = '#202124';
    if (styleDefault && styleDefault.fill) fillColor = styleDefault.fill;
    if (styleDefault && (styleDefault.stroke || styleDefault.color)) strokeColor = styleDefault.stroke || styleDefault.color;
    if (styleDefault && (styleDefault.text || styleDefault.textColor)) textColor = styleDefault.text || styleDefault.textColor;
    var iconColor = scDef.icon, iconAccent = scDef.accent;
    if (styleDefault && styleDefault.iconColor) iconColor = styleDefault.iconColor;
    if (styleDefault && styleDefault.accentColor) iconAccent = styleDefault.accentColor;
    var iconName = KB.findIconForLabel(n.fullLabel);
    if (styleDefault && styleDefault.icon) { iconName = (styleDefault.icon === "" || styleDefault.icon === null) ? null : styleDefault.icon; }
if (st) {
      if (st.color) {
        strokeColor = st.color;
        var tc2 = st.textColor || st.text || (styleDefault && (styleDefault.text || styleDefault.textColor)) || null;
        if (tc2) { textColor = tc2; if (st.fill) fillColor = st.fill; }
        if (st.fill) fillColor = st.fill;
        else fillColor = (st.solid) ? st.color : KB.tint(st.color, 0.90);
        if (st.solid) v1Type = 'startEnd'; else v1Type = 'standard';
      }
if (st.textColor) textColor = st.textColor;
      if (st.text) textColor = st.text;
if (st.iconColor) iconColor = st.iconColor;
      if (st.accentColor) iconAccent = st.accentColor;
      else if (st.iconColor) iconAccent = st.iconColor;
if (st.icon !== undefined) {
        iconName = (st.icon === null || st.icon === "") ? null : st.icon;
      }
    }
var iconSize=26;
    __debugLog.push("Node=" + n.id + " label=" + n.fullLabel + " type=" + n.type + " stroke=" + strokeColor + " fill=" + fillColor + " text=" + textColor + " icon=" + iconName + " iconColor=" + iconColor + " accent=" + iconAccent);
    var ncx=n.cx+n.dx, ncy=n.cy+n.dy;
    
    var r=8*scale;
    var skipShape=(iconName && FB && (n.type==="stadium"||n.type==="rect"||n.type==="cylinder"));
    if(!skipShape)
    {
    if(n.type==="stadium") drawStadium(ctx,n,sx,sy,sw,scale,strokeColor,fillColor,r);
    else if(n.type==="rect") drawRect(ctx,n,sx,sy,sw,scale,strokeColor,fillColor,r);
    else if(n.type==="diamond") drawDiamond(ctx,n,sx,sy,sw,scale,strokeColor,fillColor);
    else if(n.type==="circle") drawCircle(ctx,n,sx,sy,sw,scale,strokeColor,fillColor);
    else if(n.type==="subroutine") drawSubroutine(ctx,n,sx,sy,sw,scale,strokeColor,fillColor);
    else if(n.type==="cylinder") drawCylinder(ctx,n,sx,sy,sw,scale,strokeColor,fillColor);
    }
    if(n.type=="parallelogram") drawParallelogram(ctx,n,sx,sy,sw,scale,strokeColor,fillColor);
    if(n.type==="diamond")
    {
      if(iconName && FB)
      {
        ctx.font="600 "+(15*scale)+"px Arial, sans-serif";
        var dw=wrapText(ctx, n.labelLines.join(" "), n.w*0.65, scale);
        var dl=15*1.15*scale, dtt=dl*dw.length;
        var totalH=dtt/scale+iconSize+4;
        var dtsy=ncy-totalH/2+dl/(2*scale);
        ctx.fillStyle=textColor; ctx.textAlign="center"; ctx.textBaseline="middle";
        for(var dti=0; dti<dw.length; dti++) ctx.fillText(dw[dti], sx(ncx), sy(dtsy+dti*dl/scale));
        var diy=dtsy+dtt/scale+iconSize/2+2;
        KB.drawFeatherIcon(ctx, sx, sy, scale, FB, iconName, ncx, diy, iconSize, iconColor, iconAccent);
      }
      else if(n.labelLines.length>0)
      {
        ctx.fillStyle=textColor; ctx.font="600 "+(15*scale)+"px Arial, sans-serif";
        ctx.textAlign="center"; ctx.textBaseline="middle";
        var dw2=wrapText(ctx, n.labelLines.join(" "), n.w*0.65, scale);
        var dl2=15*1.15*scale, dtt2=dl2*dw2.length;
        var dtsy2=ncy-(dtt2-dl2)/(2*scale);
        for(var dti2=0; dti2<dw2.length; dti2++) ctx.fillText(dw2[dti2], sx(ncx), sy(dtsy2+dti2*dl2/scale));
      }
    }
    else if(n.type==="circle")
    {
      if(iconName && FB) KB.drawFeatherIcon(ctx, sx, sy, scale, FB, iconName, ncx, ncy, iconSize, iconColor, iconAccent);
      if(iconName && FB && n.labelLines.length>0)
      {
        ctx.fillStyle=textColor; ctx.font="600 "+(14*scale)+"px Arial, sans-serif";
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(n.labelLines.join(" "), sx(ncx), sy(ncy+n.cR/2+8/scale));
      }
      else if(n.labelLines.length>0)
      {
        ctx.fillStyle=textColor; ctx.font="600 "+(14*scale)+"px Arial, sans-serif";
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(n.labelLines.join(" "), sx(ncx), sy(ncy));
      }
    }
    else if(n.type=="parallelogram")
    {
      if(iconName && FB)
      {
        ctx.font="600 "+(15*scale)+"px Arial, sans-serif";
        var maxTWp=n.maxTextWidth||(n.w-40);
        var wrp=wrapText(ctx, n.labelLines.join(" "), maxTWp, scale);
        var lHp=15*1.15*scale;
        var bboxp=getTextBBox(ctx, wrp, ncx, ncy, lHp, scale);
        var baseWp=(bboxp.maxX-bboxp.minX)+40;
        n.w=baseWp+25;
        n.x=ncx-baseWp/2-15;
        var textShiftp=10;
        // Redraw the parallelogram with new width
        drawParallelogram(ctx,n,sx,sy,sw,scale,strokeColor,fillColor);
        var dotXp=bboxp.minX-8;
        KB.drawFeatherIcon(ctx, sx, sy, scale, FB, iconName, dotXp, bboxp.cy, iconSize, iconColor, iconAccent);
        ctx.fillStyle=textColor; ctx.textAlign="center"; ctx.textBaseline="middle";
        for(var rpi=0; rpi<wrp.length; rpi++) ctx.fillText(wrp[rpi], sx(ncx+textShiftp), sy(bboxp.minY+(rpi+0.5)*lHp/scale));
      }
      else if(n.labelLines.length>0)
      {
        ctx.fillStyle=textColor; ctx.font="600 "+(15*scale)+"px Arial, sans-serif";
        ctx.textAlign="center"; ctx.textBaseline="middle";
        var pwt=wrapText(ctx, n.labelLines.join(" "), (n.maxTextWidth||200)-4, scale);
        var plt=15*1.15*scale, ptt2=plt*pwt.length;
        var psty=ncy-(ptt2-plt)/(2*scale);
        for(var pti=0; pti<pwt.length; pti++) ctx.fillText(pwt[pti], sx(ncx), sy(psty+pti*plt/scale));
      }
    }
    else if(n.type=="subroutine")
    {
      if(iconName && FB)
      {
ctx.font=((v1Type==='startEnd')?"700 ":"600 ")+(15*scale)+"px Arial, sans-serif";
        var maxTWs=9999;
        var wrs=wrapText(ctx, n.labelLines.join(" "), maxTWs, scale);
        var lHs=15*1.15*scale;
        var bboxs=getTextBBox(ctx, wrs, ncx, ncy, lHs, scale);
        var baseWs=(bboxs.maxX-bboxs.minX)+40;
        n.w=baseWs+25;
        n.x=ncx-baseWs/2-15;
        var textShifts=10;
        drawSubroutine(ctx,n,sx,sy,sw,scale,strokeColor,fillColor);
        var dotXs=bboxs.minX-8;
        KB.drawFeatherIcon(ctx, sx, sy, scale, FB, iconName, dotXs, bboxs.cy, iconSize, iconColor, iconAccent);
        ctx.fillStyle=textColor; ctx.textAlign="center"; ctx.textBaseline="middle";
        for(var rsi=0; rsi<wrs.length; rsi++) ctx.fillText(wrs[rsi], sx(ncx+textShifts), sy(bboxs.minY+(rsi+0.5)*lHs/scale));
      }
      else if(n.labelLines.length>0)
      {
        ctx.fillStyle=textColor; ctx.font="600 "+(15*scale)+"px Arial, sans-serif";
        ctx.textAlign="center"; ctx.textBaseline="middle";
        var swt=wrapText(ctx, n.labelLines.join(" "), (n.maxTextWidth||200)-4, scale);
        var slt=15*1.15*scale, stt=slt*swt.length;
        var ssty=ncy-(stt-slt)/(2*scale);
        for(var sti=0; sti<swt.length; sti++) ctx.fillText(swt[sti], sx(ncx), sy(ssty+sti*slt/scale));
      }
    }
    else
    {
      if(iconName && FB)
      {
ctx.font=((v1Type==='startEnd')?"700 ":"600 ")+(15*scale)+"px Arial, sans-serif";
        var maxTW0=9999;
        var wr=wrapText(ctx, n.labelLines.join(" "), maxTW0, scale);
        var lH=15*1.15*scale;
        var bbox=getTextBBox(ctx, wr, ncx, ncy, lH, scale);
        var baseW=(bbox.maxX-bbox.minX)+40;
        n.w=baseW+25;
        if(n.type==="stadium" && n.w < n.h) n.w = n.h + 20;
        if(n.type==="stadium") n.r = n.h/2;
        n.x=ncx-baseW/2-15;
        var textShift=10;
        // Redraw the node shape with new width
        var r2=8*scale;
if(n.type==="stadium") drawStadium(ctx,n,sx,sy,sw,scale,strokeColor,fillColor,r2);
        else if(n.type==="rect") drawRect(ctx,n,sx,sy,sw,scale,strokeColor,fillColor,r2);
        else drawRect(ctx,n,sx,sy,sw,scale,strokeColor,fillColor,r2);
        var dotX=bbox.minX-8;
        KB.drawFeatherIcon(ctx, sx, sy, scale, FB, iconName, dotX, bbox.cy, iconSize, iconColor, iconAccent);
        ctx.font=((v1Type==='startEnd')?"700 ":"600 ")+(15*scale)+"px Arial, sans-serif";
        ctx.fillStyle=textColor; ctx.textAlign="center"; ctx.textBaseline="middle";
        for(var ri=0; ri<wr.length; ri++) ctx.fillText(wr[ri], sx(ncx+textShift), sy(bbox.minY+(ri+0.5)*lH/scale));
      }
      else if(n.labelLines.length>0)
      {
ctx.fillStyle=textColor; ctx.font=((v1Type==='startEnd')?"700 ":"600 ")+(15*scale)+"px Arial, sans-serif";
        ctx.textAlign="center"; ctx.textBaseline="middle";
        var wt=wrapText(ctx, n.labelLines.join(" "), (n.maxTextWidth||200)-4, scale);
        var lt=15*1.15*scale, tt=lt*wt.length;
        var stt=ncy-(tt-lt)/(2*scale);
        for(var rti=0; rti<wt.length; rti++) ctx.fillText(wt[rti], sx(ncx), sy(stt+rti*lt/scale));
      }
    }
  }
  if (files.length > 2 && files[2] && files[2].data.toString('utf8').indexOf('debug') !== -1) {
    return __debugLog.join('\n');
  }
  return canvas.toBuffer("image/png");
}
