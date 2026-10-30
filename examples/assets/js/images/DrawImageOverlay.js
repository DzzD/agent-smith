// ImageOverlay.js — Generic image overlay compositor
//
// Draws (composites) one image onto another at a specified position with optional sizing.
//
// API: async function main(files)
//   files[0] = background image (PNG/JPEG/WebP) — the canvas to draw onto
//   files[1] = overlay image (PNG/JPEG/WebP) — the image to draw on top
//   files[2] = options JSON (optional) — positioning and sizing parameters
//
// Options JSON format:
// {
//   "position": "top-left" | "top-right" | "bottom-left" | "bottom-right" |
//                "center" | "top-center" | "bottom-center" |
//                { "x": 100, "y": 50 },
//   "width": 200,          // optional: target width in px (maintains aspect ratio if height omitted)
//   "height": 150,         // optional: target height in px (maintains aspect ratio if width omitted)
//   "ratio": 0.15,         // optional: overlay width as fraction of background width (0-1)
//   "zoom": 1.5,           // optional: scale factor relative to overlay's natural size
//   "margin": 20,          // optional: margin in px from edges (for named positions)
//   "opacity": 1.0,        // optional: 0-1, default 1.0
//   "rotation": 0,         // optional: rotation in degrees, default 0
//   "align": "left" | "center" | "right",  // optional: horizontal alignment for y-based positions
//   "valign": "top" | "middle" | "bottom"  // optional: vertical alignment for x-based positions
// }
//
// Priority: width/height > ratio > zoom > natural size
// Output: PNG Buffer (preserves alpha for transparency-aware overlays)
// =============================================================

async function main(files) {
  const { createCanvas, loadImage } = require('canvas');

  // --- Load background ---
  if (!files[0]) throw new Error('No background image provided (files[0])');
  const bgImage = await loadImage(files[0].data);
  const bgW = bgImage.width;
  const bgH = bgImage.height;

  // --- Load overlay ---
  if (!files[1]) throw new Error('No overlay image provided (files[1])');
  const ovImage = await loadImage(files[1].data);
  const ovNatW = ovImage.width;
  const ovNatH = ovImage.height;

  // --- Parse options ---
  var opts = {};
  if (files[2]) {
    try {
      opts = JSON.parse(files[2].data.toString('utf8'));
    } catch (e) {
      // Ignore invalid JSON, use defaults
    }
  }

  var position = opts.position || 'bottom-right';
  var margin = opts.margin != null ? opts.margin : 20;
  var opacity = opts.opacity != null ? opts.opacity : 1.0;
  var rotation = opts.rotation || 0;

  // --- Compute overlay dimensions ---
  var ovW, ovH;
  var ovAspect = ovNatW / ovNatH;

  if (opts.width && opts.height) {
    // Both specified: use as-is (may stretch)
    ovW = opts.width;
    ovH = opts.height;
  } else if (opts.width) {
    // Width specified: maintain aspect ratio
    ovW = opts.width;
    ovH = Math.round(ovW / ovAspect);
  } else if (opts.height) {
    // Height specified: maintain aspect ratio
    ovH = opts.height;
    ovW = Math.round(ovH * ovAspect);
  } else if (opts.ratio != null) {
    // Ratio: overlay width as fraction of background width
    ovW = Math.round(bgW * opts.ratio);
    ovH = Math.round(ovW / ovAspect);
  } else if (opts.zoom != null) {
    // Zoom: scale relative to natural size
    ovW = Math.round(ovNatW * opts.zoom);
    ovH = Math.round(ovNatH * opts.zoom);
  } else {
    // Natural size
    ovW = ovNatW;
    ovH = ovNatH;
  }

  // Clamp to not exceed background
  if (ovW > bgW) { ovH = Math.round(ovH * (bgW / ovW)); ovW = bgW; }
  if (ovH > bgH) { ovW = Math.round(ovW * (bgH / ovH)); ovH = bgH; }

  // --- Compute position (x, y = top-left of overlay) ---
  var x, y;

  if (typeof position === 'object' && position !== null) {
    // Explicit { x, y }
    x = position.x != null ? position.x : 0;
    y = position.y != null ? position.y : 0;

    // Apply alignment offsets
    var align = opts.align || 'left';
    var valign = opts.valign || 'top';
    if (align === 'center') x -= ovW / 2;
    else if (align === 'right') x -= ovW;
    if (valign === 'middle') y -= ovH / 2;
    else if (valign === 'bottom') y -= ovH;
  } else {
    // Named positions
    switch (position) {
      case 'top-left':
        x = margin; y = margin; break;
      case 'top-right':
        x = bgW - ovW - margin; y = margin; break;
      case 'bottom-left':
        x = margin; y = bgH - ovH - margin; break;
      case 'bottom-right':
        x = bgW - ovW - margin; y = bgH - ovH - margin; break;
      case 'center':
        x = Math.round((bgW - ovW) / 2);
        y = Math.round((bgH - ovH) / 2); break;
      case 'top-center':
        x = Math.round((bgW - ovW) / 2); y = margin; break;
      case 'bottom-center':
        x = Math.round((bgW - ovW) / 2);
        y = bgH - ovH - margin; break;
      default:
        x = margin; y = margin;
    }
  }

  // --- Create canvas matching background ---
  const canvas = createCanvas(bgW, bgH);
  const ctx = canvas.getContext('2d');

  // Draw background
  ctx.drawImage(bgImage, 0, 0, bgW, bgH);

  // --- Draw overlay with opacity and rotation ---
  ctx.save();
  ctx.globalAlpha = opacity;

  if (rotation !== 0) {
    // Rotate around overlay center
    var cx = x + ovW / 2;
    var cy = y + ovH / 2;
    ctx.translate(cx, cy);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.translate(-cx, -cy);
  }

  ctx.drawImage(ovImage, x, y, ovW, ovH);
  ctx.restore();

  return canvas.toBuffer('image/png');
}