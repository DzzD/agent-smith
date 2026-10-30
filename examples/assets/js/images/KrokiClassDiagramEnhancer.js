// =============================================================
// KrokiClassDiagramEnhancer.js v24
// Enhances a Kroki/Mermaid class diagram SVG into styled high-res PNG.
//
// Required JS: FeatherDrawIcon.js (via requiredJsFiles)
// Input:  [0] = class-diagram.svg (from Kroki, format=svg)
//         [1] = optional style.json
// Output: PNG buffer (high resolution)
// =============================================================
//
// style.json format:
// {
//   "scale": 4,           // Resolution multiplier (default 4, use 2 for large diagrams)
//   "fontScale": 1,       // Multiplies all font sizes (default 1)
//   "colors": {           // All optional, override default ASP palette
//     "bg": "#FFFFFF",
//     "nodeBg": "#F8F9FF",
//     "nodeBorder": "#6A78F0",
//     "titleText": "#0038B8",
//     "memberText": "#202124",
//     "methodText": "#202124",
//     "dividerColor": "#6A78F0",
//     "edgeColor": "#596275",
//     "edgeLabelBg": "#EEF0FF",
//     "edgeLabelText": "#202124",
//     "accent": "#FF3B30"
//   },
//   "icons": {            // Optional, maps class name to Feather icon
//     "Agent": "cpu",
//     "Tool": "command",
//     "Context": "box"
//   },
//   "nodeColors": {       // Optional, overrides background color per class
//     "Agent": "#E8F5E9",
//     "Tool": "#FFF3E0"
//   },
//   "iconAccents": {      // Optional, overrides icon accent color per class
//     "Agent": "#FF9575", // Falls back to colors.accent if not specified
//     "Tool": "#FF9575"
//   }
// }
//
// Features:
//   - Class boxes: title, attributes, methods, dividers, rounded corners, shadow
//   - Stereotypes/annotations auto-parsed from Mermaid class definition
//   - 4 marker types with correct Bezier tangent direction:
//       composition (filled diamond), aggregation (hollow diamond),
//       extension/inheritance (hollow triangle, at start side),
//       dependency (open V arrow)
//   - Edge labels in badges with border (owns, uses, creates...)
//   - Curved Bezier paths
//   - Yellow sticky notes with folded corner + dotted connection lines
//   - Optional per-class background color override (nodeColors)
//   - Optional per-class Feather icons with bicolor support (icons + iconAccents)
// =============================================================
var ASP={bg:'#FFFFFF',nodeBg:'#F8F9FF',nodeBorder:'#6A78F0',titleText:'#0038B8',memberText:'#202124',methodText:'#202124',dividerColor:'#6A78F0',edgeColor:'#596275',edgeLabelBg:'#EEF0FF',edgeLabelText:'#202124',accent:'#FF3B30'};
var scOverride=null,fsOverride=1,_sc=4;
var nodeIcons={},nodeColors={},nodeIconAccents={};
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();}
function fsz(s){return s*_sc*fsOverride;}
function applyClassStyle(cfg){if(!cfg)return;if(cfg.colors)for(var k in cfg.colors)if(ASP.hasOwnProperty(k))ASP[k]=cfg.colors[k];if(cfg.scale)scOverride=cfg.scale;if(cfg.fontScale)fsOverride=cfg.fontScale;if(cfg.icons)for(var ik in cfg.icons)nodeIcons[ik.toLowerCase()]=cfg.icons[ik];if(cfg.nodeColors)for(var nc in cfg.nodeColors)nodeColors[nc.toLowerCase()]=cfg.nodeColors[nc];if(cfg.iconAccents)for(var ia in cfg.iconAccents)nodeIconAccents[ia.toLowerCase()]=cfg.iconAccents[ia];}
function parseClassStyleJson(d){if(!d)return null;try{return JSON.parse(d.toString('utf8'));}catch(e){return null;}}
function drawSeqIcon(c,name,cx,cy,sz,col,accentCol){if(typeof FeatherBicolor!=='undefined'&&FeatherBicolor.draw){FeatherBicolor.draw(c,name,cx-sz/2,cy-sz/2,sz,col,accentCol||col);}}

