/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { imageSize } from 'image-size';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  HeightRule,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlignSection,
  VerticalAlignTable,
  WidthType,
} from 'docx';

export class GenerateDocxSkill extends AgentSkill
{
  static MIME_TYPE =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  static THEME = {
    primary: '0038B8',
    secondary: '2E5C7A',
    accent: 'C46A2B',
    text: '202124',
    muted: '5F6368',
    border: 'D7DEE8',
    light: 'F5F8FC',
    white: 'FFFFFF',
    danger: 'B3261E',
    success: '188038',
    codeBackground: '1F2937',
    codeText: 'F9FAFB',
    codeMuted: 'CBD5E1',
    noteBackground: 'EEF4FF',
    ideaBackground: 'FFF4E5',
    warningBackground: 'FDECEA',
    successBackground: 'EAF5EE',
    quoteBackground: 'F4F4F5',
  };

  static PAGE = {
    width: 11906,
    height: 16838,
    margin: 700,
    contentWidth: 10506,
    contentHeight: 15438,
  };

  static FONTS = {
    body: 'DejaVu Sans',
    heading: 'DejaVu Sans',
    mono: 'DejaVu Sans Mono',
  };

  static FONT_SIZE = {
    body: 16,
    h1: 26,
    h2: 23,
    h3: 20,
    coverH1: 44,
    coverH2: 28,
    coverH3: 22,
    codeLanguage: 14,
    code: 16,
  };

