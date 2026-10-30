// =============================================================
// FeatherDrawIcon.js (feather-bicolor)
// v54 — 286 Feather icons with bicolor support, SVG parser, Canvas/PNG/SVG rendering
//
// A self-contained icon library that parses Feather-style SVG path data
// and renders icons onto a Node.js Canvas context or exports them as
// PNG buffers or SVG strings. Each icon supports two independent colors:
// a "main" color (primary strokes) and an "accent" color (secondary strokes).
//
// --- Usage ---
//   var FB = require("./feather-bicolor");
//
//   // Draw onto an existing canvas context
//   FB.draw(ctx, "activity", x, y, size, mainColor, accentColor)
//     - ctx:          Canvas 2D rendering context
//     - name:         icon name, e.g. "activity", "send", "alert-triangle"
//     - x, y:         top-left position in pixels
//     - size:         icon size in pixels (icon space is 24x24, scaled to fit)
//     - mainColor:    hex color for primary strokes (default: "#000000")
//     - accentColor:  hex color for secondary strokes (default: "#000000")
//
//   // Export as PNG Buffer
//   FB.toPNG("activity", size, mainColor, accentColor) -> Buffer
//     - size:           icon size in px (default: 48)
//     - mainColor:      optional
//     - accentColor:    optional
//
//   // Export as SVG string
//   FB.toSVG("activity", size, mainColor, accentColor) -> string
//     - size:           icon size in px (default: 24)
//
//   // List all available icon names
//   FB.names() -> string[]
//
//   // Check if an icon exists
//   FB.has("activity") -> boolean
//
//   // Get raw icon data
//   FB.get("activity") -> { main: "<svg...>", accent: "<svg...>" } | null
//
// --- Bicolor principle ---
// Each icon is split into "main" and "accent" SVG fragments:
//   - main:   primary outlines (e.g. envelope body)
//   - accent: secondary details (e.g. envelope flap, arrow tips)
// Both are rendered with stroke-only (fill="none"), stroke-width 2,
// round caps and joins, matching the Feather icon style.
//
// --- Common icon names (286 total) ---
//   activity, alert-circle, alert-octagon, alert-triangle, archive,
//   arrow-down, arrow-left, arrow-right, arrow-up, bell, bold, book,
//   bookmark, box, briefcase, calendar, camera, check, check-circle,
//   check-square, chevron-down, chevron-left, chevron-right, chevron-up,
//   clock, cloud, code, copy, credit-card, database, delete, download,
//   edit, envelope, eye, file, file-text, filter, folder, grid, help-circle,
//   home, image, inbox, info, layers, link, list, lock, mail, map-pin,
//   message, minus, monitor, more-horizontal, more-vertical, move, music,
//   package, paperclip, pause, pencil, phone, play, plus, power, printer,
//   refresh-cw, save, scissors, search, send, server, settings, share,
//   shield, shopping-cart, slash, slider, star, stop, tag, target,
//   thumbs-down, thumbs-up, trash, truck, tv, umbrella, user, users,
//   video, voicemail, volume, warning, wifi, x, x-circle, zap, ...
//
// --- Used by ---
//   KrokiStyledSvgRender.js  — loaded via eval as files[1] to render
//                              Feather icons inside flowchart/state nodes.
//
//   ImageOverlay.js          — can be used standalone to generate icon
//                              PNGs for compositing onto other images.
// =============================================================