function parseClassNodes(svg){
  var nodes=[];
  // Find all node opening tags with classId- ids
  var tagRe=/<g\s+class="node[^"]*"\s+id="(classId-[^"]+)"\s+transform="translate\(([^,]+),([^)]+)\)">/g;
  var positions=[];
  var m;
  while((m=tagRe.exec(svg))!==null){
    positions.push({id:m[1],tx:parseFloat(m[2]),ty:parseFloat(m[3]),start:m.index+ m[0].length});
  }
  // For each node, content goes from its start to the next node's start (or end of nodes section)
  for(var i=0;i<positions.length;i++){
    var endPos;
    if(i+1<positions.length){
      endPos=positions[i+1].start - positions[i+1].id.length - 40; // backtrack before the next <g tag
      // Actually find the <g that starts the next node
      endPos=svg.lastIndexOf('<g class="node', positions[i+1].start);
      if(endPos<0) endPos=positions[i+1].start;
    }else{
      // Last node: find </g></g></g> after start (end of nodes section)
      endPos=svg.indexOf('</g></g></g>', positions[i].start);
      if(endPos<0) endPos=svg.length;
    }
    var content=svg.substring(positions[i].start, endPos);
    var id=positions[i].id,tx=positions[i].tx,ty=positions[i].ty;

    // Parse box dimensions from the label-container path: M-W -H L W -H L W H L -W H
    var boxM=content.match(/path d="M(-?[\d.]+)\s+(-?[\d.]+)\s+L(-?[\d.]+)\s+(-?[\d.]+)\s+L(-?[\d.]+)\s+(-?[\d.]+)\s+L(-?[\d.]+)\s+(-?[\d.]+)"/);
    var w=200,h=100;
    if(boxM){w=Math.abs(parseFloat(boxM[3]));h=Math.abs(parseFloat(boxM[2]));}

    // Parse class title from label-group with font-weight:bolder
    var titleM=content.match(/class="label[^"]*"[^>]*style="font-weight:\s*bolder"[^>]*>[\s\S]*?<p>([^<]+)<\/p>/);
    var annM=content.match(/class="annotation-group[^"]*"[^>]*>\s*<g class="label"[^>]*>[\s\S]*?<p>([^<]+)<\/p>/);
    var annotation=annM?annM[1]:null;
    var title=titleM?titleM[1]:(id.match(/classId-([^-]+(?:-[^-]+)*)-\d+/)||['',''])[1];

    // Parse members
    var members=[];
    var memG=content.match(/class="members-group[^"]*"[^>]*>([\s\S]*?)<\/g>\s*(?=<g\s+class="methods-group|<g\s+class="divider|$)/);
    if(memG){
      var memRe=/<p>([^<]+)<\/p>/g;
      var mm;
      while((mm=memRe.exec(memG[1]))!==null)members.push(mm[1]);
    }

    // Parse methods
    var methods=[];
    var metG=content.match(/class="methods-group[^"]*"[^>]*>([\s\S]*?)<\/g>\s*(?=<g\s+class="divider|$)/);
    if(metG){
      var metRe=/<p>([^<]+)<\/p>/g;
      var mm2;
      while((mm2=metRe.exec(metG[1]))!==null)methods.push(mm2[1]);
    }

    // Parse divider positions (relative to node center)
    var dividers=[];
    var divRe=/<g\s+class="divider"[^>]*>[\s\S]*?<path\s+d="M(-?[\d.]+)\s+(-?[\d.]+)/g;
    var dm;
    while((dm=divRe.exec(content))!==null){
      dividers.push(parseFloat(dm[2]));
    }

    // Extract node name from id: classId-NAME-NUM
    var nameM=id.match(/classId-([^-]+(?:-[^-]+)*)-\d+$/);
    var name=nameM?nameM[1]:title;

    nodes.push({id:id,x:tx,y:ty,w:w,h:h,title:title,members:members,methods:methods,dividers:dividers,name:name,annotation:annotation});
  }
  return nodes;
}


function parseClassNotes(svg){
  var notes=[];
  var noteRe=/<g\s+class="node undefined"\s+id="(note\d+)"\s+transform="translate\(([^,]+),([^)]+)\)">([\s\S]*?)<\/g>\s*<\/g>/g;
  var m;
  while((m=noteRe.exec(svg))!==null){
    var id=m[1],nx=parseFloat(m[2]),ny=parseFloat(m[3]),content=m[4];
    // Parse box dimensions from path
    var boxM=content.match(/path d="M(-?[\d.]+)\s+(-?[\d.]+)\s+L(-?[\d.]+)\s+(-?[\d.]+)\s+L(-?[\d.]+)\s+(-?[\d.]+)\s+L(-?[\d.]+)\s+(-?[\d.]+)"/);
    var w=200,h=36;
    if(boxM){w=Math.abs(parseFloat(boxM[3]))*2;h=Math.abs(parseFloat(boxM[8]))*2;}
    // Parse text content
    var textM=content.match(/<p>([^<]+)<\/p>/);
    var text=textM?textM[1]:'';
    // Parse foreignObject for text dimensions
    var foM=content.match(/foreignObject width="([\d.]+)" height="([\d.]+)"/);
    var textW=foM?parseFloat(foM[1]):w-20;
    var textH=foM?parseFloat(foM[2]):24;
    notes.push({id:id,x:nx,y:ny,w:w,h:h,text:text,textW:textW,textH:textH});
  }
  return notes;
}

