/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { McpSkill } from './McpSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

export class RagSkill extends McpSkill
{
  constructor({
    url,
    bearer,
    timeout = 360000,
    tempFileManagerSkill = null,
     toolValueMaxChar = 15000*3.5 , //env 15k tokens
    maxInlineBlocksChars = toolValueMaxChar,
  } = {})
  {
    super({
      name: 'RagSkill',
      endpoint: url,
      accessToken: bearer,
      timeout,
      reconnectDelayMs: 1000,
      toolValueMaxChar,
      description:
        'Searches the company documentation for authoritative information and retrieves supporting page images or original documents.',
    });

    this._tempFileManagerSkill = tempFileManagerSkill;
    this.maxInlineBlocksChars = maxInlineBlocksChars;
  }

  get usage()
  {
    return `
      - Use this skill to search and retrieve content from RAG documentation.

      <document_add>
        - Use document_add to index a temporary file in an authorized documentation domain.
        - If information about the document is known, pass it in description to provide context for indexing.
        - If no information about the document is known, omit description entirely.
      </document_add>

      <document_search>
        - Always perform a fresh document_search for each user request.
        - Resolve references from the conversation before building the search queries.
        - Use document_search only to discover candidate documents and pages, never as final evidence.

        - Use semanticQuery and lexicalQuery together by default.
        - semanticQuery must express the complete meaning and intent of the user's request in natural language.
        - lexicalQuery must contain the discriminating terms expected to appear literally in the source documents.
        - Extract lexicalQuery terms from the resolved request, including when relevant:
          - proper names;
          - acronyms;
          - identifiers and references;
          - quoted expressions;
          - dates and numbers;
          - important domain-specific nouns;
          - essential keywords describing the requested subject.
        - Never copy the complete natural-language question into lexicalQuery.
        - Remove articles, pronouns, generic verbs, and other non-discriminating words from lexicalQuery.
        - Preserve exact names, acronyms, identifiers, and references without paraphrasing them.
        - When semanticQuery is used, omitting lexicalQuery is allowed only when no meaningful literal keyword can be extracted after resolving the request.
        - Use lexicalQuery alone only for a strictly exact lookup where semantic expansion would provide no benefit.
        - Use additional document_search calls when useful for aliases, synonyms, alternative spellings, or different literal formulations.
        - minimumScoreRatio controls breadth from 0 to 1 and defaults to 0.8: lower it for broader discovery, raise it for fewer and more precise matches.
        - Never determine relevance from a document title or file name.
        - Inspect potentially relevant pages regardless of whether their document title appears related to the question.
      </document_search>

      <document_get>
        - After completing all document_search calls, identify every candidate page that may contain direct evidence.
        - Group candidate pages by document.
        - Retrieve all candidate pages in one document_get call through the documents array.
        - Put all candidate page numbers for the same document in its pageNumbers array.
        - Do not make separate document_get calls when pages can be retrieved together.
        - Use includeOriginal=true when original source documents must be attached.

        - document_get returns page images, metadata, descriptions, and complete page blocks.
        - Blocks may be returned directly or through blocksTempFileName.
        - When blocksTempFileName is returned, always read it with TempFileManagerSkill before analyzing the page.
        - Returned files are available through TempFileManagerSkill using their file names.
      </document_get>

      <evidence>
        - Base the answer only on complete page blocks returned by document_get.
        - Page descriptions, search chunks, document titles, and file names are discovery data, not evidence.
        - Block coordinates are intentionally omitted from document_get responses to reduce context size.
        - Never infer visual proximity, alignment, grouping, columns, table relationships, chart relationships, or reading order from the block array order.
        - Use only blocks of type 'text' or 'title' as evidence.
        - For every selected block, identify an exact text fragment from its own content that supports the answer.
        - Select all blocks containing the complete useful passage and the minimum context required to understand it.
        - If a relevant sentence or paragraph is split across several blocks, select every required block.
        - Never select page-level, image, decorative, empty, neighboring, or unrelated blocks.
        - Every blockId is qualified by its pageUuid.
        - Copy each blockId exactly from the block belonging to that page.
        - Never reconstruct, shorten, reuse, or transfer a blockId between pages.
      </evidence>

      <page_highlight>
        - After selecting blocks for every displayed page, call page_highlight exactly once.
        - Send all displayed pages together in the pages array.
        - For each page, pass only its pageUuid and selected blockIds.
        - Every displayed page must have a successful result from page_highlight.
        - Use the returned page images and normalized highlights exactly as returned.
        - Never calculate, normalize, modify, validate, estimate, expand, shrink, or replace highlight coordinates.
        - Never use a full-page fallback.
        - If page_highlight rejects a page or blockId, return to the page blocks, correct the selection, and repeat the grouped call.
      </page_highlight>
    `;
  }
  
