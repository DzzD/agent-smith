/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { OpenApiSkill } from '../ext/OpenApiSkill.js';

export class OpenApiKrokiSkill extends OpenApiSkill
{
  constructor()
  {
    super({
      id: 'kroki',
      specUrl: 'https://kroki.io/openapi.yml',
      apiBaseUrl: 'https://kroki.io',
      description: 'API for rendering textual diagrams into images. It can render diagrams such as PlantUML, Mermaid, GraphViz, BPMN, Ditaa, BlockDiag, SeqDiag, ActDiag, C4PlantUML, Excalidraw, Erd, Nomnoml, Pikchr, Structurizr, SvgBob, Vega, Vega-Lite, WaveDrom, and others. Use it when a user asks to create, render, convert, or visualize a diagram.',
    });
  }

  get usage()
  {
    return [
      super.usage ?? '',
      '- Use this skill for diagram rendering operations.',
      '- Use this skill when the user asks to create, render, convert, or visualize a diagram.',
      '- Kroki converts textual diagram source into image formats such as SVG or PNG.',
      '- Prefer SVG when the user wants editable, readable, or document-friendly output.',
      '- Prefer PNG when the user wants a directly viewable image preview.',
      '- Do not use TempFileManagerSkill to generate diagrams directly.',
      '- TempFileManagerSkill may only be used to store source files or generated output files.',
      '- Before rendering, identify the diagram type: mermaid, plantuml, graphviz, bpmn, ditaa, blockdiag, seqdiag, actdiag, c4plantuml, erd, nomnoml, pikchr, structurizr, svgbob, vega, vegalite, wavedrom, or another supported type.',
      '- For Mermaid state diagrams, the source should start with "stateDiagram-v2".',
      '- For Mermaid flowcharts, the source should usually start with "flowchart TD", "flowchart LR", "graph TD", or "graph LR".',
      '- For PlantUML diagrams, the source should usually start with "@startuml" and end with "@enduml".',
      '- For GraphViz diagrams, the source should usually start with "digraph" or "graph".',
      '- To find an endpoint, use concrete keywords only.',
      '- Good endpoint search keywords: mermaid, plantuml, graphviz, svg, png, diagram, render, convert.',
      '- Bad endpoint search keywords: make diagram, create image, draw something.',
      '- If endpoint search returns too many results, retry with one concrete keyword such as mermaid, plantuml, graphviz, svg, or png.',
      '- Never claim that a diagram was generated unless the rendering endpoint succeeded and produced an output file.',
      '- Always store the generated diagram with a meaningful file extension matching the output format, such as .svg or .png.',
      'Examples of known endpoints among many others:',
      '- Render Mermaid diagram as SVG: /mermaid/svg',
      '- Render Mermaid diagram as PNG: /mermaid/png',
      '- Render PlantUML diagram as SVG: /plantuml/svg',
      '- Render PlantUML diagram as PNG: /plantuml/png',
      '- Render GraphViz diagram as SVG: /graphviz/svg',
      '- Render GraphViz diagram as PNG: /graphviz/png',
      '- These examples are not exhaustive. Use endpoint search to discover the best endpoint for the requested diagram type and output format.',
    ].filter(Boolean).join('\n');
  }
}
