/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import path from 'node:path';
import {
  MatrixClient as MatrixSdkClient,
  MatrixAuth,
  // AutojoinRoomsMixin,
  SimpleFsStorageProvider,
  RustSdkCryptoStorageProvider,
} from 'matrix-bot-sdk';
import { StoreType } from '@matrix-org/matrix-sdk-crypto-nodejs';

export class MatrixClient
{
  constructor({
    matrixServerUrl,
    username = null,
    password = null,
    accessToken = null,
    deviceId = null,
    storagePath = './.matrix-storage',
  })
  {
    this.matrixServerUrl = matrixServerUrl;
    this.username = username;
    this.password = password;
    this.accessToken = accessToken;
    this.deviceId = deviceId;
    this.storagePath = storagePath;
    this.client = null;
    this.typingStreams = new Map();
  }

  createStorageProviders()
  {
    const basePath = path.resolve(this.storagePath);
    return {
      storageProvider: new SimpleFsStorageProvider(path.join(basePath, 'storage.json')),
      cryptoStore: new RustSdkCryptoStorageProvider(path.join(basePath, 'crypto'), StoreType.Sqlite),
    };
  }

  async queryOwnDevice()
  {
    const userId = await this.getUserId();
    const resolvedDeviceId = await this.#resolveDeviceId();

    const result = await this.client.doRequest(
      'POST',
      '/_matrix/client/v3/keys/query',
      null,
      {
        device_keys: {
          [userId]: [resolvedDeviceId],
        },
      }
    );

    // console.dir(result.device_keys?.[userId]?.[this.deviceId], {
    //   depth: null,
    //   colors: true,
    // });

    return result.device_keys?.[userId]?.[resolvedDeviceId] ?? null;
  }

  async #resolveDeviceId()
  {
    const configuredDeviceId = typeof this.deviceId === 'string' ? this.deviceId.trim() : '';

    if (configuredDeviceId)
    {
      return configuredDeviceId;
    }

    const whoAmI = await this.client.getWhoAmI();
    const discoveredDeviceId = typeof whoAmI?.device_id === 'string' ? whoAmI.device_id.trim() : '';

    if (!discoveredDeviceId)
    {
      throw new Error('Unable to resolve Matrix device_id from /account/whoami.');
    }

    this.deviceId = discoveredDeviceId;

    console.log(`[MatrixClient] Discovered MATRIX_DEVICE_ID = ${this.deviceId}`);

    if (typeof this.accessToken === 'string' && this.accessToken.trim())
    {
      console.log(`[MatrixClient] Current MATRIX_ACCESS_TOKEN = ${this.accessToken}`);
    }

    return discoveredDeviceId;
  }

  createMatrixClient(token, homeserverUrl = this.matrixServerUrl)
  {
    const { storageProvider, cryptoStore } = this.createStorageProviders();
    return new MatrixSdkClient(homeserverUrl, token, storageProvider, cryptoStore);
  }

  async putAccountData(accountData = {}, accountDataType = 'mon.type')
  {
    const normalizedType = String(accountDataType ?? '').trim();

    if (!normalizedType)
    {
      throw new Error('accountDataType is required');
    }

    if (!accountData || typeof accountData !== 'object' || Array.isArray(accountData))
    {
      throw new Error('accountData must be an object');
    }

    return await this.client.setAccountData(normalizedType, accountData);
  }

  async getAccountData(accountDataType = 'mon.type')
  {
    const normalizedType = String(accountDataType ?? '').trim();

    if (!normalizedType)
    {
      throw new Error('accountDataType is required');
    }

    return await this.client.getAccountData(normalizedType);
  }

  async connect()
  {
    if (!this.accessToken)
    {
      const auth = new MatrixAuth(this.matrixServerUrl);
      const tempClient = await auth.passwordLogin(this.username, this.password);

      this.accessToken = tempClient.accessToken;
      console.log(`New accessToken = ${this.accessToken}`);
      this.matrixServerUrl = tempClient.homeserverUrl ?? this.matrixServerUrl;
    }

    this.client = this.createMatrixClient(this.accessToken, this.matrixServerUrl);

    try
    {
      // Avoid startup M_NOT_FOUND in matrix-bot-sdk DMs cache bootstrap.
      await this.client.setAccountData('m.direct', {});
    }
    catch (error)
    {
      console.warn('[MatrixClient] Unable to pre-initialize m.direct account data:', error?.message || error);
    }

    this.client.on('room.invite', async (roomId) =>
    {
      try
      {
        await this.client.joinRoom(roomId);
        console.log(`[MatrixClient] Joined room ${roomId}`);
      }
      catch (error)
      {
        console.error(`[MatrixClient] Failed to join room ${roomId}:`, error);
      }
    });

    await this.client.start();

    try
    {
      await this.putAccountData({ foo: 'bar' }, 'mon.type');
      const initializedAccountData = await this.getAccountData('mon.type');
      console.log(`[MatrixClient] Account data mon.type initialized: ${JSON.stringify(initializedAccountData)}`);
    }
    catch (error)
    {
      console.warn('[MatrixClient] Account data initialization skipped:', error?.message || error);
    }

    await this.queryOwnDevice();
  }