function parseClassEdges(svg){
  var edges=[];
  // Parse regular edges (id_*) and note edges (edgeNote*)
  var eR=/<path\s+d="([^"]+)"\s+id="(id_[^"]+|edgeNote\d+)"([^>]*)>/g;
  var m;
  while((m=eR.exec(svg))!==null){
    var d=m[1],id=m[2],attrs=m[3]||'';
    var msM=attrs.match(/marker-start="url\(#container_class-(\w+)Start\)"/);
    var meM=attrs.match(/marker-end="url\(#container_class-(\w+)End\)"/);
    var markerStart=msM?msM[1]:null;
    var markerEnd=meM?meM[1]:null;
    // Extract first M point and last L point
    var startM=d.match(/^M([\d.]+),([\d.]+)/);
    var endM=d.match(/L([\d.]+),([\d.]+)$/);
    var sx2=startM?parseFloat(startM[1]):0;
    var sy2=startM?parseFloat(startM[2]):0;
    var ex2=endM?parseFloat(endM[1]):sx2;
    var ey2=endM?parseFloat(endM[2]):sy2;
    
    // Extract edge id parts: id_Source_Target_N
    var idParts=id.match(/id_([^_]+)_([^_]+)_(\d+)/);
    var source=idParts?idParts[1]:'';
    var target=idParts?idParts[2]:'';
    
    edges.push({d:d,x1:sx2,y1:sy2,x2:ex2,y2:ey2,markerStart:markerStart,markerEnd:markerEnd,id:id,source:source,target:target,label:'',lx:0,ly:0,_srcNode:null,_tgtNode:null});
  }
  
  // Parse edge labels
  var lR=/<g\s+class="edgeLabel"\s+transform="translate\(([^,]+),([^)]+)\)">[\s\S]*?data-id="(id_[^"]+)"[\s\S]*?<p>([^<]+)<\/p>/g;
  var lm;
  while((lm=lR.exec(svg))!==null){
    var lx=parseFloat(lm[1]),ly=parseFloat(lm[2]),lid=lm[3],lbl=lm[4];
    for(var i=0;i<edges.length;i++)if(edges[i].id===lid){edges[i].label=lbl;edges[i].lx=lx;edges[i].ly=ly;break;}
  }
  
  return edges;
}