var FeatherBicolor = (function() {
"use strict";

var ICONS = {
"activity":{main:"<polyline points=\"22 12 18 12 15 21 9 3 6 12 2 12\"></polyline>",accent:""},
"airplay":{main:"<path d=\"M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1\"></path>",accent:"<polygon points=\"12 15 17 21 7 21 12 15\"></polygon>"},
"alert-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"12\"></line><line x1=\"12\" y1=\"16\" x2=\"12.01\" y2=\"16\"></line>"},
"alert-octagon":{main:"<polygon points=\"7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2\"></polygon>",accent:"<line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"12\"></line><line x1=\"12\" y1=\"16\" x2=\"12.01\" y2=\"16\"></line>"},
"alert-triangle":{main:"<path d=\"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"></path>",accent:"<line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"></line><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"></line>"},
"align-center":{main:"<line x1=\"18\" y1=\"10\" x2=\"6\" y2=\"10\"></line><line x1=\"18\" y1=\"18\" x2=\"6\" y2=\"18\"></line>",accent:"<line x1=\"21\" y1=\"6\" x2=\"3\" y2=\"6\"></line><line x1=\"21\" y1=\"14\" x2=\"3\" y2=\"14\"></line>"},
"align-justify":{main:"<line x1=\"21\" y1=\"10\" x2=\"3\" y2=\"10\"></line><line x1=\"21\" y1=\"18\" x2=\"3\" y2=\"18\"></line>",accent:"<line x1=\"21\" y1=\"6\" x2=\"3\" y2=\"6\"></line><line x1=\"21\" y1=\"14\" x2=\"3\" y2=\"14\"></line>"},
"align-left":{main:"<line x1=\"17\" y1=\"10\" x2=\"3\" y2=\"10\"></line><line x1=\"17\" y1=\"18\" x2=\"3\" y2=\"18\"></line>",accent:"<line x1=\"21\" y1=\"6\" x2=\"3\" y2=\"6\"></line><line x1=\"21\" y1=\"14\" x2=\"3\" y2=\"14\"></line>"},
"align-right":{main:"<line x1=\"21\" y1=\"10\" x2=\"7\" y2=\"10\"></line>",accent:"<line x1=\"21\" y1=\"6\" x2=\"3\" y2=\"6\"></line><line x1=\"21\" y1=\"14\" x2=\"3\" y2=\"14\"></line><line x1=\"21\" y1=\"18\" x2=\"7\" y2=\"18\"></line>"},
"anchor":{main:"<circle cx=\"12\" cy=\"5\" r=\"3\"></circle><path d=\"M5 12H2a10 10 0 0 0 20 0h-3\"></path><line x1=\"12\" y1=\"22\" x2=\"12\" y2=\"8\"></line>",accent:""},
"aperture":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><line x1=\"9.69\" y1=\"8\" x2=\"21.17\" y2=\"8\"></line><line x1=\"7.38\" y1=\"12\" x2=\"13.12\" y2=\"2.06\"></line><line x1=\"9.69\" y1=\"16\" x2=\"3.95\" y2=\"6.06\"></line><line x1=\"14.31\" y1=\"16\" x2=\"2.83\" y2=\"16\"></line>",accent:"<line x1=\"14.31\" y1=\"8\" x2=\"20.05\" y2=\"17.94\"></line><line x1=\"16.62\" y1=\"12\" x2=\"10.88\" y2=\"21.94\"></line>"},
"archive":{main:"<polyline points=\"21 8 21 21 3 21 3 8\"></polyline><rect x=\"1\" y=\"3\" width=\"22\" height=\"5\"></rect>",accent:"<line x1=\"10\" y1=\"12\" x2=\"14\" y2=\"12\"></line>"},
"arrow-down":{main:"<line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"></line>",accent:"<polyline points=\"19 12 12 19 5 12\"></polyline>"},
"arrow-down-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<polyline points=\"8 12 12 16 16 12\"></polyline><line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"16\"></line>"},
"arrow-down-left":{main:"<line x1=\"17\" y1=\"7\" x2=\"7\" y2=\"17\"></line>",accent:"<polyline points=\"17 17 7 17 7 7\"></polyline>"},
"arrow-down-right":{main:"<line x1=\"7\" y1=\"7\" x2=\"17\" y2=\"17\"></line>",accent:"<polyline points=\"17 7 17 17 7 17\"></polyline>"},
"arrow-left":{main:"<line x1=\"19\" y1=\"12\" x2=\"5\" y2=\"12\"></line>",accent:"<polyline points=\"12 19 5 12 12 5\"></polyline>"},
"arrow-left-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<polyline points=\"12 8 8 12 12 16\"></polyline><line x1=\"16\" y1=\"12\" x2=\"8\" y2=\"12\"></line>"},
"arrow-right":{main:"<line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"></line>",accent:"<polyline points=\"12 5 19 12 12 19\"></polyline>"},
"arrow-right-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<polyline points=\"12 16 16 12 12 8\"></polyline><line x1=\"8\" y1=\"12\" x2=\"16\" y2=\"12\"></line>"},
"arrow-up":{main:"<line x1=\"12\" y1=\"19\" x2=\"12\" y2=\"5\"></line>",accent:"<polyline points=\"5 12 12 5 19 12\"></polyline>"},
"arrow-up-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<polyline points=\"16 12 12 8 8 12\"></polyline><line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"8\"></line>"},
"arrow-up-left":{main:"<line x1=\"17\" y1=\"17\" x2=\"7\" y2=\"7\"></line>",accent:"<polyline points=\"7 17 7 7 17 7\"></polyline>"},
"arrow-up-right":{main:"<line x1=\"7\" y1=\"17\" x2=\"17\" y2=\"7\"></line>",accent:"<polyline points=\"7 7 17 7 17 17\"></polyline>"},
"at-sign":{main:"<circle cx=\"12\" cy=\"12\" r=\"4\"></circle><path d=\"M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94\"></path>",accent:""},
"award":{main:"<circle cx=\"12\" cy=\"8\" r=\"7\"></circle>",accent:"<polyline points=\"8.21 13.89 7 23 12 20 17 23 15.79 13.88\"></polyline>"},
"bar-chart":{main:"<line x1=\"12\" y1=\"20\" x2=\"12\" y2=\"10\"></line>",accent:"<line x1=\"18\" y1=\"20\" x2=\"18\" y2=\"4\"></line><line x1=\"6\" y1=\"20\" x2=\"6\" y2=\"16\"></line>"},
"bar-chart-2":{main:"<line x1=\"18\" y1=\"20\" x2=\"18\" y2=\"10\"></line>",accent:"<line x1=\"12\" y1=\"20\" x2=\"12\" y2=\"4\"></line><line x1=\"6\" y1=\"20\" x2=\"6\" y2=\"14\"></line>"},
"battery":{main:"<rect x=\"1\" y=\"6\" width=\"18\" height=\"12\" rx=\"2\" ry=\"2\"></rect>",accent:"<line x1=\"23\" y1=\"13\" x2=\"23\" y2=\"11\"></line>"},
"battery-charging":{main:"<path d=\"M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19\"></path>",accent:"<line x1=\"23\" y1=\"13\" x2=\"23\" y2=\"11\"></line><polyline points=\"11 6 7 12 13 12 9 18\"></polyline>"},
"bell":{main:"<path d=\"M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9\"></path>",accent:"<path d=\"M13.73 21a2 2 0 0 1-3.46 0\"></path>"},
"bell-off":{main:"<path d=\"M13.73 21a2 2 0 0 1-3.46 0\"></path><path d=\"M18.63 13A17.89 17.89 0 0 1 18 8\"></path><path d=\"M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14\"></path><path d=\"M18 8a6 6 0 0 0-9.33-5\"></path>",accent:"<line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line>"},
"bluetooth":{main:"<polyline points=\"6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5\"></polyline>",accent:""},
"bold":{main:"<path d=\"M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z\"></path><path d=\"M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z\"></path>",accent:""},
"book":{main:"<path d=\"M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z\"></path>",accent:"<path d=\"M4 19.5A2.5 2.5 0 0 1 6.5 17H20\"></path>"},
"book-open":{main:"<path d=\"M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z\"></path><path d=\"M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z\"></path>",accent:""},
"bookmark":{main:"<path d=\"M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z\"></path>",accent:""},
"box":{main:"<path d=\"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z\"></path><polyline points=\"3.27 6.96 12 12.01 20.73 6.96\"></polyline><line x1=\"12\" y1=\"22.08\" x2=\"12\" y2=\"12\"></line>",accent:""},
"briefcase":{main:"<rect x=\"2\" y=\"7\" width=\"20\" height=\"14\" rx=\"2\" ry=\"2\"></rect>",accent:"<path d=\"M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\"></path>"},
"calendar":{main:"<rect x=\"3\" y=\"4\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>",accent:"<line x1=\"16\" y1=\"2\" x2=\"16\" y2=\"6\"></line><line x1=\"8\" y1=\"2\" x2=\"8\" y2=\"6\"></line><line x1=\"3\" y1=\"10\" x2=\"21\" y2=\"10\"></line>"},
"camera":{main:"<path d=\"M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z\"></path>",accent:"<circle cx=\"12\" cy=\"13\" r=\"4\"></circle>"},
"camera-off":{main:"<path d=\"M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56\"></path>",accent:"<line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line>"},
"cast":{main:"<path d=\"M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6\"></path>",accent:"<line x1=\"2\" y1=\"20\" x2=\"2.01\" y2=\"20\"></line>"},
"check":{main:"<polyline points=\"20 6 9 17 4 12\"></polyline>",accent:""},
"check-circle":{main:"<path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"></path>",accent:"<polyline points=\"22 4 12 14.01 9 11.01\"></polyline>"},
"check-square":{main:"<polyline points=\"9 11 12 14 22 4\"></polyline>",accent:"<path d=\"M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11\"></path>"},
"chevron-down":{main:"<polyline points=\"6 9 12 15 18 9\"></polyline>",accent:""},
"chevron-left":{main:"<polyline points=\"15 18 9 12 15 6\"></polyline>",accent:""},
"chevron-right":{main:"<polyline points=\"9 18 15 12 9 6\"></polyline>",accent:""},
"chevron-up":{main:"<polyline points=\"18 15 12 9 6 15\"></polyline>",accent:""},
"chevrons-down":{main:"<polyline points=\"7 13 12 18 17 13\"></polyline>",accent:"<polyline points=\"7 6 12 11 17 6\"></polyline>"},
"chevrons-left":{main:"<polyline points=\"11 17 6 12 11 7\"></polyline>",accent:"<polyline points=\"18 17 13 12 18 7\"></polyline>"},
"chevrons-right":{main:"<polyline points=\"13 17 18 12 13 7\"></polyline>",accent:"<polyline points=\"6 17 11 12 6 7\"></polyline>"},
"chevrons-up":{main:"<polyline points=\"17 11 12 6 7 11\"></polyline>",accent:"<polyline points=\"17 18 12 13 7 18\"></polyline>"},
"chrome":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<circle cx=\"12\" cy=\"12\" r=\"4\"></circle><line x1=\"21.17\" y1=\"8\" x2=\"12\" y2=\"8\"></line><line x1=\"3.95\" y1=\"6.06\" x2=\"8.54\" y2=\"14\"></line><line x1=\"10.88\" y1=\"21.94\" x2=\"15.46\" y2=\"14\"></line>"},
"circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:""},
"clipboard":{main:"<path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\"></path>",accent:"<rect x=\"8\" y=\"2\" width=\"8\" height=\"4\" rx=\"1\" ry=\"1\"></rect>"},
"clock":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<polyline points=\"12 6 12 12 16 14\"></polyline>"},
"cloud":{main:"<path d=\"M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z\"></path>",accent:""},
"cloud-drizzle":{main:"<path d=\"M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25\"></path>",accent:"<line x1=\"8\" y1=\"19\" x2=\"8\" y2=\"21\"></line><line x1=\"8\" y1=\"13\" x2=\"8\" y2=\"15\"></line><line x1=\"16\" y1=\"19\" x2=\"16\" y2=\"21\"></line><line x1=\"16\" y1=\"13\" x2=\"16\" y2=\"15\"></line><line x1=\"12\" y1=\"21\" x2=\"12\" y2=\"23\"></line><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"17\"></line>"},
"cloud-lightning":{main:"<path d=\"M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9\"></path>",accent:"<polyline points=\"13 11 9 17 15 17 11 23\"></polyline>"},
"cloud-off":{main:"<path d=\"M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3\"></path>",accent:"<line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line>"},
"cloud-rain":{main:"<path d=\"M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25\"></path>",accent:"<line x1=\"16\" y1=\"13\" x2=\"16\" y2=\"21\"></line><line x1=\"8\" y1=\"13\" x2=\"8\" y2=\"21\"></line><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"23\"></line>"},
"cloud-snow":{main:"<path d=\"M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25\"></path>",accent:"<line x1=\"8\" y1=\"16\" x2=\"8.01\" y2=\"16\"></line><line x1=\"8\" y1=\"20\" x2=\"8.01\" y2=\"20\"></line><line x1=\"12\" y1=\"18\" x2=\"12.01\" y2=\"18\"></line><line x1=\"12\" y1=\"22\" x2=\"12.01\" y2=\"22\"></line><line x1=\"16\" y1=\"16\" x2=\"16.01\" y2=\"16\"></line><line x1=\"16\" y1=\"20\" x2=\"16.01\" y2=\"20\"></line>"},
"code":{main:"<polyline points=\"16 18 22 12 16 6\"></polyline>",accent:"<polyline points=\"8 6 2 12 8 18\"></polyline>"},
"codepen":{main:"<polygon points=\"12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2\"></polygon>",accent:"<line x1=\"12\" y1=\"22\" x2=\"12\" y2=\"15.5\"></line><polyline points=\"22 8.5 12 15.5 2 8.5\"></polyline><polyline points=\"2 15.5 12 8.5 22 15.5\"></polyline><line x1=\"12\" y1=\"2\" x2=\"12\" y2=\"8.5\"></line>"},
"codesandbox":{main:"<path d=\"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z\"></path>",accent:"<polyline points=\"7.5 4.21 12 6.81 16.5 4.21\"></polyline><polyline points=\"7.5 19.79 7.5 14.6 3 12\"></polyline><polyline points=\"21 12 16.5 14.6 16.5 19.79\"></polyline><polyline points=\"3.27 6.96 12 12.01 20.73 6.96\"></polyline><line x1=\"12\" y1=\"22.08\" x2=\"12\" y2=\"12\"></line>"},
"coffee":{main:"<path d=\"M18 8h1a4 4 0 0 1 0 8h-1\"></path><path d=\"M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z\"></path>",accent:"<line x1=\"6\" y1=\"1\" x2=\"6\" y2=\"4\"></line><line x1=\"10\" y1=\"1\" x2=\"10\" y2=\"4\"></line><line x1=\"14\" y1=\"1\" x2=\"14\" y2=\"4\"></line>"},
"columns":{main:"<path d=\"M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18\"></path>",accent:""},
"command":{main:"<path d=\"M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z\"></path>",accent:""},
"cpu":{main:"<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\" ry=\"2\"></rect><rect x=\"9\" y=\"9\" width=\"6\" height=\"6\"></rect>",accent:"<line x1=\"9\" y1=\"1\" x2=\"9\" y2=\"4\"></line><line x1=\"15\" y1=\"1\" x2=\"15\" y2=\"4\"></line><line x1=\"9\" y1=\"20\" x2=\"9\" y2=\"23\"></line><line x1=\"15\" y1=\"20\" x2=\"15\" y2=\"23\"></line><line x1=\"20\" y1=\"9\" x2=\"23\" y2=\"9\"></line><line x1=\"20\" y1=\"14\" x2=\"23\" y2=\"14\"></line><line x1=\"1\" y1=\"9\" x2=\"4\" y2=\"9\"></line><line x1=\"1\" y1=\"14\" x2=\"4\" y2=\"14\"></line>"},
"compass":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<polygon points=\"16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76\"></polygon>"},
"copy":{main:"<rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\" ry=\"2\"></rect>",accent:"<path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"></path>"},
"corner-down-left":{main:"<polyline points=\"9 10 4 15 9 20\"></polyline><path d=\"M20 4v7a4 4 0 0 1-4 4H4\"></path>",accent:""},
"corner-down-right":{main:"<polyline points=\"15 10 20 15 15 20\"></polyline><path d=\"M4 4v7a4 4 0 0 0 4 4h12\"></path>",accent:""},
"corner-left-down":{main:"<polyline points=\"14 15 9 20 4 15\"></polyline><path d=\"M20 4h-7a4 4 0 0 0-4 4v12\"></path>",accent:""},
"corner-left-up":{main:"<polyline points=\"14 9 9 4 4 9\"></polyline><path d=\"M20 20h-7a4 4 0 0 1-4-4V4\"></path>",accent:""},
"corner-right-down":{main:"<polyline points=\"10 15 15 20 20 15\"></polyline><path d=\"M4 4h7a4 4 0 0 1 4 4v12\"></path>",accent:""},
"corner-right-up":{main:"<polyline points=\"10 9 15 4 20 9\"></polyline><path d=\"M4 20h7a4 4 0 0 0 4-4V4\"></path>",accent:""},
"corner-up-left":{main:"<polyline points=\"9 14 4 9 9 4\"></polyline><path d=\"M20 20v-7a4 4 0 0 0-4-4H4\"></path>",accent:""},
"corner-up-right":{main:"<polyline points=\"15 14 20 9 15 4\"></polyline><path d=\"M4 20v-7a4 4 0 0 1 4-4h12\"></path>",accent:""},
"credit-card":{main:"<rect x=\"1\" y=\"4\" width=\"22\" height=\"16\" rx=\"2\" ry=\"2\"></rect>",accent:"<line x1=\"1\" y1=\"10\" x2=\"23\" y2=\"10\"></line>"},
"crop":{main:"<path d=\"M6.13 1L6 16a2 2 0 0 0 2 2h15\"></path>",accent:"<path d=\"M1 6.13L16 6a2 2 0 0 1 2 2v15\"></path>"},
"crosshair":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<line x1=\"22\" y1=\"12\" x2=\"18\" y2=\"12\"></line><line x1=\"6\" y1=\"12\" x2=\"2\" y2=\"12\"></line><line x1=\"12\" y1=\"6\" x2=\"12\" y2=\"2\"></line><line x1=\"12\" y1=\"22\" x2=\"12\" y2=\"18\"></line>"},
"database":{main:"<path d=\"M21 12c0 1.66-4 3-9 3s-9-1.34-9-3\"></path><path d=\"M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5\"></path><ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"></ellipse>",accent:""},
"delete":{main:"<path d=\"M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z\"></path>",accent:"<line x1=\"18\" y1=\"9\" x2=\"12\" y2=\"15\"></line><line x1=\"12\" y1=\"9\" x2=\"18\" y2=\"15\"></line>"},
"disc":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<circle cx=\"12\" cy=\"12\" r=\"3\"></circle>"},
"divide":{main:"<circle cx=\"12\" cy=\"6\" r=\"2\"></circle><circle cx=\"12\" cy=\"18\" r=\"2\"></circle>",accent:"<line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"></line>"},
"divide-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<line x1=\"8\" y1=\"12\" x2=\"16\" y2=\"12\"></line><line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"16\"></line><line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"8\"></line>"},
"divide-square":{main:"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>",accent:"<line x1=\"8\" y1=\"12\" x2=\"16\" y2=\"12\"></line><line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"16\"></line><line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"8\"></line>"},
"dollar-sign":{main:"<path d=\"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6\"></path>",accent:"<line x1=\"12\" y1=\"1\" x2=\"12\" y2=\"23\"></line>"},
"download":{main:"<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path>",accent:"<polyline points=\"7 10 12 15 17 10\"></polyline><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"></line>"},
"download-cloud":{main:"<polyline points=\"8 17 12 21 16 17\"></polyline>",accent:"<path d=\"M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29\"></path><line x1=\"12\" y1=\"12\" x2=\"12\" y2=\"21\"></line>"},
"dribbble":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32\"></path>",accent:""},
"droplet":{main:"<path d=\"M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z\"></path>",accent:""},
"edit":{main:"<path d=\"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"></path>",accent:"<path d=\"M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z\"></path>"},
"edit-2":{main:"<path d=\"M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z\"></path>",accent:""},
"edit-3":{main:"<path d=\"M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z\"></path>",accent:"<path d=\"M12 20h9\"></path>"},
"external-link":{main:"<path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"></path>",accent:"<polyline points=\"15 3 21 3 21 9\"></polyline><line x1=\"10\" y1=\"14\" x2=\"21\" y2=\"3\"></line>"},
"eye":{main:"<path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"></path>",accent:"<circle cx=\"12\" cy=\"12\" r=\"3\"></circle>"},
"eye-off":{main:"<path d=\"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24\"></path>",accent:"<line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line>"},
"facebook":{main:"<path d=\"M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z\"></path>",accent:""},
"fast-forward":{main:"<polygon points=\"13 19 22 12 13 5 13 19\"></polygon>",accent:"<polygon points=\"2 19 11 12 2 5 2 19\"></polygon>"},
"feather":{main:"<path d=\"M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z\"></path><line x1=\"16\" y1=\"8\" x2=\"2\" y2=\"22\"></line><line x1=\"17.5\" y1=\"15\" x2=\"9\" y2=\"15\"></line>",accent:""},
"figma":{main:"<path d=\"M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z\"></path>",accent:"<path d=\"M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z\"></path><path d=\"M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z\"></path><path d=\"M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z\"></path><path d=\"M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z\"></path>"},
"file":{main:"<path d=\"M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z\"></path>",accent:"<polyline points=\"13 2 13 9 20 9\"></polyline>"},
"file-minus":{main:"<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"></path>",accent:"<polyline points=\"14 2 14 8 20 8\"></polyline><line x1=\"9\" y1=\"15\" x2=\"15\" y2=\"15\"></line>"},
"file-plus":{main:"<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"></path><polyline points=\"14 2 14 8 20 8\"></polyline>",accent:"<line x1=\"12\" y1=\"18\" x2=\"12\" y2=\"12\"></line><line x1=\"9\" y1=\"15\" x2=\"15\" y2=\"15\"></line>"},
"file-text":{main:"<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"></path><polyline points=\"14 2 14 8 20 8\"></polyline>",accent:"<line x1=\"16\" y1=\"13\" x2=\"8\" y2=\"13\"></line><line x1=\"16\" y1=\"17\" x2=\"8\" y2=\"17\"></line><polyline points=\"10 9 9 9 8 9\"></polyline>"},
"film":{main:"<rect x=\"2\" y=\"2\" width=\"20\" height=\"20\" rx=\"2.18\" ry=\"2.18\"></rect><line x1=\"7\" y1=\"2\" x2=\"7\" y2=\"22\"></line><line x1=\"17\" y1=\"2\" x2=\"17\" y2=\"22\"></line><line x1=\"2\" y1=\"12\" x2=\"22\" y2=\"12\"></line><line x1=\"2\" y1=\"7\" x2=\"7\" y2=\"7\"></line><line x1=\"2\" y1=\"17\" x2=\"7\" y2=\"17\"></line><line x1=\"17\" y1=\"17\" x2=\"22\" y2=\"17\"></line><line x1=\"17\" y1=\"7\" x2=\"22\" y2=\"7\"></line>",accent:""},
"filter":{main:"<polygon points=\"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3\"></polygon>",accent:""},
"flag":{main:"<path d=\"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z\"></path><line x1=\"4\" y1=\"22\" x2=\"4\" y2=\"15\"></line>",accent:""},
"folder":{main:"<path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"></path>",accent:""},
"folder-minus":{main:"<path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"></path>",accent:"<line x1=\"9\" y1=\"14\" x2=\"15\" y2=\"14\"></line>"},
"folder-plus":{main:"<path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"></path>",accent:"<line x1=\"12\" y1=\"11\" x2=\"12\" y2=\"17\"></line><line x1=\"9\" y1=\"14\" x2=\"15\" y2=\"14\"></line>"},
"framer":{main:"<path d=\"M5 16V9h14V2H5l14 14h-7m-7 0l7 7v-7m-7 0h7\"></path>",accent:""},
"frown":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"M16 16s-1.5-2-4-2-4 2-4 2\"></path>",accent:"<line x1=\"9\" y1=\"9\" x2=\"9.01\" y2=\"9\"></line><line x1=\"15\" y1=\"9\" x2=\"15.01\" y2=\"9\"></line>"},
"gift":{main:"<polyline points=\"20 12 20 22 4 22 4 12\"></polyline><rect x=\"2\" y=\"7\" width=\"20\" height=\"5\"></rect><path d=\"M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z\"></path><path d=\"M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z\"></path><line x1=\"12\" y1=\"22\" x2=\"12\" y2=\"7\"></line>",accent:""},
"git-branch":{main:"<path d=\"M18 9a9 9 0 0 1-9 9\"></path><line x1=\"6\" y1=\"3\" x2=\"6\" y2=\"15\"></line><circle cx=\"18\" cy=\"6\" r=\"3\"></circle><circle cx=\"6\" cy=\"18\" r=\"3\"></circle>",accent:""},
"git-commit":{main:"<circle cx=\"12\" cy=\"12\" r=\"4\"></circle><line x1=\"17.01\" y1=\"12\" x2=\"22.96\" y2=\"12\"></line>",accent:"<line x1=\"1.05\" y1=\"12\" x2=\"7\" y2=\"12\"></line>"},
"git-merge":{main:"<circle cx=\"18\" cy=\"18\" r=\"3\"></circle><path d=\"M6 21V9a9 9 0 0 0 9 9\"></path><circle cx=\"6\" cy=\"6\" r=\"3\"></circle>",accent:""},
"git-pull-request":{main:"<circle cx=\"18\" cy=\"18\" r=\"3\"></circle><path d=\"M13 6h3a2 2 0 0 1 2 2v7\"></path><circle cx=\"6\" cy=\"6\" r=\"3\"></circle><line x1=\"6\" y1=\"9\" x2=\"6\" y2=\"21\"></line>",accent:""},
"github":{main:"<path d=\"M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22\"></path>",accent:""},
"gitlab":{main:"<path d=\"M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z\"></path>",accent:""},
"globe":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z\"></path><line x1=\"2\" y1=\"12\" x2=\"22\" y2=\"12\"></line>",accent:""},
"grid":{main:"<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\"></rect><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\"></rect><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\"></rect>",accent:"<rect x=\"3\" y=\"14\" width=\"7\" height=\"7\"></rect>"},
"hard-drive":{main:"<path d=\"M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\"></path><line x1=\"22\" y1=\"12\" x2=\"2\" y2=\"12\"></line>",accent:"<line x1=\"6\" y1=\"16\" x2=\"6.01\" y2=\"16\"></line><line x1=\"10\" y1=\"16\" x2=\"10.01\" y2=\"16\"></line>"},
"hash":{main:"<line x1=\"4\" y1=\"9\" x2=\"20\" y2=\"9\"></line><line x1=\"4\" y1=\"15\" x2=\"20\" y2=\"15\"></line><line x1=\"10\" y1=\"3\" x2=\"8\" y2=\"21\"></line><line x1=\"16\" y1=\"3\" x2=\"14\" y2=\"21\"></line>",accent:""},
"headphones":{main:"<path d=\"M3 18v-6a9 9 0 0 1 18 0v6\"></path><path d=\"M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z\"></path>",accent:""},
"heart":{main:"<path d=\"M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z\"></path>",accent:""},
"help-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\"></path><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"></line>"},
"hexagon":{main:"<path d=\"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z\"></path>",accent:""},
"home":{main:"<path d=\"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"></path>",accent:"<polyline points=\"9 22 9 12 15 12 15 22\"></polyline>"},
"image":{main:"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>",accent:"<circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"></circle><polyline points=\"21 15 16 10 5 21\"></polyline>"},
"inbox":{main:"<path d=\"M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\"></path>",accent:"<polyline points=\"22 12 16 12 14 15 10 15 8 12 2 12\"></polyline>"},
"info":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"12\"></line><line x1=\"12\" y1=\"8\" x2=\"12.01\" y2=\"8\"></line>"},
"instagram":{main:"<rect x=\"2\" y=\"2\" width=\"20\" height=\"20\" rx=\"5\" ry=\"5\"></rect>",accent:"<path d=\"M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z\"></path><line x1=\"17.5\" y1=\"6.5\" x2=\"17.51\" y2=\"6.5\"></line>"},
"italic":{main:"<line x1=\"19\" y1=\"4\" x2=\"10\" y2=\"4\"></line>",accent:"<line x1=\"14\" y1=\"20\" x2=\"5\" y2=\"20\"></line><line x1=\"15\" y1=\"4\" x2=\"9\" y2=\"20\"></line>"},
"key":{main:"<path d=\"M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4\"></path>",accent:""},
"layers":{main:"<polygon points=\"12 2 2 7 12 12 22 7 12 2\"></polygon><polyline points=\"2 17 12 22 22 17\"></polyline>",accent:"<polyline points=\"2 12 12 17 22 12\"></polyline>"},
"layout":{main:"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>",accent:"<line x1=\"3\" y1=\"9\" x2=\"21\" y2=\"9\"></line><line x1=\"9\" y1=\"21\" x2=\"9\" y2=\"9\"></line>"},
"life-buoy":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<circle cx=\"12\" cy=\"12\" r=\"4\"></circle><line x1=\"4.93\" y1=\"4.93\" x2=\"9.17\" y2=\"9.17\"></line><line x1=\"14.83\" y1=\"14.83\" x2=\"19.07\" y2=\"19.07\"></line><line x1=\"14.83\" y1=\"9.17\" x2=\"19.07\" y2=\"4.93\"></line><line x1=\"14.83\" y1=\"9.17\" x2=\"18.36\" y2=\"5.64\"></line><line x1=\"4.93\" y1=\"19.07\" x2=\"9.17\" y2=\"14.83\"></line>"},
"link":{main:"<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"></path>",accent:"<path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"></path>"},
"link-2":{main:"<path d=\"M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3\"></path>",accent:"<line x1=\"8\" y1=\"12\" x2=\"16\" y2=\"12\"></line>"},
"linkedin":{main:"<path d=\"M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z\"></path><rect x=\"2\" y=\"9\" width=\"4\" height=\"12\"></rect>",accent:"<circle cx=\"4\" cy=\"4\" r=\"2\"></circle>"},
"list":{main:"<line x1=\"8\" y1=\"6\" x2=\"21\" y2=\"6\"></line><line x1=\"8\" y1=\"18\" x2=\"21\" y2=\"18\"></line><line x1=\"3\" y1=\"6\" x2=\"3.01\" y2=\"6\"></line><line x1=\"3\" y1=\"18\" x2=\"3.01\" y2=\"18\"></line>",accent:"<line x1=\"8\" y1=\"12\" x2=\"21\" y2=\"12\"></line><line x1=\"3\" y1=\"12\" x2=\"3.01\" y2=\"12\"></line>"},
"loader":{main:"<line x1=\"12\" y1=\"2\" x2=\"12\" y2=\"6\"></line><line x1=\"12\" y1=\"18\" x2=\"12\" y2=\"22\"></line><line x1=\"4.93\" y1=\"4.93\" x2=\"7.76\" y2=\"7.76\"></line><line x1=\"16.24\" y1=\"16.24\" x2=\"19.07\" y2=\"19.07\"></line><line x1=\"2\" y1=\"12\" x2=\"6\" y2=\"12\"></line><line x1=\"18\" y1=\"12\" x2=\"22\" y2=\"12\"></line><line x1=\"4.93\" y1=\"19.07\" x2=\"7.76\" y2=\"16.24\"></line>",accent:"<line x1=\"16.24\" y1=\"7.76\" x2=\"19.07\" y2=\"4.93\"></line>"},
"lock":{main:"<rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\" ry=\"2\"></rect>",accent:"<path d=\"M7 11V7a5 5 0 0 1 10 0v4\"></path>"},
"log-in":{main:"<path d=\"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4\"></path>",accent:"<polyline points=\"10 17 15 12 10 7\"></polyline><line x1=\"15\" y1=\"12\" x2=\"3\" y2=\"12\"></line>"},
"log-out":{main:"<path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"></path>",accent:"<polyline points=\"16 17 21 12 16 7\"></polyline><line x1=\"21\" y1=\"12\" x2=\"9\" y2=\"12\"></line>"},
"mail":{main:"<path d=\"M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z\"></path>",accent:"<polyline points=\"22,6 12,13 2,6\"></polyline>"},
"map":{main:"<polygon points=\"1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6\"></polygon>",accent:"<line x1=\"8\" y1=\"2\" x2=\"8\" y2=\"18\"></line><line x1=\"16\" y1=\"6\" x2=\"16\" y2=\"22\"></line>"},
"map-pin":{main:"<path d=\"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z\"></path>",accent:"<circle cx=\"12\" cy=\"10\" r=\"3\"></circle>"},
"maximize":{main:"<path d=\"M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3\"></path>",accent:""},
"maximize-2":{main:"<polyline points=\"9 21 3 21 3 15\"></polyline><line x1=\"3\" y1=\"21\" x2=\"10\" y2=\"14\"></line>",accent:"<polyline points=\"15 3 21 3 21 9\"></polyline><line x1=\"21\" y1=\"3\" x2=\"14\" y2=\"10\"></line>"},
"meh":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<line x1=\"8\" y1=\"15\" x2=\"16\" y2=\"15\"></line><line x1=\"9\" y1=\"9\" x2=\"9.01\" y2=\"9\"></line><line x1=\"15\" y1=\"9\" x2=\"15.01\" y2=\"9\"></line>"},
"menu":{main:"<line x1=\"3\" y1=\"12\" x2=\"21\" y2=\"12\"></line>",accent:"<line x1=\"3\" y1=\"6\" x2=\"21\" y2=\"6\"></line><line x1=\"3\" y1=\"18\" x2=\"21\" y2=\"18\"></line>"},
"message-circle":{main:"<path d=\"M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z\"></path>",accent:""},
"message-square":{main:"<path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"></path>",accent:""},
"mic":{main:"<path d=\"M19 10v2a7 7 0 0 1-14 0v-2\"></path><line x1=\"12\" y1=\"19\" x2=\"12\" y2=\"23\"></line>",accent:"<path d=\"M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z\"></path>"},
"mic-off":{main:"<path d=\"M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23\"></path><line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line><line x1=\"12\" y1=\"19\" x2=\"12\" y2=\"23\"></line>",accent:"<path d=\"M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6\"></path>"},
"minimize":{main:"<path d=\"M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3\"></path>",accent:""},
"minimize-2":{main:"<polyline points=\"4 14 10 14 10 20\"></polyline><line x1=\"3\" y1=\"21\" x2=\"10\" y2=\"14\"></line>",accent:"<polyline points=\"20 10 14 10 14 4\"></polyline><line x1=\"14\" y1=\"10\" x2=\"21\" y2=\"3\"></line>"},
"minus":{main:"<line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"></line>",accent:""},
"minus-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<line x1=\"8\" y1=\"12\" x2=\"16\" y2=\"12\"></line>"},
"minus-square":{main:"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>",accent:"<line x1=\"8\" y1=\"12\" x2=\"16\" y2=\"12\"></line>"},
"monitor":{main:"<rect x=\"2\" y=\"3\" width=\"20\" height=\"14\" rx=\"2\" ry=\"2\"></rect><line x1=\"8\" y1=\"21\" x2=\"16\" y2=\"21\"></line><line x1=\"12\" y1=\"17\" x2=\"12\" y2=\"21\"></line>",accent:""},
"moon":{main:"<path d=\"M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z\"></path>",accent:""},
"more-horizontal":{main:"<circle cx=\"12\" cy=\"12\" r=\"1\"></circle>",accent:"<circle cx=\"19\" cy=\"12\" r=\"1\"></circle><circle cx=\"5\" cy=\"12\" r=\"1\"></circle>"},
"more-vertical":{main:"<circle cx=\"12\" cy=\"12\" r=\"1\"></circle>",accent:"<circle cx=\"12\" cy=\"5\" r=\"1\"></circle><circle cx=\"12\" cy=\"19\" r=\"1\"></circle>"},
"mouse-pointer":{main:"<path d=\"M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z\"></path><path d=\"M13 13l6 6\"></path>",accent:""},
"move":{main:"<polyline points=\"5 9 2 12 5 15\"></polyline><polyline points=\"9 5 12 2 15 5\"></polyline><polyline points=\"15 19 12 22 9 19\"></polyline><polyline points=\"19 9 22 12 19 15\"></polyline><line x1=\"2\" y1=\"12\" x2=\"22\" y2=\"12\"></line><line x1=\"12\" y1=\"2\" x2=\"12\" y2=\"22\"></line>",accent:""},
"music":{main:"<path d=\"M9 18V5l12-2v13\"></path>",accent:"<circle cx=\"6\" cy=\"18\" r=\"3\"></circle><circle cx=\"18\" cy=\"16\" r=\"3\"></circle>"},
"navigation":{main:"<polygon points=\"3 11 22 2 13 21 11 13 3 11\"></polygon>",accent:""},
"navigation-2":{main:"<polygon points=\"12 2 19 21 12 17 5 21 12 2\"></polygon>",accent:""},
"octagon":{main:"<polygon points=\"7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2\"></polygon>",accent:""},
"package":{main:"<path d=\"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z\"></path><line x1=\"16.5\" y1=\"9.4\" x2=\"7.5\" y2=\"4.21\"></line><polyline points=\"3.27 6.96 12 12.01 20.73 6.96\"></polyline><line x1=\"12\" y1=\"22.08\" x2=\"12\" y2=\"12\"></line>",accent:""},
"paperclip":{main:"<path d=\"M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48\"></path>",accent:""},
"pause":{main:"<rect x=\"6\" y=\"4\" width=\"4\" height=\"16\"></rect>",accent:"<rect x=\"14\" y=\"4\" width=\"4\" height=\"16\"></rect>"},
"pause-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<line x1=\"10\" y1=\"15\" x2=\"10\" y2=\"9\"></line><line x1=\"14\" y1=\"15\" x2=\"14\" y2=\"9\"></line>"},
"pen-tool":{main:"<path d=\"M12 19l7-7 3 3-7 7-3-3z\"></path><path d=\"M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z\"></path><path d=\"M2 2l7.586 7.586\"></path>",accent:"<circle cx=\"11\" cy=\"11\" r=\"2\"></circle>"},
"percent":{main:"<line x1=\"19\" y1=\"5\" x2=\"5\" y2=\"19\"></line>",accent:"<circle cx=\"6.5\" cy=\"6.5\" r=\"2.5\"></circle><circle cx=\"17.5\" cy=\"17.5\" r=\"2.5\"></circle>"},
"phone":{main:"<path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z\"></path>",accent:""},
"phone-call":{main:"<path d=\"M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z\"></path>",accent:""},
"phone-forwarded":{main:"<polyline points=\"19 1 23 5 19 9\"></polyline>",accent:"<path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z\"></path><line x1=\"15\" y1=\"5\" x2=\"23\" y2=\"5\"></line>"},
"phone-incoming":{main:"<polyline points=\"16 2 16 8 22 8\"></polyline>",accent:"<path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z\"></path>"},
"phone-missed":{main:"<path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z\"></path>",accent:"<line x1=\"23\" y1=\"1\" x2=\"17\" y2=\"7\"></line><line x1=\"17\" y1=\"1\" x2=\"23\" y2=\"7\"></line>"},
"phone-off":{main:"<path d=\"M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91\"></path>",accent:"<line x1=\"23\" y1=\"1\" x2=\"1\" y2=\"23\"></line>"},
"phone-outgoing":{main:"<polyline points=\"23 7 23 1 17 1\"></polyline>",accent:"<path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z\"></path>"},
"pie-chart":{main:"<path d=\"M21.21 15.89A10 10 0 1 1 8 2.83\"></path>",accent:"<path d=\"M22 12A10 10 0 0 0 12 2v10z\"></path>"},
"play":{main:"<polygon points=\"5 3 19 12 5 21 5 3\"></polygon>",accent:""},
"play-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<polygon points=\"10 8 16 12 10 16 10 8\"></polygon>"},
"plus":{main:"<line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"></line><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"></line>",accent:""},
"plus-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"16\"></line><line x1=\"8\" y1=\"12\" x2=\"16\" y2=\"12\"></line>"},
"plus-square":{main:"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>",accent:"<line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"16\"></line><line x1=\"8\" y1=\"12\" x2=\"16\" y2=\"12\"></line>"},
"pocket":{main:"<path d=\"M4 3h16a2 2 0 0 1 2 2v6a10 10 0 0 1-10 10A10 10 0 0 1 2 11V5a2 2 0 0 1 2-2z\"></path>",accent:"<polyline points=\"8 10 12 14 16 10\"></polyline>"},
"power":{main:"<path d=\"M18.36 6.64a9 9 0 1 1-12.73 0\"></path>",accent:"<line x1=\"12\" y1=\"2\" x2=\"12\" y2=\"12\"></line>"},
"printer":{main:"<polyline points=\"6 9 6 2 18 2 18 9\"></polyline><path d=\"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2\"></path>",accent:"<rect x=\"6\" y=\"14\" width=\"12\" height=\"8\"></rect>"},
"radio":{main:"<path d=\"M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14\"></path>",accent:"<circle cx=\"12\" cy=\"12\" r=\"2\"></circle>"},
"refresh-ccw":{main:"<polyline points=\"1 4 1 10 7 10\"></polyline><path d=\"M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15\"></path>",accent:""},
"refresh-cw":{main:"<polyline points=\"23 4 23 10 17 10\"></polyline><path d=\"M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15\"></path>",accent:""},
"repeat":{main:"<polyline points=\"17 1 21 5 17 9\"></polyline><path d=\"M3 11V9a4 4 0 0 1 4-4h14\"></path><path d=\"M21 13v2a4 4 0 0 1-4 4H3\"></path><polyline points=\"7 23 3 19 7 15\"></polyline>",accent:""},
"rewind":{main:"<polygon points=\"11 19 2 12 11 5 11 19\"></polygon>",accent:"<polygon points=\"22 19 13 12 22 5 22 19\"></polygon>"},
"rotate-ccw":{main:"<polyline points=\"1 4 1 10 7 10\"></polyline><path d=\"M3.51 15a9 9 0 1 0 2.13-9.36L1 10\"></path>",accent:""},
"rotate-cw":{main:"<polyline points=\"23 4 23 10 17 10\"></polyline><path d=\"M20.49 15a9 9 0 1 1-2.12-9.36L23 10\"></path>",accent:""},
"rss":{main:"<path d=\"M4 11a9 9 0 0 1 9 9\"></path><path d=\"M4 4a16 16 0 0 1 16 16\"></path>",accent:"<circle cx=\"5\" cy=\"19\" r=\"1\"></circle>"},
"save":{main:"<path d=\"M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z\"></path><polyline points=\"17 21 17 13 7 13 7 21\"></polyline>",accent:"<polyline points=\"7 3 7 8 15 8\"></polyline>"},
"scissors":{main:"<circle cx=\"6\" cy=\"6\" r=\"3\"></circle><circle cx=\"6\" cy=\"18\" r=\"3\"></circle><line x1=\"20\" y1=\"4\" x2=\"8.12\" y2=\"15.88\"></line><line x1=\"14.47\" y1=\"14.48\" x2=\"20\" y2=\"20\"></line><line x1=\"8.12\" y1=\"8.12\" x2=\"12\" y2=\"12\"></line>",accent:""},
"search":{main:"<circle cx=\"11\" cy=\"11\" r=\"8\"></circle><line x1=\"21\" y1=\"21\" x2=\"16.65\" y2=\"16.65\"></line>",accent:""},
"send":{main:"<polygon points=\"22 2 15 22 11 13 2 9 22 2\"></polygon><line x1=\"22\" y1=\"2\" x2=\"11\" y2=\"13\"></line>",accent:""},
"server":{main:"<rect x=\"2\" y=\"2\" width=\"20\" height=\"8\" rx=\"2\" ry=\"2\"></rect><rect x=\"2\" y=\"14\" width=\"20\" height=\"8\" rx=\"2\" ry=\"2\"></rect>",accent:"<line x1=\"6\" y1=\"6\" x2=\"6.01\" y2=\"6\"></line><line x1=\"6\" y1=\"18\" x2=\"6.01\" y2=\"18\"></line>"},
"settings":{main:"<path d=\"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z\"></path>",accent:"<circle cx=\"12\" cy=\"12\" r=\"3\"></circle>"},
"share":{main:"<path d=\"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8\"></path>",accent:"<polyline points=\"16 6 12 2 8 6\"></polyline><line x1=\"12\" y1=\"2\" x2=\"12\" y2=\"15\"></line>"},
"share-2":{main:"<circle cx=\"18\" cy=\"5\" r=\"3\"></circle><circle cx=\"6\" cy=\"12\" r=\"3\"></circle><circle cx=\"18\" cy=\"19\" r=\"3\"></circle><line x1=\"8.59\" y1=\"13.51\" x2=\"15.42\" y2=\"17.49\"></line><line x1=\"15.41\" y1=\"6.51\" x2=\"8.59\" y2=\"10.49\"></line>",accent:""},
"shield":{main:"<path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"></path>",accent:""},
"shield-off":{main:"<path d=\"M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18\"></path><path d=\"M4.73 4.73L4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38\"></path>",accent:"<line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line>"},
"shopping-bag":{main:"<path d=\"M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z\"></path><path d=\"M16 10a4 4 0 0 1-8 0\"></path>",accent:"<line x1=\"3\" y1=\"6\" x2=\"21\" y2=\"6\"></line>"},
"shopping-cart":{main:"<circle cx=\"20\" cy=\"21\" r=\"1\"></circle>",accent:"<circle cx=\"9\" cy=\"21\" r=\"1\"></circle><path d=\"M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6\"></path>"},
"shuffle":{main:"<polyline points=\"16 3 21 3 21 8\"></polyline><line x1=\"4\" y1=\"20\" x2=\"21\" y2=\"3\"></line><polyline points=\"21 16 21 21 16 21\"></polyline><line x1=\"15\" y1=\"15\" x2=\"21\" y2=\"21\"></line><line x1=\"4\" y1=\"4\" x2=\"9\" y2=\"9\"></line>",accent:""},
"sidebar":{main:"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>",accent:"<line x1=\"9\" y1=\"3\" x2=\"9\" y2=\"21\"></line>"},
"skip-back":{main:"<polygon points=\"19 20 9 12 19 4 19 20\"></polygon>",accent:"<line x1=\"5\" y1=\"19\" x2=\"5\" y2=\"5\"></line>"},
"skip-forward":{main:"<polygon points=\"5 4 15 12 5 20 5 4\"></polygon>",accent:"<line x1=\"19\" y1=\"5\" x2=\"19\" y2=\"19\"></line>"},
"slack":{main:"<path d=\"M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z\"></path><path d=\"M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z\"></path><path d=\"M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z\"></path><path d=\"M3.5 14H5v1.5c0 .83-.67 1.5-1.5 1.5S2 16.33 2 15.5 2.67 14 3.5 14z\"></path><path d=\"M14 14.5c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5z\"></path><path d=\"M15.5 19H14v1.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5z\"></path><path d=\"M10 9.5C10 8.67 9.33 8 8.5 8h-5C2.67 8 2 8.67 2 9.5S2.67 11 3.5 11h5c.83 0 1.5-.67 1.5-1.5z\"></path>",accent:"<path d=\"M8.5 5H10V3.5C10 2.67 9.33 2 8.5 2S7 2.67 7 3.5 7.67 5 8.5 5z\"></path>"},
"slash":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<line x1=\"4.93\" y1=\"4.93\" x2=\"19.07\" y2=\"19.07\"></line>"},
"sliders":{main:"<line x1=\"4\" y1=\"21\" x2=\"4\" y2=\"14\"></line><line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"3\"></line><line x1=\"20\" y1=\"21\" x2=\"20\" y2=\"16\"></line><line x1=\"1\" y1=\"14\" x2=\"7\" y2=\"14\"></line><line x1=\"9\" y1=\"8\" x2=\"15\" y2=\"8\"></line><line x1=\"17\" y1=\"16\" x2=\"23\" y2=\"16\"></line>",accent:"<line x1=\"4\" y1=\"10\" x2=\"4\" y2=\"3\"></line><line x1=\"12\" y1=\"21\" x2=\"12\" y2=\"12\"></line><line x1=\"20\" y1=\"12\" x2=\"20\" y2=\"3\"></line>"},
"smartphone":{main:"<rect x=\"5\" y=\"2\" width=\"14\" height=\"20\" rx=\"2\" ry=\"2\"></rect>",accent:"<line x1=\"12\" y1=\"18\" x2=\"12.01\" y2=\"18\"></line>"},
"smile":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"M8 14s1.5 2 4 2 4-2 4-2\"></path>",accent:"<line x1=\"9\" y1=\"9\" x2=\"9.01\" y2=\"9\"></line><line x1=\"15\" y1=\"9\" x2=\"15.01\" y2=\"9\"></line>"},
"speaker":{main:"<rect x=\"4\" y=\"2\" width=\"16\" height=\"20\" rx=\"2\" ry=\"2\"></rect>",accent:"<circle cx=\"12\" cy=\"14\" r=\"4\"></circle><line x1=\"12\" y1=\"6\" x2=\"12.01\" y2=\"6\"></line>"},
"square":{main:"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>",accent:""},
"star":{main:"<polygon points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\"></polygon>",accent:""},
"stop-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<rect x=\"9\" y=\"9\" width=\"6\" height=\"6\"></rect>"},
"sun":{main:"<circle cx=\"12\" cy=\"12\" r=\"5\"></circle>",accent:"<line x1=\"12\" y1=\"1\" x2=\"12\" y2=\"3\"></line><line x1=\"12\" y1=\"21\" x2=\"12\" y2=\"23\"></line><line x1=\"4.22\" y1=\"4.22\" x2=\"5.64\" y2=\"5.64\"></line><line x1=\"18.36\" y1=\"18.36\" x2=\"19.78\" y2=\"19.78\"></line><line x1=\"1\" y1=\"12\" x2=\"3\" y2=\"12\"></line><line x1=\"21\" y1=\"12\" x2=\"23\" y2=\"12\"></line><line x1=\"4.22\" y1=\"19.78\" x2=\"5.64\" y2=\"18.36\"></line><line x1=\"18.36\" y1=\"5.64\" x2=\"19.78\" y2=\"4.22\"></line>"},
"sunrise":{main:"<path d=\"M17 18a5 5 0 0 0-10 0\"></path><line x1=\"12\" y1=\"2\" x2=\"12\" y2=\"9\"></line><line x1=\"4.22\" y1=\"10.22\" x2=\"5.64\" y2=\"11.64\"></line><line x1=\"1\" y1=\"18\" x2=\"3\" y2=\"18\"></line><line x1=\"21\" y1=\"18\" x2=\"23\" y2=\"18\"></line><line x1=\"18.36\" y1=\"11.64\" x2=\"19.78\" y2=\"10.22\"></line><line x1=\"23\" y1=\"22\" x2=\"1\" y2=\"22\"></line><polyline points=\"8 6 12 2 16 6\"></polyline>",accent:""},
"sunset":{main:"<path d=\"M17 18a5 5 0 0 0-10 0\"></path>",accent:"<line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"2\"></line><line x1=\"4.22\" y1=\"10.22\" x2=\"5.64\" y2=\"11.64\"></line><line x1=\"1\" y1=\"18\" x2=\"3\" y2=\"18\"></line><line x1=\"21\" y1=\"18\" x2=\"23\" y2=\"18\"></line><line x1=\"18.36\" y1=\"11.64\" x2=\"19.78\" y2=\"10.22\"></line><line x1=\"23\" y1=\"22\" x2=\"1\" y2=\"22\"></line><polyline points=\"16 5 12 9 8 5\"></polyline>"},
"table":{main:"<path d=\"M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18\"></path>",accent:""},
"tablet":{main:"<rect x=\"4\" y=\"2\" width=\"16\" height=\"20\" rx=\"2\" ry=\"2\"></rect>",accent:"<line x1=\"12\" y1=\"18\" x2=\"12.01\" y2=\"18\"></line>"},
"tag":{main:"<path d=\"M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z\"></path>",accent:"<line x1=\"7\" y1=\"7\" x2=\"7.01\" y2=\"7\"></line>"},
"target":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><circle cx=\"12\" cy=\"12\" r=\"6\"></circle>",accent:"<circle cx=\"12\" cy=\"12\" r=\"2\"></circle>"},
"terminal":{main:"<polyline points=\"4 17 10 11 4 5\"></polyline>",accent:"<line x1=\"12\" y1=\"19\" x2=\"20\" y2=\"19\"></line>"},
"thermometer":{main:"<path d=\"M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z\"></path>",accent:""},
"thumbs-down":{main:"<path d=\"M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17\"></path>",accent:""},
"thumbs-up":{main:"<path d=\"M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3\"></path>",accent:""},
"toggle-left":{main:"<rect x=\"1\" y=\"5\" width=\"22\" height=\"14\" rx=\"7\" ry=\"7\"></rect>",accent:"<circle cx=\"8\" cy=\"12\" r=\"3\"></circle>"},
"toggle-right":{main:"<rect x=\"1\" y=\"5\" width=\"22\" height=\"14\" rx=\"7\" ry=\"7\"></rect>",accent:"<circle cx=\"16\" cy=\"12\" r=\"3\"></circle>"},
"tool":{main:"<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z\"></path>",accent:""},
"trash":{main:"<polyline points=\"3 6 5 6 21 6\"></polyline>",accent:"<path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path>"},
"trash-2":{main:"<polyline points=\"3 6 5 6 21 6\"></polyline><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path>",accent:"<line x1=\"10\" y1=\"11\" x2=\"10\" y2=\"17\"></line><line x1=\"14\" y1=\"11\" x2=\"14\" y2=\"17\"></line>"},
"trello":{main:"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect><rect x=\"7\" y=\"7\" width=\"3\" height=\"9\"></rect>",accent:"<rect x=\"14\" y=\"7\" width=\"3\" height=\"5\"></rect>"},
"trending-down":{main:"<polyline points=\"23 18 13.5 8.5 8.5 13.5 1 6\"></polyline>",accent:"<polyline points=\"17 18 23 18 23 12\"></polyline>"},
"trending-up":{main:"<polyline points=\"23 6 13.5 15.5 8.5 10.5 1 18\"></polyline>",accent:"<polyline points=\"17 6 23 6 23 12\"></polyline>"},
"triangle":{main:"<path d=\"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"></path>",accent:""},
"truck":{main:"<rect x=\"1\" y=\"3\" width=\"15\" height=\"13\"></rect>",accent:"<polygon points=\"16 8 20 8 23 11 23 16 16 16 16 8\"></polygon><circle cx=\"5.5\" cy=\"18.5\" r=\"2.5\"></circle><circle cx=\"18.5\" cy=\"18.5\" r=\"2.5\"></circle>"},
"tv":{main:"<rect x=\"2\" y=\"7\" width=\"20\" height=\"15\" rx=\"2\" ry=\"2\"></rect>",accent:"<polyline points=\"17 2 12 7 7 2\"></polyline>"},
"twitch":{main:"<path d=\"M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7\"></path>",accent:""},
"twitter":{main:"<path d=\"M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z\"></path>",accent:""},
"type":{main:"<polyline points=\"4 7 4 4 20 4 20 7\"></polyline>",accent:"<line x1=\"9\" y1=\"20\" x2=\"15\" y2=\"20\"></line><line x1=\"12\" y1=\"4\" x2=\"12\" y2=\"20\"></line>"},
"umbrella":{main:"<path d=\"M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7\"></path>",accent:""},
"underline":{main:"<path d=\"M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3\"></path>",accent:"<line x1=\"4\" y1=\"21\" x2=\"20\" y2=\"21\"></line>"},
"unlock":{main:"<rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\" ry=\"2\"></rect>",accent:"<path d=\"M7 11V7a5 5 0 0 1 9.9-1\"></path>"},
"upload":{main:"<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path>",accent:"<polyline points=\"17 8 12 3 7 8\"></polyline><line x1=\"12\" y1=\"3\" x2=\"12\" y2=\"15\"></line>"},
"upload-cloud":{main:"<polyline points=\"16 16 12 12 8 16\"></polyline>",accent:"<path d=\"M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3\"></path><line x1=\"12\" y1=\"12\" x2=\"12\" y2=\"21\"></line><polyline points=\"16 16 12 12 8 16\"></polyline>"},
"user":{main:"<path d=\"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2\"></path><circle cx=\"12\" cy=\"7\" r=\"4\"></circle>",accent:""},
"user-check":{main:"<path d=\"M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\"></path><circle cx=\"8.5\" cy=\"7\" r=\"4\"></circle>",accent:"<polyline points=\"17 11 19 13 23 9\"></polyline>"},
"user-minus":{main:"<path d=\"M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\"></path><circle cx=\"8.5\" cy=\"7\" r=\"4\"></circle>",accent:"<line x1=\"23\" y1=\"11\" x2=\"17\" y2=\"11\"></line>"},
"user-plus":{main:"<path d=\"M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\"></path><circle cx=\"8.5\" cy=\"7\" r=\"4\"></circle>",accent:"<line x1=\"20\" y1=\"8\" x2=\"20\" y2=\"14\"></line><line x1=\"23\" y1=\"11\" x2=\"17\" y2=\"11\"></line>"},
"user-x":{main:"<path d=\"M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\"></path><circle cx=\"8.5\" cy=\"7\" r=\"4\"></circle>",accent:"<line x1=\"18\" y1=\"8\" x2=\"23\" y2=\"13\"></line><line x1=\"23\" y1=\"8\" x2=\"18\" y2=\"13\"></line>"},
"users":{main:"<path d=\"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\"></path><path d=\"M23 21v-2a4 4 0 0 0-3-3.87\"></path>",accent:"<path d=\"M16 3.13a4 4 0 0 1 0 7.75\"></path><circle cx=\"9\" cy=\"7\" r=\"4\"></circle>"},
"video":{main:"<polygon points=\"23 7 16 12 23 17 23 7\"></polygon><rect x=\"1\" y=\"5\" width=\"15\" height=\"14\" rx=\"2\" ry=\"2\"></rect>",accent:""},
"video-off":{main:"<path d=\"M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10\"></path>",accent:"<line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line>"},
"voicemail":{main:"<circle cx=\"5.5\" cy=\"11.5\" r=\"4.5\"></circle><circle cx=\"18.5\" cy=\"11.5\" r=\"4.5\"></circle><line x1=\"5.5\" y1=\"16\" x2=\"18.5\" y2=\"16\"></line>",accent:""},
"volume":{main:"<polygon points=\"11 5 6 9 2 9 2 15 6 15 11 19 11 5\"></polygon>",accent:""},
"volume-1":{main:"<polygon points=\"11 5 6 9 2 9 2 15 6 15 11 19 11 5\"></polygon>",accent:"<path d=\"M15.54 8.46a5 5 0 0 1 0 7.07\"></path>"},
"volume-2":{main:"<polygon points=\"11 5 6 9 2 9 2 15 6 15 11 19 11 5\"></polygon>",accent:"<path d=\"M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07\"></path>"},
"volume-x":{main:"<polygon points=\"11 5 6 9 2 9 2 15 6 15 11 19 11 5\"></polygon>",accent:"<line x1=\"23\" y1=\"9\" x2=\"17\" y2=\"15\"></line><line x1=\"17\" y1=\"9\" x2=\"23\" y2=\"15\"></line>"},
"watch":{main:"<circle cx=\"12\" cy=\"12\" r=\"7\"></circle><path d=\"M16.51 17.35l-.35 3.83a2 2 0 0 1-2 1.82H9.83a2 2 0 0 1-2-1.82l-.35-3.83m.01-10.7l.35-3.83A2 2 0 0 1 9.83 1h4.35a2 2 0 0 1 2 1.82l.35 3.83\"></path>",accent:"<polyline points=\"12 9 12 12 13.5 13.5\"></polyline>"},
"wifi":{main:"<path d=\"M5 12.55a11 11 0 0 1 14.08 0\"></path><path d=\"M1.42 9a16 16 0 0 1 21.16 0\"></path><path d=\"M8.53 16.11a6 6 0 0 1 6.95 0\"></path>",accent:"<line x1=\"12\" y1=\"20\" x2=\"12.01\" y2=\"20\"></line>"},
"wifi-off":{main:"<path d=\"M16.72 11.06A10.94 10.94 0 0 1 19 12.55\"></path><path d=\"M5 12.55a10.94 10.94 0 0 1 5.17-2.39\"></path><path d=\"M10.71 5.05A16 16 0 0 1 22.58 9\"></path><path d=\"M1.42 9a15.91 15.91 0 0 1 4.7-2.88\"></path><path d=\"M8.53 16.11a6 6 0 0 1 6.95 0\"></path>",accent:"<line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line><line x1=\"12\" y1=\"20\" x2=\"12.01\" y2=\"20\"></line>"},
"wind":{main:"<path d=\"M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2\"></path>",accent:""},
"x":{main:"<line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"></line>",accent:"<line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"></line>"},
"x-circle":{main:"<circle cx=\"12\" cy=\"12\" r=\"10\"></circle>",accent:"<line x1=\"15\" y1=\"9\" x2=\"9\" y2=\"15\"></line><line x1=\"9\" y1=\"9\" x2=\"15\" y2=\"15\"></line>"},
"x-octagon":{main:"<polygon points=\"7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2\"></polygon>",accent:"<line x1=\"15\" y1=\"9\" x2=\"9\" y2=\"15\"></line><line x1=\"9\" y1=\"9\" x2=\"15\" y2=\"15\"></line>"},
"x-square":{main:"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect>",accent:"<line x1=\"9\" y1=\"9\" x2=\"15\" y2=\"15\"></line><line x1=\"15\" y1=\"9\" x2=\"9\" y2=\"15\"></line>"},
"youtube":{main:"<path d=\"M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z\"></path>",accent:"<polygon points=\"9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02\"></polygon>"},
"zap":{main:"<polygon points=\"13 2 3 14 12 14 11 22 21 10 12 10 13 2\"></polygon>",accent:""},
"zap-off":{main:"<polyline points=\"12.41 6.75 13 2 10.57 4.92\"></polyline>",accent:"<polyline points=\"18.57 12.91 21 10 15.66 10\"></polyline><polyline points=\"8 8 3 14 12 14 11 22 16 16\"></polyline><line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line>"},
"zoom-in":{main:"<circle cx=\"11\" cy=\"11\" r=\"8\"></circle>",accent:"<line x1=\"21\" y1=\"21\" x2=\"16.65\" y2=\"16.65\"></line><line x1=\"11\" y1=\"8\" x2=\"11\" y2=\"14\"></line><line x1=\"8\" y1=\"11\" x2=\"14\" y2=\"11\"></line>"},
"zoom-out":{main:"<circle cx=\"11\" cy=\"11\" r=\"8\"></circle>",accent:"<line x1=\"21\" y1=\"21\" x2=\"16.65\" y2=\"16.65\"></line><line x1=\"8\" y1=\"11\" x2=\"14\" y2=\"11\"></line>"}
};

