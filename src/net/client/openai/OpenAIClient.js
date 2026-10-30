/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
export class OpenAIClient
{
  constructor({ apiKey, url = 'https://api.openai.com/' } = {})
  {
    this.apiKey = apiKey;
    this.url = url;
  }

  extractCost(payload, depth = 0)
  {
    const cost = payload?.cost
      ?? payload?.response_cost
      ?? payload?._hidden_params?.response_cost
      ?? payload?.additional_usage_values?.cost
      ?? payload?.usage?.additional_usage_values?.cost
      ?? payload?.usage?.cost
      ?? payload?.usage?.total_cost;

    if (cost != null)
    {
      const numericCost = Number(cost);

      if (Number.isFinite(numericCost) && numericCost >= 0)
      {
        return numericCost;
      }
    }

    if (depth >= 3)
    {
      return null;
    }

    for (const nestedPayload of [payload?.payload, payload?.response])
    {
      if (!nestedPayload || nestedPayload === payload)
      {
        continue;
      }

      const nestedCost = this.extractCost(nestedPayload, depth + 1);

      if (nestedCost != null)
      {
        return nestedCost;
      }
    }

    return null;
  }

  applyCost(target, payload)
  {
    const cost = this.extractCost(payload);

    if (cost != null)
    {
      target.cost = cost;
    }

    return target;
  }

  applyResponseCost(target, headers)
  {
    const cost = headers?.get?.('x-litellm-response-cost') ?? headers?.get?.('x-response-cost');
    const numericCost = Number(cost);

    if (cost != null && Number.isFinite(numericCost) && numericCost >= 0)
    {
      target.cost = numericCost;
    }

    return target;
  }

  async parseResponse(response)
  {
    const text = await response.text();

    try
    {
      return text ? JSON.parse(text) : null;
    }
    catch
    {
      return text;
    }
  }

  async getModels()
  {
    return await this.getJson('models', {
      errorContext: 'Unable to load models',
    });
  }

  _buildEndpointUrl(endpointPath = '')
  {
    const normalizedBaseUrl = String(this.url ?? '').trim() || 'https://api.openai.com/';
    const baseUrlObject = new URL(normalizedBaseUrl);
    const normalizedPathname = baseUrlObject.pathname.replace(/\/+$/, '').toLowerCase();
    const hasV1Suffix = normalizedPathname.endsWith('/v1');
    let normalizedEndpointPath = String(endpointPath ?? '').trim().replace(/^\/+/, '');

    if (!normalizedEndpointPath)
    {
      return baseUrlObject.toString();
    }

    if (hasV1Suffix && normalizedEndpointPath.toLowerCase().startsWith('v1/'))
    {
      normalizedEndpointPath = normalizedEndpointPath.slice(3);
    }

    if (!hasV1Suffix && !normalizedEndpointPath.toLowerCase().startsWith('v1/'))
    {
      normalizedEndpointPath = `v1/${normalizedEndpointPath}`;
    }

    return new URL(normalizedEndpointPath, baseUrlObject).toString();
  }

  _buildHeaders({ contentType = null, headers = {} } = {})
  {
    const builtHeaders = {
      Accept: 'application/json',
      ...headers,
    };

    if (contentType)
    {
      builtHeaders['Content-Type'] = contentType;
    }

    if (this.apiKey != null && String(this.apiKey).trim())
    {
      builtHeaders.Authorization = `Bearer ${String(this.apiKey).trim()}`;
    }

    return builtHeaders;
  }

  _extractErrorDetails(payload)
  {
    if (payload?.error?.message)
    {
      return String(payload.error.message);
    }

    if (typeof payload === 'string')
    {
      return payload;
    }

    if (payload == null)
    {
      return '';
    }

    try
    {
      return JSON.stringify(payload);
    }
    catch
    {
      return String(payload);
    }
  }

  _throwRequestError({ response, payload, context = 'OpenAI request failed', endpointUrl = '' })
  {
    const details = this._extractErrorDetails(payload);
    const endpointLabel = endpointUrl ? ` (${endpointUrl})` : '';
    throw new Error(`${context}${endpointLabel}: ${response.status} ${response.statusText}${details ? ` - ${details}` : ''}`);
  }

  async getJson(endpointPath, { headers = {}, errorContext = 'OpenAI GET failed' } = {})
  {
    const endpointUrl = this._buildEndpointUrl(endpointPath);
    const response = await fetch(endpointUrl, {
      method: 'GET',
      headers: this._buildHeaders({ headers }),
    });

    const payload = await this.parseResponse(response);

    if (!response.ok)
    {
      this._throwRequestError({
        response,
        payload,
        context: errorContext,
        endpointUrl,
      });
    }

    if (payload && typeof payload === 'object')
    {
      this.applyResponseCost(payload, response.headers);
    }

    return this.applyCost({
      endpointUrl,
      payload,
    }, payload);
  }

  async postJson(endpointPath, body, { headers = {}, errorContext = 'OpenAI JSON request failed', signal = undefined } = {})
  {
    const endpointUrl = this._buildEndpointUrl(endpointPath);
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: this._buildHeaders({ contentType: 'application/json', headers }),
      body: JSON.stringify(body ?? {}),
      signal,
    });

    const payload = await this.parseResponse(response);

    if (!response.ok)
    {
      this._throwRequestError({
        response,
        payload,
        context: errorContext,
        endpointUrl,
      });
    }

    if (payload && typeof payload === 'object')
    {
      this.applyResponseCost(payload, response.headers);
    }

    return this.applyCost({
      endpointUrl,
      payload,
    }, payload);
  }

  async postForm(endpointPath, formData, { headers = {}, errorContext = 'OpenAI multipart request failed', signal = undefined } = {})
  {
    const endpointUrl = this._buildEndpointUrl(endpointPath);
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: this._buildHeaders({ headers }),
      body: formData,
      signal,
    });

    const payload = await this.parseResponse(response);

    if (!response.ok)
    {
      this._throwRequestError({
        response,
        payload,
        context: errorContext,
        endpointUrl,
      });
    }

    if (payload && typeof payload === 'object')
    {
      this.applyResponseCost(payload, response.headers);
    }

    return this.applyCost({
      endpointUrl,
      payload,
    }, payload);
  }

  async postBinary(endpointPath, body, { headers = {}, errorContext = 'OpenAI binary request failed', signal = undefined } = {})
  {
    const endpointUrl = this._buildEndpointUrl(endpointPath);
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: this._buildHeaders({
        contentType: 'application/json',
        headers: {
          Accept: '*/*',
          ...headers,
        },
      }),
      body: JSON.stringify(body ?? {}),
      signal,
    });

    if (!response.ok)
    {
      const payload = await this.parseResponse(response);

      this._throwRequestError({
        response,
        payload,
        context: errorContext,
        endpointUrl,
      });
    }

    const responseArrayBuffer = await response.arrayBuffer();

    return this.applyResponseCost({
      endpointUrl,
      buffer: Buffer.from(responseArrayBuffer),
    }, response.headers);
  }
}