  get tempFileManagerSkill()
  {
    return this._tempFileManagerSkill
      ?? this.agent.skills.get('TempFileManagerSkill');
  }

  _buildMcpToolDefinition(mcpToolName, tool)
  {
    if (mcpToolName === 'document_add')
    {
      return {
        ...tool,

        description:
          'Add and index a document stored by TempFileManagerSkill in an authorized domain.',

        parameters: {
          type: 'object',

          properties: {
            tempFileName: {
              type: 'string',
              description:
                'Temporary file name managed by TempFileManagerSkill.',
            },

            fileName: {
              type: 'string',
              description:
                'Optional original file name sent to the RAG server.',
            },

            domain:
              tool.parameters.properties.domain,

            description:
              tool.parameters.properties.description,
          },

          required: [
            'tempFileName',
            'domain',
          ],

          additionalProperties: false,
        },
      };
    }

    return tool;
  }

  async _prepareMcpToolArguments(
    mcpToolName,
    args,
    context = {},
  )
  {
    if (mcpToolName === 'document_add')
    {
      const file =
        await this.tempFileManagerSkill._getFile(
          args.tempFileName,
          context.streamId,
          true,
          context,
        );

      const fileName =
        args.fileName
        || args.tempFileName.split('/').pop();

      return {
        file: {
          name:
            AgentUtils.sanitizeFileName(fileName),

          dataBase64:
            file.data.toString('base64'),
        },

        domain:
          args.domain,

        ...(args.description !== undefined
          ? { description: args.description }
          : {}),
      };
    }

    return args;
  }

  async _processMcpToolResult(
    mcpToolName,
    result,
    originalArgs,
    context = {},
  )
  {
    if (result?.isError === true)
    {
      return result;
    }

    const resultWithStoredBlocks =
      await this._storeBlockFiles(
        mcpToolName,
        result,
        context,
      );

    return this._storeReturnedFiles(
      mcpToolName,
      resultWithStoredBlocks,
      context,
    );
  }

  async _storeBlockFiles(
    mcpToolName,
    result,
    context,
  )
  {
    const structuredContent =
      result.structuredContent;

    if (!structuredContent)
    {
      return result;
    }

    let pages =
      structuredContent.pages;

    let documents =
      structuredContent.documents;

    let searchResults =
      structuredContent.result;

    const structuredContentWithBlocks = {
      ...structuredContent,
      ...(Array.isArray(pages) ? { pages: pages.map(page => page?.blocks
        ? { ...page, blocks: this._prepareBlocksForResponse(page.blocks) }
        : page) } : {}),
      ...(Array.isArray(documents) ? { documents: documents.map(document => ({
        ...document,
        pages: document.pages?.map(page => page?.blocks
          ? { ...page, blocks: this._prepareBlocksForResponse(page.blocks) }
          : page),
      })) } : {}),
    };
    const { content, temporaryFiles, ...resultWithoutReturnedFiles } = result;
    const inlineBlocks = Buffer.byteLength(JSON.stringify({
      ...resultWithoutReturnedFiles,
      structuredContent: structuredContentWithBlocks,
    }), 'utf8') < this.maxInlineBlocksChars;

    if (Array.isArray(pages))
    {
      pages = [];

      for (const page of structuredContent.pages)
      {
        const storedPage =
          await this._storePageBlocks(
            mcpToolName,
            page,
            structuredContent,
            context,
            inlineBlocks,
          );

        pages.push(storedPage);
      }
    }

    if (Array.isArray(documents))
    {
      documents = [];

      for (const document of structuredContent.documents)
      {
        const documentContext = { ...structuredContent, documentUuid: document.documentUuid, name: document.originalFilename ?? document.name };
        const storedPages = [];

        for (const page of document.pages ?? [])
        {
          storedPages.push(await this._storePageBlocks(mcpToolName, page, documentContext, context, inlineBlocks));
        }

        documents.push({ ...document, pages: storedPages });
      }
    }

    if (Array.isArray(searchResults))
    {
      searchResults = [];

      for (const item of structuredContent.result)
      {
        const storedItem =
          await this._storePageBlocks(
            mcpToolName,
            item,
            structuredContent,
            context,
            inlineBlocks,
          );

        searchResults.push(storedItem);
      }
    }

    return {
      ...result,

      structuredContent: {
        ...structuredContent,

        ...(Array.isArray(pages)
          ? { pages }
          : {}),

        ...(Array.isArray(documents)
          ? { documents }
          : {}),

        ...(Array.isArray(searchResults)
          ? { result: searchResults }
          : {}),
      },
    };
  }