var DEFAULT_MAIN = "#6A78F0";
var DEFAULT_ACCENT = "#FF3B30";

// --- SVG element attribute parser ---
function getAttr(a, n) {
  var m = a.match(new RegExp(n + '\\s*=\\s*"([^"]*)"'));
  return m ? m[1] : '';
}

// --- SVG path parser ---
function parseSvgPath(d) {
  var cmds = [];
  var re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  var m;
  while ((m = re.exec(d)) !== null) {
    var cmd = m[1];
    // Fixed regex: properly matches numbers like 1.82 and .33 as separate tokens
    // Old regex [d.]+ swallowed "1.82.33" as one token
    var args = m[2].trim().match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    args = args.map(parseFloat);
    // Arc commands (a/A) take exactly 7 args each. SVG allows multiple
    // consecutive arcs under one command letter, e.g.
    // "a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51" = two arcs of 7 args
    // Split into groups of 7 so each arc is rendered correctly.
    if ((cmd === 'a' || cmd === 'A') && args.length > 7 && args.length % 7 === 0) {
      for (var j = 0; j < args.length; j += 7) {
        cmds.push({ cmd: cmd, args: args.slice(j, j + 7) });
      }
    } else {
      cmds.push({ cmd: cmd, args: args });
    }
  }
  return cmds;
}

