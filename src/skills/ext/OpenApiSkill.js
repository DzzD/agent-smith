/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { Agent } from '../../Agent.js';
import { AgentSkill } from '../../AgentSkill.js';
import YAML from 'yaml';

export class OpenApiSkill extends AgentSkill
{
  constructor({ id, description, specUrl, apiBaseUrl = null } = {})
  {
    super();

    this.id = id;
    this.description = description;
    this.specUrl = specUrl;
    this.apiBaseUrl = apiBaseUrl ?? this.#deriveApiBaseUrl(specUrl);

    this.listToolName = `${id}_openapi_list_endpoints`;
    this.describeToolName = `${id}_openapi_describe_endpoint`;

    this.specCacheFileName = `open_api_${id}_spec.tmp`;
    this.endpointsCacheFileName = `open_api_${id}_endpoints.tmp`;

    this.tools = [
      {
        type: 'function',
        name: this.listToolName,
        description: `Returns the compact endpoint list for the "${this.id}" API.`,
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            search: {
              type: 'string',
              description: 'Optional plain text filter. Use "|" for alternatives.',
            },
          },
          required: ['search'],
        },
      },
      {
        type: 'function',
        name: this.describeToolName,
        description: `Describes one endpoint from the "${this.id}" API.`,
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            method: {
              type: 'string',
              description: 'HTTP method, for example GET or POST.',
            },
            path: {
              type: 'string',
              description: 'Endpoint path, for example /api/v1/example.',
            },
          },
          required: ['method', 'path'],
        },
      },
    ];

    this[this.listToolName] = async (args = {}, context = {}) => this.listEndpoints(args, context);

    this[this.describeToolName] = async (args = {}, context = {}) => this.describeEndpoint(args, context);
  }

  get tempFileManagerSkill()
  {
    return this.agent.skills.get('TempFileManagerSkill');
  }

  get usage()
  {
    return `
- Use ${this.listToolName} to find the relevant endpoint.
- Always use ${this.describeToolName} before calling an endpoint.
- Then use HttpSkill functions such as http_get or http_post to execute the real HTTP request.
- Build the request strictly from the described endpoint.
- Do not guess request parameters, multipart field names, JSON property names, value types, request structure, or output format when the endpoint description is available.
- For multipart/form-data endpoints, if ${this.describeToolName} returns fileFields, use those exact field names in HttpSkill files.
- For multipart/form-data endpoints, if ${this.describeToolName} returns formFields, use those exact field names in HttpSkill formFields.
- If the described endpoint returns a PDF, image, audio file, archive, or other binary or file output, call HttpSkill with outputMode "temp_file".
- Do not use outputMode "return" for binary or file outputs.
`.trim();
  }

  async load(context = {})
  {
    const refresh = context.refresh === true;
    const globalContext = this.#buildGlobalContext(context);

    if (!refresh)
    {
      const listed = JSON.parse(await this.tempFileManagerSkill.temp_file_list({}, globalContext));
      const files = Array.isArray(listed?.files) ? listed.files : [];
      const hasSpec = files.some((file) => file.tempFileName === this.specCacheFileName);
      const hasEndpoints = files.some((file) => file.tempFileName === this.endpointsCacheFileName);

      if (hasSpec && hasEndpoints)
      {
        return {
          id: this.id,
          status: 'already_loaded',
          specUrl: this.specUrl,
          apiBaseUrl: this.apiBaseUrl,
          specCacheFileName: this.specCacheFileName,
          endpointsCacheFileName: this.endpointsCacheFileName,
          message: `OpenAPI specification is already loaded in "${this.specCacheFileName}" and "${this.endpointsCacheFileName}".`,
        };
      }
    }

    const httpSkill = this.agent.skills.get('HttpSkill');

    if (!httpSkill)
    {
      throw new Error('HttpSkill is required to download OpenAPI specifications.');
    }

    const response = await httpSkill.http_get({
      url: this.specUrl,
      outputMode: 'temp_file',
      outputFileName: this.specCacheFileName,
    }, globalContext);

    const raw = await this.tempFileManagerSkill.temp_file_read({
      tempFileName: this.specCacheFileName,
      encoding: 'utf8',
      startLine: null,
      endLine: null,
      applyLimit: false,
    }, globalContext);

    const spec = this.#parseSpec(raw, this.specUrl);

    await this.tempFileManagerSkill.temp_file_remove({ tempFileName: this.specCacheFileName }, globalContext);
    await this.tempFileManagerSkill.temp_file_create({
      tempFileName: this.specCacheFileName,
      mimeType: 'application/json',
    }, globalContext);
    await this.tempFileManagerSkill.temp_file_insert({
      tempFileName: this.specCacheFileName,
      content: JSON.stringify(spec, null, 2),
      startLine: null,
    }, globalContext);

    const endpoints = this.#extractEndpoints(spec);
    const endpointsText = endpoints
      .map((endpoint) => `${endpoint.method} ${endpoint.path}`)
      .join('\n');

    await this.tempFileManagerSkill.temp_file_remove({ tempFileName: this.endpointsCacheFileName }, globalContext);
    await this.tempFileManagerSkill.temp_file_create({
      tempFileName: this.endpointsCacheFileName,
      mimeType: 'text/plain',
    }, globalContext);
    await this.tempFileManagerSkill.temp_file_insert({
      tempFileName: this.endpointsCacheFileName,
      content: endpointsText,
      startLine: null,
    }, globalContext);

    return {
      id: this.id,
      status: 'loaded',
      specUrl: this.specUrl,
      apiBaseUrl: this.apiBaseUrl,
      specCacheFileName: this.specCacheFileName,
      endpointsCacheFileName: this.endpointsCacheFileName,
      title: spec.info?.title ?? null,
      version: spec.info?.version ?? null,
      description: spec.info?.description ?? null,
      servers: Array.isArray(spec.servers)
        ? spec.servers.map((server) => server.url).filter(Boolean)
        : [],
      endpointCount: endpoints.length,
      endpoints,
      message: `OpenAPI specification has been downloaded and normalized to "${this.specCacheFileName}". Compact endpoint list has been written to "${this.endpointsCacheFileName}".`,
      httpResponse: response ?? null,
    };
  }

  async listEndpoints({ search = '' } = {}, context = {})
  {
    await this.load(context);

    const spec = await this.#readSpec(context);
    const endpoints = this.#extractEndpoints(spec);

    const searchTerms = String(search || '')
      .toLowerCase()
      .split(/[\s|]+/)
      .map((term) => term.trim())
      .filter(Boolean);

    const filtered = !searchTerms.length
      ? endpoints
      : endpoints.filter((endpoint) =>
        searchTerms.some((term) =>
          [
            endpoint.method,
            endpoint.path,
            endpoint.operationId,
            ...(endpoint.tags || []),
            endpoint.summary,
            endpoint.description,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(term)
        )
      );

    return {
      id: this.id,
      search,
      count: filtered.length,
      endpointsCacheFileName: this.endpointsCacheFileName,
      endpoints: filtered.map((endpoint) => ({
                  method: endpoint.method,
                  path: endpoint.path,
                  absoluteUrl: this.#buildAbsoluteUrl(endpoint.path, spec),
                  operationId: endpoint.operationId,
                  tags: endpoint.tags,
                  summary: endpoint.summary,
                  description: endpoint.description,
                })),
    };
  }

  async describeEndpoint({ method, path } = {}, context = {})
  {
    await this.load(context);

    const spec = await this.#readSpec(context);
    const normalizedMethod = String(method || '').trim().toLowerCase();
    const normalizedPath = this.#normalizePath(path);
    const pathItem = spec.paths?.[normalizedPath];

    if (!pathItem || !pathItem[normalizedMethod])
    {
      throw new Error(`Endpoint not found: ${method} ${path}`);
    }

    const operation = pathItem[normalizedMethod];

    const mergedParameters = [
      ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
      ...(Array.isArray(operation.parameters) ? operation.parameters : []),
    ].map((parameter) => this.#resolveParameter(parameter, spec));

    const requestContent = operation.requestBody?.content ?? {};
    const responseContent =
      operation.responses?.['200']?.content ??
      operation.responses?.['201']?.content ??
      operation.responses?.default?.content ??
      {};

    const requestBody = this.#simplifyRequestBody(requestContent, spec);

    return {
      id: this.id,
      method: normalizedMethod.toUpperCase(),
      path: normalizedPath,
      absoluteBaseUrl: this.#resolveAbsoluteBaseUrl(spec),
      absoluteUrl: this.#buildAbsoluteUrl(normalizedPath, spec),
      baseUrls: this.#resolveServerUrls(spec),
      apiBaseUrl: this.apiBaseUrl,
      endpointsCacheFileName: this.endpointsCacheFileName,
      specCacheFileName: this.specCacheFileName,
      operationId: operation.operationId ?? null,
      tags: operation.tags ?? [],
      summary: operation.summary ?? null,
      description: operation.description ?? null,
      parameters: mergedParameters,
      requestBody,
      requestContentTypes: requestBody?.contentTypes ?? [],
      requestBodyRequired: operation.requestBody?.required ?? false,
      fileFields: requestBody?.fileFields ?? [],
      formFields: requestBody?.formFields ?? [],
      multipartFieldNames: requestBody?.multipartFieldNames ?? [],
      responses: Object.keys(operation.responses ?? {}),
      responseContentTypes: Object.keys(responseContent),
      binaryOutput: this.#isBinaryResponse(responseContent),
      security: operation.security ?? null,
    };
  }

  async #readSpec(context = {})
  {
    const globalContext = this.#buildGlobalContext(context);

    const text = await this.tempFileManagerSkill.temp_file_read({
      tempFileName: this.specCacheFileName,
      encoding: 'utf8',
      startLine: null,
      endLine: null,
      applyLimit: false,
    }, globalContext);

    return this.#parseSpec(text, this.specCacheFileName);
  }

  #buildGlobalContext(context = {})
  {
    return {
      ...context,
      streamId: Agent.GLOBAL_STREAM_ID,
    };
  }

  #parseSpec(raw, sourceLabel = 'OpenAPI specification')
  {
    const text = String(raw ?? '').trim();

    if (!text)
    {
      throw new Error(`OpenAPI specification is empty: ${sourceLabel}`);
    }

    let jsonErrorMessage = '';

    try
    {
      return this.#validateSpecShape(JSON.parse(text), sourceLabel);
    }
    catch (error)
    {
      jsonErrorMessage = error instanceof Error ? error.message : String(error);
    }

    try
    {
      return this.#validateSpecShape(YAML.parse(text), sourceLabel);
    }
    catch (yamlError)
    {
      const yamlErrorMessage = yamlError instanceof Error ? yamlError.message : String(yamlError);

      throw new Error(
        `Failed to parse OpenAPI specification from "${sourceLabel}" as JSON or YAML. ` +
        `JSON error: ${jsonErrorMessage}. YAML error: ${yamlErrorMessage}`
      );
    }
  }

  #validateSpecShape(spec, sourceLabel)
  {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec))
    {
      throw new Error(`Invalid OpenAPI document in "${sourceLabel}": expected an object.`);
    }

    if (!spec.paths || typeof spec.paths !== 'object')
    {
      throw new Error(`Invalid OpenAPI document in "${sourceLabel}": missing "paths" object.`);
    }

    return spec;
  }

  #extractEndpoints(spec)
  {
    const endpoints = [];

    for (const [path, pathItem] of Object.entries(spec.paths ?? {}))
    {
      for (const [method, operation] of Object.entries(pathItem ?? {}))
      {
        if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method))
        {
          continue;
        }

        endpoints.push({
          method: method.toUpperCase(),
          path,
          operationId: operation?.operationId ?? null,
          tags: operation?.tags ?? [],
          summary: operation?.summary ?? '',
          description: operation?.description ?? '',
        });
      }
    }

    return endpoints;
  }

  #simplifyRequestBody(content, spec)
  {
    if (!content || typeof content !== 'object')
    {
      return null;
    }

    const contentTypes = Object.keys(content);
    const multipart = content['multipart/form-data'];
    const json = content['application/json'];
    const form = content['application/x-www-form-urlencoded'];
    const selected =
      multipart ??
      json ??
      form ??
      Object.values(content)[0];

    if (!selected?.schema)
    {
      return {
        contentTypes,
        type: null,
        required: [],
        properties: {},
        fileFields: [],
        formFields: [],
        multipartFieldNames: [],
      };
    }

    const schema = this.#resolveSchema(selected.schema, spec);
    const properties = schema?.properties ?? {};
    const required = Array.isArray(schema?.required) ? schema.required : [];

    const normalizedProperties = {};
    const fileFields = [];
    const formFields = [];

    for (const [name, propertySchema] of Object.entries(properties))
    {
      const resolvedProperty = this.#resolveSchema(propertySchema, spec);
      const simplified = this.#simplifySchema(resolvedProperty, spec);

      normalizedProperties[name] = simplified;

      if (this.#isFileSchema(resolvedProperty))
      {
        fileFields.push({
          name,
          required: required.includes(name),
          type: simplified?.type ?? null,
          format: simplified?.format ?? null,
          description: simplified?.description ?? null,
        });
      }
      else
      {
        formFields.push({
          name,
          required: required.includes(name),
          type: simplified?.type ?? null,
          format: simplified?.format ?? null,
          enum: simplified?.enum ?? null,
          description: simplified?.description ?? null,
        });
      }
    }

    return {
      contentTypes,
      type: schema?.type ?? null,
      required,
      properties: normalizedProperties,
      fileFields,
      formFields,
      multipartFieldNames: multipart ? Object.keys(properties) : [],
    };
  }

  #resolveParameter(parameter, spec)
  {
    const resolved = this.#resolveSchema(parameter, spec);

    return {
      name: resolved?.name ?? null,
      in: resolved?.in ?? null,
      required: resolved?.required ?? false,
      description: resolved?.description ?? null,
      schema: this.#simplifySchema(resolved?.schema ?? null, spec),
    };
  }

  #simplifySchema(schema, spec)
  {
    const resolved = this.#resolveSchema(schema, spec);

    if (!resolved || typeof resolved !== 'object')
    {
      return null;
    }

    const result = {
      type: resolved.type ?? null,
      format: resolved.format ?? null,
      description: resolved.description ?? null,
    };

    if (Array.isArray(resolved.enum))
    {
      result.enum = resolved.enum;
    }

    if (resolved.items)
    {
      result.items = this.#simplifySchema(resolved.items, spec);
    }

    if (resolved.properties && typeof resolved.properties === 'object')
    {
      result.properties = {};

      for (const [key, value] of Object.entries(resolved.properties))
      {
        result.properties[key] = this.#simplifySchema(value, spec);
      }
    }

    if (Array.isArray(resolved.required))
    {
      result.required = resolved.required;
    }

    if (typeof resolved.default !== 'undefined')
    {
      result.default = resolved.default;
    }

    return result;
  }

  #resolveSchema(schema, spec, seen = new Set())
  {
    if (!schema || typeof schema !== 'object')
    {
      return schema;
    }

    if (schema.$ref)
    {
      const ref = schema.$ref;

      if (seen.has(ref))
      {
        return {};
      }

      seen.add(ref);

      const resolvedRef = this.#getRef(spec, ref);
      const merged = {
        ...this.#resolveSchema(resolvedRef, spec, seen),
        ...Object.fromEntries(
          Object.entries(schema).filter(([key]) => key !== '$ref'),
        ),
      };

      seen.delete(ref);
      return this.#resolveSchema(merged, spec, seen);
    }

    if (Array.isArray(schema.allOf) && schema.allOf.length)
    {
      const merged = {};

      for (const entry of schema.allOf)
      {
        const resolvedEntry = this.#resolveSchema(entry, spec, seen);

        if (resolvedEntry?.properties)
        {
          merged.properties = {
            ...(merged.properties ?? {}),
            ...resolvedEntry.properties,
          };
        }

        if (Array.isArray(resolvedEntry?.required))
        {
          merged.required = [
            ...new Set([
              ...(merged.required ?? []),
              ...resolvedEntry.required,
            ]),
          ];
        }

        for (const [key, value] of Object.entries(resolvedEntry ?? {}))
        {
          if (key === 'properties' || key === 'required')
          {
            continue;
          }

          if (typeof merged[key] === 'undefined')
          {
            merged[key] = value;
          }
        }
      }

      for (const [key, value] of Object.entries(schema))
      {
        if (key !== 'allOf')
        {
          merged[key] = value;
        }
      }

      return merged;
    }

    if (Array.isArray(schema.oneOf) && schema.oneOf.length)
    {
      return this.#resolveSchema(schema.oneOf[0], spec, seen);
    }

    if (Array.isArray(schema.anyOf) && schema.anyOf.length)
    {
      return this.#resolveSchema(schema.anyOf[0], spec, seen);
    }

    return schema;
  }

  #getRef(spec, ref)
  {
    if (!ref.startsWith('#/'))
    {
      throw new Error(`Unsupported OpenAPI reference: ${ref}`);
    }

    let current = spec;
    const parts = ref
      .slice(2)
      .split('/')
      .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));

    for (const part of parts)
    {
      current = current?.[part];
    }

    if (typeof current === 'undefined')
    {
      throw new Error(`OpenAPI reference not found: ${ref}`);
    }

    return current;
  }

  #isFileSchema(schema)
  {
    if (!schema || typeof schema !== 'object')
    {
      return false;
    }

    if (schema.type === 'string' && ['binary', 'base64'].includes(schema.format))
    {
      return true;
    }

    if (schema.type === 'array')
    {
      return this.#isFileSchema(schema.items);
    }

    return false;
  }

  #isBinaryResponse(content)
  {
    return Object.keys(content ?? {}).some((type) =>
      type === 'application/pdf' ||
      type.startsWith('image/') ||
      type.startsWith('audio/') ||
      type.startsWith('video/') ||
      type === 'application/octet-stream' ||
      type.includes('zip')
    );
  }

  #resolveServerUrls(spec)
  {
    const urls = Array.isArray(spec.servers)
      ? spec.servers.map((server) => server?.url).filter(Boolean)
      : [];

    return urls.length ? urls : [this.apiBaseUrl];
  }

  #resolveAbsoluteBaseUrl(spec)
  {
    const urls = this.#resolveServerUrls(spec);

    for (const url of urls)
    {
      if (/^https?:\/\//i.test(url))
      {
        return url.replace(/\/+$/, '');
      }

      if (url === '/')
      {
        return this.apiBaseUrl.replace(/\/+$/, '');
      }

      if (url.startsWith('/'))
      {
        return `${this.apiBaseUrl.replace(/\/+$/, '')}${url}`;
      }
    }

    return this.apiBaseUrl.replace(/\/+$/, '');
  }

  #buildAbsoluteUrl(path, spec)
  {
    const base = this.#resolveAbsoluteBaseUrl(spec).replace(/\/+$/, '');
    const normalizedPath = this.#normalizePath(path);

    return `${base}${normalizedPath}`;
  }

  #normalizePath(path)
  {
    const value = String(path || '').trim();

    return !value ? '/' : value.startsWith('/') ? value : `/${value}`;
  }

  #deriveApiBaseUrl(specUrl)
  {
    const url = new URL(specUrl);
    const pathname = url.pathname.replace(/\/+$/, '');

    if (pathname.endsWith('/api-docs/file-processing'))
    {
      url.pathname = pathname.slice(0, -'/api-docs/file-processing'.length) || '/';
      return url.toString().replace(/\/+$/, '');
    }

    const lastSlash = pathname.lastIndexOf('/');
    url.pathname = lastSlash > 0 ? pathname.slice(0, lastSlash) : '/';

    return url.toString().replace(/\/+$/, '');
  }
}