  async _storePageBlocks(
    mcpToolName,
    page,
    structuredContent,
    context,
    inlineBlocks,
  )
  {
    if (!page?.blocks)
    {
      return page;
    }

    const documentUuid =
      page.documentUuid
      ?? structuredContent.documentUuid
      ?? 'results';

    const pageNumber =
      page.pageNumber
      ?? 'unknown';

    const documentName =
      AgentUtils.sanitizeFileName(
        page.documentName
        ?? page.originalFilename
        ?? page.original_filename
        ?? structuredContent.name
        ?? 'document',
      );

    const outputDirectory =
      `rag/${AgentUtils.sanitizeFileName(documentUuid)}`;

    const fileName =
      `${documentName}-page-${pageNumber}-blocks.json`;

    const tempFileName =
      `${outputDirectory}/${fileName}`;

    const responseBlocks = this._prepareBlocksForResponse(page.blocks);
    const data = Buffer.from(this._serializeBlocks(responseBlocks), 'utf8');
    const mimeType = 'application/json';
    const countBlocks = block => 1 + (block.children ?? []).reduce((sum, child) => sum + countBlocks(child), 0);
    const blockCount = countBlocks(page.blocks) - 1;

    if (inlineBlocks)
    {
      return {
        ...page,
        blocks: responseBlocks,
        blockCount,
      };
    }

    await this.tempFileManagerSkill.createFile({
      streamId: context.streamId,
      tempFileName,
      mimeType,

      description:
        `Hierarchical JSON blocks returned by ${mcpToolName} for RAG document ${documentUuid}, page ${pageNumber}.`,

      permanent: false,
      data,
    }, context);

    const {
      blocks,
      ...pageWithoutBlocks
    } = page;

    return {
      ...pageWithoutBlocks,
      blockCount,
      blocksTempFileName: tempFileName,
    };
  }

  _prepareBlocksForResponse(block)
  {
    if (!block)
    {
      return block;
    }

    const {
      x, y, width, height, x2, y2, box, childWidth, childHeight,
      source, confidence, pageMinX, pageMinY, pageMaxX, pageMaxY, children, ...responseBlock
    } = block;

    return {
      ...responseBlock,
      ...(Array.isArray(children) ? { children: children.map(child => this._prepareBlocksForResponse(child)) } : {}),
    };
  }