// --- Draw SVG path onto ctx (corrected: multi-arg + smooth curves) ---
function drawSvgPath(ctx, d, ox, oy, scale, stroke, sw2) {
  var cmds = parseSvgPath(d);
  if (cmds.length === 0) return;
  var cx=0, cy=0, startX=0, startY=0;
  var prevCmd="", prevCtrlX=0, prevCtrlY=0;
  var sx=function(x){return x*scale+ox;};
  var sy=function(y){return y*scale+oy;};
  var sw=function(v){return v*scale;};
  ctx.beginPath();
  for (var ci=0; ci<cmds.length; ci++) {
    var c=cmds[ci], a=c.args;
    switch(c.cmd) {
      case "M": cx=a[0];cy=a[1];startX=cx;startY=cy;ctx.moveTo(sx(cx),sy(cy));
        for(var i=2;i<a.length;i+=2){cx=a[i];cy=a[i+1];ctx.lineTo(sx(cx),sy(cy));}
        prevCmd="M"; break;
      case "m": cx+=a[0];cy+=a[1];startX=cx;startY=cy;ctx.moveTo(sx(cx),sy(cy));
        for(var i=2;i<a.length;i+=2){cx+=a[i];cy+=a[i+1];ctx.lineTo(sx(cx),sy(cy));}
        prevCmd="M"; break;
      case "L": for(var i=0;i<a.length;i+=2){cx=a[i];cy=a[i+1];ctx.lineTo(sx(cx),sy(cy));} prevCmd="L"; break;
      case "l": for(var i=0;i<a.length;i+=2){cx+=a[i];cy+=a[i+1];ctx.lineTo(sx(cx),sy(cy));} prevCmd="L"; break;
      case "H": for(var i=0;i<a.length;i++){cx=a[i];ctx.lineTo(sx(cx),sy(cy));} prevCmd="H"; break;
      case "h": for(var i=0;i<a.length;i++){cx+=a[i];ctx.lineTo(sx(cx),sy(cy));} prevCmd="H"; break;
      case "V": for(var i=0;i<a.length;i++){cy=a[i];ctx.lineTo(sx(cx),sy(cy));} prevCmd="V"; break;
      case "v": for(var i=0;i<a.length;i++){cy+=a[i];ctx.lineTo(sx(cx),sy(cy));} prevCmd="V"; break;
      case "C": for(var i=0;i<a.length;i+=6){
        ctx.bezierCurveTo(sx(a[i]),sy(a[i+1]),sx(a[i+2]),sy(a[i+3]),sx(a[i+4]),sy(a[i+5]));
        prevCtrlX=a[i+2];prevCtrlY=a[i+3];cx=a[i+4];cy=a[i+5];} prevCmd="C"; break;
      case "c": for(var i=0;i<a.length;i+=6){
        ctx.bezierCurveTo(sx(cx+a[i]),sy(cy+a[i+1]),sx(cx+a[i+2]),sy(cy+a[i+3]),sx(cx+a[i+4]),sy(cy+a[i+5]));
        prevCtrlX=cx+a[i+2];prevCtrlY=cy+a[i+3];cx+=a[i+4];cy+=a[i+5];} prevCmd="C"; break;
      case "S": for(var i=0;i<a.length;i+=4){
        var rx2,ry2;
        if(prevCmd==="C"||prevCmd==="c"||prevCmd==="S"||prevCmd==="s"){rx2=2*cx-prevCtrlX;ry2=2*cy-prevCtrlY;}
        else{rx2=cx;ry2=cy;}
        ctx.bezierCurveTo(sx(rx2),sy(ry2),sx(a[i]),sy(a[i+1]),sx(a[i+2]),sy(a[i+3]));
        prevCtrlX=a[i];prevCtrlY=a[i+1];cx=a[i+2];cy=a[i+3];} prevCmd="S"; break;
      case "s": for(var i=0;i<a.length;i+=4){
        var rx2,ry2;
        if(prevCmd==="C"||prevCmd==="c"||prevCmd==="S"||prevCmd==="s"){rx2=2*cx-prevCtrlX;ry2=2*cy-prevCtrlY;}
        else{rx2=cx;ry2=cy;}
        ctx.bezierCurveTo(sx(rx2),sy(ry2),sx(cx+a[i]),sy(cy+a[i+1]),sx(cx+a[i+2]),sy(cy+a[i+3]));
        prevCtrlX=cx+a[i];prevCtrlY=cy+a[i+1];cx+=a[i+2];cy+=a[i+3];} prevCmd="S"; break;
      case "Q": for(var i=0;i<a.length;i+=4){
        ctx.quadraticCurveTo(sx(a[i]),sy(a[i+1]),sx(a[i+2]),sy(a[i+3]));
        prevCtrlX=a[i];prevCtrlY=a[i+1];cx=a[i+2];cy=a[i+3];} prevCmd="Q"; break;
      case "q": for(var i=0;i<a.length;i+=4){
        ctx.quadraticCurveTo(sx(cx+a[i]),sy(cy+a[i+1]),sx(cx+a[i+2]),sy(cy+a[i+3]));
        prevCtrlX=cx+a[i];prevCtrlY=cy+a[i+1];cx+=a[i+2];cy+=a[i+3];} prevCmd="Q"; break;
      case "T": for(var i=0;i<a.length;i+=2){
        var rx2,ry2;
        if(prevCmd==="Q"||prevCmd==="q"||prevCmd==="T"||prevCmd==="t"){rx2=2*cx-prevCtrlX;ry2=2*cy-prevCtrlY;}
        else{rx2=cx;ry2=cy;}
        ctx.quadraticCurveTo(sx(rx2),sy(ry2),sx(a[i]),sy(a[i+1]));cx=a[i];cy=a[i+1];} prevCmd="T"; break;
      case "t": for(var i=0;i<a.length;i+=2){
        var rx2,ry2;
        if(prevCmd==="Q"||prevCmd==="q"||prevCmd==="T"||prevCmd==="t"){rx2=2*cx-prevCtrlX;ry2=2*cy-prevCtrlY;}
        else{rx2=cx;ry2=cy;}
        ctx.quadraticCurveTo(sx(rx2),sy(ry2),sx(cx+a[i]),sy(cy+a[i+1]));cx+=a[i];cy+=a[i+1];} prevCmd="T"; break;case "A": for(var i=0;i<a.length;i+=7){
        var arx=a[i],ary=a[i+1],arot=a[i+2]*Math.PI/180,alarge=a[i+3],asweep=a[i+4];
        var aex=a[i+5],aey=a[i+6];var acx=cx,acy=cy;
        var cosr=Math.cos(arot),sinr=Math.sin(arot);
        var dx1=(acx-aex)/2,dy1=(acy-aey)/2;
        var ex1=dx1*cosr+dy1*sinr,ey1=-dx1*sinr+dy1*cosr;
        var rx=Math.max(arx,0.01),ry=Math.max(ary,0.01);
        var rx2=rx*rx,ry2=ry*ry,ex2=ex1*ex1,ey2=ey1*ey1;
        var f=Math.max(0,(rx2*ry2-rx2*ey2-ry2*ex2)/(rx2*ey2+ry2*ex2));
        f=Math.sqrt(f);if(alarge===asweep)f=-f;
        var cpx=f*rx*ey1/ry,cpy=-f*ry*ex1/rx;
        var ccx=cpx*cosr-cpy*sinr+(acx+aex)/2;
        var ccy=cpx*sinr+cpy*cosr+(acy+aey)/2;
        var ang1=Math.atan2((ey1-cpy)/ry,(ex1-cpx)/rx);
        var ang2=Math.atan2((-ey1-cpy)/ry,(-ex1-cpx)/rx);
        if(!asweep&&ang2>ang1)ang2-=2*Math.PI;
        if(asweep&&ang2<ang1)ang2+=2*Math.PI;
        ctx.ellipse(sx(ccx),sy(ccy),sw(rx),sw(ry),arot,ang1,ang2,!asweep);
        cx=aex;cy=aey;} prevCmd="A"; break;
      case "a": for(var i=0;i<a.length;i+=7){
        var arx=a[i],ary=a[i+1],arot=a[i+2]*Math.PI/180,alarge=a[i+3],asweep=a[i+4];
        var aex=cx+a[i+5],aey=cy+a[i+6];var acx=cx,acy=cy;
        var cosr=Math.cos(arot),sinr=Math.sin(arot);
        var dx1=(acx-aex)/2,dy1=(acy-aey)/2;
        var ex1=dx1*cosr+dy1*sinr,ey1=-dx1*sinr+dy1*cosr;
        var rx=Math.max(arx,0.01),ry=Math.max(ary,0.01);
        var rx2=rx*rx,ry2=ry*ry,ex2=ex1*ex1,ey2=ey1*ey1;
        var f=Math.max(0,(rx2*ry2-rx2*ey2-ry2*ex2)/(rx2*ey2+ry2*ex2));
        f=Math.sqrt(f);if(alarge===asweep)f=-f;
        var cpx=f*rx*ey1/ry,cpy=-f*ry*ex1/rx;
        var ccx=cpx*cosr-cpy*sinr+(acx+aex)/2;
        var ccy=cpx*sinr+cpy*cosr+(acy+aey)/2;
        var ang1=Math.atan2((ey1-cpy)/ry,(ex1-cpx)/rx);
        var ang2=Math.atan2((-ey1-cpy)/ry,(-ex1-cpx)/rx);
        if(!asweep&&ang2>ang1)ang2-=2*Math.PI;
        if(asweep&&ang2<ang1)ang2+=2*Math.PI;
        ctx.ellipse(sx(ccx),sy(ccy),sw(rx),sw(ry),arot,ang1,ang2,!asweep);
        cx=aex;cy=aey;} prevCmd="A"; break;
      case "Z": case "z": ctx.closePath(); cx=startX; cy=startY; prevCmd="Z"; break;
      default: break;
    }
  }
  ctx.strokeStyle=stroke; ctx.lineWidth=sw2; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.stroke();
}

