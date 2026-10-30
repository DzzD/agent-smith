// =============================================================
// KrokiFlowEnhancer.js
// Enhancer for Mermaid flowchart and state diagrams rendered as SVG by Kroki.
// Requires: KrokiBase.js, FeatherDrawIcon.js (via requiredJsFiles)
//
// Input files (in order):
//   [0] SVG source (from Kroki, format=svg)
//   [1] FeatherDrawIcon.js (icon library, optional — can also be in requiredJsFiles)
//   [2] Style JSON (optional)
//
// Output: PNG buffer (high resolution, scale 4)
//
// =============================================================
// Style JSON format
// =============================================================
//
// The style JSON overrides default colors and icons per node.
// Node keys are matched case-insensitively against the node label.
//
// {
//   "default": {
//     "color": "#6A78F0"        // Default stroke/border color for all nodes
//   },
//   "nodes": {
//     "label of the node": {
//       "color": "#0038B8",     // Primary color (fill for solid nodes, stroke for others)
//       "textColor": "#FFFFFF", // Text color inside the node (use #FFFFFF for solid nodes)
//       "icon": "inbox",        // Feather icon name (see FeatherDrawIcon.js)
//       "iconColor": "#FFFFFF", // Override icon color (defaults to color or white for solid)
//       "accentColor": "#FF3B30"// Override accent color for icons
//     }
//   }
// }
//
// When textColor is "#FFFFFF", the node is rendered as a solid filled node
// (like startEnd nodes). Otherwise it gets a light tinted background.
//
// Icon names follow the Feather icon set (e.g. "inbox", "check-circle",
// "alert-triangle", "settings", "database", "send", "user", "lock",
// "file-text", "play", "square", "clock", "search", "help-circle").
//
// =============================================================