function drawClassNode(c,node,sc,sx,sy,swf){
  var bx=sx(node.x-node.w),by=sy(node.y-node.h),bw=swf(node.w*2),bh=swf(node.h*2);
  var r=6*sc;
  
  // Shadow
  c.fillStyle='rgba(106,120,240,0.08)';
  rr(c,bx+2*sc,by+3*sc,bw,bh,r);c.fill();
  
  // Box background (with optional per-node color override)
  var nodeColorOverride=nodeColors[node.name.toLowerCase()]||nodeColors[node.title.toLowerCase()];
  c.fillStyle=nodeColorOverride||ASP.nodeBg;
  c.strokeStyle=ASP.nodeBorder;
  c.lineWidth=1.5*sc;
  rr(c,bx,by,bw,bh,r);c.fill();c.stroke();
  
  // Title bar (top section before first divider)
  var divY1=node.dividers.length>0?sy(node.y+node.dividers[0]):by+sw(48);
  var titleH=divY1-by;
  c.save();
  rr(c,bx,by,bw,titleH,r);
  c.clip();
  // Clip to top rounded corners only
  c.fillStyle=ASP.nodeBorder;
  c.globalAlpha=0.12;
  c.fillRect(bx,by,bw,titleH);
  c.globalAlpha=1;
  c.restore();
  
  // Annotation (stereotype like «abstract»)
  if(node.annotation){
    c.font='italic '+fsz(10)+'px Arial,sans-serif';
    c.fillStyle=ASP.nodeBorder;
    c.globalAlpha=0.7;
    c.textAlign='center';c.textBaseline='middle';
    c.fillText(node.annotation,bx+bw/2,by+titleH/2-fsz(14));
    c.globalAlpha=1;
  }
  // Title text
  var titleFont='bold '+fsz(15)+'px Arial,sans-serif';
  c.font=titleFont;
  c.fillStyle=ASP.titleText;
  c.textAlign='center';
  c.textBaseline='middle';
  var titleY=by+titleH/2+(node.annotation?fsz(8):0);
  
  // Check for icon
  var icon=nodeIcons[node.name.toLowerCase()]||nodeIcons[node.title.toLowerCase()];
  if(icon&&typeof drawSeqIcon==='function'){
    var isz=24*sc;
    var tw=c.measureText(node.title).width;
    var gap=8*sc;
    var totalW=isz+gap+tw;
    var iconCx=bx+(bw-totalW)/2+isz/2;
    var textCx=bx+(bw-totalW)/2+isz+gap+tw/2;
    var iconAccent=nodeIconAccents[node.name.toLowerCase()]||nodeIconAccents[node.title.toLowerCase()]||ASP.accent;
    drawSeqIcon(c,icon,iconCx,titleY,isz,ASP.titleText,iconAccent);
    c.font=titleFont;
    c.fillStyle=ASP.titleText;
    c.fillText(node.title,textCx,titleY);
  }else{
    c.fillText(node.title,bx+bw/2,titleY);
  }
  
  // Dividers
  for(var di=0;di<node.dividers.length;di++){
    var dy=sy(node.y+node.dividers[di]);
    c.strokeStyle=ASP.dividerColor;
    c.lineWidth=1*sc;
    c.globalAlpha=0.5;
    c.beginPath();
    c.moveTo(bx+2*sc,dy);
    c.lineTo(bx+bw-2*sc,dy);
    c.stroke();
    c.globalAlpha=1;
  }
  
  // Members (between first divider and second divider, or between title divider and methods divider)
  var memFont=fsz(12)+'px Arial,sans-serif';
  c.font=memFont;
  c.fillStyle=ASP.memberText;
  c.textAlign='left';
  c.textBaseline='middle';
  
  // Calculate member area Y range
  var memStartY=node.dividers.length>0?node.dividers[0]:-48;
  var memEndY=node.dividers.length>1?node.dividers[1]:0;
  var memY=memStartY+12;
  for(var mi=0;mi<node.members.length;mi++){
    var txt=node.members[mi];
    txt=txt.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
    c.fillText(txt,bx+10*sc,sy(node.y+memY));
    memY+=24;
  }
  
  // Methods (after second divider)
  var metStartY=node.dividers.length>1?node.dividers[1]:0;
  var metY=metStartY+12;
  for(var mi2=0;mi2<node.methods.length;mi2++){
    var txt2=node.methods[mi2];
    txt2=txt2.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
    c.font=fsz(12)+'px Arial,sans-serif';
    c.fillStyle=ASP.methodText;
    c.fillText(txt2,bx+10*sc,sy(node.y+metY));
    metY+=24;
  }
}