  _serializeBlocks(blocks)
  {
    return JSON.stringify(blocks, null, 2)
      .replace(/"box": \[\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?)\n\s+\]/g,
        '"box": [$1, $2, $3, $4]')
      .replace(/^[ \t]+/gm, '');
  }

  async _storeReturnedFiles(
    mcpToolName,
    result,
    context,
  )
  {
    const { temporaryFiles: existingTemporaryFiles, ...resultWithoutTemporaryFiles } = result;
    const safeContent = [];

    const structuredContent = result.structuredContent
      ? {
          ...result.structuredContent,
          ...(Array.isArray(result.structuredContent.pages)
            ? { pages: result.structuredContent.pages.map(page => ({ ...page })) }
            : {}),
          ...(Array.isArray(result.structuredContent.documents)
            ? { documents: result.structuredContent.documents.map(document => ({
                ...document,
                pages: document.pages?.map(page => ({ ...page })),
              })) }
            : {}),
        }
      : undefined;

    const structuredPages =
      structuredContent?.pages;

    const structuredDocuments =
      structuredContent?.documents;

    const structuredResults =
      structuredContent?.result;

    const pageMetadata =
      Array.isArray(structuredPages)
        ? structuredPages
        : Array.isArray(structuredDocuments)
          ? structuredDocuments.flatMap(document => (document.pages ?? []).map(page => ({ page, document })))
        : Array.isArray(structuredResults)
          ? structuredResults.filter(
            item => item.result_type === 'page',
          ).map(page => ({ page }))
          : [];

    let pageIndex = 0;

    for (const content of result.content ?? [])
    {
      let fileName;
      let mimeType;
      let dataBase64;
      let pageNumber;
      let documentUuid;
      let documentName;
      let page;
      let document;

      if (
        content.type === 'image'
        && content.data
      )
      {
        const extension =
          AgentUtils.getExtensionFromMimeType(
            content.mimeType,
            'image',
          );

        const pageEntry = pageMetadata[pageIndex];
        page = pageEntry?.page ?? pageEntry;
        document = pageEntry?.document;

        pageIndex += 1;

        pageNumber =
          page?.pageNumber
          ?? pageIndex;

        documentUuid =
          page?.documentUuid
          ?? page?.pageUuid
          ?? document?.documentUuid
          ?? structuredContent?.documentUuid
          ?? 'results';

        documentName =
          AgentUtils.sanitizeFileName(
            page?.documentName
            ?? page?.originalFilename
            ?? page?.original_filename
            ?? document?.originalFilename
            ?? document?.name
            ?? structuredContent?.name
            ?? 'document',
          );

        fileName =
          `${documentName}-page-${pageNumber}.${extension}`;

        mimeType =
          content.mimeType;

        dataBase64 =
          content.data;

      }
      else if (
        content.type === 'resource'
        && content.resource?.blob
      )
      {
        const documentMatch = String(content.resource.uri ?? '').match(/^rag:\/\/document\/([^/]+)\/original$/);
        documentUuid =
          documentMatch?.[1]
          ?? structuredContent?.documentUuid
          ?? 'results';

        document = structuredDocuments?.find(item => item.documentUuid === documentUuid);

        documentName =
          AgentUtils.sanitizeFileName(
            document?.originalFilename
            ?? document?.name
            ?? structuredContent?.name
            ?? 'document',
          );

        fileName =
          documentName;

        mimeType =
          content.resource.mimeType;

        dataBase64 =
          content.resource.blob;
      }
      else
      {
        if (
          content.type !== 'text'
          || !result.structuredContent
        )
        {
          safeContent.push(content);
        }

        continue;
      }

      const outputDirectory =
        `rag/${AgentUtils.sanitizeFileName(documentUuid)}`;

      const tempFileName =
        `${outputDirectory}/${fileName}`;

      const data =
        Buffer.from(dataBase64, 'base64');

      await this.tempFileManagerSkill.createFile({
        streamId: context.streamId,
        tempFileName,
        mimeType,

        description:
          `Retrieved by ${mcpToolName} from RAG document ${documentUuid}.`,

        permanent: false,
        data,
      }, context);

      if (page)
      {
        page.imageTempFileName = tempFileName;
      }
      else if (document)
      {
        document.originalTempFileName = tempFileName;
      }
      else if (structuredContent)
      {
        structuredContent.originalTempFileName = tempFileName;
      }
    }

    if (result.structuredContent)
    {
      safeContent.unshift({
        type: 'text',

        text:
          `${mcpToolName} completed. Use structuredContent.`,
      });
    }

    return {
      ...resultWithoutTemporaryFiles,
      content: safeContent,
      ...(structuredContent ? { structuredContent } : {}),
    };
  }
}