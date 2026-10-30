/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */

export class WebChatClient
{
  constructor({
    apiBaseUrl = 'http://127.0.0.1:3000/webchat/api',
    login,
    password,
    maxBodySizeBytes = 25 * 1024 * 1024,
    reconnectDelayMs = 10000,
  })
  {
    this.apiBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
    this.maxBodySizeBytes = Number(maxBodySizeBytes);
    this.reconnectDelayMs = reconnectDelayMs;
    this.loginCredentials = { login, password };
    this.messageHandler = null;
    this.authToken = '';
    this.userId = '';
    this.sseConnection = null;
    this.isStopped = false;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.typingStreams = new Map();
  }

  async registerUser(id, name, token)
  {
    return { id, name, token };
  }

  async login(login, password)
  {
    this.isStopped = false;
    this.loginCredentials = {
      login,
      password,
    };

    return await this.#authenticateAndConnect({
      login,
      password,
      throwOnFailure: true,
    });
  }

  onMessage(handler)
  {
    this.messageHandler = handler;
  }

  async start()
  {
    this.isStopped = false;

    const { login, password } = this.loginCredentials;
    await this.#authenticateAndConnect({ login, password, throwOnFailure: false });

    return this;
  }

  async stop()
  {
    this.isStopped = true;
    this.#initializeConnectionState();
  }

  async sendMessage(streamId, message, format = 'html', parentMessageId = null, attachments = [])
  {
    if (!this.#hasActiveSseConnections())
    {
      await this.#reconnectNow('send_message');
    }

    const response = await fetch(`${this.apiBaseUrl}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        streamId,
        message,
        format,
        files: Array.isArray(attachments) ? attachments.map((attachment) => ({
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          dataBase64: attachment.dataBase64,
        })) : [],
        ...(parentMessageId ? { parentMessageId } : {}),
      }),
    });

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok)
    {
      const messageText = typeof payload === 'object' && payload !== null
        ? String(payload.error ?? payload.message ?? 'send_message_failed')
        : String(payload || 'send_message_failed');

      throw new Error(messageText);
    }

    return {
      messageId: payload.messageId,
      streamId,
      content: message,
      format,
      attachments,
      ...(parentMessageId ? { parentMessageId } : {}),
      timestamp: new Date().toISOString(),
    };
  }

  async sendStatus(streamId, status)
  {
    return { streamId, status };
  }

  async sendTypingStart(streamId, timeout = 3000, label = '')
  {
    let typingStream = this.typingStreams.get(streamId);

    if (!typingStream)
    {
      typingStream = {
        typing: false,
        timeoutId: null,
        timeoutMs: timeout,
        label: '',
        sessionId: 0,
      };

      this.typingStreams.set(streamId, typingStream);
    }

    typingStream.typing = true;
    typingStream.timeoutMs = timeout;
    typingStream.label = label;
    typingStream.sessionId++;

    if (typingStream.timeoutId)
    {
      clearTimeout(typingStream.timeoutId);
      typingStream.timeoutId = null;
    }

    const sessionId = typingStream.sessionId;

    await this.#renewTyping(streamId, sessionId, 'start');

    return {
      streamId,
      timeout,
      label,
      status: 'processing',
    };
  }

  async sendTypingStop(streamId)
  {
    const typingStream = this.typingStreams.get(streamId);

    if (typingStream?.timeoutId)
    {
      clearTimeout(typingStream.timeoutId);
      typingStream.timeoutId = null;
    }

    if (typingStream)
    {
      typingStream.typing = false;
      typingStream.sessionId++;
    }

    try
    {
      await this.#postTyping(streamId, false, '', 'stop');
      return { streamId, status: 'idle' };
    }
    finally
    {
      this.typingStreams.delete(streamId);
    }
  }

  async sendTypingSubTask(streamId, { label = '', taskUid = '', status = '', cost = null, action = 'subtask_start' } = {})
  {
    await this.#postTyping(streamId, true, label || '', action, {
      taskUid,
      status,
      cost,
    });

    return {
      streamId,
      taskUid,
      status,
      cost,
      action,
    };
  }

  async sendReaction(streamId, relatedTo, reactionKey, sender = 'assistant', senderName = 'assistant', action = 'add')
  {
    if (!this.#hasActiveSseConnections())
    {
      await this.#reconnectNow('send_reaction');
    }

    const response = await fetch(`${this.apiBaseUrl}/streams/${encodeURIComponent(streamId)}/reactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        relatedTo,
        reactionKey,
        action,
        sender,
        senderId: this.userId,
        senderName,
      }),
    });

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok)
    {
      const messageText = typeof payload === 'object' && payload !== null
        ? String(payload.error ?? payload.message ?? 'send_reaction_failed')
        : String(payload || 'send_reaction_failed');

      throw new Error(messageText);
    }

    return {
      ok: true,
      eventId: payload.eventId,
      streamId,
      relatedTo,
      reactionKey,
      action,
      timestamp: new Date().toISOString(),
    };
  }

  async getMessageById(streamId, messageId)
  {
    const normalizedStreamId = String(streamId ?? '').trim();
    const normalizedMessageId = String(messageId ?? '').trim();

    if (!normalizedStreamId)
    {
      throw new Error('streamId_required');
    }

    if (!normalizedMessageId)
    {
      throw new Error('messageId_required');
    }

    if (!this.#hasActiveSseConnections())
    {
      await this.#reconnectNow('get_message_by_id');
    }

    const response = await fetch(
      `${this.apiBaseUrl}/streams/${encodeURIComponent(normalizedStreamId)}/messages/${encodeURIComponent(normalizedMessageId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      }
    );

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok)
    {
      const messageText = typeof payload === 'object' && payload !== null
        ? String(payload.error ?? payload.message ?? 'get_message_by_id_failed')
        : String(payload || 'get_message_by_id_failed');

      throw new Error(messageText);
    }

    return payload?.message ?? null;
  }

  async downloadAttachment(attachment = {})
  {
    const href = String(attachment?.href ?? attachment?.src ?? '').trim();

    if (!href)
    {
      throw new Error('attachment_href_required');
    }

    if (!this.#hasActiveSseConnections())
    {
      await this.#reconnectNow('download_attachment');
    }

    const response = await fetch(this.#resolveAttachmentUrl(href), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.authToken}`,
      },
    });

    if (!response.ok)
    {
      const bodyText = await response.text().catch(() => '');
      const errorSuffix = bodyText ? `:${bodyText}` : '';
      throw new Error(`download_attachment_http_${response.status}${errorSuffix}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = String(response.headers.get('content-type') || '').trim();
    const contentDisposition = String(response.headers.get('content-disposition') || '').trim();
    const fileName = this.#extractFileNameFromContentDisposition(contentDisposition)
      || String(attachment?.fileName ?? '').trim()
      || 'attachment.bin';

    return {
      href,
      fileName,
      mimeType: contentType || String(attachment?.mimeType ?? '').trim() || 'application/octet-stream',
      size: buffer.length,
      buffer,
    };
  }

  async #openSseChannel()
  {
    this.#closeSseConnection('replace_connection');

    const abortController = new AbortController();
    const openedAtMs = Date.now();

    const response = await fetch(`${this.apiBaseUrl}/events`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.authToken}`,
      },
      signal: abortController.signal,
    });

    if (!response.ok || !response.body)
    {
      throw new Error(`sse_open_failed_${response.status}`);
    }

    const readerTask = this.#runSseReader(response.body.getReader())
      .then((closeInfo) =>
      {
        this.#logSseChannelClosed({
          ...closeInfo,
          openedAtMs,
        });

        if (!this.isStopped)
        {
          this.#scheduleReconnect(`sse_closed:${closeInfo.reason}`);
        }
      })
      .catch((error) =>
      {
        const connectionState = this.sseConnection;
        const closeReason = String(connectionState?.closeReason || '').trim();
        const isExpectedAbort = closeReason === 'replace_connection' || closeReason === 'initialize_connection_state';

        if (this.isStopped || (this.#isAbortError(error) && isExpectedAbort))
        {
          this.#logSseChannelClosed({
            reason: this.isStopped ? 'client_stopped' : `stream_aborted:${closeReason || 'expected'}`,
            eventCount: 0,
            openedAtMs,
            lastEventAtMs: openedAtMs,
            closedAtMs: Date.now(),
          });
          return;
        }

        if (this.#isAbortError(error))
        {
          this.#logSseChannelClosed({
            reason: `stream_aborted:${closeReason || 'unexpected'}`,
            eventCount: 0,
            openedAtMs,
            lastEventAtMs: openedAtMs,
            closedAtMs: Date.now(),
          });

          this.#scheduleReconnect(`sse_aborted:${closeReason || 'unexpected'}`);
          return;
        }

        this.#logSseChannelError('user', error, { openedAtMs });

        this.#scheduleReconnect(error);
      })
      .finally(() =>
      {
        const currentConnection = this.sseConnection;

        if (currentConnection?.readerTask === readerTask)
        {
          this.sseConnection = null;
        }
      });

    const wasReconnect = this.reconnectAttempt > 0;

    this.sseConnection = {
      abortController,
      closeReason: '',
      openedAtMs,
      readerTask,
    };
    this.reconnectAttempt = 0;
    this.#clearReconnectTimer();
    console.log(`[WebChatClient] ${wasReconnect ? 'reconnected' : 'connected'}`);
  }

  async #ensureSseConnection()
  {
    if (this.sseConnection?.readerTask)
    {
      return;
    }

    try
    {
      await this.#openSseChannel();
    }
    catch (error)
    {
      const errorText = error instanceof Error ? error.message : String(error);
      this.#scheduleReconnect(errorText);
    }
  }

  async #postTyping(streamId, isTyping, label = '', typingAction = '', meta = null)
  {
    const taskUid = meta?.taskUid ? String(meta.taskUid).trim() : '';
    const status = meta?.status ? String(meta.status).trim().toLowerCase() : '';
    const cost = Number(meta?.cost);
    const hasCost = meta?.cost != null && Number.isFinite(cost) && cost >= 0;

    const response = await fetch(`${this.apiBaseUrl}/streams/${encodeURIComponent(streamId)}/typing`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        isTyping: isTyping === true,
        ...(label ? { label } : {}),
        ...(typingAction ? { typingAction } : {}),
        ...(taskUid ? { taskUid } : {}),
        ...(status ? { status } : {}),
        ...(hasCost ? { cost } : {}),
      }),
    });

    if (!response.ok)
    {
      const bodyText = await response.text();
      throw new Error(`typing_http_${response.status}${bodyText ? `:${bodyText}` : ''}`);
    }
  }

  async #renewTyping(streamId, sessionId, typingAction = 'refresh')
  {
    const typingStream = this.typingStreams.get(streamId);

    if (!typingStream || !typingStream.typing || typingStream.sessionId !== sessionId)
    {
      return;
    }

    await this.#postTyping(streamId, true, typingStream.label, typingAction);

    const refreshedTypingStream = this.typingStreams.get(streamId);

    if (!refreshedTypingStream || !refreshedTypingStream.typing || refreshedTypingStream.sessionId !== sessionId)
    {
      return;
    }

    if (refreshedTypingStream.timeoutId)
    {
      clearTimeout(refreshedTypingStream.timeoutId);
    }

    refreshedTypingStream.timeoutId = setTimeout(() =>
    {
      this.#renewTyping(streamId, sessionId, 'refresh').catch((error) =>
      {
        console.error(`[WebChatClient] Typing renewal failed for stream ${streamId}:`, error);
        this.#scheduleReconnect(error);
      });
    }, Math.floor(refreshedTypingStream.timeoutMs * 0.9));
  }

  #clearAllTypingRenewals()
  {
    for (const typingStream of this.typingStreams.values())
    {
      if (typingStream?.timeoutId)
      {
        clearTimeout(typingStream.timeoutId);
        typingStream.timeoutId = null;
      }
    }

    this.typingStreams.clear();
  }

  async #runSseReader(reader)
  {
    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;
    let lastEventAtMs = Date.now();

    try
    {
      while (true)
      {
        const { value, done } = await reader.read();

        if (done)
        {
          return {
            reason: 'upstream_stream_closed',
            eventCount,
            lastEventAtMs,
            closedAtMs: Date.now(),
          };
        }

        buffer += decoder.decode(value, { stream: true });
        let separatorIndex = buffer.indexOf('\n\n');

        while (separatorIndex >= 0)
        {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          const handled = this.#handleSseRawEvent(rawEvent);

          if (handled)
          {
            eventCount += 1;
            lastEventAtMs = Date.now();
          }

          separatorIndex = buffer.indexOf('\n\n');
        }
      }
    }
    finally
    {
      try
      {
        reader.releaseLock();
      }
      catch (error)
      {
        console.warn('[WebChatClient] Failed to release SSE reader lock:', error);
      }
    }
  }

  async #authenticateAndConnect({ login, password, throwOnFailure = false })
  {
    try
    {
      this.#initializeConnectionState();

      const response = await fetch(`${this.apiBaseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          login,
          password,
        }),
      });

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const payload = contentType.includes('application/json') ? await response.json() : await response.text();

      if (!response.ok)
      {
        const message = typeof payload === 'object' && payload !== null
          ? String(payload.error ?? payload.message ?? 'login_failed')
          : String(payload || 'login_failed');

        throw new Error(message);
      }

      const token = payload.token;
      const userId = String(payload?.user?.id ?? '').trim();

      this.authToken = token;
      this.userId = userId;

      await this.#ensureSseConnection();

      return {
        ok: true,
        token,
        userId,
        streamId: userId,
        authorization: `Bearer ${token}`,
      };
    }
    catch (error)
    {
      this.#scheduleReconnect(error);

      if (throwOnFailure)
      {
        throw error;
      }

      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  #scheduleReconnect(reason = '')
  {
    if (this.isStopped || !this.loginCredentials)
    {
      return;
    }

    if (this.reconnectTimer)
    {
      return;
    }

    this.reconnectAttempt += 1;
    const reasonText = reason instanceof Error
      ? reason.message
      : String(reason || 'connection_error');

    console.warn(
      `[WebChatClient] connection issue: ${reasonText}. `
      + `retry #${this.reconnectAttempt} in ${this.reconnectDelayMs}ms.`
    );

    this.reconnectTimer = setTimeout(() =>
    {
      this.reconnectTimer = null;

      if (this.isStopped || !this.loginCredentials)
      {
        return;
      }

      const { login, password } = this.loginCredentials;
      void this.#authenticateAndConnect({
        login,
        password,
        throwOnFailure: false,
      });
    }, this.reconnectDelayMs);
  }

  async #reconnectNow(reason)
  {
    if (this.isStopped || !this.loginCredentials)
    {
      return { ok: false };
    }

    console.warn(`[WebChatClient] ${reason}: immediate reconnect attempt.`);

    const { login, password } = this.loginCredentials;
    const reconnectResult = await this.#authenticateAndConnect({ login, password, throwOnFailure: false });

    if (reconnectResult?.ok === true)
    {
      await this.#ensureSseConnection();
    }

    if (reconnectResult?.ok !== true)
    {
      this.#scheduleReconnect(`${reason}_connection_not_restored`);
    }

    return reconnectResult;
  }

  #initializeConnectionState()
  {
    this.#clearReconnectTimer();
    this.#clearAllTypingRenewals();
    this.#closeSseConnection('initialize_connection_state');
  }

  #hasActiveSseConnections()
  {
    return Boolean(this.sseConnection?.readerTask);
  }

  #closeSseConnection(reason = 'manual_close')
  {
    const currentConnection = this.sseConnection;

    if (!currentConnection)
    {
      return;
    }

    currentConnection.closeReason = reason;
    currentConnection.abortController?.abort();
    this.sseConnection = null;
  }

  #clearReconnectTimer()
  {
    if (!this.reconnectTimer)
    {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  #resolveAttachmentUrl(href)
  {
    const normalizedHref = String(href ?? '').trim();

    if (!normalizedHref)
    {
      throw new Error('attachment_href_required');
    }

    if (/^https?:\/\//i.test(normalizedHref))
    {
      return normalizedHref;
    }

    const apiUrl = new URL(this.apiBaseUrl);

    if (normalizedHref.startsWith('/'))
    {
      return `${apiUrl.origin}${normalizedHref}`;
    }

    return new URL(normalizedHref, `${apiUrl.origin}/`).toString();
  }

  #extractFileNameFromContentDisposition(contentDisposition)
  {
    const normalizedValue = String(contentDisposition ?? '').trim();

    if (!normalizedValue)
    {
      return '';
    }

    const utf8Match = normalizedValue.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);

    if (utf8Match)
    {
      try
      {
        return decodeURIComponent(String(utf8Match[1] ?? '').trim());
      }
      catch (_error)
      {
        // Keep fallback filename parsing below.
      }
    }

    const quotedMatch = normalizedValue.match(/filename\s*=\s*"([^"]+)"/i);

    if (quotedMatch)
    {
      return String(quotedMatch[1] ?? '').trim();
    }

    const bareMatch = normalizedValue.match(/filename\s*=\s*([^;\s]+)/i);

    if (bareMatch)
    {
      return String(bareMatch[1] ?? '').trim();
    }

    return '';
  }

  #isAbortError(error)
  {
    if (!error)
    {
      return false;
    }

    const name = (error?.name ?? '').toLowerCase();
    const message = (error?.message ?? '').toLowerCase();

    return name === 'aborterror'
      || message.includes('aborted')
      || message.includes('terminated');
  }

  #handleSseRawEvent(rawEvent)
  {
    const lines = String(rawEvent).split(/\r?\n/);
    let eventName = '';
    const dataLines = [];

    for (const line of lines)
    {
      if (line.startsWith('event:'))
      {
        eventName = line.slice(6).trim();
        continue;
      }

      if (line.startsWith('data:'))
      {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (!eventName || dataLines.length === 0 || !this.messageHandler)
    {
      return false;
    }

    let payload = null;

    try
    {
      payload = JSON.parse(dataLines.join('\n'));
    }
    catch (error)
    {
      console.warn('[WebChatClient] Invalid SSE payload:', error);
      return false;
    }

    if (eventName === 'message')
    {
      if (payload.sender !== 'user' && payload.sender !== 'assistant')
      {
        return true;
      }

      if (payload.senderId === this.userId)
      {
        return true;
      }

      void this.messageHandler({
        streamId: payload.streamId,
        userId: payload.senderId,
        userName: payload.senderName,
        message: payload.content,
        files: Array.isArray(payload.attachments) ? payload.attachments : [],
        messageId: payload.messageId,
        parentMessageId: payload.parentMessageId ?? null,
        timestamp: payload.timestamp,
      });
      return true;
    }

    if (eventName === 'reaction')
    {
      if (payload.sender !== 'user')
      {
        return true;
      }

      void this.messageHandler({
        eventType: 'reaction',
        streamId: payload.streamId,
        userId: payload.senderId,
        userName: payload.senderName,
        relatedTo: payload.relatedTo,
        reactionKey: payload.reactionKey,
        action: payload.action,
        eventId: payload.eventId,
        timestamp: payload.timestamp,
      });

      return true;
    }

    if (eventName === 'heartbeat')
    {
      return true;
    }

    return true;
  }

  #logSseChannelClosed(closeInfo = {})
  {
    const normalizedReason = String(closeInfo.reason || 'unknown');
    const openedAtMs = Number(closeInfo.openedAtMs) || Date.now();
    const closedAtMs = Number(closeInfo.closedAtMs) || Date.now();
    const eventCount = Number(closeInfo.eventCount) || 0;
    const lastEventAtMs = Number(closeInfo.lastEventAtMs) || openedAtMs;
    const durationMs = Math.max(0, closedAtMs - openedAtMs);
    const idleMs = Math.max(0, closedAtMs - lastEventAtMs);
    const likelyTimeout = normalizedReason.includes('timeout') || (normalizedReason === 'upstream_stream_closed' && idleMs >= 60000);

    console.warn(
      `[WebChatClient] SSE disconnected reason=${normalizedReason} `
      + `durationMs=${durationMs} idleMs=${idleMs} eventCount=${eventCount} likelyTimeout=${likelyTimeout}`
    );
  }

  #logSseChannelError(streamId, error, { openedAtMs = Date.now() } = {})
  {
    const closedAtMs = Date.now();
    const durationMs = Math.max(0, closedAtMs - openedAtMs);
    const errorText = error instanceof Error ? `${error.name}:${error.message}` : String(error);

    console.error(
      `[WebChatClient] SSE error streamId=${streamId} durationMs=${durationMs} error=${errorText}`
    );
  }
}