function drawClassEdge(c,edge,sc,sx,sy){drawClassEdgePath(c,edge,sc,sx,sy);drawClassEdgeMarkers(c,edge,sc,sx,sy);}
  function drawClassEdgePath(c,edge,sc,sx,sy){
  // Compute marker sizes for path shortening
  var startMarkerLen=0,endMarkerLen=0;
  if(edge.markerStart==='composition'||edge.markerStart==='aggregation') startMarkerLen=24*sc;
    if(edge.markerStart==='extension') startMarkerLen=15*sc; // triangle length
  if(edge.markerEnd==='extension') endMarkerLen=15*sc; // triangle length
  else if(edge.markerEnd) endMarkerLen=10*sc; // arrowhead length
  
  // Draw the edge path (shortened to make room for markers)
  c.strokeStyle=ASP.edgeColor;
  c.lineWidth=1.5*sc;
  c.setLineDash([]);
  c.beginPath();
  // Parse all path commands: M, L, C (approximate curves with line segments)
  var cmdRe=/([MLC])\s*([\d.]+)\s*,?\s*([\d.]+)(?:\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)(?:\s*,?\s*([\d.]+)\s*,?\s*([\d.]+))?)?/g;
  var cmd;
  var lastX=0,lastY=0;
  var started=false;
  // We will draw the path but skip the first startMarkerLen and last endMarkerLen pixels
  // Simpler: compute total path length, then clip start and end
  // Even simpler: just start the path offset from the box by marker length
  var pStartX=sx(edge.x1),pStartY=sy(edge.y1);
  var pEndX=sx(edge.x2),pEndY=sy(edge.y2);
  
  while((cmd=cmdRe.exec(edge.d))!==null){
    var ct=cmd[1];
    if(ct==='M'){
      lastX=sx(parseFloat(cmd[2]));lastY=sy(parseFloat(cmd[3]));
      // Offset start by marker length in path direction
      if(edge.markerStart){
        // We need direction first - will compute after. For now, just moveTo
        c.moveTo(lastX,lastY);
      }else{
        c.moveTo(lastX,lastY);
      }
      started=true;
    }else if(ct==='L'){
      var lx3=sx(parseFloat(cmd[2])),ly3=sy(parseFloat(cmd[3]));
      if(started)c.lineTo(lx3,ly3);
      lastX=lx3;lastY=ly3;
    }else if(ct==='C'){
      var cx1=sx(parseFloat(cmd[2])),cy1=sy(parseFloat(cmd[3]));
      var cx2=sx(parseFloat(cmd[4])),cy2=sy(parseFloat(cmd[5]));
      var ex2p=sx(parseFloat(cmd[6])),ey2p=sy(parseFloat(cmd[7]));
      for(var t=0;t<=1;t+=0.125){
        var mt=1-t;
        var bx=mt*mt*mt*lastX+3*mt*mt*t*cx1+3*mt*t*t*cx2+t*t*t*ex2p;
        var by=mt*mt*mt*lastY+3*mt*mt*t*cy1+3*mt*t*t*cy2+t*t*t*ey2p;
        if(started)c.lineTo(bx,by);
      }
      lastX=ex2p;lastY=ey2p;
    }
  }
  c.stroke();
  }
  
  function drawClassEdgeMarkers(c,edge,sc,sx,sy){
  // Compute direction at start and end using proper Bezier tangent
  // Parse full path: M, L, C commands
  var cmdRe2=/([MLC])\s*([\d.]+)\s*,?\s*([\d.]+)(?:\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)(?:\s*,?\s*([\d.]+)\s*,?\s*([\d.]+))?)?/g;
  var cmd2;
  var pLastX=0,pLastY=0;
  var lastCtrl2X=0,lastCtrl2Y=0,hasLastCtrl2=false;
  var firstCtrl1X=0,firstCtrl1Y=0,hasFirstCtrl1=false;
  var firstPX=0,firstPY=0,hasFirstP=false;
  var secondPX=0,secondPY=0,hasSecondP=false;
  var lastPX=0,lastPY=0;
  var prevToLastPX=0,prevToLastPY=0;
  var pointCount=0;
  
  while((cmd2=cmdRe2.exec(edge.d))!==null){
    var ct2=cmd2[1];
    if(ct2==='M'){
      pLastX=parseFloat(cmd2[2]);pLastY=parseFloat(cmd2[3]);
      if(!hasFirstP){firstPX=pLastX;firstPY=pLastY;hasFirstP=true;}
      pointCount++;
      if(pointCount===2){secondPX=pLastX;secondPY=pLastY;hasSecondP=true;}
      prevToLastPX=lastPX;prevToLastPY=lastPY;
      lastPX=pLastX;lastPY=pLastY;
      hasLastCtrl2=false;
    }else if(ct2==='L'){
      pLastX=parseFloat(cmd2[2]);pLastY=parseFloat(cmd2[3]);
      pointCount++;
      if(pointCount===2){secondPX=pLastX;secondPY=pLastY;hasSecondP=true;}
      prevToLastPX=lastPX;prevToLastPY=lastPY;
      lastPX=pLastX;lastPY=pLastY;
      hasLastCtrl2=false;
    }else if(ct2==='C'){
      var ccx1=parseFloat(cmd2[2]),ccy1=parseFloat(cmd2[3]);
      var ccx2=parseFloat(cmd2[4]),ccy2=parseFloat(cmd2[5]);
      var cex=parseFloat(cmd2[6]),cey=parseFloat(cmd2[7]);
      if(!hasFirstCtrl1){firstCtrl1X=ccx1;firstCtrl1Y=ccy1;hasFirstCtrl1=true;}
      // Sample curve points for fallback direction
      for(var tt=0;tt<=1;tt+=0.05){
        var mt2=1-tt;
        var sbx=mt2*mt2*mt2*pLastX+3*mt2*mt2*tt*ccx1+3*mt2*tt*tt*ccx2+tt*tt*tt*cex;
        var sby=mt2*mt2*mt2*pLastY+3*mt2*mt2*tt*ccy1+3*mt2*tt*tt*ccy2+tt*tt*tt*cey;
        pointCount++;
        if(pointCount===2){secondPX=sbx;secondPY=sby;hasSecondP=true;}
        prevToLastPX=lastPX;prevToLastPY=lastPY;
        lastPX=sbx;lastPY=sby;
      }
      // Store last control point 2 for tangent computation
      lastCtrl2X=ccx2;lastCtrl2Y=ccy2;hasLastCtrl2=true;
      pLastX=cex;pLastY=cey;
    }
  }
  
  // END direction: if last segment was C, tangent = endPoint - controlPoint2
  // Otherwise tangent = lastPoint - prevToLastPoint
  var endDx,endDy;
  if(hasLastCtrl2){
    endDx=lastPX-lastCtrl2X;
    endDy=lastPY-lastCtrl2Y;
  }else{
    endDx=lastPX-prevToLastPX;
    endDy=lastPY-prevToLastPY;
  }
  var eln=Math.sqrt(endDx*endDx+endDy*endDy);
  if(eln>0){endDx/=eln;endDy/=eln;}else{endDx=edge.x2-edge.x1;endDy=edge.y2-edge.y1;var eln2=Math.sqrt(endDx*endDx+endDy*endDy);if(eln2>0){endDx/=eln2;endDy/=eln2;}else{endDx=1;endDy=0;}}
  
  // START direction: if first segment was C, tangent = controlPoint1 - startPoint
  // Otherwise tangent = secondPoint - firstPoint
  var startDx,startDy;
  if(hasFirstCtrl1){
    startDx=firstCtrl1X-firstPX;
    startDy=firstCtrl1Y-firstPY;
  }else if(hasSecondP){
    startDx=secondPX-firstPX;
    startDy=secondPY-firstPY;
  }else{
    startDx=edge.x2-edge.x1;
    startDy=edge.y2-edge.y1;
  }
  var sln=Math.sqrt(startDx*startDx+startDy*startDy);
  if(sln>0){startDx/=sln;startDy/=sln;}else{startDx=1;startDy=0;}
  
  // Draw marker at START (composition or aggregation diamond)
  if(edge.markerStart){
    // Path start is offset from box edge by Mermaid's marker space (~18px)
    // Extend diamond tip backward to touch the box
    var extendBy=18*sc;
    var sx0=sx(edge.x1)-startDx*extendBy,sy0=sy(edge.y1)-startDy*extendBy;
    var ds=16*sc; // diamond size
    c.fillStyle=ASP.edgeColor;
    if(edge.markerStart==='composition'){
      // Filled diamond
      c.beginPath();
      c.moveTo(sx0,sy0);
      c.lineTo(sx0+ds*startDx+ds*0.5*startDy,sy0+ds*startDy-ds*0.5*startDx);
      c.lineTo(sx0+ds*2*startDx,sy0+ds*2*startDy);
      c.lineTo(sx0+ds*startDx-ds*0.5*startDy,sy0+ds*startDy+ds*0.5*startDx);
      c.closePath();
      c.fill();
      c.strokeStyle=ASP.titleText;
      c.lineWidth=2*sc;
      c.stroke();
    }else if(edge.markerStart==='aggregation'){
      // Hollow diamond
      c.fillStyle=ASP.bg;
      c.beginPath();
      c.moveTo(sx0,sy0);
      c.lineTo(sx0+ds*startDx+ds*0.5*startDy,sy0+ds*startDy-ds*0.5*startDx);
      c.lineTo(sx0+ds*2*startDx,sy0+ds*2*startDy);
      c.lineTo(sx0+ds*startDx-ds*0.5*startDy,sy0+ds*startDy+ds*0.5*startDx);
      c.closePath();
      c.fill();
      c.strokeStyle=ASP.titleText;
      c.lineWidth=2.5*sc;
      c.stroke();
    }else if(edge.markerStart==='extension'){
      // Hollow triangle at start (inheritance: parent is at start side)
      var triSize=14*sc;
      var startExtend=18*sc;
      var tsx=sx(edge.x1)-startDx*startExtend,tsy=sy(edge.y1)-startDy*startExtend;
      c.fillStyle=ASP.bg;
      c.beginPath();
      c.moveTo(tsx,tsy);
      c.lineTo(tsx+triSize*1.5*startDx-triSize*0.7*startDy,tsy+triSize*1.5*startDy+triSize*0.7*startDx);
      c.lineTo(tsx+triSize*1.5*startDx+triSize*0.7*startDy,tsy+triSize*1.5*startDy-triSize*0.7*startDx);
      c.closePath();
      c.fill();
      c.strokeStyle=ASP.titleText;
      c.lineWidth=2.5*sc;
      c.stroke();
    }
  }
  
  // Draw marker at END (arrowhead type depends on marker type)
  // Path end is offset from box edge by Mermaid's marker space
  // Only extend for extension (inheritance) markers which have bigger gap
  // Dependency arrowheads are already close to the box, don't extend them
  var endExtend=0;
  if(edge.markerEnd==='extension') endExtend=15*sc;
  var ex=sx(edge.x2)+endDx*endExtend,ey=sy(edge.y2)+endDy*endExtend;
  var ah=14*sc;
  c.fillStyle=ASP.edgeColor;
  if(edge.markerEnd==='extension'){
    // Hollow triangle (inheritance)
    c.fillStyle=ASP.bg;
    c.beginPath();
    c.moveTo(ex,ey);
    c.lineTo(ex-ah*1.5*endDx+ah*0.7*endDy,ey-ah*1.5*endDy-ah*0.7*endDx);
    c.lineTo(ex-ah*1.5*endDx-ah*0.7*endDy,ey-ah*1.5*endDy+ah*0.7*endDx);
    c.closePath();
    c.fill();
    c.strokeStyle=ASP.titleText;
    c.lineWidth=2.5*sc;
    c.stroke();
  }else if(edge.markerEnd==='dependency'){
    // Open arrowhead (V shape) - cleaner proportions
    var aw=ah*1.2; // arrow width
    c.beginPath();
    c.moveTo(ex,ey);
    c.lineTo(ex-ah*endDx+aw*0.5*endDy,ey-ah*endDy-aw*0.5*endDx);
    c.lineTo(ex-ah*endDx*0.6,ey-ah*endDy*0.6);
    c.lineTo(ex-ah*endDx-aw*0.5*endDy,ey-ah*endDy+aw*0.5*endDx);
    c.closePath();
    c.fill();
  }else if(edge.markerEnd==='composition'){
    // Filled diamond at end
    c.beginPath();
    c.moveTo(ex,ey);
    c.lineTo(ex-ds*endDx+ds*0.5*endDy,ey-ds*endDy-ds*0.5*endDx);
    c.lineTo(ex-ds*2*endDx,ey-ds*2*endDy);
    c.lineTo(ex-ds*endDx-ds*0.5*endDy,ey-ds*endDy+ds*0.5*endDx);
    c.closePath();
    c.fill();
    c.stroke();
  }else if(edge.markerEnd==='aggregation'){
    // Hollow diamond at end
    c.fillStyle=ASP.bg;
    c.beginPath();
    c.moveTo(ex,ey);
    c.lineTo(ex-ds*endDx+ds*0.5*endDy,ey-ds*endDy-ds*0.5*endDx);
    c.lineTo(ex-ds*2*endDx,ey-ds*2*endDy);
    c.lineTo(ex-ds*endDx-ds*0.5*endDy,ey-ds*endDy+ds*0.5*endDx);
    c.closePath();
    c.fill();
    c.stroke();
  }
  
  // Draw edge label
  if(edge.label){
    c.font=fsz(11)+'px Arial,sans-serif';
    var tw=c.measureText(edge.label).width;
    var lx=sx(edge.lx),ly=sy(edge.ly);
    var padX=6*sc,padY=3*sc;
    c.fillStyle=ASP.edgeLabelBg;
    rr(c,lx-tw/2-padX,ly-10*sc-padY,tw+padX*2,20*sc+padY*2,4*sc);
    c.fill();
    c.strokeStyle=ASP.nodeBorder;
    c.globalAlpha=0.3;
    c.lineWidth=1*sc;
    c.stroke();
    c.globalAlpha=1;
    c.fillStyle=ASP.edgeLabelText;
    c.textAlign='center';
    c.textBaseline='middle';
    c.fillText(edge.label,lx,ly);
  }
}