async function main(files) {
  const { createCanvas } = require('canvas');
  var KB = KrokiBase;

  // --- Load SVG ---
  var svgText = files[0].data.toString('utf8');
  if (!svgText) throw new Error('No SVG input provided');

  // --- Load Feather icon library ---
  // If FeatherDrawIcon-v2.js is passed as requiredJsFiles, FeatherBicolor is already global.
  // If passed as files[1], eval it.
  var FB = null;
  if (typeof FeatherBicolor !== 'undefined') {
    FB = FeatherBicolor;
  } else if (files[1]) {
    var _mod = { exports: {} };
    var _savedModule = typeof module !== 'undefined' ? module : undefined;
    module = _mod;
    eval(files[1].data.toString('utf8'));
    FB = _mod.exports || (typeof FeatherBicolor !== 'undefined' ? FeatherBicolor : null);
    if (_savedModule !== undefined) module = _savedModule; else module = undefined;
  }

  // --- Load style JSON ---
  var styleData = null;
  var styleFileIdx = (typeof FeatherBicolor === 'undefined' && files[1]) ? 2 : 1;
  if (files[styleFileIdx]) styleData = files[styleFileIdx].data;
  var parsedStyle = KB.parseStyleJson(styleData);
  var styleMap = parsedStyle.map;
  var styleDefault = parsedStyle.default;// --- Parse SVG ---
  var dims = KB.extractDimensions(svgText);
  var classStyles = KB.parseCssStyles(svgText);

  // --- Extract nodes ---
  function extractNodes(svg, cs) {
    var nodes = [];
    var ns = /<g\s+class="node[^"]*"\s+id="([^"]*)"\s+transform="translate\(([\d.\-]+),\s*([\d.\-]+)\)"[^>]*>/g;
    var m;
    while ((m = ns.exec(svg)) !== null) {
      var depth = 1, pos = m.index + m[0].length;
      while (depth > 0 && pos < svg.length) {
        var oi = svg.indexOf('<g', pos), ci = svg.indexOf('</g>', pos);
        if (ci === -1) break;
        if (oi !== -1 && oi < ci) { depth++; pos = oi + 2; } else { depth--; pos = ci + 4; }
      }
      var nc = svg.substring(m.index, pos);
      var cls = KB.resolveClassStyle(nc, cs);
      var shape = 'rect', rx = 0, ry = 0, rw = 0, rh = 0, hw = 0, hh = 0, radius = 0, cCx = 0, cCy = 0, cR = 0, pp = null;
      var rm = nc.match(/<rect[^>]*x="([\d.\-]+)"[^>]*y="([\d.\-]+)"[^>]*width="([\d.\-]+)"[^>]*height="([\d.\-]+)"/);
      if (rm) { rx = parseFloat(rm[1]); ry = parseFloat(rm[2]); rw = parseFloat(rm[3]); rh = parseFloat(rm[4]); }
      var pm = nc.match(/<polygon[^>]*points="([^"]*)"[^>]*>/);
      if (pm) {
        shape = 'diamond';
        var pts = pm[1].trim().split(/[\s,]+/).map(parseFloat);
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (var i = 0; i < pts.length; i += 2) { minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]); minY = Math.min(minY, pts[i+1]); maxY = Math.max(maxY, pts[i+1]); }
        hw = (maxX - minX) / 2; hh = (maxY - minY) / 2;
        if (pts.length / 2 === 4) {
          var p0x=pts[0],p0y=pts[1],p1x=pts[2],p1y=pts[3],p2x=pts[4],p2y=pts[5],p3x=pts[6],p3y=pts[7];
          var midX=(p0x+p1x+p2x+p3x)/4, midY=(p0y+p1y+p2y+p3y)/4;
          var isDiamond = (Math.abs(p0x-midX)<1 && Math.abs(p2x-midX)<1 && Math.abs(p1y-midY)<1 && Math.abs(p3y-midY)<1)
                       || (Math.abs(p1x-midX)<1 && Math.abs(p3x-midX)<1 && Math.abs(p0y-midY)<1 && Math.abs(p2y-midY)<1);
          if (!isDiamond) shape = 'polygon';
        } else { shape = 'polygon'; }
        pp = pts;
        var polyTm = nc.match(/<polygon[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
        if (polyTm) { pp = pp.slice(); pp._offset = { tx: parseFloat(polyTm[1]), ty: parseFloat(polyTm[2]) }; }
      }
      var cm2tag = nc.match(/<circle[^>]*>/);
      if (cm2tag) {
        var ctag = cm2tag[0];
        var rm2 = ctag.match(/\sr="([\d.\-]+)"/), cxm2 = ctag.match(/\scx="([\d.\-]+)"/), cym2 = ctag.match(/\scy="([\d.\-]+)"/);
        if (rm2 && cxm2 && cym2) { shape = 'circle'; cR = parseFloat(rm2[1]); cCx = parseFloat(cxm2[1]); cCy = parseFloat(cym2[1]); }
        else { var rm3 = ctag.match(/\sr="([\d.\-]+)"/); if (rm3) { shape = 'circle'; cR = parseFloat(rm3[1]); cCx = 0; cCy = 0; } }
      }
      var pathM = nc.match(/<path[^>]*d="([^"]*)"[^>]*>/);
      var pathD = null, pathTransform = { tx: 0, ty: 0 }, pathBBoxH = 0;
      if (pathM && !pm && !cm2tag) {
        pathD = pathM[1];
        var ptM = nc.match(/<g[^>]*class="[^"]*label-container[^"]*"[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
        var ptx = 0, pty = 0;
        if (ptM) { ptx = parseFloat(ptM[1]); pty = parseFloat(ptM[2]); }
        var bb = KB.parseSvgPathBBox(pathD);
        if (bb) { ptx -= bb.cx; pty -= bb.cy; pathBBoxH = bb.maxY - bb.minY; }
        pathTransform = { tx: ptx, ty: pty };
        shape = 'path';
      }
      var em = nc.match(/<ellipse[^>]*cx="([\d.\-]+)"[^>]*cy="([\d.\-]+)"[^>]*rx="([\d.\-]+)"[^>]*ry="([\d.\-]+)"/);
      if (em) { shape = 'ellipse'; cCx = parseFloat(em[1]); cCy = parseFloat(em[2]); hw = parseFloat(em[3]); hh = parseFloat(em[4]); }
      var radM = nc.match(/<rect[^>]*rx="([\d.]+)"/); if (radM) radius = parseFloat(radM[1]);
      if (shape === 'rect' && !rm) {
        var foM = nc.match(/<foreignObject[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/);
        var labelGm = nc.match(/<g\s+class="label"[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
        if (foM && labelGm) { rw = parseFloat(foM[1]) + 20; rh = parseFloat(foM[2]) + 16; rx = parseFloat(labelGm[1]) - 10; ry = parseFloat(labelGm[2]) - 8; }
      }
      var emtag = nc.match(/<ellipse[^>]*>/);
      var ses = pm ? pm[0] : (rm ? rm[0] : (cm2tag ? cm2tag[0] : (emtag ? emtag[0] : '')));
      var ss = KB.extractStyle(ses);
      var gs = KB.extractStyle(nc.substring(0, nc.indexOf('>')));
      var fill = cls.fill || ss.fill || gs.fill || '#F8F9FF';
      var stroke = cls.stroke || ss.stroke || gs.stroke || '#6A78F0';
      var swv = cls.strokeWidth || ss.strokeWidth || gs.strokeWidth || 2;
      var tc = cls.color || ss.color || gs.color || '#202124';
      var label = KB.extractLabel(nc);
      var labelGMatch = nc.match(/<g\s+class="label"[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/);
      var textYOffset = labelGMatch ? parseFloat(labelGMatch[2]) : 0;
      var foMatch2 = nc.match(/<foreignObject[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/);
      var foW = foMatch2 ? parseFloat(foMatch2[1]) : 200;
      var textHeight = foMatch2 ? parseFloat(foMatch2[2]) : 24;
      var wsMatch = nc.match(/white-space:\s*(\w+(?:-\w+)?)/);
      var whiteSpace = wsMatch ? wsMatch[1] : 'nowrap';
      var tm = nc.match(/class="node[^"]*\s(startEnd|standard|decision|warning)/);
      nodes.push({ id: m[1], type: tm ? tm[1] : 'standard', label: label, cx: parseFloat(m[2]), cy: parseFloat(m[3]), shape: shape, rx: rx, ry: ry, rw: rw, rh: rh, hw: hw, hh: hh, radius: radius, cCx: cCx, cCy: cCy, cR: cR, pp: pp, pathD: pathD, pathTransform: pathTransform, pathBBoxH: pathBBoxH, textYOffset: textYOffset, textHeight: textHeight, foW: foW, whiteSpace: whiteSpace, fill: fill, stroke: stroke, strokeWidth: swv, textColor: tc });
    }
    return nodes;
  }// --- Extract edges ---
  function extractEdges(svg) {
    var edges = [];
    var pr = /<path[^>]*data-id="([^"]*)"[^>]*data-points="([^"]*)"[^>]*>/g;
    var m;
    while ((m = pr.exec(svg)) !== null) {
      var pts = KB.decodePoints(m[2]);
      if (pts && pts.length >= 2) edges.push({ id: m[1], points: pts });
    }
    return edges;
  }

  // --- Extract edge labels ---
  function extractEdgeLabels(svg) {
    var labels = [];
    var lr = /<g\s+class="edgeLabel"\s+transform="translate\(([\d.\-]+),\s*([\d.\-]+)\)"[^>]*>([\s\S]*?)<\/g>/g;
    var m;
    while ((m = lr.exec(svg)) !== null) {
      var t = KB.extractLabel(m[3]);
      if (t) labels.push({ x: parseFloat(m[1]), y: parseFloat(m[2]), text: t });
    }
    return labels;
  }

  var nodes = extractNodes(svgText, classStyles);
  var edges = extractEdges(svgText);
  var edgeLabels = extractEdgeLabels(svgText);// --- Canvas setup ---
  var scale = 4;
  var padding = 40;
  var rc = KB.createRenderContext(createCanvas(1, 1), scale, padding, dims);
  var W = rc.W, H = rc.H;
  var canvas = createCanvas(W, H);
  var ctx = canvas.getContext('2d');
  var sx = rc.sx, sy = rc.sy, sw = rc.sw;

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // --- Draw edges ---
  var edgeColor = '#596275';
  var edgeWidth = 2.5 * scale;
  for (var ei = 0; ei < edges.length; ei++) {
    KB.drawArrowPath(ctx, sx, sy, scale, edges[ei].points, edgeColor, edgeWidth);
  }

  // --- Draw edge labels ---
  for (var eli = 0; eli < edgeLabels.length; eli++) {
    KB.drawEdgeLabel(ctx, sx, sy, sw, scale, edgeLabels[eli].text, edgeLabels[eli].x, edgeLabels[eli].y);
  }// --- Draw nodes ---
  var iconSize = 24;
  var nodeIdx = 0;

  for (var ni = 0; ni < nodes.length; ni++) {
    var node = nodes[ni];
    var sc = KB.getStateColor(node.label, node.type, nodeIdx++);
    var iconName = KB.findIconForLabel(node.label);
    var iconColor = sc.icon;
    var iconAccentColor = sc.accent;
    node.fill = sc.fill;
    node.stroke = sc.stroke;
    node.textColor = (node.type === 'startEnd') ? '#FFFFFF' : '#202124';

    // Override with style JSON if provided
    var ns = KB.getStyleForNode(node, styleMap, styleDefault);
    var isStyledNode = false;
    var isDarkStyled = false;
    if (ns) {
      isStyledNode = true;
      if (ns.color) {
        var cHex = ns.color.replace('#', '');
        var cr = parseInt(cHex.substr(0, 2), 16);
        var cg = parseInt(cHex.substr(2, 2), 16);
        var cb = parseInt(cHex.substr(4, 2), 16);
        var wantSolid = (ns.textColor === '#FFFFFF' || ns.textColor === '#ffffff');
        isDarkStyled = wantSolid;
        if (wantSolid) {
          node.fill = ns.color; node.stroke = ns.color; node.textColor = '#FFFFFF';
          node.type = 'startEnd'; iconColor = '#FFFFFF';
        } else {
          node.stroke = ns.color;
          node.fill = KB.tint(ns.color, 0.90);
          node.textColor = '#202124'; node.type = 'standard';
          iconColor = ns.color;
        }
      }
      if (ns.textColor) node.textColor = ns.textColor;
      if (ns.icon) iconName = ns.icon;
      if (ns.iconColor) iconColor = ns.iconColor;
      if (ns.accentColor) iconAccentColor = ns.accentColor;
    }

    // --- RECT shape ---
    if (node.shape === 'rect') {
      if (iconName) {
        ctx.font = (node.type === 'startEnd' ? '700' : '600') + ' ' + (15 * scale) + 'px Arial, sans-serif';
        var maxLineW = 0;
        var wrappedCheck = KB.wrapText(ctx, sw, scale, node.label, (node.foW || 200) - 4, 15 * scale, node.type === 'startEnd' ? '700' : '600');
        for (var wc = 0; wc < wrappedCheck.length; wc++) maxLineW = Math.max(maxLineW, ctx.measureText(wrappedCheck[wc]).width / scale);
        var neededW = 16 + iconSize + 10 + maxLineW + 20;
        if (node.rw < neededW) { var expand = neededW - node.rw; node.rw = neededW; node.rx -= expand / 2; }
      }
      var x = node.cx + node.rx, y = node.cy + node.ry, w = node.rw, h = node.rh;
      var r = 10;
      var sw2 = (node.strokeWidth || 2) * scale;
      var hasShadow = node.type === 'standard' || node.type === 'warning' || node.type === 'decision' || isStyledNode;
      KB.drawRoundedRect(ctx, sx, sy, sw, scale, sx(x), sy(y), sw(w), sw(h), r * scale, node.fill, node.stroke, sw2, hasShadow);

      // Gradient overlay for startEnd
      if (node.type === 'startEnd') {
        var grad = ctx.createLinearGradient(sx(x), sy(y), sx(x), sy(y + h));
        grad.addColorStop(0, 'rgba(255,255,255,0.15)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save(); ctx.beginPath();
        ctx.moveTo(sx(x)+r*scale, sy(y)); ctx.lineTo(sx(x+w)-r*scale, sy(y));
        ctx.quadraticCurveTo(sx(x+w), sy(y), sx(x+w), sy(y)+r*scale); ctx.lineTo(sx(x+w), sy(y+h)-r*scale);
        ctx.quadraticCurveTo(sx(x+w), sy(y+h), sx(x+w)-r*scale, sy(y+h)); ctx.lineTo(sx(x)+r*scale, sy(y+h));
        ctx.quadraticCurveTo(sx(x), sy(y+h), sx(x), sy(y+h)-r*scale); ctx.lineTo(sx(x), sy(y)+r*scale);
        ctx.quadraticCurveTo(sx(x), sy(y), sx(x)+r*scale, sy(y)); ctx.closePath();
        ctx.fillStyle = grad; ctx.fill(); ctx.restore();
      }
      // Gradient overlay for styled standard nodes
      if (isStyledNode && node.type !== 'startEnd') {
        var grad2 = ctx.createLinearGradient(sx(x), sy(y), sx(x), sy(y + h));
        grad2.addColorStop(0, 'rgba(255,255,255,0.35)'); grad2.addColorStop(0.5, 'rgba(255,255,255,0.08)'); grad2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save(); ctx.beginPath();
        ctx.moveTo(sx(x)+10*scale, sy(y)); ctx.lineTo(sx(x+w)-10*scale, sy(y));
        ctx.quadraticCurveTo(sx(x+w), sy(y), sx(x+w), sy(y)+10*scale); ctx.lineTo(sx(x+w), sy(y+h)-10*scale);
        ctx.quadraticCurveTo(sx(x+w), sy(y+h), sx(x+w)-10*scale, sy(y+h)); ctx.lineTo(sx(x)+10*scale, sy(y+h));
        ctx.quadraticCurveTo(sx(x), sy(y+h), sx(x), sy(y+h)-10*scale); ctx.lineTo(sx(x), sy(y)+10*scale);
        ctx.quadraticCurveTo(sx(x), sy(y), sx(x)+10*scale, sy(y)); ctx.closePath();
        ctx.fillStyle = grad2; ctx.fill(); ctx.restore();
      }// Icon + text layout for rect
      if (iconName) {
        var fw = node.type === 'startEnd' ? '700' : '600';
        var iconW = iconSize, padLeft = 16, gap = 10;
        var iconCx = x + padLeft + iconW / 2;
        var maxTextW = w - padLeft - iconW - gap - 12;
        var wrapped = KB.wrapText(ctx, sw, scale, node.label, maxTextW, 15 * scale, fw);
        var lineHeight = 15 * 1.15;
        var totalTextH = lineHeight * wrapped.length;
        KB.drawFeatherIcon(ctx, sx, sy, scale, FB, iconName, iconCx, node.cy, iconSize, iconColor, iconAccentColor);
        var textAreaStart = x + padLeft + iconW + gap;
        var textAreaW = w - padLeft - iconW - gap - 12;
        var textCx = textAreaStart + textAreaW / 2;
        var textStartY = node.cy - totalTextH / 2 + lineHeight / 2;
        for (var ri = 0; ri < wrapped.length; ri++) {
          KB.drawText(ctx, sx, sy, scale, wrapped[ri], textCx, textStartY + ri * lineHeight, node.textColor, 15 * scale, fw);
        }
      } else if (node.label) {
        var fw2 = node.type === 'startEnd' ? '700' : '600';
        if (node.whiteSpace === 'break-spaces' && node.foW) {
          var maxTextW2 = node.foW - 4;
          var wrapped2 = KB.wrapText(ctx, sw, scale, node.label, maxTextW2, 15 * scale, fw2);
          var lh2 = 15 * 1.15;
          var totalH2 = lh2 * wrapped2.length;
          var startY2 = node.cy - totalH2 / 2 + lh2 / 2;
          for (var ri2 = 0; ri2 < wrapped2.length; ri2++) {
            KB.drawText(ctx, sx, sy, scale, wrapped2[ri2], node.cx, startY2 + ri2 * lh2, node.textColor, 15 * scale, fw2);
          }
        } else {
          KB.drawTextFit(ctx, sx, sy, sw, scale, node.label, node.cx, node.cy, node.textColor, (w - 16), 15 * scale, fw2);
        }
      }
    }// --- DIAMOND shape ---
    else if (node.shape === 'diamond') {
      var dsw2 = (node.strokeWidth || 2) * scale;
      KB.drawDiamond(ctx, sx, sy, scale, node.cx, node.cy, node.hw, node.hh, node.fill, node.stroke, dsw2, true);
      // Inner highlight
      ctx.save(); ctx.beginPath();
      ctx.moveTo(sx(node.cx), sy(node.cy - node.hh * 0.85)); ctx.lineTo(sx(node.cx + node.hw * 0.85), sy(node.cy));
      ctx.lineTo(sx(node.cx), sy(node.cy + node.hh * 0.85)); ctx.lineTo(sx(node.cx - node.hw * 0.85), sy(node.cy));
      ctx.closePath(); ctx.strokeStyle = 'rgba(255,59,48,0.10)'; ctx.lineWidth = scale; ctx.stroke(); ctx.restore();

      var dMaxW = (node.foW || 200) - 4;
      var dWrapped = (node.whiteSpace === 'break-spaces') ? KB.wrapText(ctx, sw, scale, node.label, dMaxW, 15 * scale, '600') : node.label.split('\n');
      var dLineHeight = 15 * 1.15;
      var dTotalTextH = dLineHeight * dWrapped.length;
      if (iconName) {
        var dIconW = iconSize, dGap = 8;
        ctx.font = '600 ' + (15 * scale) + 'px Arial, sans-serif';
        var dMaxLineWidth = 0;
        for (var di = 0; di < dWrapped.length; di++) dMaxLineWidth = Math.max(dMaxLineWidth, ctx.measureText(dWrapped[di]).width / scale);
        var dNeededW = dIconW + dGap + dMaxLineWidth + 16;
        var dMinHW = dNeededW / 2 + 30;
        if (node.hw < dMinHW) node.hw = dMinHW;
        var dMinHH = (dNeededW / 2.5 + 22) + (dTotalTextH + iconSize + 8) / 2;
        if (node.hh < dMinHH) node.hh = dMinHH;
        KB.drawDiamond(ctx, sx, sy, scale, node.cx, node.cy, node.hw, node.hh, node.fill, node.stroke, dsw2, false);
        ctx.save(); ctx.beginPath();
        ctx.moveTo(sx(node.cx), sy(node.cy - node.hh * 0.85)); ctx.lineTo(sx(node.cx + node.hw * 0.85), sy(node.cy));
        ctx.lineTo(sx(node.cx), sy(node.cy + node.hh * 0.85)); ctx.lineTo(sx(node.cx - node.hw * 0.85), sy(node.cy));
        ctx.closePath(); ctx.strokeStyle = 'rgba(255,59,48,0.10)'; ctx.lineWidth = scale; ctx.stroke(); ctx.restore();
        var dTextStartY = node.cy - dTotalTextH / 2 + dLineHeight / 2 - iconSize / 2 - 2;
        for (var dti = 0; dti < dWrapped.length; dti++) {
          KB.drawText(ctx, sx, sy, scale, dWrapped[dti], node.cx, dTextStartY + dti * dLineHeight, node.textColor, 15 * scale, '600');
        }
        var diamondIconY = node.cy + dTotalTextH / 2 + iconSize / 2 + 2;
        KB.drawFeatherIcon(ctx, sx, sy, scale, FB, iconName, node.cx, diamondIconY, iconSize, iconColor, iconAccentColor);
      } else if (node.label) {
        var dStartY = node.cy - dTotalTextH / 2 + dLineHeight / 2;
        for (var dti2 = 0; dti2 < dWrapped.length; dti2++) {
          KB.drawText(ctx, sx, sy, scale, dWrapped[dti2], node.cx, dStartY + dti2 * dLineHeight, node.textColor, 15 * scale, '600');
        }
      }
    }// --- CIRCLE shape ---
    else if (node.shape === 'circle') {
      var csw2 = (node.strokeWidth || 2) * scale;
      KB.drawCircle(ctx, sx, sy, sw, scale, node.cx + node.cCx, node.cy + node.cCy, node.cR, node.fill, node.stroke, csw2, node.type !== 'startEnd');
      if (iconName) {
        var cfw = node.type === 'startEnd' ? '700' : '600';
        var ccx = node.cx + node.cCx, ccy = node.cy + node.cCy;
        ctx.font = cfw + ' ' + (13 * scale) + 'px Arial, sans-serif';
        var cTextW = ctx.measureText(node.label).width / scale;
        var cTotalW = iconSize + 6 + cTextW;
        if (node.cR < cTotalW / 2 + 26) {
          node.cR = cTotalW / 2 + 26;
          KB.drawCircle(ctx, sx, sy, sw, scale, ccx, ccy, node.cR, node.fill, node.stroke, csw2, false);
        }
        var cHalfTW = cTotalW / 2;
        KB.drawFeatherIcon(ctx, sx, sy, scale, FB, iconName, ccx - cHalfTW + iconSize/2, ccy, iconSize, iconColor, iconAccentColor);
        KB.drawText(ctx, sx, sy, scale, node.label, ccx - cHalfTW + iconSize + 6 + cTextW/2, ccy, node.textColor, 13 * scale, cfw);
      } else if (node.label) {
        KB.drawText(ctx, sx, sy, scale, node.label, node.cx+node.cCx, node.cy+node.cCy, node.textColor, 13*scale, node.type==='startEnd'?'700':'600');
      }
    }
// --- ELLIPSE ---
    else if (node.shape === 'ellipse') {
      var esw2 = (node.strokeWidth || 2) * scale;
      KB.drawEllipse(ctx, sx, sy, sw, scale, node.cx+node.cCx, node.cy+node.cCy, node.hw, node.hh, node.fill, node.stroke, esw2, true);
      if (iconName) {
        ctx.font = '600 ' + (14*scale) + 'px Arial, sans-serif';
        var eTW = ctx.measureText(node.label).width/scale;
        var eHW = (iconSize+6+eTW)/2;
        KB.drawFeatherIcon(ctx, sx, sy, scale, FB, iconName, node.cx+node.cCx-eHW+iconSize/2, node.cy+node.cCy, iconSize, iconColor, iconAccentColor);
        KB.drawText(ctx, sx, sy, scale, node.label, node.cx+node.cCx-eHW+iconSize+6+eTW/2, node.cy+node.cCy, node.textColor, 14*scale, '600');
      } else if (node.label) {
        KB.drawText(ctx, sx, sy, scale, node.label, node.cx+node.cCx, node.cy+node.cCy, node.textColor, 14*scale, '600');
      }
    }
    // --- POLYGON ---
    else if (node.shape === 'polygon') {
      var psw2 = (node.strokeWidth || 2) * scale;
      KB.drawPolygonPath(ctx, sx, sy, sw, scale, node.pp, node.cx, node.cy, node.fill, node.stroke, psw2, true);
      if (iconName) {
        ctx.font = '600 ' + (14*scale) + 'px Arial, sans-serif';
        var pTW = ctx.measureText(node.label).width/scale;
        var pHW = (iconSize+6+pTW)/2;
        KB.drawFeatherIcon(ctx, sx, sy, scale, FB, iconName, node.cx-pHW+iconSize/2, node.cy, iconSize, iconColor, iconAccentColor);
        KB.drawText(ctx, sx, sy, scale, node.label, node.cx-pHW+iconSize+6+pTW/2, node.cy, node.textColor, 14*scale, '600');
      } else if (node.label) {
        KB.drawText(ctx, sx, sy, scale, node.label, node.cx, node.cy, node.textColor, 14*scale, '600');
      }
    }
    // --- PATH ---
    else if (node.shape === 'path' && node.pathD) {
      var pasw2 = (node.strokeWidth || 2) * scale;
      if (iconName) {
        ctx.font = '600 ' + (14*scale) + 'px Arial, sans-serif';
        var paTW = ctx.measureText(node.label).width/scale;
        var paNeededW = iconSize + 6 + paTW + 32;
        var paPathH = node.pathBBoxH || 52;
        var paExpW = Math.max(paNeededW, paPathH * 1.8);
        KB.drawRoundedRect(ctx, sx, sy, sw, scale, sx(node.cx-paExpW/2), sy(node.cy-paPathH/2), sw(paExpW), sw(paPathH), paPathH/2*scale, node.fill, node.stroke, pasw2, true);
      } else {
        KB.drawSvgPath(ctx, sx, sy, sw, scale, node.pathD, node.pathTransform, node.cx, node.cy, node.fill, node.stroke, pasw2, true);
      }
      if (iconName) {
        ctx.font = '600 ' + (14*scale) + 'px Arial, sans-serif';
        var p2TW = ctx.measureText(node.label).width/scale;
        var p2HW = (iconSize+6+p2TW)/2;
        KB.drawFeatherIcon(ctx, sx, sy, scale, FB, iconName, node.cx-p2HW+iconSize/2, node.cy, iconSize, iconColor, iconAccentColor);
        KB.drawText(ctx, sx, sy, scale, node.label, node.cx-p2HW+iconSize+6+p2TW/2, node.cy, node.textColor, 14*scale, '600');
      } else if (node.label) {
        KB.drawText(ctx, sx, sy, scale, node.label, node.cx, node.cy, node.textColor, 14*scale, '600');
      }
    }
  }

  // --- OUTPUT ---
  return canvas.toBuffer('image/png');
}