  async getUserId()
  {
    return this.client.getUserId();
  }

  onMessage(handler)
  {
    this.client.on('room.event', async (roomId, event) =>
    {
      const eventType = String(event?.type || '');

      if (!['m.room.message', 'm.reaction'].includes(eventType))
      {
        return;
      }

      const content = event?.content ?? {};
      const timestamp = Number.isFinite(event?.origin_server_ts)
        ? new Date(event.origin_server_ts).toISOString()
        : new Date().toISOString();

      if (eventType === 'm.reaction')
      {
        const relatesTo = content?.['m.relates_to'] ?? {};

        await handler({
          roomId,
          eventId: event?.event_id ?? null,
          eventType: 'reaction',
          content,
          timestamp,
          sender: event?.sender ?? null,
          relatedEventId: relatesTo?.event_id ?? null,
          reactionKey: relatesTo?.key ?? null,
          raw: event,
        });

        return;
      }

      await handler({
        roomId,
        eventId: event?.event_id ?? null,
        eventType: 'message',
        content,
        timestamp,
        sender: event?.sender ?? content?.sender ?? null,
        body: this.extractMessageBody(content),
        msgtype: content?.msgtype ?? null,
        url: content?.url ?? null,
        file: content?.file ?? null,
        filename: content?.filename ?? null,
        info: content?.info ?? null,
        raw: event,
      });
    });
  }

  getMediaDownloadUrl(mxcUrl)
  {
    const [, serverName, mediaId] = /^mxc:\/\/([^/]+)\/(.+)$/.exec(mxcUrl);
    return `${this.matrixServerUrl}/_matrix/client/v1/media/download/${encodeURIComponent(serverName)}/${encodeURIComponent(mediaId)}`;
  }

  async downloadFile(file)
  {
    const mxcUrl = file?.url;

    if (!mxcUrl)
    {
      throw new Error('Missing Matrix file url');
    }

    if (!this.client?.crypto)
    {
      throw new Error('Matrix crypto is not available');
    }

    const hasEncryptionMetadata = Boolean(file?.v || file?.key || file?.iv || file?.hashes);
    let buffer;

    if (hasEncryptionMetadata)
    {
      const encryptedFile = file?.v ? file : { ...file, v: 'v2' };
      buffer = await this.client.crypto.decryptMedia(encryptedFile);
    }
    else
    {
      const downloaded = await this.client.downloadContent(mxcUrl);
      buffer = downloaded.data;
    }

    return {
      url: mxcUrl,
      size: buffer.length,
      base64: buffer.toString('base64'),
    };
  }

  async getRoomEvent(roomId, messageId)
  {
    if (!roomId)
    {
      throw new Error('roomId is required');
    }

    if (!messageId)
    {
      throw new Error('messageId is required');
    }

    return await this.client.getEvent(roomId, messageId);
  }

  async listPinnedMessages(roomId)
  {
    try
    {
      const content = await this.client.getRoomStateEvent(
        roomId,
        'm.room.pinned_events',
        ''
      );

      return Array.isArray(content?.pinned) ? content.pinned : [];
    }
    catch (error)
    {
      if (error?.body?.errcode === 'M_NOT_FOUND' || error?.errcode === 'M_NOT_FOUND')
      {
        return [];
      }

      throw error;
    }
  }

  async setPinnedMessages(roomId, eventIds)
  {
    return await this.client.sendStateEvent(
      roomId,
      'm.room.pinned_events',
      '',
      {
        pinned: [...new Set(eventIds)],
      }
    );
  }

  async pinMessage(roomId, eventId)
  {
    const pinned = await this.listPinnedMessages(roomId);

    if (pinned.includes(eventId))
    {
      return {
        changed: false,
        pinned,
      };
    }

    pinned.push(eventId);

    const result = await this.setPinnedMessages(roomId, pinned);

    return {
      changed: true,
      pinned,
      result,
    };
  }