function drawClassNote(c,note,sc,sx,sy){
  var nx=sx(note.x),ny=sy(note.y);
  var nw=note.w*sc,nh=note.h*sc;
  var pad=10*sc;
  var foldSize=10*sc;
  var r=4*sc;
  // Subtle shadow
  c.fillStyle='rgba(0,0,0,0.08)';
  rr(c,nx-nw/2+2*sc,ny-nh/2+2*sc,nw,nh,r);
  c.fill();
  // Note background (warm yellow)
  c.fillStyle='#FFF9C4';
  c.strokeStyle='#E6CE5C';
  c.lineWidth=1.5*sc;
  c.beginPath();
  // Rounded rect with folded corner (top-right)
  c.moveTo(nx-nw/2+r,ny-nh/2);
  c.lineTo(nx+nw/2-foldSize,ny-nh/2);
  // Folded corner
  c.lineTo(nx+nw/2,ny-nh/2+foldSize);
  c.lineTo(nx+nw/2,ny+nh/2-r);
  c.quadraticCurveTo(nx+nw/2,ny+nh/2,nx+nw/2-r,ny+nh/2);
  c.lineTo(nx-nw/2+r,ny+nh/2);
  c.quadraticCurveTo(nx-nw/2,ny+nh/2,nx-nw/2,ny+nh/2-r);
  c.lineTo(nx-nw/2,ny-nh/2+r);
  c.quadraticCurveTo(nx-nw/2,ny-nh/2,nx-nw/2+r,ny-nh/2);
  c.closePath();
  c.fill();
  c.stroke();
  // Fold triangle (slightly darker)
  c.beginPath();
  c.moveTo(nx+nw/2-foldSize,ny-nh/2);
  c.lineTo(nx+nw/2-foldSize,ny-nh/2+foldSize);
  c.lineTo(nx+nw/2,ny-nh/2+foldSize);
  c.closePath();
  c.fillStyle='#F0E0A0';
  c.fill();
  c.strokeStyle='#D4B85A';
  c.lineWidth=1*sc;
  c.stroke();
  // Text (handle \n line breaks)
  c.fillStyle='#5D4E1A';
  c.font=fsz(13)+'px Arial,sans-serif';
  c.textAlign='center';
  c.textBaseline='middle';
  var lines=note.text.split('\\n');
  var lineH=18*sc;
  var startY=ny-((lines.length-1)*lineH)/2;
  for(var li=0;li<lines.length;li++){
    c.fillText(lines[li],nx,startY+li*lineH);
  }
}

