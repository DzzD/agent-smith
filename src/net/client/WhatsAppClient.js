/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import http from 'node:http';

export class WhatsAppClient
{
  constructor({
    accessToken,
    phoneNumberId,
    verifyToken,
    port = 3000,
    host = '0.0.0.0',
    webhookPath = '/whatsapp/webhook',
    graphApiVersion = 'v23.0',
  })
  {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.verifyToken = verifyToken;
    this.port = port;
    this.host = host;
    this.webhookPath = webhookPath;
    this.graphApiVersion = graphApiVersion;

    this.server = null;
    this.messageHandler = null;
    this.webhookProcessingChain = Promise.resolve();
  }

  async start()
  {
    if (this.server)
    {
      return;
    }

    this.server = http.createServer((request, response) =>
    {
      this.#handleRequest(request, response).catch((error) =>
      {
        console.error('[WhatsAppClient] Request handling error:', error);

        if (response.headersSent)
        {
          response.end();
          return;
        }

        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'internal_server_error' }));
      });
    });

    await new Promise((resolve, reject) =>
    {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, resolve);
    });

    console.log(`[WhatsAppClient] Webhook listening on http://${this.host}:${this.port}${this.webhookPath}`);
  }

  async stop()
  {
    if (!this.server)
    {
      return;
    }

    const server = this.server;
    this.server = null;

    await new Promise((resolve, reject) =>
    {
      server.close((error) =>
      {
        if (error)
        {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  onMessage(handler)
  {
    this.messageHandler = handler;
  }

  async sendMessage(recipientId, message)
  {
    if (typeof recipientId !== 'string' || !recipientId.trim())
    {
      throw new Error('recipientId is required and must be a non-empty string');
    }

    if (typeof message !== 'string' || !message.trim())
    {
      throw new Error('message is required and must be a non-empty string');
    }

    const endpointUrl = `https://graph.facebook.com/${this.graphApiVersion}/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientId,
      type: 'text',
      text: {
        preview_url: false,
        body: message,
      },
    };

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const rawBody = await response.text();

    if (!response.ok)
    {
      throw new Error(`WhatsApp Cloud API error (HTTP ${response.status}): ${rawBody}`);
    }

    const responseJson = rawBody ? JSON.parse(rawBody) : {};

    return responseJson;
  }

  extractMessageId(sendResult)
  {
    return sendResult.messages?.[0]?.id ?? null;
  }

  async #handleRequest(request, response)
  {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);

    if (url.pathname !== this.webhookPath)
    {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    if (request.method === 'GET')
    {
      this.#handleWebhookVerification(url, response);
      return;
    }

    if (request.method === 'POST')
    {
      await this.#handleWebhookPost(request, response);
      return;
    }

    response.writeHead(405, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'method_not_allowed' }));
  }

  #handleWebhookVerification(url, response)
  {
    const hubMode = url.searchParams.get('hub.mode');
    const hubVerifyToken = url.searchParams.get('hub.verify_token');
    const hubChallenge = url.searchParams.get('hub.challenge');

    if (hubMode === 'subscribe' && hubVerifyToken === this.verifyToken)
    {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end(hubChallenge ?? '');
      return;
    }

    response.writeHead(403, { 'Content-Type': 'text/plain' });
    response.end('Forbidden');
  }

  async #handleWebhookPost(request, response)
  {
    const rawBody = await this.#readRequestBody(request);
    let payload;

    try
    {
      payload = rawBody ? JSON.parse(rawBody) : {};
    }
    catch (error)
    {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_json' }));
      return;
    }

    await this.#enqueueWebhookProcessing(async () =>
    {
      await this.#processWebhookPayload(payload);
    });

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
  }

  async #enqueueWebhookProcessing(task)
  {
    const currentTask = this.webhookProcessingChain.then(task);

    this.webhookProcessingChain = currentTask.catch((error) =>
    {
      console.error('[WhatsAppClient] Webhook processing error:', error);
    });

    await currentTask;
  }

  async #processWebhookPayload(payload)
  {
    console.dir(payload, { depth: null });
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];

    for (const entry of entries)
    {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes)
      {
        await this.#processChange(change);
      }
    }
  }

  async #processChange(change)
  {
    const value = change?.value ?? {};
    const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
    const messages = Array.isArray(value?.messages) ? value.messages : [];

    for (const status of statuses)
    {
      console.dir({
        messageId: status?.id,
        status: status?.status,
        recipientId: status?.recipient_id,
        errors: status?.errors,
        conversation: status?.conversation,
        pricing: status?.pricing,
      }, { depth: null });
    }
    if (!messages.length)
    {
      return;
    }

    const contacts = Array.isArray(value?.contacts) ? value.contacts : [];

    for (const message of messages)
    {
      if (message?.type !== 'text')
      {
        const ignoredType = message?.type ?? 'unknown';
        console.log(`[WhatsAppClient] Ignoring unsupported message type: ${ignoredType}`);
        continue;
      }

      const senderContact = contacts.find((contact) => contact?.wa_id === message.from) ?? null;
      const senderName = senderContact?.profile?.name ?? message.from;
      const normalizedMessage = {
        messageId: message.id,
        from: message.from,
        senderName,
        timestamp: this.#toIsoTimestamp(message.timestamp),
        type: 'text',
        text: message.text?.body,
        raw: message,
      };

      await this.messageHandler(normalizedMessage);
    }
  }

  #toIsoTimestamp(timestamp)
  {
    const unixTimestampSeconds = Number(timestamp);

    if (!Number.isFinite(unixTimestampSeconds))
    {
      return new Date().toISOString();
    }

    return new Date(unixTimestampSeconds * 1000).toISOString();
  }

  async #readRequestBody(request)
  {
    const chunks = [];

    for await (const chunk of request)
    {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks).toString('utf8');
  }
}