  async unpinMessage(roomId, eventId)
  {
    const pinned = await this.listPinnedMessages(roomId);
    const updatedPinned = pinned.filter((pinnedEventId) => pinnedEventId !== eventId);

    if (updatedPinned.length === pinned.length)
    {
      return {
        changed: false,
        pinned,
      };
    }

    const result = await this.setPinnedMessages(roomId, updatedPinned);

    return {
      changed: true,
      pinned: updatedPinned,
      result,
    };
  }

  async clearPinnedMessages(roomId)
  {
    return await this.setPinnedMessages(roomId, []);
  }

  async listRoomUsers(roomId)
  {
    if (!roomId)
    {
      throw new Error('roomId is required');
    }

    const response = await this.client.doRequest(
      'GET',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/members`,
      {
        membership: 'join',
      },
      null
    );

    const chunk = Array.isArray(response?.chunk) ? response.chunk : [];

    return chunk
      .map((memberEvent) =>
      {
        const userId = typeof memberEvent?.state_key === 'string' ? memberEvent.state_key.trim() : '';
        const name = typeof memberEvent?.content?.displayname === 'string' ? memberEvent.content.displayname.trim() : '';

        if (!userId)
        {
          return null;
        }

        return {
          userId,
          name: name || userId,
        };
      })
      .filter(Boolean);
  }

  extractFileRef(content)
  {
    return (content.url || content.file?.url || content['org.matrix.msc1767.file']?.file?.url || '').trim();
  }

  extractMessageBody(content)
  {
    if (!content)
    {
      return '';
    }

    const rawBody = typeof content.body === 'string' ? content.body.trim() : '';
    if (rawBody)
    {
      return rawBody;
    }

    if (content.msgtype)
    {
      const filename = content?.info?.filename;
      return filename ? `${content.msgtype}: ${filename}` : `[${content.msgtype}]`;
    }

    return '';
  }

  extractMessageId(sendResult)
  {
    if (typeof sendResult === 'string' && sendResult.trim())
    {
      return sendResult.trim();
    }

    if (sendResult && typeof sendResult === 'object')
    {
      const value = sendResult.event_id ?? sendResult.eventId ?? sendResult.id ?? '';

      if (typeof value === 'string' && value.trim())
      {
        return value.trim();
      }
    }

    return null;
  }

  async sendMessage(roomId, message, formatted = true)
  {
    const payload = {
      msgtype: 'm.text',
      body: message,
    };

    if (formatted)
    {
      payload.format = 'org.matrix.custom.html';
      payload.formatted_body = message;
    }

    const result = await this.client.sendMessage(roomId, payload);

    if (this.typingStreams.get(roomId)?.typing)
    {
      await this.sendTypingStart(roomId);
    } 

    return result;
  }

  async sendNotice(roomId, message, formatted = true)
  {
    const payload = {
      msgtype: 'm.notice',
      body: message,
    };

    if (formatted)
    {
      payload.format = 'org.matrix.custom.html';
      payload.formatted_body = message;
    }

    const result = await this.client.sendMessage(roomId, payload);

    if (this.typingStreams.get(roomId)?.typing)
    {
      await this.sendTypingStart(roomId);
    }

    return result;
  }

  async sendReply(roomId, eventId, message, formatted = true)
  {
    const payload = {
      msgtype: 'm.text',
      body: message,
      'm.relates_to': {
        'm.in_reply_to': {
          event_id: eventId,
        },
      },
    };

    if (formatted)
    {
      payload.format = 'org.matrix.custom.html';
      payload.formatted_body = message;
    }

    const result = await this.client.sendMessage(roomId, payload);

    if (this.typingStreams.get(roomId)?.typing)
    {
      await this.sendTypingStart(roomId);
    }

    return result;
  }


  async sendFile(roomId, buffer, fileName, mimeType = 'application/octet-stream', replyToEventId = null)
  {
    const mxcUrl = await this.client.uploadContent(buffer, mimeType, fileName);

    const payload = {
      msgtype: 'm.file',
      body: fileName,
      filename: fileName,
      url: mxcUrl,
      info: {
        mimetype: mimeType,
        size: buffer.length,
      },
    };

    if (typeof replyToEventId === 'string' && replyToEventId.trim())
    {
      payload['m.relates_to'] = {
        'm.in_reply_to': {
          event_id: replyToEventId.trim(),
        },
      };
    }

    const sendResult = await this.client.sendMessage(roomId, payload);

    if (this.typingStreams.get(roomId)?.typing)
    {
      await this.sendTypingStart(roomId);
    } 

    const sentMessageId = this.extractMessageId(sendResult);

    return {
      ...(sendResult && typeof sendResult === 'object' ? sendResult : {}),
      ...(sentMessageId ? { event_id: sentMessageId, eventId: sentMessageId, id: sentMessageId } : {}),
      ref: mxcUrl,
      fileName,
      mimeType,
      size: buffer.length,
    };
  }

  async sendImage(roomId, buffer, fileName, mimeType = 'image/png', replyToEventId = null)
  {
    if (!/\.[a-z0-9]+$/i.test(fileName))
    {
      const extensionByMimeType = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
      };

      fileName += extensionByMimeType[mimeType] || '.png';
    }

    const mxcUrl = await this.client.uploadContent(buffer, mimeType, fileName);
    
    const payload = {
      msgtype: 'm.image',
      body: fileName,
      filename: fileName,
      url: mxcUrl,
      info: {
        mimetype: mimeType,
        size: buffer.length,
      },
    };

    if (typeof replyToEventId === 'string' && replyToEventId.trim())
    {
      payload['m.relates_to'] = {
        'm.in_reply_to': {
          event_id: replyToEventId.trim(),
        },
      };
    }

    const sendResult = await this.client.sendMessage(roomId, payload);

    if (this.typingStreams.get(roomId)?.typing)
    {
      await this.sendTypingStart(roomId);
    }

    const sentMessageId = this.extractMessageId(sendResult);

    return {
      ...(sendResult && typeof sendResult === 'object' ? sendResult : {}),
      ...(sentMessageId ? { event_id: sentMessageId, eventId: sentMessageId, id: sentMessageId } : {}),
      ref: mxcUrl,
      fileName,
      mimeType,
      size: buffer.length,
    };
  }

  async sendReaction(roomId, eventId, key)
  {
    const result = await this.client.sendEvent(roomId, 'm.reaction', {
      'm.relates_to': {
        rel_type: 'm.annotation',
        event_id: eventId,
        key,
      },
    });

    if (this.typingStreams.get(roomId)?.typing)
    {
      await this.sendTypingStart(roomId);
    }

    return result;
  }

  async sendTypingStart(roomId, timeout = 1000)
  {
    let typingStream = this.typingStreams.get(roomId);

    if (!typingStream)
    {
      typingStream = {
        typing: false,
        timeout: null,
        sessionId: 0,
      };

      this.typingStreams.set(roomId, typingStream);
    }

    typingStream.typing = true;
    typingStream.sessionId++;

    if (typingStream.timeout)
    {
      clearTimeout(typingStream.timeout);
      typingStream.timeout = null;
    }

    const sessionId = typingStream.sessionId;
    const userId = await this.getUserId();

    const url = `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/typing/${encodeURIComponent(userId)}`;

    const startTyping = async () =>
    {
      const currentTypingStream = this.typingStreams.get(roomId);

      if (!currentTypingStream || !currentTypingStream.typing || currentTypingStream.sessionId !== sessionId)
      {
        return;
      }
      // console.log("typing start stop");
      await this.client.doRequest(
        'PUT',
        url,
        null,
        {
          typing: false
        }
      );

      if (!currentTypingStream.typing || currentTypingStream.sessionId !== sessionId)
      {
        return;
      }

      await this.client.doRequest(
        'PUT',
        url,
        null,
        {
          typing: true,
          timeout
        }
      );      
      // console.log("typing start stop end");

      if (!currentTypingStream.typing || currentTypingStream.sessionId !== sessionId)
      {
        return;
      }

      if (currentTypingStream.timeout)
      {
        clearTimeout(currentTypingStream.timeout);
      }

      currentTypingStream.timeout = setTimeout(
        () =>
        {
          startTyping().catch((error) =>
          {
            console.error(`[MatrixClient] Typing renewal failed for room ${roomId}:`, error);
          });
        },
        Math.floor(timeout * 0.9)
      );
    };

    await startTyping();

    return true;
  }

  async sendTypingStop(roomId)
  {
    const typingStream = this.typingStreams.get(roomId);

    if (typingStream?.timeout)
    {
      clearTimeout(typingStream.timeout);
      typingStream.timeout = null;
    }

    if (typingStream)
    {
      typingStream.typing = false;
      typingStream.sessionId++;
    }

    const userId = await this.getUserId();

    try
    {
      // console.log("typing stop");
      return await this.client.doRequest(
        'PUT',
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/typing/${encodeURIComponent(userId)}`,
        null,
        {
          typing: false
        }
      );
    }
    finally
    {
      this.typingStreams.delete(roomId);
    }
  }
}