  constructor({ theme = {} } = {})
  {
    super();

    this.theme = Object.fromEntries(
      Object.entries({
        ...GenerateDocxSkill.THEME,
        ...theme,
      }).map(([name, color]) => [name, this._normalizeHexColor(color)])
    );

    this.description =
      'Generates a styled DOCX document from an XML file.';

    this.tools = [
      {
        type: 'function',
        name: 'generate_docx',
        allowRepeat: true,
        description:
          'Generates a DOCX from an XML file stored in TempFileManagerSkill.',
        parameters: {
          type: 'object',
          properties: {
            sourceName: {
              type: 'string',
              description: 'Name of the XML source file.',
            },
          },
          required: ['sourceName'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
    generate_docx:
    - First create and edit an XML file with TempFileManagerSkill.
    - Then call generate_docx with its file name.
    - Root element: <document name="output.docx">.
    - Use send_matrix_file after generation.

    Blocks:
    - <cover>: cover block grouped into image and text zones.
    - <h1>, <h2>, <h3>: headings.
    - <p>: paragraph.
    - <image>: image from TempFileManagerSkill.
    - <table>, <tr>, <th>, <td>: table.
    - <code>: source code or commands.
    - <note>: highlighted note.
    - <quote>: citation.
    - <page-break />: manual page break.
    - No automatic page break is added after <cover>.

    Inline formatting:
    - <b>, <i>, <u>, <color value="..."> and <br />.
    - Use a named theme color with <color value="primary">text</color>.
    - Available text color names: primary, secondary, accent, text, muted, white, danger, success, codeText and codeMuted.
    - Background theme colors used automatically by their components: light, codeBackground, noteBackground, ideaBackground, warningBackground, successBackground and quoteBackground.
    - A direct hexadecimal color is accepted, for example <color value="#7C3AED">text</color>.
    - Theme colors configure the whole document style; prefer named colors over repeated hexadecimal values.

    Alignment:
    - h1, h2, h3, p and image accept align="left|center|right".
    - p also accepts align="justify".
    - Normal headings and paragraphs are left aligned by default.
    - Cover content and images are centered by default.
    - Use justify only for long narrative paragraphs.

    Images:
    - Without width or height, an image is never enlarged.
    - Large images are automatically reduced to fit the page.
    - Numeric width and height are expressed in pixels.
    - width="100%" fills the page width only if enlarge="true".
    - By default, images are never enlarged.
    - Prefer the natural image size.
    - Avoid width="100%" for logos, icons, small images and photographs.
    - Use width="100%" mainly for large diagrams.

    Notes:
    - <note> defaults to type="note".
    - Available types: note, idea, warning and success.
    - title is optional.
    - Override note colors with background="...", border-color="..." and title-color="...".
    - Example: <note background="#FFF3E0" border-color="#FF6600" title-color="#FF6600">...</note>.

    Tables:
    - Override table colors with border-color, header-background, header-color, row-background and alternate-row-background.
    - The default header background is primary; light is only the default alternating-row background.
    - Example: <table header-background="#FF6600" header-color="#FFFFFF" border-color="#FF6600">...</table>.

    Quotes:
    - <quote source="..."> accepts an optional source.
    - Override quote colors with background="...", border-color="..." and source-color="...".

    Code:
    - <code language="..."> preserves spaces and line breaks.
    - Override code colors with background="...", border-color="...", text-color="..." and language-color="...".
    - Escape XML characters with &lt;, &gt; and &amp;.

    Complete example:

    <document name="presentation-projet.docx">
      <cover>
        <image name="logo.png" />
        <h1>Présentation du projet</h1>
        <h2>Architecture et feuille de route</h2>
        <p>Direction des systèmes d’information<br />Juillet 2026</p>
      </cover>

      <h1>Contexte</h1>

      <p align="justify">
        Ce document présente <b>l’architecture cible</b>,
        les composants et les résultats attendus.
        Il contient du <i>texte en italique</i>,
        du <u>texte souligné</u> et une
        <color value="accent">mise en couleur</color>.
      </p>

      <note title="À retenir">
        Les images conservent leur ratio et ne sont pas agrandies
        sans demande explicite.
      </note>

      <h2>Architecture générale</h2>
      <image name="architecture.png" width="100%" />

      <h3>Configuration</h3>

      <code language="javascript">
    const config = {
      enabled: true,
      retries: 3,
    };

    if (config.enabled)
    {
      startApplication(config);
    }
      </code>

      <note type="idea" title="Idée">
        Générer automatiquement une table des matières.
      </note>

      <table>
        <tr>
          <th>Composant</th>
          <th>Rôle</th>
          <th>État</th>
        </tr>
        <tr>
          <td>API</td>
          <td>Expose les services applicatifs</td>
          <td><color value="success"><b>Disponible</b></color></td>
        </tr>
        <tr>
          <td>Base de données</td>
          <td>Stocke les documents</td>
          <td><color value="accent">En cours</color></td>
        </tr>
      </table>

      <note type="warning" title="Attention">
        Les fichiers référencés doivent exister dans TempFileManagerSkill.
      </note>

      <page-break />

      <h1>Exemple Mermaid</h1>

      <code language="mermaid">
    flowchart TD
      Start["Début"] --&gt; Check{"Valide ?"}
      Check --&gt;|Oui| End["Fin"]
      Check --&gt;|Non| Start
      </code>

      <quote source="Guide interne">
        Un bon diagramme répond à une question précise.
      </quote>

      <cover>
        <h1>Conclusion</h1>
        <p>Merci pour votre attention.</p>
      </cover>
    </document>

    Tool call:
    { "sourceName": "presentation-projet.xml" }`;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      generate_docx: '📄 generating DOCX document',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'generate_docx':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.sourceName, 64);
        break;
      }

      default:
      {
        break;
      }
    }

    if (!toolArgsReadable)
    {
      return toolNameReadable;
    }

    return `${toolNameReadable} ${toolArgsReadable}`;
  }

  get tempFileManagerSkill()
  {
    return this.agent.skills.get('TempFileManagerSkill');
  }

  async generate_docx({ sourceName }, context = {})
  {
    const normalizedSourceName = AgentUtils.normalizeRequiredString(
      sourceName,
      'XML source file name'
    );

    const sourceFile = await this.tempFileManagerSkill._getFile(normalizedSourceName, context.streamId, true, context);

    if (!sourceFile)
    {
      throw new Error(`XML source file not found: ${normalizedSourceName}`);
    }

    const source = this._readTextFile(sourceFile);
    const validation = XMLValidator.validate(source);

    if (validation !== true)
    {
      throw new Error(validation.err.msg);
    }

    const parser = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      attributeNamePrefix: '',
      trimValues: false,
      parseTagValue: false,
      parseAttributeValue: false,
    });

    const root = parser.parse(source).find((node) => node.document);

    if (!root)
    {
      throw new Error('Missing <document> root element');
    }

    const outputTempFileName = AgentUtils.ensureExtension(
      AgentUtils.normalizeRequiredString(
        root[':@']?.name,
        'document name'
      ),
      'docx'
    );

    const document = new Document({
      styles: this._createStyles(),
      sections: await this._createSections(root.document, context),
    });

    const buffer = await Packer.toBuffer(document);
    const files = this.tempFileManagerSkill;

    if ((await files.getFiles(context.streamId, context)).has(outputTempFileName))
    {
      await files.temp_file_remove({ tempFileName: outputTempFileName }, context);
    }

    await files.temp_file_create({
      tempFileName: outputTempFileName,
      mimeType: GenerateDocxSkill.MIME_TYPE,
    }, context);

    await files.appendBuffer({
      tempFileName: outputTempFileName,
      data: buffer,
    }, context);

    return {
      sourceName: normalizedSourceName,
      outputTempFileName,
      mimeType: GenerateDocxSkill.MIME_TYPE,
      size: buffer.length,
    };
  }

  _readTextFile(file)
  {
    if (Buffer.isBuffer(file.data) || file.data instanceof Uint8Array)
    {
      return Buffer.from(file.data).toString('utf8');
    }

    return String(file.data ?? '');
  }

  _font(name)
  {
    return {
      name,
      ascii: name,
      hAnsi: name,
      cs: name,
      eastAsia: name,
    };
  }

  _createStyles()
  {
    const theme = this.theme;
    const fonts = GenerateDocxSkill.FONTS;
    const fontSize = GenerateDocxSkill.FONT_SIZE;

    return {
      default: {
        document: {
          run: {
            font: this._font(fonts.body),
            size: fontSize.body,
            color: theme.text,
          },
          paragraph: {
            spacing: {
              after: 100,
              line: 260,
            },
          },
        },
      },
      paragraphStyles: [
        this._headingStyle(
          1,
          fontSize.h1,
          theme.primary,
          240,
          120,
          true
        ),
        this._headingStyle(
          2,
          fontSize.h2,
          theme.secondary,
          200,
          80
        ),
        this._headingStyle(
          3,
          fontSize.h3,
          theme.text,
          160,
          60
        ),
      ],
    };
  }

  _headingStyle(level, size, color, before, after, underline = false)
  {
    const paragraph = {
      keepNext: true,
      spacing: { before, after },
    };

    if (underline)
    {
      paragraph.border = {
        bottom: {
          color,
          style: BorderStyle.SINGLE,
          size: 10,
          space: 6,
        },
      };
    }

    return {
      id: `Heading${level}`,
      name: `Heading ${level}`,
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: {
        font: this._font(GenerateDocxSkill.FONTS.heading),
        size,
        bold: true,
        color,
      },
      paragraph,
    };
  }

  async _createSections(nodes = [], context = {})
  {
    const groups = [];
    let current = [];

    const flush = () =>
    {
      const blocks = this._cleanNodes(current);

      if (blocks.length)
      {
        groups.push({ cover: false, nodes: blocks });
      }

      current = [];
    };

    for (const node of nodes)
    {
      const tag = this._tag(node);

      if (tag === '#text')
      {
        if (node['#text']?.trim())
        {
          throw new Error('Text must be inside a document block');
        }

        continue;
      }

      if (tag !== 'cover')
      {
        current.push(node);
        continue;
      }

      flush();

      const coverNodes = this._cleanNodes(node.cover ?? []);

      if (!coverNodes.length)
      {
        throw new Error('A <cover> block cannot be empty');
      }

      groups.push({ cover: true, nodes: coverNodes });
    }

    flush();

    if (!groups.length)
    {
      throw new Error('The <document> element must contain at least one block');
    }

    return await Promise.all(groups.map(async (group, index) => ({
      properties: this._sectionProperties(group, index, groups),
      children: group.cover
        ? await this._createCoverBlocks(group.nodes, context)
        : await this._createBlocks(
            this._removePageBreakAfterCover(group.nodes, groups[index - 1]),
            false,
            context
          ),
    })));
  }

  _removePageBreakAfterCover(nodes, previousGroup)
  {
    if (previousGroup?.cover !== true || this._tag(nodes[0]) !== 'page-break')
    {
      return nodes;
    }

    return nodes.slice(1);
  }

  _sectionProperties(group, index, groups)
  {
    const previousGroup = groups[index - 1];

    const startsAfterCover =
      previousGroup?.cover === true &&
      group.cover === false;

    const page = GenerateDocxSkill.PAGE;

    return {
      ...(
        index && !startsAfterCover
          ? { type: SectionType.NEXT_PAGE }
          : {}
      ),
      verticalAlign: VerticalAlignSection.TOP,
      page: {
        size: {
          width: page.width,
          height: page.height,
        },
        margin: {
          top: page.margin,
          right: page.margin,
          bottom: page.margin,
          left: page.margin,
          header: 0,
          footer: 0,
          gutter: 0,
        },
      },
    };
  }

  _cleanNodes(nodes = [])
  {
    const cleanNodes = [];

    for (const node of nodes)
    {
      if (this._tag(node) !== '#text')
      {
        if (this._tag(node) !== 'page-break' || this._tag(cleanNodes.at(-1)) !== 'page-break')
        {
          cleanNodes.push(node);
        }

        continue;
      }

      if (node['#text']?.trim())
      {
        throw new Error('Text must be inside a block element');
      }
    }

    return cleanNodes;
  }

  async _createCoverBlocks(nodes, context = {})
  {
    const allowed = ['h1', 'h2', 'h3', 'p', 'image'];
    const imageNodes = [];
    const textNodes = [];

    for (const node of nodes)
    {
      const tag = this._tag(node);

      if (!allowed.includes(tag))
      {
        throw new Error(`Unsupported <cover> block: <${tag}>`);
      }

      if (tag === 'image')
      {
        imageNodes.push(node);
      }
      else
      {
        textNodes.push(node);
      }
    }

    const page = GenerateDocxSkill.PAGE;
    const none = this._noneBorder();
    const rows = [];

    if (imageNodes.length && textNodes.length)
    {
      const imageHeight = Math.floor(page.contentHeight * 0.62);
      const textHeight = page.contentHeight - imageHeight;

      rows.push(await this._coverRow(imageNodes, none, imageHeight, context));
      rows.push(await this._coverRow(textNodes, none, textHeight, context));
    }
    else
    {
      const zoneNodes = imageNodes.length
        ? imageNodes
        : textNodes;

      rows.push(await this._coverRow(
        zoneNodes,
        none,
        page.contentHeight,
        { ...context, coverImageOnly: imageNodes.length > 0 && textNodes.length === 0 }
      ));
    }

    return [
      new Table({
        width: {
          size: page.contentWidth,
          type: WidthType.DXA,
        },
        layout: TableLayoutType.FIXED,
        columnWidths: [page.contentWidth],
        margins: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
        borders: this._noBorders(none),
        rows,
      }),
    ];
  }

  async _coverRow(nodes, none, height, context = {})
  {
    return new TableRow({
      cantSplit: true,
      height: {
        value: height,
        rule: HeightRule.EXACT,
      },
      children: [
        await this._coverCell(nodes, none, height, context),
      ],
    });
  }

  async _coverCell(nodes, none, height, context = {})
  {
    return new TableCell({
      width: {
        size: GenerateDocxSkill.PAGE.contentWidth,
        type: WidthType.DXA,
      },
      verticalAlign: VerticalAlignTable.CENTER,
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
      borders: {
        top: none,
        bottom: none,
        left: none,
        right: none,
      },
      children: nodes.length
        ? await this._createBlocks(nodes, true, { ...context, coverCellHeight: height })
        : [new Paragraph({})],
    });
  }

  _noneBorder()
  {
    return {
      style: BorderStyle.NONE,
      size: 0,
      color: this.theme.white,
      space: 0,
    };
  }

  _noBorders(none)
  {
    return {
      top: none,
      bottom: none,
      left: none,
      right: none,
      insideHorizontal: none,
      insideVertical: none,
    };
  }

  async _createBlocks(nodes, cover, context = {})
  {
    const blocks = await Promise.all(nodes.map(async (node) =>
    {
      const tag = this._tag(node);
      const attributes = node[':@'] ?? {};

      if (cover && !['h1', 'h2', 'h3', 'p', 'image'].includes(tag))
      {
        throw new Error(`Unsupported <cover> block: <${tag}>`);
      }

      switch (tag)
      {
        case 'h1':
        case 'h2':
        case 'h3':
          return this._createHeading(
            Number(tag[1]),
            node[tag],
            attributes,
            cover
          );

        case 'p':
          return this._createParagraph(node.p, attributes, cover);

        case 'image':
          return await this._createImage(attributes, cover, context);

        case 'table':
          return [this._createTable(node.table, attributes), this._spacer()];

        case 'code':
          return [this._createCode(node.code, attributes), this._spacer()];

        case 'note':
          return [this._createNote(node.note, attributes), this._spacer()];

        case 'quote':
          return [this._createQuote(node.quote, attributes), this._spacer()];

        case 'page-break':
          return new Paragraph({ children: [new PageBreak()] });

        default:
          throw new Error(`Unsupported block XML element: <${tag}>`);
      }
    }));

    return blocks.flat();
  }

  _createHeading(level, nodes, attributes, cover)
  {
    if (!cover)
    {
      return new Paragraph({
        heading: this._headingLevel(level),
        alignment: this._alignment(attributes.align),
        children: this._createRuns(nodes),
      });
    }

    const fontSize = GenerateDocxSkill.FONT_SIZE;

    const styles = {
      1: {
        size: fontSize.coverH1,
        color: this.theme.primary,
        after: 160,
      },
      2: {
        size: fontSize.coverH2,
        color: this.theme.secondary,
        after: 120,
      },
      3: {
        size: fontSize.coverH3,
        color: this.theme.text,
        after: 80,
      },
    };

    const style = styles[level] ?? styles[1];

    return new Paragraph({
      alignment: this._alignment(
        attributes.align,
        AlignmentType.CENTER
      ),
      keepNext: true,
      spacing: {
        before: 0,
        after: style.after,
      },
      children: this._createRuns(nodes, {
        font: this._font(GenerateDocxSkill.FONTS.heading),
        size: style.size,
        bold: true,
        color: style.color,
      }),
    });
  }

  _createParagraph(nodes, attributes, cover)
  {
    return new Paragraph({
      alignment: this._alignment(
        attributes.align,
        cover ? AlignmentType.CENTER : undefined
      ),
      spacing: cover
        ? {
            before: 40,
            after: 0,
            line: 260,
          }
        : undefined,
      children: this._createRuns(
        nodes,
        cover
          ? {
              font: this._font(GenerateDocxSkill.FONTS.body),
              size: GenerateDocxSkill.FONT_SIZE.body,
              color: this.theme.muted,
            }
          : {
              font: this._font(GenerateDocxSkill.FONTS.body),
            }
      ),
    });
  }

  _createCode(nodes, attributes)
  {
    const theme = this.theme;
    const language = String(attributes.language ?? '').trim();
    const background = attributes.background ? this._color(attributes.background) : theme.codeBackground;
    const border = attributes['border-color'] ? this._color(attributes['border-color']) : background;
    const textColor = attributes['text-color'] ? this._color(attributes['text-color']) : theme.codeText;
    const languageColor = attributes['language-color'] ? this._color(attributes['language-color']) : theme.codeMuted;
    const paragraphs = [];

    if (language)
    {
      paragraphs.push(new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: language.toUpperCase(),
            font: this._font(GenerateDocxSkill.FONTS.mono),
            size: GenerateDocxSkill.FONT_SIZE.codeLanguage,
            bold: true,
            color: languageColor,
          }),
        ],
      }));
    }

    paragraphs.push(new Paragraph({
      spacing: {
        before: 0,
        after: 0,
        line: 240,
      },
      children: this._codeRuns(this._codeText(nodes), textColor),
    }));

    return this._panel(
      paragraphs,
      background,
      border,
      true
    );
  }

  _codeText(nodes)
  {
    let text = '';

    for (const node of nodes)
    {
      const tag = this._tag(node);

      if (tag === '#text')
      {
        text += String(node['#text']);
        continue;
      }

      if (tag === 'br')
      {
        text += '\n';
        continue;
      }

      throw new Error(`Unsupported element inside <code>: <${tag}>`);
    }

    const lines = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.replace(/\t/g, '    '));

    while (lines.length && !lines[0].trim())
    {
      lines.shift();
    }

    while (lines.length && !lines.at(-1).trim())
    {
      lines.pop();
    }

    const contentLines = lines.filter((line) => line.trim());

    if (!contentLines.length)
    {
      return '';
    }

    const indent = Math.min(
      ...contentLines.map((line) => line.match(/^ */)[0].length)
    );

    return lines
      .map((line) => line.slice(indent))
      .join('\n');
  }

  _codeRuns(code, color)
  {
    return code.split('\n').map((line, index) =>
      new TextRun({
        text: line || ' ',
        break: index ? 1 : undefined,
        font: this._font(GenerateDocxSkill.FONTS.mono),
        size: GenerateDocxSkill.FONT_SIZE.code,
        color,
      })
    );
  }

  _createNote(nodes, attributes)
  {
    const type = String(attributes.type ?? 'note').toLowerCase();

    const styles = {
      note: [
        'Note',
        this.theme.noteBackground,
        this.theme.primary,
      ],
      idea: [
        'Idée',
        this.theme.ideaBackground,
        this.theme.accent,
      ],
      warning: [
        'Attention',
        this.theme.warningBackground,
        this.theme.danger,
      ],
      success: [
        'Succès',
        this.theme.successBackground,
        this.theme.success,
      ],
    };

    if (!styles[type])
    {
      throw new Error(`Unsupported note type: ${type}`);
    }

    const [defaultTitle, defaultFill, defaultBorder] = styles[type];
    const fill = attributes.background ? this._color(attributes.background) : defaultFill;
    const border = attributes['border-color'] ? this._color(attributes['border-color']) : defaultBorder;
    const titleColor = attributes['title-color'] ? this._color(attributes['title-color']) : border;
    const title = String(attributes.title ?? defaultTitle).trim();
    const paragraphs = [];

    if (title)
    {
      paragraphs.push(new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: title,
            font: this._font(GenerateDocxSkill.FONTS.body),
            bold: true,
            color: titleColor,
          }),
        ],
      }));
    }

    paragraphs.push(new Paragraph({
      spacing: {
        after: 0,
        line: 260,
      },
      children: this._createRuns(nodes, {
        font: this._font(GenerateDocxSkill.FONTS.body),
      }),
    }));

    return this._panel(paragraphs, fill, border);
  }

  _createQuote(nodes, attributes)
  {
    const theme = this.theme;
    const source = String(attributes.source ?? '').trim();
    const background = attributes.background ? this._color(attributes.background) : theme.quoteBackground;
    const border = attributes['border-color'] ? this._color(attributes['border-color']) : theme.muted;
    const sourceColor = attributes['source-color'] ? this._color(attributes['source-color']) : theme.muted;

    const paragraphs = [
      new Paragraph({
        spacing: {
          after: source ? 80 : 0,
          line: 260,
        },
        children: this._createRuns(nodes, {
          font: this._font(GenerateDocxSkill.FONTS.body),
          italics: true,
        }),
      }),
    ];

    if (source)
    {
      paragraphs.push(new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
        children: [
          new TextRun({
            text: `— ${source}`,
            font: this._font(GenerateDocxSkill.FONTS.body),
            italics: true,
            color: sourceColor,
          }),
        ],
      }));
    }

    return this._panel(
      paragraphs,
      background,
      border
    );
  }

  _panel(children, fill, borderColor, fullBorder = false)
  {
    const none = {
      style: BorderStyle.NIL,
      size: 0,
      color: fill,
    };

    const line = {
      style: BorderStyle.SINGLE,
      size: fullBorder ? 6 : 18,
      color: borderColor,
    };

    const cellBorders = fullBorder
      ? {
          top: line,
          bottom: line,
          left: line,
          right: line,
        }
      : {
          top: none,
          bottom: none,
          right: none,
          left: line,
        };

    return new Table({
      width: {
        size: GenerateDocxSkill.PAGE.contentWidth,
        type: WidthType.DXA,
      },
      layout: TableLayoutType.FIXED,
      columnWidths: [
        GenerateDocxSkill.PAGE.contentWidth,
      ],
      borders: {
        top: fullBorder ? line : none,
        bottom: fullBorder ? line : none,
        left: fullBorder ? line : none,
        right: fullBorder ? line : none,
        insideHorizontal: none,
        insideVertical: none,
      },
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: {
                size: GenerateDocxSkill.PAGE.contentWidth,
                type: WidthType.DXA,
              },
              shading: {
                type: ShadingType.CLEAR,
                color: 'auto',
                fill,
              },
              margins: {
                top: 180,
                bottom: 180,
                left: 220,
                right: 220,
              },
              borders: cellBorders,
              children,
            }),
          ],
        }),
      ],
    });
  }

  _createRuns(nodes = [], style = {})
  {
    const defaultStyle = {
      font: this._font(GenerateDocxSkill.FONTS.body),
      ...style,
    };

    const runs = this._runOptions(nodes, defaultStyle);
    const texts = runs.filter(
      (run) => typeof run.text === 'string'
    );

    if (texts.length)
    {
      texts[0].text = texts[0].text.trimStart();
      texts.at(-1).text = texts.at(-1).text.trimEnd();
    }

    return runs
      .filter((run) => run.break || run.text)
      .map((run) => new TextRun(run));
  }

  _runOptions(nodes, style)
  {
    return nodes.flatMap((node) =>
    {
      const tag = this._tag(node);

      if (tag === '#text')
      {
        return {
          text: String(node['#text']).replace(/\s+/g, ' '),
          ...style,
        };
      }

      if (tag === 'b')
      {
        return this._runOptions(node.b, {
          ...style,
          bold: true,
        });
      }

      if (tag === 'i')
      {
        return this._runOptions(node.i, {
          ...style,
          italics: true,
        });
      }

      if (tag === 'u')
      {
        return this._runOptions(node.u, {
          ...style,
          underline: {},
        });
      }

      if (tag === 'color')
      {
        return this._runOptions(node.color, {
          ...style,
          color: this._color(node[':@']?.value),
        });
      }

      if (tag === 'br')
      {
        return {
          text: '',
          break: 1,
          ...style,
        };
      }

      throw new Error(`Unsupported inline XML element: <${tag}>`);
    });
  }

  async _createImage(attributes, cover, context = {})
  {
    const name = AgentUtils.normalizeRequiredString(
      attributes.name,
      'image name'
    );

    const file = await this.tempFileManagerSkill._getFile(name, context.streamId, true, context);

    if (!file.mimeType?.startsWith('image/'))
    {
      throw new Error(`File is not an image: ${name}`);
    }

    const data = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.data);

    const type = this._imageType(file.mimeType);
    const size = imageSize(data);

    if (!size.width || !size.height)
    {
      throw new Error(
        `Unable to determine image dimensions: ${name}`
      );
    }

    return new Paragraph({
      alignment: this._alignment(
        attributes.align,
        AlignmentType.CENTER
      ),
      spacing: cover
        ? {
            before: 0,
            after: 0,
          }
        : {
            before: 120,
            after: 180,
          },
      children: [
        new ImageRun({
          data,
          type,
          transformation: this._imageSize(
            size,
            attributes,
            cover,
            context.coverCellHeight,
            context.coverImageOnly
          ),
        }),
      ],
    });
  }

  _imageSize(natural, attributes, cover, coverCellHeight = null, coverImageOnly = false)
  {
    const widthValue = String(attributes.width ?? '').trim();

    const percentMatch = widthValue.match(
      /^(\d+(?:\.\d+)?)%$/
    );

    const widthPercent = percentMatch
      ? Number(percentMatch[1])
      : null;

    if (
      widthPercent !== null &&
      (
        !Number.isFinite(widthPercent) ||
        widthPercent <= 0 ||
        widthPercent > 100
      )
    )
    {
      throw new Error(
        `Invalid image width percentage: ${widthValue}`
      );
    }

    const allowEnlarge =
      String(attributes.enlarge ?? '').toLowerCase() === 'true';

    const width = widthPercent !== null
      ? null
      : this._number(attributes.width);

    const height = this._number(attributes.height);
    const pixelsPerTwip = 96 / 1440;

    const maxWidth = Math.floor(
      GenerateDocxSkill.PAGE.contentWidth *
      pixelsPerTwip *
      (
        cover && !coverImageOnly && widthPercent === null
          ? 0.82
          : 1
      )
    );

    const coverMaxHeight = coverCellHeight
      ? coverCellHeight * pixelsPerTwip * (coverImageOnly ? 1 : 0.95)
      : GenerateDocxSkill.PAGE.contentHeight *
        pixelsPerTwip *
        0.48;

    const maxHeight = Math.floor(
      cover
        ? coverMaxHeight
        : GenerateDocxSkill.PAGE.contentHeight *
          pixelsPerTwip *
          0.9
    );

    let scale;

    if (widthPercent !== null)
    {
      const targetWidth =
        maxWidth *
        widthPercent /
        100;

      scale = targetWidth / natural.width;

      if (height)
      {
        scale = Math.min(
          scale,
          height / natural.height
        );
      }
    }
    else if (width && height)
    {
      scale = Math.min(
        width / natural.width,
        height / natural.height
      );
    }
    else if (width)
    {
      scale = width / natural.width;
    }
    else if (height)
    {
      scale = height / natural.height;
    }
    else
    {
      scale = Math.min(
        1,
        maxWidth / natural.width,
        maxHeight / natural.height
      );
    }

    scale = Math.min(
      scale,
      maxWidth / natural.width,
      maxHeight / natural.height
    );

    if (!allowEnlarge && !coverImageOnly)
    {
      scale = Math.min(scale, 1);
    }

    return {
      width: Math.max(
        1,
        Math.round(natural.width * scale)
      ),
      height: Math.max(
        1,
        Math.round(natural.height * scale)
      ),
    };
  }

  _imageType(mimeType)
  {
    const types = {
      'image/png': 'png',
      'image/x-png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
    };

    const type = types[mimeType.toLowerCase()];

    if (!type)
    {
      throw new Error(
        `Unsupported DOCX image type: ${mimeType}`
      );
    }

    return type;
  }

  _createTable(nodes, attributes)
  {
    const rows = this._cleanNodes(nodes).map(
      (node, index) =>
      {
        if (this._tag(node) !== 'tr')
        {
          throw new Error(
            `Unsupported table element: <${this._tag(node)}>`
          );
        }

        return this._tableRow(node.tr, index);
      }
    );

    if (!rows.length)
    {
      throw new Error(
        'A <table> must contain at least one row'
      );
    }

    const columnCount = Math.max(
      ...rows.map((row) => row.cells.length)
    );

    if (!columnCount)
    {
      throw new Error(
        'A table row must contain at least one cell'
      );
    }

    const width = Math.floor(
      GenerateDocxSkill.PAGE.contentWidth /
      columnCount
    );

    const tableRows = rows.map(
      (row, rowIndex) =>
      {
        const cells = [...row.cells];

        while (cells.length < columnCount)
        {
          cells.push({
            header: row.header,
            nodes: [],
          });
        }

        return new TableRow({
          tableHeader: row.header,
          cantSplit: true,
          children: cells.map((cell) =>
            this._tableCell(
              cell,
              row.header,
              rowIndex,
              width,
              attributes
            )
          ),
        });
      }
    );

    const border = {
      style: BorderStyle.SINGLE,
      size: 6,
      color: attributes['border-color'] ? this._color(attributes['border-color']) : this.theme.border,
    };

    return new Table({
      rows: tableRows,
      width: {
        size: GenerateDocxSkill.PAGE.contentWidth,
        type: WidthType.DXA,
      },
      layout: TableLayoutType.FIXED,
      columnWidths: Array(columnCount).fill(width),
      margins: {
        top: 100,
        bottom: 100,
        left: 120,
        right: 120,
      },
      borders: {
        top: border,
        bottom: border,
        left: border,
        right: border,
        insideHorizontal: border,
        insideVertical: border,
      },
    });
  }

  _tableRow(nodes, rowIndex)
  {
    const cells = this._cleanNodes(nodes).map((node) =>
    {
      const tag = this._tag(node);

      if (tag !== 'th' && tag !== 'td')
      {
        throw new Error(
          `Unsupported element in table row ${rowIndex + 1}: <${tag}>`
        );
      }

      return {
        header: tag === 'th',
        nodes: node[tag] ?? [],
      };
    });

    return {
      header: cells.some((cell) => cell.header),
      cells,
    };
  }

  _tableCell(cell, rowHeader, rowIndex, width, attributes)
  {
    const theme = this.theme;
    const header = rowHeader || cell.header;
    const headerBackground = attributes['header-background'] ? this._color(attributes['header-background']) : theme.primary;
    const headerColor = attributes['header-color'] ? this._color(attributes['header-color']) : theme.white;
    const rowBackground = attributes['row-background'] ? this._color(attributes['row-background']) : theme.white;
    const alternateRowBackground = attributes['alternate-row-background']
      ? this._color(attributes['alternate-row-background'])
      : theme.light;

    const fill = header
      ? headerBackground
      : rowIndex % 2
        ? alternateRowBackground
        : rowBackground;

    return new TableCell({
      width: {
        size: width,
        type: WidthType.DXA,
      },
      verticalAlign: VerticalAlignTable.CENTER,
      shading: {
        type: ShadingType.CLEAR,
        color: 'auto',
        fill,
      },
      children: [
        new Paragraph({
          spacing: {
            before: 0,
            after: 0,
            line: 240,
          },
          children: this._createRuns(
            cell.nodes,
            header
              ? {
                  font: this._font(GenerateDocxSkill.FONTS.body),
                  bold: true,
                  color: headerColor,
                }
              : {
                  font: this._font(GenerateDocxSkill.FONTS.body),
                }
          ),
        }),
      ],
    });
  }

  _spacer()
  {
    return new Paragraph({
      spacing: {
        after: 80,
      },
    });
  }

  _tag(node)
  {
    return Object.keys(node).find(
      (key) => key !== ':@'
    );
  }

  _headingLevel(level)
  {
    if (level === 2)
    {
      return HeadingLevel.HEADING_2;
    }

    if (level === 3)
    {
      return HeadingLevel.HEADING_3;
    }

    return HeadingLevel.HEADING_1;
  }

  _alignment(value, fallback)
  {
    if (value === undefined || value === null || value === '')
    {
      return fallback;
    }

    const alignments = {
      left: AlignmentType.LEFT,
      center: AlignmentType.CENTER,
      right: AlignmentType.RIGHT,
      justify: AlignmentType.JUSTIFIED,
    };

    const alignment =
      alignments[String(value).toLowerCase()];

    if (!alignment)
    {
      throw new Error(`Invalid alignment: ${value}`);
    }

    return alignment;
  }

  _number(value)
  {
    if (value === undefined || value === null || value === '')
    {
      return null;
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0)
    {
      throw new Error(`Invalid positive number: ${value}`);
    }

    return number;
  }

  _color(value)
  {
    const raw = AgentUtils.normalizeRequiredString(
      value,
      'color'
    );

    const named = Object.entries(this.theme).find(
      ([name]) => name.toLowerCase() === raw.toLowerCase()
    )?.[1];

    if (named)
    {
      return named;
    }

    return this._normalizeHexColor(raw);
  }

  _normalizeHexColor(value)
  {
    const color = String(value)
      .replace(/^#/, '')
      .toUpperCase();

    if (/^[0-9A-F]{3}$/.test(color))
    {
      return [...color]
        .map((character) => character.repeat(2))
        .join('');
    }

    if (!/^[0-9A-F]{6}$/.test(color))
    {
      throw new Error(`Invalid color: ${value}`);
    }

    return color;
  }
}