// --- Draw a single SVG element onto ctx ---
function drawEl(ctx, tag, attrs, color, ox, oy, scale) {
  ctx.strokeStyle = color; ctx.lineWidth = 2 * scale;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  var sx=function(x){return x*scale+ox;};
  var sy=function(y){return y*scale+oy;};
  var sw=function(v){return v*scale;};
  if (tag === "circle") {
    ctx.beginPath();
    ctx.arc(sx(parseFloat(getAttr(attrs,"cx"))),sy(parseFloat(getAttr(attrs,"cy"))),sw(parseFloat(getAttr(attrs,"r"))),0,Math.PI*2);
    ctx.stroke();
  } else if (tag === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(sx(parseFloat(getAttr(attrs,"cx"))),sy(parseFloat(getAttr(attrs,"cy"))),sw(parseFloat(getAttr(attrs,"rx"))),sw(parseFloat(getAttr(attrs,"ry"))),0,0,Math.PI*2);
    ctx.stroke();
  } else if (tag === "line") {
    ctx.beginPath();
    ctx.moveTo(sx(parseFloat(getAttr(attrs,"x1"))),sy(parseFloat(getAttr(attrs,"y1"))));
    ctx.lineTo(sx(parseFloat(getAttr(attrs,"x2"))),sy(parseFloat(getAttr(attrs,"y2"))));
    ctx.stroke();
  } else if (tag === "rect") {
    ctx.beginPath();
    var rx=getAttr(attrs,"rx")?parseFloat(getAttr(attrs,"rx")):0;
    if(rx>0) ctx.roundRect(sx(parseFloat(getAttr(attrs,"x"))),sy(parseFloat(getAttr(attrs,"y"))),sw(parseFloat(getAttr(attrs,"width"))),sw(parseFloat(getAttr(attrs,"height"))),sw(rx));
    else ctx.rect(sx(parseFloat(getAttr(attrs,"x"))),sy(parseFloat(getAttr(attrs,"y"))),sw(parseFloat(getAttr(attrs,"width"))),sw(parseFloat(getAttr(attrs,"height"))));
    ctx.stroke();
  } else if (tag === "polyline" || tag === "polygon") {
    var pts=getAttr(attrs,"points").trim().split(/[\s,]+/);
    ctx.beginPath();
    for(var j=0;j<pts.length;j+=2){
      var px=sx(parseFloat(pts[j])),py=sy(parseFloat(pts[j+1]));
      if(j===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    if(tag==="polygon")ctx.closePath();
    ctx.stroke();
  } else if (tag === "path") {
    drawSvgPath(ctx, getAttr(attrs,"d"), ox, oy, scale, color, 2*scale);
  }
}

// --- Parse SVG elements from a string ---
function parseElements(svgStr) {
  var re = /<(path|circle|line|polyline|polygon|ellipse|rect)\b([^>]*)\/?>(?:<\/\1>)?/g;
  var els = [];
  var m;
  while ((m = re.exec(svgStr)) !== null) els.push({ tag: m[1], attrs: m[2], raw: m[0] });
  return els;
}

// ============================
// PUBLIC API
// ============================

// Draw an icon onto an existing canvas 2d context
function draw(ctx, name, x, y, size, mainColor, accentColor) {
  var icon = ICONS[name];
  if (!icon) return;
  var mc = mainColor || DEFAULT_MAIN;
  var ac = accentColor || DEFAULT_ACCENT;
  var scale = size / 24;
  var mainEls = parseElements(icon.main || "");
  var mainRaw = {};
  mainEls.forEach(function(e) { mainRaw[e.raw] = true; });
  var allEls = parseElements((icon.main || "") + (icon.accent || ""));
  for (var i = 0; i < allEls.length; i++) {
    var e = allEls[i];
    var color = mainRaw[e.raw] ? mc : ac;
    drawEl(ctx, e.tag, e.attrs, color, x, y, scale);
  }
}

// Generate a PNG Buffer for an icon
function toPNG(name, size, mainColor, accentColor) {
  var createCanvas = require("canvas").createCanvas;
  var s = size || 48;
  var canvas = createCanvas(s, s);
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, s, s);
  draw(ctx, name, 0, 0, s, mainColor, accentColor);
  return canvas.toBuffer("image/png");
}

// Generate an SVG string for an icon (for HTML inline)
function toSVG(name, size, mainColor, accentColor) {
  var icon = ICONS[name];
  if (!icon) return "";
  var mc = mainColor || DEFAULT_MAIN;
  var ac = accentColor || DEFAULT_ACCENT;
  var s = size || 24;
  var mainColored = (icon.main || "").replace(/<(path|circle|line|polyline|polygon|ellipse|rect)\b/g, '<$1 stroke="' + mc + '"');
  var accentColored = (icon.accent || "").replace(/<(path|circle|line|polyline|polygon|ellipse|rect)\b/g, '<$1 stroke="' + ac + '"');
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + mainColored + accentColored + '</svg>';
}

// List all icon names
function names() {
  return Object.keys(ICONS).sort();
}

// Check if an icon exists
function has(name) {
  return !!ICONS[name];
}

// Get raw icon data
function get(name) {
  return ICONS[name] || null;
}

return {
  draw: draw,
  toPNG: toPNG,
  toSVG: toSVG,
  names: names,
  has: has,
  get: get,
  ICONS: ICONS,
  DEFAULT_MAIN: DEFAULT_MAIN,
  DEFAULT_ACCENT: DEFAULT_ACCENT
};

})();

if (typeof module !== "undefined") module.exports = FeatherBicolor;