async function main(files){
  const{createCanvas}=require('canvas');
  var svg=files[0].data.toString('utf8');
  if(!svg)throw new Error('No SVG');
  if(files[1])applyClassStyle(parseClassStyleJson(files[1].data));
  var wm=svg.match(/width="([\d.]+)"/),hm=svg.match(/height="([\d.]+)"/);
  var W0=wm?+wm[1]:800,H0=hm?+hm[1]:600,sc=scOverride||4,pad=30;
  _sc=sc;
  var W=Math.round(W0*sc+pad*2),H=Math.round(H0*sc+pad*2);
  var cv=createCanvas(W,H),ctx=cv.getContext('2d');
  function sx(v){return v*sc+pad;}
  function sy(v){return v*sc+pad;}
  function sw(v){return v*sc;}
  
  // Background
  ctx.fillStyle=ASP.bg;
  ctx.fillRect(0,0,W,H);
  
  var nodes=parseClassNodes(svg);
  var edges=parseClassEdges(svg);
  // Link edges to their source/target nodes for marker positioning
  var nodeMap={};for(var ni=0;ni<nodes.length;ni++)nodeMap[nodes[ni].name]=nodes[ni];
  for(var ei=0;ei<edges.length;ei++){if(edges[ei].source&&nodeMap[edges[ei].source])edges[ei]._srcNode=nodeMap[edges[ei].source];if(edges[ei].target&&nodeMap[edges[ei].target])edges[ei]._tgtNode=nodeMap[edges[ei].target];}
  
  // Draw edges first (behind nodes)
  for(var i=0;i<edges.length;i++){
    // Skip note edges - draw them separately after nodes
    if(edges[i].id.indexOf('edgeNote')>=0) continue;
    drawClassEdgePath(ctx,edges[i],sc,sx,sy);
  }
  // Draw nodes on top
  for(var j=0;j<nodes.length;j++)drawClassNode(ctx,nodes[j],sc,sx,sy,sw);
  // Draw edge markers on top of nodes (so triangles/diamonds are visible)
  for(var k=0;k<edges.length;k++){
    if(edges[k].id.indexOf('edgeNote')>=0) continue;
    drawClassEdgeMarkers(ctx,edges[k],sc,sx,sy);
  }
  // Draw note connection lines (dotted) then notes on top
  var notes=parseClassNotes(svg);
  // Draw note edges as dotted lines
  for(var ne=0;ne<edges.length;ne++){
    if(edges[ne].id.indexOf('edgeNote')<0) continue;
    var e=edges[ne];
    ctx.strokeStyle=ASP.edgeColor;
    ctx.lineWidth=1*sc;
    ctx.setLineDash([2*sc,2*sc]);
    ctx.beginPath();
    ctx.moveTo(sx(e.x1),sy(e.y1));
    // Draw curve if present
    var pts=e.d.match(/[MC]\s*[\d.]+\s*,?\s*[\d.]+/g);
    if(pts){
      for(var pi=1;pi<pts.length;pi++){
        var pm=pts[pi].match(/[\d.]+/g);
        if(pm) ctx.lineTo(sx(parseFloat(pm[0])),sy(parseFloat(pm[1])));
      }
    }
    ctx.lineTo(sx(e.x2),sy(e.y2));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for(var k=0;k<notes.length;k++)drawClassNote(ctx,notes[k],sc,sx,sy);
  
  return cv.toBuffer('image/png');
}