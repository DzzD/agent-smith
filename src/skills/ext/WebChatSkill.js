/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

export class WebChatSkill extends AgentSkill
{
  processToolData(toolName)
  {
    return ![
      'send_webchat_message',
      'send_webchat_miniframe_file',
      'send_webchat_reaction',
      'send_webchat_status',
    ].includes(toolName);
  }

  get keepToolCallsOnCompression()
  {
    return true;
  }

  constructor({ webChatClient })
  {
    super();
    this.webChatClient = webChatClient;

    this.description = 'Provides functions to send messages and statuses through WebChat.';

    this.tools = [
      {
        type: 'function',
        name: 'send_webchat_message',
        allowRepeat: true,
        description: 'Send a formatted message to a WebChat conversation. Use messageId to send as a reply. Optionally attach files.',
        parameters: {
          type: 'object',
          properties: {
            streamId: {
              type: 'string',
              description: 'WebChat conversation identifier. Use the current streamId.',
            },
            message: {
              type: 'string',
              description: 'HTML or plain text message content.',
            },
            format: {
              type: 'string',
              enum: ['html', 'miniframe', 'text'],
              description: 'Message format: html, miniframe or text.',
            },
            messageId: {
              type: ['string', 'null'],
              description: 'Message ID to reply to. Omit it or use null to send a new message.',
            },
            files: {
              type: ['array', 'null'],
              description: 'Optional attached files from TempFileManagerSkill.',
              items: {
                type: 'object',
                properties: {
                  tempFileName: {
                    type: 'string',
                    description: 'Temp file name stored in TempFileManagerSkill.',
                  },
                  fileName: {
                    type: ['string', 'null'],
                    description: 'Optional file name shown in WebChat. Use null to keep original name.',
                  },
                },
                required: ['tempFileName', 'fileName'],
                additionalProperties: false,
              },
            },
          },
          required: ['streamId', 'message', 'format'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'send_webchat_miniframe_file',
        allowRepeat: true,
        description: 'Send an HTML temp file as a miniframe WebChat message using file reference instead of inline HTML content.',
        parameters: {
          type: 'object',
          properties: {
            streamId: {
              type: 'string',
              description: 'WebChat conversation identifier. Use the current streamId.',
            },
            tempFileName: {
              type: 'string',
              description: 'HTML temp file name stored in TempFileManagerSkill.',
            },
            messageId: {
              type: ['string', 'null'],
              description: 'Message ID to reply to. Omit it or use null to send a new message.',
            },
            attachSourceFile: {
              type: ['boolean', 'null'],
              description: 'Attach the source HTML file in the message attachments. Defaults to false.',
            },
            sourceFileName: {
              type: ['string', 'null'],
              description: 'Optional display name when attachSourceFile is true.',
            },
          },
          required: ['streamId', 'tempFileName'],
          additionalProperties: false,
        },
      },
      // {
      //   type: 'function',
      //   name: 'send_webchat_status',
      //   allowRepeat: true,
      //   description: 'Send a processing status to a WebChat conversation.',
      //   parameters: {
      //     type: 'object',
      //     properties: {
      //       streamId: {
      //         type: 'string',
      //         description: 'WebChat conversation identifier. Use the current streamId.',
      //       },
      //       status: {
      //         type: 'string',
      //         description: 'Status value such as processing, idle, or error.',
      //       },
      //     },
      //     required: ['streamId', 'status'],
      //     additionalProperties: false,
      //   },
      // },
      {
        type: 'function',
        name: 'send_webchat_reaction',
        allowRepeat: true,
        description: 'Send an emoji reaction to a WebChat message by target message id.',
        parameters: {
          type: 'object',
          properties: {
            streamId: {
              type: 'string',
              description: 'WebChat conversation identifier. Use the current streamId.',
            },
            relatedTo: {
              type: 'string',
              description: 'Target message id to react to.',
            },
            reactionKey: {
              type: 'string',
              description: 'Single emoji reaction key (for example 👍, ❤️, 😂, 🎉).',
            },
            action: {
              type: 'string',
              description: 'Reaction action: add or remove. Defaults to add.',
            },
          },
          required: ['streamId', 'relatedTo', 'reactionKey'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'load_webchat_message',
        allowRepeat: true,
        description: 'Load a WebChat message by messageId. If attachments are present, download them into TempFileManager like incoming file messages.',
        parameters: {
          type: 'object',
          properties: {
            streamId: {
              type: 'string',
              description: 'WebChat conversation identifier. Use the current streamId.',
            },
            messageId: {
              type: 'string',
              description: 'WebChat message identifier to load.',
            },
          },
          required: ['streamId', 'messageId'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
    send_webchat_message :
    - Default tool for textual answers sent through WebChat.
    - Use streamId from the current WebChat conversation.
    - Set messageId when the answer must be sent as a reply to a specific message.
    - Use format "html" for formatted answers in standard bubble rendering.
    - Use format "miniframe" to render the message inside a sandboxed iframe.
    - For format "miniframe", keep file://path/file.ext references unchanged in HTML.
    - Referenced TempFileManager files are auto-attached from these file:// references.
    - Use format "text" only for plain text.
    - Never use Markdown.
    - HTML formatting is supported.
    - Use simple readable HTML.
    - WebChat supports standard AppCore components inside format "html": alerts, mentions, YouTube, PeerTube and TikTok videos, image URLs and generic web URLs. Each host must have a unique data-appcore-id instance ID; never reuse the same complete ID for multiple components in one message.
    - To display an alert block, use a component host with data-appcore-id="js.alert-component::alert-<unique-id>", data-template="tpl.alert-component" and an optional data-title attribute. Put the alert HTML inside a child with data-zone="content".
    - Alert example: <aside data-appcore-id="js.alert-component::alert-a1" data-template="tpl.alert-component" data-title="Attention"><div data-zone="content">This operation cannot be undone.</div></aside>
    - A message may contain multiple alert blocks. Give every alert a different complete data-appcore-id. Keep alert content concise and use alerts only for information requiring special attention.
    - WebChat HTML, use the highlighted image component when you have a complete image and a bounding box located on that same image. This is useful for RAG sources but can be used for any image.
    - Use this exact format with normalized coordinates: <span data-appcore-id="js.highlighted-image-component::<unique-id>" data-highlights='{"coordinateSpace":"normalized","x1":0.1,"y1":0.2,"x2":0.3,"y2":0.4}'><img src="file://<tempFileName>" alt="<description>"></span>
    - Use the exact returned 'tempFileName'.
    - Coordinates must match the exact displayed image and be used without modification.
    - Never guess coordinates. Use one component per highlighted area and a unique ID each time.
    - Do not create the overlay, zoom, or controls yourself.
    - Do not use this component outside WebChat HTML.
    - To mention a user, use a component host with data-appcore-id="js.mention-component::mention-<unique-id>", data-template="tpl.mention-component", data-webchat-mention="<user-uuid>", data-user-uuid="<user-uuid>" and data-label="<user-display-name>". Keep the visible label as @<user-display-name>. Only mention users returned by WebChat autocomplete or otherwise known to belong to the current stream.
    - To embed a YouTube video, use a component host with data-appcore-id="js.youtube-component::url-<unique-id>", data-template="tpl.youtube-component" and data-src set to the complete YouTube URL. Supported URL forms include youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/... and youtube.com/embed/....
    - Do not generate the YouTube iframe yourself. The WebChat client component creates the youtube-nocookie.com iframe. Do not send YouTube embeds as format "miniframe".
    - To embed a PeerTube video, use a component host with data-appcore-id="js.peertube-component::url-<unique-id>", data-template="tpl.peertube-component" and data-src set to the complete PeerTube watch URL, such as https://instance.example/videos/watch/<id> or https://instance.example/w/<id>. The PeertubeComponent owns its CSS and creates the iframe itself. Do not generate the iframe yourself and do not send PeerTube embeds as format "miniframe".
    - To embed a TikTok video, use a component host with data-appcore-id="js.tiktok-component::url-<unique-id>", data-template="tpl.tiktok-component" and data-src set to a complete URL such as https://www.tiktok.com/@user/video/<id>. Do not use a profile or home page URL as a video source.
    - To display an image from a URL, use a component host with data-appcore-id="js.image-url-component::url-<unique-id>", data-template="tpl.image-url-component" and data-src set to an http(s) URL ending with a supported image extension such as .jpg, .jpeg, .png, .gif, .webp, .svg or .avif.
    - To display a generic web page, use a component host with data-appcore-id="js.url-component::url-<unique-id>", data-template="tpl.url-component" and data-src set to an http(s) URL. The client creates the iframe with sandbox="allow-scripts" and adds a link to the original page below it.
    - Example with two independent components (the complete data-appcore-id values are intentionally different): <span data-appcore-id="js.mention-component::mention-a1" data-template="tpl.mention-component" data-webchat-mention="<user-uuid>" data-user-uuid="<user-uuid>" data-label="Ada">@Ada</span> <span data-appcore-id="js.image-url-component::url-b2" data-template="tpl.image-url-component" data-src="https://example.com/image.png"></span>
    - The WebChat server stores these component hosts passively; do not normalize or convert them server-side.
    - For format "miniframe", if a fixed stage is required, set dimensions directly on the body tag, for example: <body width="800" height="640" style="width:800px;height:640px">.
    - For format "miniframe", body width/height attributes are preferred.
    - If body width/height attributes are missing, width/height are read from the body inline style (style="width:...;height:...").
    - Only body dimensions are used to force iframe size (not canvas and not other tags).
    - If body width/height are not provided, the iframe uses natural content size.
    - Minimal example (miniframe, fixed size, no margin, no scrollbars, hello world):
      <!doctype html>
      <html>
      <head><meta charset="utf-8"></head>
      <body width="800" height="600" style="width:800px;height:600px;margin:0;overflow:hidden;background:#101827;color:#f8fafc;font-family:Arial, sans-serif;display:flex;align-items:center;justify-content:center;">
        <div style="font-size:42px;font-weight:700;letter-spacing:0.02em;">Hello world</div>
      </body>
      </html>
    - Prefer p, ul, ol, li, b, strong, i, em, code, pre, blockquote, a, img, h1, h2 and h3.
    - For img, you can use src="file://..." to reference a temp file in the current stream, use fullpath + name.
    - Before sending, each img src starting with file:// is converted to a base64 data URI. ex: <img src="file://images/logo.asp">
    - Optional files can be attached using files: [{ tempFileName, fileName }].
    - Use attachments for binary or downloadable content.
    - Do not use script, iframe, style, forms or inline event handlers.

    send_webchat_miniframe_file :
    - Use this tool to send a miniframe from an existing HTML temp file.
    - Prefer this tool when HTML content is large.
    - This avoids passing large inline HTML in tool arguments.
    - The tool reads tempFileName content and sends it as format "miniframe".
    - streamId is required.
    - tempFileName must point to an existing text/html temp file.
    - messageId is optional and can be used to reply.
    - Optionally set attachSourceFile=true to attach the original HTML file.

    

    send_webchat_reaction :
    - Use to react to an existing WebChat message.
    - relatedTo is the target message id.
    - reactionKey is a single emoji.
    - action can be add or remove (default add).

    load_webchat_message :
    - Load a message by streamId + messageId from WebChat history.
    - If the loaded message has attachments, they are downloaded into TempFileManager.
    `;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      send_webchat_message: '📨 sending WebChat message',
      send_webchat_miniframe_file: '📎 sending WebChat miniframe file',
      send_webchat_reaction: '👍 sending WebChat reaction',
      load_webchat_message: '📥 loading WebChat message',
      send_webchat_status: '📡 sending WebChat status',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'send_webchat_message':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.streamId, 64);
        break;
      }

      case 'send_webchat_miniframe_file':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
        break;
      }

      case 'send_webchat_reaction':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.reactionKey, 64);
        break;
      }

      case 'load_webchat_message':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.messageId, 64);
        break;
      }

      case 'send_webchat_status':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.status, 64);
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

  // send_webchat_status :
    // - Use only for explicit WebChat status updates.
    // - Normal task processing status is already handled automatically by WebChatInput.
    // - Do not send redundant processing or idle statuses.

  async send_webchat_message(args = {}, context = {})
  {
    const callStartedAt = Date.now();
    const streamId = args.streamId;
    const rawMessage = typeof args.message === 'string' ? args.message : '';
    const format = args.format;
    const normalizedFormat = String(format ?? '').trim().toLowerCase();
    let attachments = await this.resolveAttachments(args.files, streamId, context);
    attachments = await this.resolveHtmlAttachmentReferences(attachments, streamId, context);
    const inlineImageHtml = this.buildInlineImageHtmlFromAttachments(attachments);
    const message = normalizedFormat === 'miniframe'
      ? rawMessage
      : await this.beforeSendMessage(rawMessage, streamId, context);

    if (normalizedFormat === 'miniframe')
    {
      attachments = await this.resolveMiniframeAttachmentsForMessage(message, streamId, attachments, context);
    }

    const hasMessageContent = String(message ?? '').trim().length > 0;
    const effectiveMessage = hasMessageContent ? message : inlineImageHtml;
    const effectiveFormat = hasMessageContent ? format : (inlineImageHtml ? 'html' : format);
    const messageId = typeof args.messageId === 'string' ? args.messageId.trim() : '';
    const normalizedMessageId = messageId.toLowerCase() === 'null' ? '' : messageId;
    const parentMessageId = normalizedMessageId || null;
    const startIsoTimestamp = new Date(callStartedAt).toISOString();

    // console.log(
    //   `[WEBCHAT][${startIsoTimestamp}][${callStartedAt}] phase=tool_send_start streamId=${streamId} `
    //   + `format=${effectiveFormat} parentMessageId=${parentMessageId ?? 'none'} `
    //   + `messageLength=${String(effectiveMessage ?? '').length} attachments=${attachments.length}`
    // );

    const result = await this.webChatClient.sendMessage(streamId, effectiveMessage, effectiveFormat, parentMessageId, attachments);

    const endTimestampMs = Date.now();
    const endIsoTimestamp = new Date(endTimestampMs).toISOString();
    const callDurationMs = endTimestampMs - callStartedAt;

    // console.log(
    //   `[WEBCHAT][${endIsoTimestamp}][${endTimestampMs}] phase=tool_send_done streamId=${streamId} `
    //   + `messageId=${result.messageId} durationMs=${callDurationMs}`
    // );

    //  this.#pushOutputEvent({
    //   type: 'output_message',
    //   streamId: roomId,
    //   senderId: 'assistant',
    //   senderName: this.agent.name,
    //   dataType: 'text',
    //   data: message,
    //   prompt: '',
    // });

    return {
      ok: true,
      status: parentMessageId ? 'reply_delivered' : 'message_delivered',
      recipient: streamId,
      messageId: result.messageId,
      attachmentCount: attachments.length,
      ...(parentMessageId ? { parentMessageId } : {}),
    };
  }

  async send_webchat_miniframe_file(args = {}, context = {})
  {
    const streamId = String(args.streamId ?? '').trim();
    const tempFileName = String(args.tempFileName ?? '').trim();
    const rawMessageId = typeof args.messageId === 'string' ? args.messageId.trim() : '';
    const normalizedMessageId = rawMessageId.toLowerCase() === 'null' ? '' : rawMessageId;
    const parentMessageId = normalizedMessageId || null;
    const attachSourceFile = args.attachSourceFile === true;
    const sourceFileName = typeof args.sourceFileName === 'string' ? args.sourceFileName.trim() : '';

    if (!streamId)
    {
      throw new Error('streamId is required.');
    }

    if (!tempFileName)
    {
      throw new Error('tempFileName is required.');
    }

    const file = await this.tempFileManagerSkill._getFile(tempFileName, streamId, true, context);
    const mimeType = String(file?.mimeType ?? '').trim().toLowerCase();

    if (!mimeType.startsWith('text/html'))
    {
      throw new Error(`tempFileName must be a text/html file. Got: ${file?.mimeType ?? 'unknown'}`);
    }

    const miniframeHtml = String(file.data.toString('utf8') ?? '');

    if (!miniframeHtml.trim())
    {
      throw new Error(`tempFileName is empty: ${tempFileName}`);
    }

    const sourceAttachments = attachSourceFile
      ? await this.resolveAttachments([
        {
          tempFileName,
          fileName: sourceFileName || null,
        },
      ], streamId, context)
      : [];
    const attachments = await this.resolveMiniframeAttachmentsForMessage(miniframeHtml, streamId, sourceAttachments, context);

    const result = await this.webChatClient.sendMessage(streamId, miniframeHtml, 'miniframe', parentMessageId, attachments);

    return {
      ok: true,
      status: parentMessageId ? 'reply_delivered' : 'message_delivered',
      recipient: streamId,
      messageId: result.messageId,
      attachmentCount: attachments.length,
      sourceTempFileName: tempFileName,
      format: 'miniframe',
      ...(parentMessageId ? { parentMessageId } : {}),
    };
  }

  async resolveAttachments(rawFiles, streamId, context = {})
  {
    const normalizedFiles = Array.isArray(rawFiles) ? rawFiles : [];

    if (!normalizedFiles.length)
    {
      return [];
    }

    const tempFileManager = this.agent.skills.get('TempFileManagerSkill');

    return await Promise.all(normalizedFiles.map(async (fileEntry) =>
    {
      const tempFileName = String(fileEntry?.tempFileName ?? '').trim();

      if (!tempFileName)
      {
        throw new Error('Invalid files: tempFileName is required for each attachment.');
      }

      const file = await tempFileManager._getFile(tempFileName, streamId, true, context);
      const mimeType = String(file.mimeType ?? '').trim() || 'application/octet-stream';
      const fallbackName = tempFileName.split('/').pop() || `attachment-${Date.now()}`;
      const requestedFileName = fileEntry?.fileName == null ? '' : String(fileEntry.fileName).trim();
      const safeFileName = AgentUtils.sanitizeFileName(requestedFileName || fallbackName);
      const dataBase64 = file.data.toString('base64');

      return {
        tempFileName,
        fileName: safeFileName,
        mimeType,
        size: file.data.length,
        dataBase64,
      };
    }));
  }

  buildInlineImageHtmlFromAttachments(attachments = [])
  {
    if (!Array.isArray(attachments) || attachments.length === 0)
    {
      return '';
    }

    const imageHtml = attachments
      .filter((attachment) => String(attachment?.mimeType ?? '').trim().toLowerCase().startsWith('image/'))
      .map((attachment) =>
      {
        const fileName = this.escapeHtmlAttribute(attachment.fileName || 'image');
        return `<img src="data:${attachment.mimeType};base64,${attachment.dataBase64}" alt="${fileName}" />`;
      })
      .join('');

    return imageHtml.trim();
  }

  escapeHtmlAttribute(value)
  {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  async resolveMiniframeAttachmentsForMessage(message, streamId, existingAttachments = [], context = {})
  {
    return await this.resolveFileReferencesFromHtml(message, streamId, existingAttachments, context);
  }

  async resolveFileReferencesFromHtml(message, streamId, existingAttachments = [], context = {})
  {
    const existingTempFileNames = new Set(existingAttachments.map((attachment) => attachment.tempFileName));
    const missingFiles = this.extractFileTempReferencesFromHtml(message)
      .filter((tempFileName) => !existingTempFileNames.has(tempFileName))
      .map((tempFileName) => ({ tempFileName }));

    if (missingFiles.length === 0)
    {
      return existingAttachments;
    }

    return [...existingAttachments, ...await this.resolveAttachments(missingFiles, streamId, context)];
  }

  async resolveHtmlAttachmentReferences(existingAttachments = [], streamId, context = {})
  {
    let attachments = existingAttachments;

    for (const attachment of attachments)
    {
      if (!String(attachment?.mimeType ?? '').trim().toLowerCase().startsWith('text/html'))
      {
        continue;
      }

      const html = Buffer.from(attachment.dataBase64, 'base64').toString('utf8');
      attachments = await this.resolveFileReferencesFromHtml(html, streamId, attachments, context);
    }

    return attachments;
  }

  extractFileTempReferencesFromHtml(html)
  {
    const matches = [...String(html ?? '').matchAll(/file:\/\/([^\s"'`<>)]+)/g)];
    return [...new Set(matches.map((match) => match[1]))];
  }

  async beforeSendMessage(message, streamId, context = {})
  {
    const normalizedMessage = String(message ?? '');
    const tempFileManager = this.agent.skills.get('TempFileManagerSkill');

    const matches = [...normalizedMessage.matchAll(/<img\b[^>]*\bsrc\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi)];
    const replacements = await Promise.all(matches.map(async (match) =>
    {
      const [fullTag, _quotedSrc, doubleQuotedSrc, singleQuotedSrc] = match;
      const src = doubleQuotedSrc ?? singleQuotedSrc;

      if (!src.startsWith('file://'))
      {
        return { fullTag, replacement: fullTag };
      }

      const tempFileName = src.slice('file://'.length);
      const file = await tempFileManager._getFile(tempFileName, streamId, true, context);
      const mimeType = file.mimeType?.trim() || 'application/octet-stream';
      const dataUri = `data:${mimeType};base64,${Buffer.from(file.data).toString('base64')}`;

      return { fullTag, replacement: fullTag.replace(src, dataUri) };
    }));

    let resolvedMessage = normalizedMessage;

    for (const { fullTag, replacement } of replacements)
    {
      resolvedMessage = resolvedMessage.replace(fullTag, replacement);
    }

    return resolvedMessage;
  }

  // async send_webchat_status(args = {}, context = {})
  // {
  //   const streamId = args.streamId;
  //   const status = args.status;

  //   await this.webChatClient.sendStatus(streamId, status);

  //   return {
  //     ok: true,
  //     status: 'status_delivered',
  //     recipient: streamId,
  //     deliveredStatus: status,
  //   };
  // }

  async send_webchat_reaction(args = {}, context = {})
  {
    const streamId = args.streamId;
    const relatedTo = args.relatedTo;
    const reactionKey = args.reactionKey;
    const action = String(args.action ?? '').trim().toLowerCase() === 'remove' ? 'remove' : 'add';

    const result = await this.webChatClient.sendReaction(
      streamId,
      relatedTo,
      reactionKey,
      'assistant',
      this.agent?.name || 'assistant',
      action
    );

    return {
      ok: true,
      status: 'reaction_delivered',
      recipient: streamId,
      eventId: result.eventId,
      relatedTo: result.relatedTo,
      reactionKey: result.reactionKey,
      action: result.action,
    };
  }

  async load_webchat_message(args = {}, context = {})
  {
    const streamId = String(args.streamId ?? '').trim();
    const messageId = String(args.messageId ?? '').trim();

    if (!streamId)
    {
      throw new Error('streamId_required');
    }

    if (!messageId)
    {
      throw new Error('messageId_required');
    }

    const loadedMessage = await this.webChatClient.getMessageById(streamId, messageId);

    if (!loadedMessage)
    {
      return {
        ok: false,
        error: {
          type: 'message_not_found',
          message: 'WebChat message not found.',
        },
      };
    }

    const attachments = Array.isArray(loadedMessage?.attachments) ? loadedMessage.attachments : [];

    if (attachments.length === 0)
    {
      return {
        ok: true,
        recipient: streamId,
        messageId: String(loadedMessage?.messageId ?? messageId).trim() || messageId,
        format: String(loadedMessage?.format ?? 'text').trim() || 'text',
        body: String(loadedMessage?.content ?? '').trim(),
        attachments: [],
        reactions: Array.isArray(loadedMessage?.reactions) ? loadedMessage.reactions : [],
      };
    }

    const tempFileManager = this.tempFileManagerSkill;

    if (!tempFileManager)
    {
      throw new Error('TempFileManagerSkill is required to handle WebChat attachments.');
    }

    const loadedAttachments = [];

    for (const attachment of attachments)
    {
      const downloaded = await this.webChatClient.downloadAttachment(attachment);
      const resolvedMimeType = String(downloaded?.mimeType ?? attachment?.mimeType ?? '').trim() || 'application/octet-stream';
      const fallbackType = resolvedMimeType.toLowerCase().startsWith('image/')
        ? 'image'
        : resolvedMimeType.toLowerCase().startsWith('audio/')
          ? 'audio'
          : 'file';
      const extension = AgentUtils.getExtensionFromMimeType(resolvedMimeType, fallbackType);
      const resolvedFileName = AgentUtils.sanitizeFileName(downloaded?.fileName || attachment?.fileName || `webchat-file-${Date.now()}`);
      const tempFileName = AgentUtils.buildTempAttachmentPath({
        source: 'webchat',
        streamId,
        messageId,
        fileName: resolvedFileName,
        extension,
        fallbackType,
      });

      await tempFileManager.temp_file_remove({ tempFileName }, { ...context, streamId }).catch(() => {});
      await tempFileManager.temp_file_create({ tempFileName, mimeType: resolvedMimeType }, { ...context, streamId });

      if (AgentUtils.isTextMimeType(resolvedMimeType))
      {
        await tempFileManager.temp_file_insert({
          tempFileName,
          content: downloaded.buffer.toString('utf8'),
          startLine: null,
        }, { ...context, streamId });
      }
      else
      {
        await tempFileManager.appendBuffer({
          tempFileName,
          data: downloaded.buffer,
        }, { ...context, streamId });
      }

      loadedAttachments.push({
        tempFileName,
        fileName: resolvedFileName,
        mimeType: resolvedMimeType,
        size: Number.isFinite(downloaded?.size) ? downloaded.size : downloaded.buffer.length,
        href: String(attachment?.href ?? attachment?.src ?? '').trim() || null,
      });
    }

    return {
      ok: true,
      recipient: streamId,
      messageId: String(loadedMessage?.messageId ?? messageId).trim() || messageId,
      format: String(loadedMessage?.format ?? 'text').trim() || 'text',
      body: String(loadedMessage?.content ?? '').trim(),
      attachments: loadedAttachments,
      reactions: Array.isArray(loadedMessage?.reactions) ? loadedMessage.reactions : [],
    };
  }

}
