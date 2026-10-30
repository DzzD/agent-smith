/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

export class MatrixSkill extends AgentSkill
{
  processToolData(toolName)
  {
    return ![
      'send_matrix_message',
      'send_matrix_notice',
      'send_matrix_reaction',
      'send_matrix_file',
    ].includes(toolName);
  }

  get keepToolCallsOnCompression()
  {
    return true;
  }

  constructor({ matrixClient })
  {
    super();
    this.matrixClient = matrixClient;

    this.description = 'Provides functions to send text messages, notices, images, and files via Matrix.';

    this.tools = [
      {
        type: 'function',
        name: 'send_matrix_reaction',
        allowRepeat: true,
        description: 'Add a reaction (like/emoji) to a Matrix message by messageId.',
        parameters: {
          type: 'object',
          properties: {
            roomId: {
              type: 'string',
              description: 'Matrix room identifier (aka streamId). Optional, will fallback to context.streamId.',
            },
            messageId: {
              type: 'string',
              description: 'Target message identifier to react to.',
            },
            reactionKey: {
              type: 'string',
              description: 'Reaction key. Any Unicode emoji is allowed; prefer common single-emoji reactions such as 👍, ❤️, ✅, 🎉, 👀, 👏, 🙏, 😄, 🤔, 🚀.',
            },
          },
          required: ['roomId', 'messageId', 'reactionKey'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'send_matrix_message',
        allowRepeat: true,
        description: `Send a Matrix formatted HTML or plain text user-visible message. Use messageId to send as a reply to a target message. When both text and a file are required, send them as separate tool calls.`,
        parameters: {
          type: 'object',
          properties: {
            roomId: {
              type: 'string',
              description: 'Matrix room identifier (aka streamId). Optional, will fallback to context.streamId.',
            },
            message: {
              type: 'string',
              description: 'Valid Matrix HTML message content.',
            },
            messageId: {
              type: ['string', 'null'],
              description: 'Message ID to reply to. Omit it or use null to send a new message.',
            },
          },
          required: ['roomId', 'message'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'send_matrix_notice',
        allowRepeat: true,
        description: 'Send a Matrix notice message (m.notice) for informational, non-disruptive output.',
        parameters: {
          type: 'object',
          properties: {
            roomId: {
              type: 'string',
              description: 'Matrix room identifier (aka streamId). Optional, will fallback to context.streamId.',
            },
            message: {
              type: 'string',
              description: 'Valid Matrix HTML notice content.',
            },
          },
          required: ['roomId', 'message'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'send_matrix_file',
        allowRepeat: true,
        description: `Send a stored file to a Matrix/Tchap room. Optionally include a message to send before the file in the same tool call.`,
        parameters: {
          type: 'object',
          properties: {
            roomId: {
              type: 'string',
              description: 'Matrix room identifier (aka streamId). Optional, will fallback to context.streamId.',
            },
            tempFileName: {
              type: 'string',
              description: 'Name of the file stored in TempFileManagerSkill.',
            },
            fileName: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
              description: 'File name visible to the recipient. Use null to keep the original file name.',
            },
            message: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
              description: 'Optional Matrix HTML message sent before the file.',
            },
            messageId: {
              type: ['string', 'null'],
              description: 'Message ID to reply to. Omit it or use null to send a new message.',
            },
          },
          required: ['roomId', 'tempFileName', 'fileName', 'message'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'load_matrix_message',
        allowRepeat: true,
        description: 'Load a Matrix message by messageId. If it is a file/image/audio, download it into TempFileManager like an incoming file message.',
        parameters: {
          type: 'object',
          properties: {
            roomId: {
              type: 'string',
              description: 'Matrix room identifier (aka streamId).',
            },
            messageId: {
              type: 'string',
              description: 'Matrix event identifier to load from room history.',
            },
          },
          required: ['roomId', 'messageId'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
    send_matrix_reaction :
    - Use to react to a specific Matrix message.
    - Requires the exact target messageId.
    - reactionKey accepts any Unicode emoji.
    - Prefer a single common emoji for consistency: 👍, ❤️, ✅, 🎉, 👀, 👏, 🙏, 😄, 🤔, 🚀.
    - Use this tool when you want to annotate an existing message with an emoji reaction.

    send_matrix_message :
    - Default tool for all textual and formated answers.
    - Set messageId when the answer must be sent as a reply to a specific message.
    - To mention a user, include an HTML link using matrix.to and the Matrix user id: <a href="https://matrix.to/#/@user:server.tld">Display Name</a>.
    - You can mention multiple users at different places in the same message by adding multiple links.
    - To mention the whole room, include @room in plain text in the message body.
    - The current stream users are provided in XML under <current_stream><stream_users><user name="..." id="..."></user></stream_users>.
    - Pick the user id from stream_users and build the mention link with that exact id.
    - Emojis are allowed in message content.
    - Use send_matrix_message when the emoji is part of a textual message (for example: "Merci 🙏").
    - Use send_matrix_reaction when the emoji should be attached as a reaction to a target message.
    - Never use Markdown.
    - Use <p>, <ul>, <ol>, <li>, <b>, <code>, <pre><code>, <blockquote>, <span> and <a href="...">...</a>.
    - Use <font color="#00ff00"> to emphasize text with color, for example: <font color="#ff0000">red text</font>.
    - Use <h1>, <h2>, and <h3> to structure your message with headings and subheadings.
    - For spoilers, use Matrix HTML: <span data-mx-spoiler>hidden text</span>.
    - Do not use /spoiler command in generated messages.
    - Use <br> only for simple line breaks.
    - In code blocks, escape literal <, > and &.
    - Do not embed files or media in HTML.
    - Never embed image in message, always use send_matrix_file to send image.
    - For long messages, always use clear, well-spaced HTML formatting, such as headings, subheadings, paragraphs, lists, tables, and colored text, to improve readability.

    send_matrix_notice:
    - Send an informational Matrix notice using msgtype: "m.notice".
    - Use it for non-disruptive, system-like feedback such as status updates, progress information, warnings, or technical notifications.
    - Do not use it for normal conversational replies.
    - Never use Markdown.
    - HTML formatting rules are identical to 'send_matrix_message'.

    Message presentation rules :
    - Do not send plain unstructured text unless the answer is a single short sentence.
    - For normal answers, use separate <p> blocks.
    - For steps, options, checks, or multiple points, use <ul> or <ol>.
    - For code or commands, use <pre><code>...</code></pre>.
    - For inline technical values, use <code>...</code>.
    - Avoid long wall-of-text paragraphs.

    send_matrix_file :
    - message is optional; when present, it is sent before the file.
    - messageId is optional; when present, the file message itself is sent as a reply.
    - Small text or HTML files should still be relayed to send_matrix_message.
    - Use only for image or binary files, explicit file requests, or content too large for a message.
    - Use send_matrix_file for binary or large text files.

    load_matrix_message :
    - Load a message by roomId + messageId from Matrix history.
    - If the loaded message is a file/image/audio, it is downloaded into TempFileManager.

    `;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      send_matrix_message: '📨 sending Matrix message',
      send_matrix_notice: '📢 sending Matrix notice',
      send_matrix_reaction: '👍 sending Matrix reaction',
      send_matrix_file: '📎 sending Matrix file',
      load_matrix_message: '📥 loading Matrix message',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'send_matrix_message':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.roomId, 64);
        break;
      }

      case 'send_matrix_notice':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.roomId, 64);
        break;
      }

      case 'send_matrix_reaction':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.messageId, 64);
        break;
      }

      case 'send_matrix_file':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
        break;
      }

      case 'load_matrix_message':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.messageId, 64);
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

//  - Use <span> to emphasize text with color, for example: <span data-mx-color="#ef4444;">red text</span>.
  get tempFileManagerSkill()
  {
    return this.agent.skills.get('TempFileManagerSkill');
  }

  #sanitizeMatrixHtml(html)
  {
    return String(html)
      .replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, (_, code) =>
        `<pre><code>${this.#escapeHtml(this.#normalizeCodeBlock(code))}</code></pre>`
      )
      .replace(/<code>([\s\S]*?)<\/code>/gi, (_, code) =>
        `<code>${this.#escapeHtml(this.#decodeHtml(code))}</code>`
      );
  }

  #normalizeCodeBlock(code)
  {
    return this.#decodeHtml(code)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\u00a0/g, ' ');
  }

  #escapeHtml(text)
  {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  #decodeHtml(text)
  {
    return String(text)
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&nbsp;', '\u00a0')
      .replaceAll('&amp;', '&');
  }

  async #pushOutputEvent(event)
  {
    const matrixInput = this.agent.inputs.find((input) => input.source === 'matrix');

    if (!matrixInput)
    {
      return;
    }

    await matrixInput.pushEvent(event);
  }

  async send_matrix_message(args = {}, context = {})
  {
    const roomId = args.roomId;
    const deliveredMessage = args.message;
    const messageId = typeof args.messageId === 'string' ? args.messageId.trim() : '';
    const normalizedMessageId = messageId.toLowerCase() === 'null' ? '' : messageId;
    const parentMessageId = normalizedMessageId;
    const message = this.#sanitizeMatrixHtml(deliveredMessage);

    let sendResult;

    if (parentMessageId)
    {
      sendResult = await this.matrixClient.sendReply(roomId, parentMessageId, message, true);
    }
    else
    {
      sendResult = await this.matrixClient.sendMessage(roomId, message, true);
    }

    const sentMessageId = this.matrixClient.extractMessageId(sendResult);

    // this.#pushOutputEvent({
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
      recipient: roomId,
      ...(parentMessageId ? { parentMessageId } : {}),
      ...(sentMessageId ? { messageId: sentMessageId } : {}),
      // delivered_message: deliveredMessage,
    };
  }

  async send_matrix_notice(args = {}, context = {})
  {
    const roomId = args.roomId;
    const deliveredMessage = args.message;
    const message = this.#sanitizeMatrixHtml(deliveredMessage);

    const sendResult = await this.matrixClient.sendNotice(roomId, message, true);
    const sentMessageId = this.matrixClient.extractMessageId(sendResult);

    return {
      ok: true,
      status: 'notice_delivered',
      recipient: roomId,
      ...(sentMessageId ? { messageId: sentMessageId } : {}),
    };
  }

  async send_matrix_reaction(args = {}, context = {})
  {
    const roomId = args.roomId;
    const targetMessageId = args.messageId.trim();
    const reactionKey = args.reactionKey.trim();

    await this.matrixClient.sendReaction(roomId, targetMessageId, reactionKey);

    return {
      ok: true,
      status: 'reaction_delivered',
      recipient: roomId,
      messageId: targetMessageId,
      reactionKey,
    };
  }

  async send_matrix_file(args = {}, context = {})
  {
    const roomId = args.roomId;
    const message = args.message?.trim() || '';
    const rawReplyMessageId = typeof args.messageId === 'string' ? args.messageId.trim() : '';
    const replyMessageId = rawReplyMessageId.toLowerCase() === 'null' ? '' : rawReplyMessageId;
    const tempFileManager = this.tempFileManagerSkill;

    const file = await tempFileManager._getFile(args.tempFileName, context.streamId, true, context);
    const buffer = file.data;

    const fileName = args.fileName?.trim() || args.tempFileName.split('/').pop();

    if (message)
    {
      await this.matrixClient.sendMessage(roomId, this.#sanitizeMatrixHtml(message), true);
    }

    let fileSendResult;

    if (file.mimeType?.startsWith('image/'))
    {
      fileSendResult = await this.matrixClient.sendImage(roomId, buffer, fileName, file.mimeType, replyMessageId || null);
    }
    else
    {
      fileSendResult = await this.matrixClient.sendFile(roomId, buffer, fileName, file.mimeType, replyMessageId || null);
    }

    const fileMessageId = this.matrixClient.extractMessageId(fileSendResult);
    const resultSize = Number.isFinite(fileSendResult?.size) ? fileSendResult.size : buffer.length;

    return {
      ok: true,
      status: 'file_delivered',
      recipient: roomId,
      ...(replyMessageId ? { parentMessageId: replyMessageId } : {}),
      tempFileName: args.tempFileName,
      fileName,
      mimeType: file.mimeType,
      size: resultSize,
      ...(fileMessageId ? { messageId: fileMessageId } : {}),
    };
  }

  async load_matrix_message(args = {}, context = {})
  {
    const roomId = args.roomId;
    const messageId = args.messageId.trim();
    const tempFileManager = this.tempFileManagerSkill;
    const event = await this.matrixClient.getRoomEvent(roomId, messageId);
    const content = event?.content ?? event?.clear_event?.content ?? {};
    const msgtype = content.msgtype ?? null;
    const body = content.body ?? '';

    const mimeType =
      content['org.matrix.msc1767.file']?.mimetype
      ?? content.info?.mimetype
      ?? null;

    const isImage = msgtype === 'm.image' || mimeType?.startsWith('image/');
    const isAudio = msgtype === 'm.audio' || mimeType?.startsWith('audio/');
    const isFile = msgtype === 'm.file';

    if (!isImage && !isAudio && !isFile)
    {
      return {
        ok: true,
        recipient: roomId,
        messageId: event?.event_id ?? messageId,
        msgtype,
        body: this.matrixClient.extractMessageBody(content),
      };
    }

    const dataType = isImage ? 'image' : isAudio ? 'audio' : 'file';
    const ref = this.matrixClient.extractFileRef(content);
    const file = content.file ?? content['org.matrix.msc1767.file']?.file ?? (ref ? { url: ref } : null);
    const downloaded = await this.matrixClient.downloadFile(file);

    const resolvedMimeType =
      mimeType
      ?? downloaded.contentType
      ?? downloaded.mimeType
      ?? (isImage ? 'image/png' : isAudio ? 'audio/mpeg' : 'application/octet-stream');

    const extension = AgentUtils.getExtensionFromMimeType(resolvedMimeType, dataType);
    const originalName =
      content['org.matrix.msc1767.file']?.name
      ?? content.filename
      ?? body
      ?? `${dataType}-${Date.now()}.${extension}`;
    const tempFileName = AgentUtils.buildTempAttachmentPath({
      source: 'matrix',
      streamId: roomId,
      messageId: event?.event_id ?? messageId,
      fileName: originalName,
      extension,
      fallbackType: dataType,
    });
    const resolvedSize = Number.isFinite(downloaded.size)
      ? downloaded.size
      : Buffer.from(downloaded.base64, 'base64').length;

    await tempFileManager.temp_file_remove({ tempFileName }, { ...context, streamId: context.streamId }).catch(() => {});
    await tempFileManager.temp_file_create({ tempFileName, mimeType: resolvedMimeType }, { ...context, streamId: context.streamId });

    if (AgentUtils.isTextMimeType(resolvedMimeType))
    {
      await tempFileManager.temp_file_insert({
        tempFileName,
        content: Buffer.from(downloaded.base64, 'base64').toString('utf8'),
        startLine: null,
      }, { ...context, streamId: context.streamId });
    }
    else
    {
      await tempFileManager.appendBuffer({
        tempFileName,
        data: Buffer.from(downloaded.base64, 'base64'),
      }, { ...context, streamId: context.streamId });
    }

    return {
      ok: true,
      recipient: roomId,
      messageId: event?.event_id ?? messageId,
      msgtype,
      tempFileName,
      fileName: originalName,
      mimeType: resolvedMimeType,
      size: resolvedSize,
      ref,
    };
  }

}