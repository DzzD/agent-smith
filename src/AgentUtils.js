/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
const CONTENT_TYPE_MAP = {
  'application/json': 'json',
  'application/ogg': 'ogg',
  'application/octet-stream': 'bin',
  'application/pdf': 'pdf',
  'application/x-7z-compressed': '7z',
  'application/x-gzip': 'gz',
  'application/gzip': 'gz',
  'application/x-ndjson': 'jsonl',
  'application/xml': 'xml',
  'application/yaml': 'yaml',
  'application/x-yaml': 'yaml',
  'application/x-javascript': 'js',
  'application/javascript': 'js',
  'application/typescript': 'ts',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/x-zip-compressed': 'zip',
  'application/zip': 'zip',
  'application/vnd.rar': 'rar',
  'application/x-rar-compressed': 'rar',
  'application/x-tar': 'tar',
  'audio/flac': 'flac',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mp3': 'mp3',
  'audio/mpeg': 'mp3',
  'audio/mpeg3': 'mpeg',
  'audio/mpga': 'mpga',
  'audio/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
  'text/css': 'css',
  'text/csv': 'csv',
  'text/html': 'html',
  'text/javascript': 'js',
  'text/jsx': 'jsx',
  'text/markdown': 'md',
  'text/plain': 'txt',
  'text/tab-separated-values': 'tsv',
  'text/xml': 'xml',
  'text/yaml': 'yaml',
  'text/x-yaml': 'yaml',
  'text/x-typescript': 'ts',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
};

const EXTENSION_ALIAS_ENTRIES = [
  ['text', 'text/plain'],
  ['log', 'text/plain'],
  ['markdown', 'text/markdown'],
  ['md', 'text/markdown'],
  ['htm', 'text/html'],
  ['yml', 'text/yaml'],
  ['yaml', 'text/yaml'],
  ['jsonl', 'application/x-ndjson'],
  ['mjs', 'application/javascript'],
  ['cjs', 'application/javascript'],
  ['ts', 'application/typescript'],
  ['tsx', 'text/plain'],
  ['jsx', 'text/plain'],
  ['css', 'text/css'],
  ['jpeg', 'image/jpeg'],
  ['jfif', 'image/jpeg'],
  ['oga', 'audio/ogg'],
  ['m4v', 'video/mp4'],
  ['tgz', 'application/gzip'],
  ['tar', 'application/x-tar'],
  ['rar', 'application/vnd.rar'],
  ['7z', 'application/x-7z-compressed'],
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['xls', 'application/vnd.ms-excel'],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['ppt', 'application/vnd.ms-powerpoint'],
  ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['zip', 'application/zip'],
  ['gz', 'application/gzip'],
  ['csv', 'text/csv'],
  ['tsv', 'text/tab-separated-values'],
  ['svg', 'image/svg+xml'],
  ['bmp', 'image/bmp'],
  ['ico', 'image/x-icon'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
  ['mov', 'video/quicktime'],
  ['avi', 'video/x-msvideo'],
  ['mkv', 'video/x-matroska'],
];

const EXTENSION_TO_MIME_TYPE = (() =>
{
  const map = new Map();

  for (const [mimeType, extension] of Object.entries(CONTENT_TYPE_MAP))
  {
    if (extension && !map.has(extension))
    {
      map.set(extension, mimeType);
    }
  }

  for (const [extension, mimeType] of EXTENSION_ALIAS_ENTRIES)
  {
    if (!map.has(extension))
    {
      map.set(extension, mimeType);
    }
  }

  return map;
})();

const INVALID_FILE_NAME_CHARS = /[\\/:*?"<>|]+/g;

const FALLBACK_EXTENSION_MAP = {
  image: 'png',
  audio: 'mp3',
  video: 'mp4',
  text: 'txt',
  json: 'json',
  file: 'bin',
  binary: 'bin',
  bin: 'bin',
};

const TEXT_ONLY_FILE_NAMES = new Set([
  'readme',
  'license',
  'licence',
  'changelog',
  'todo',
  'notes',
  'makefile',
]);

export class AgentUtils
{
  static parseArrayInput(inputValue)
  {
    if (inputValue === null || inputValue === undefined)
    {
      return null;
    }

    if (typeof inputValue === 'object')
    {
      return inputValue;
    }

    if (typeof inputValue !== 'string')
    {
      return null;
    }

    const text = inputValue.trim();

    if (!text || text === 'null')
    {
      return null;
    }

    const normalizedText = text.replaceAll("'", '"');

    return JSON.parse(normalizedText);
  }

  static normalizeRequiredString(rawValue, label = 'value')
  {
    if (typeof rawValue !== 'string')
    {
      throw new Error(`Invalid ${label}`);
    }

    const normalized = rawValue.trim();

    if (!normalized)
    {
      throw new Error(`Invalid ${label}`);
    }

    return normalized;
  }

  static hasFileExtension(fileName)
  {
    if (typeof fileName !== 'string')
    {
      return false;
    }

    return /\.[^./\\]+$/.test(fileName.trim());
  }

  static isTextMimeType(mimeType)
  {
    const value = String(mimeType || '').trim().toLowerCase();

    if (!value)
    {
      return false;
    }

    const base = value.split(';')[0].trim();

    if (!base)
    {
      return false;
    }

    if (base.startsWith('text/'))
    {
      return true;
    }

    return base === 'application/json'
      || base === 'application/xml'
      || base === 'application/javascript'
      || base === 'application/x-javascript'
      || base === 'image/svg+xml'
      || base === 'application/x-www-form-urlencoded'
      || base.endsWith('+json')
      || base.endsWith('+xml');
  }

  static decodeBase64(value)
  {
    const invalidBase64Error = () =>
    {
      throw new Error('Invalid Base64 content');
    };

    const rawValue = String(value);
    let normalizedValue = rawValue
      .replace(/[ \t\r\n]+/g, '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    if (normalizedValue.length % 4 === 1)
    {
      invalidBase64Error();
    }

    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedValue))
    {
      invalidBase64Error();
    }

    const hasPadding = normalizedValue.includes('=');

    if (hasPadding)
    {
      if (normalizedValue.length % 4 !== 0)
      {
        invalidBase64Error();
      }
    }
    else
    {
      const remainder = normalizedValue.length % 4;

      if (remainder === 2)
      {
        normalizedValue += '==';
      }
      else if (remainder === 3)
      {
        normalizedValue += '=';
      }
    }

    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalizedValue))
    {
      invalidBase64Error();
    }

    const decodedBuffer = Buffer.from(normalizedValue, 'base64');
    const normalizedWithoutPadding = normalizedValue.replace(/=+$/, '');
    const reencodedWithoutPadding = decodedBuffer.toString('base64').replace(/=+$/, '');

    if (reencodedWithoutPadding !== normalizedWithoutPadding)
    {
      invalidBase64Error();
    }

    return decodedBuffer;
  }

  static contentTypeToExtension(contentType)
  {
    const normalized = String(contentType || '')
      .split(';')[0]
      .trim()
      .toLowerCase();

    if (!normalized)
    {
      return null;
    }

    if (normalized.includes('zip'))
    {
      return 'zip';
    }

    return CONTENT_TYPE_MAP[normalized] ?? null;
  }

  static getExtensionFromMimeType(mimeType, fallbackType = 'file')
  {
    const direct = AgentUtils.contentTypeToExtension(mimeType);

    if (direct)
    {
      return direct;
    }

    const normalized = String(mimeType || '').trim().toLowerCase();

    if (normalized)
    {
      const base = normalized.split(';')[0];
      const slashIndex = base.indexOf('/');

      if (slashIndex !== -1 && slashIndex < base.length - 1)
      {
        const subtype = base.slice(slashIndex + 1);
        const cleanedSubtype = AgentUtils.#normalizeMimeSubtype(subtype);

        if (cleanedSubtype)
        {
          return cleanedSubtype;
        }
      }
    }

    return AgentUtils.#fallbackExtension(fallbackType);
  }

  static sanitizeFileName(fileName)
  {
    const baseName = typeof fileName === 'string' && fileName.trim()
      ? fileName.trim()
      : `file-${Date.now()}`;

    const sanitized = baseName.replace(INVALID_FILE_NAME_CHARS, '_');

    return sanitized || `file-${Date.now()}`;
  }

  static ensureExtension(fileName, extension)
  {
    const sanitizedName = AgentUtils.sanitizeFileName(fileName);
    const normalizedExtension = String(extension || '')
      .trim()
      .replace(/^[.]+/, '')
      .toLowerCase();

    if (!normalizedExtension)
    {
      return sanitizedName;
    }

    if (sanitizedName.toLowerCase().endsWith(`.${normalizedExtension}`))
    {
      return sanitizedName;
    }

    const baseName = AgentUtils.hasFileExtension(sanitizedName)
      ? sanitizedName.replace(/\.[^./\\]+$/, '')
      : sanitizedName;

    return `${baseName}.${normalizedExtension}`;
  }

  static sanitizePathSegment(value, fallbackValue = 'unknown')
  {
    const normalizedValue = typeof value === 'string'
      ? value.trim()
      : String(value ?? '').trim();
    const sanitizedValue = normalizedValue
      .replace(INVALID_FILE_NAME_CHARS, '_')
      .replace(/[\s]+/g, '_');

    return sanitizedValue || fallbackValue;
  }

  static buildTempAttachmentPath({ source, streamId, messageId, fileName, extension, fallbackType = 'file' } = {})
  {
    const normalizedExtension = String(extension || '').trim().replace(/^[.]+/, '').toLowerCase()
      || AgentUtils.#fallbackExtension(fallbackType);
    const fallbackFileName = `${fallbackType}-${Date.now()}.${normalizedExtension}`;
    const resolvedFileName = AgentUtils.ensureExtension(fileName || fallbackFileName, normalizedExtension);
    const sourceSegment = AgentUtils.sanitizePathSegment(source, 'unknown');
    const streamSegment = AgentUtils.sanitizePathSegment(streamId, 'unknown-stream');
    const messageSegment = AgentUtils.sanitizePathSegment(messageId, 'unknown-message');

    return `${sourceSegment}/${streamSegment}/${messageSegment}/${resolvedFileName}`;
  }

  static getFileExtension(fileName)
  {
    if (typeof fileName !== 'string')
    {
      return '';
    }

    const match = fileName.trim().match(/\.([^./\\]+)$/);

    if (!match)
    {
      return '';
    }

    return match[1].toLowerCase();
  }

  static getMimeTypeFromExtension(extension)
  {
    if (typeof extension !== 'string')
    {
      return null;
    }

    const normalized = extension.trim().replace(/^[.]+/, '').toLowerCase();

    if (!normalized)
    {
      return null;
    }

    return EXTENSION_TO_MIME_TYPE.get(normalized) ?? null;
  }

  static guessMimeTypeFromFileName(fileName, {
    isBinary = null,
    fallbackBinaryMimeType = 'application/octet-stream',
    fallbackTextMimeType = 'text/plain',
  } = {})
  {
    const extension = AgentUtils.getFileExtension(fileName);

    if (extension)
    {
      const mimeType = AgentUtils.getMimeTypeFromExtension(extension);

      if (mimeType)
      {
        return mimeType;
      }
    }

    if (isBinary === false)
    {
      return fallbackTextMimeType;
    }

    if (isBinary === true)
    {
      return fallbackBinaryMimeType;
    }

    if (AgentUtils.#looksLikeTextualFileName(fileName))
    {
      return fallbackTextMimeType;
    }

    return fallbackBinaryMimeType;
  }

  static #normalizeMimeSubtype(subtype)
  {
    const value = String(subtype || '').trim().toLowerCase();

    if (!value)
    {
      return '';
    }

    let normalized = value.replace(/^x-/, '').replace(/^vnd\./, '');

    if (normalized.includes('+'))
    {
      normalized = normalized.split('+')[0];
    }

    switch (normalized)
    {
      case 'jpeg':
        return 'jpg';
      case 'plain':
        return 'txt';
      case 'mpeg3':
        return 'mpeg';
      case 'wave':
        return 'wav';
      default:
        break;
    }

    const cleaned = normalized.replace(/[^a-z0-9]+/g, '');

    return cleaned;
  }

  static #fallbackExtension(fallbackType)
  {
    const normalized = String(fallbackType || '').trim().toLowerCase();

    if (!normalized)
    {
      return 'bin';
    }

    if (FALLBACK_EXTENSION_MAP[normalized])
    {
      return FALLBACK_EXTENSION_MAP[normalized];
    }

    const cleaned = normalized.replace(/[^a-z0-9]+/g, '');

    return cleaned || 'bin';
  }

  static #looksLikeTextualFileName(fileName)
  {
    const normalized = String(fileName || '').trim().toLowerCase();

    if (!normalized)
    {
      return false;
    }

    if (TEXT_ONLY_FILE_NAMES.has(normalized))
    {
      return true;
    }

    return /^[a-z0-9._-]+$/.test(normalized);
  }

  static truncate(text, maxLength)
  {
    const value = typeof text === 'string' ? text : String(text ?? '');

    if (typeof maxLength !== 'number' || maxLength < 0 || value.length <= maxLength)
    {
      return value;
    }

    return value.slice(0, maxLength);
  }

  static stringStrimLeft(str, maxLength, padding = '...')
  {
    const value = typeof str === 'string' ? str : String(str ?? '');

    if (typeof maxLength !== 'number' || maxLength < 0 || value.length <= maxLength)
    {
      return value;
    }

    if (maxLength === 0)
    {
      return '';
    }

    const prefix = typeof padding === 'string' ? padding : String(padding ?? '');

    if (!prefix)
    {
      return value.slice(-maxLength);
    }

    if (prefix.length >= maxLength)
    {
      return prefix.slice(0, maxLength);
    }

    const tailLength = maxLength - prefix.length;
    return `${prefix}${value.slice(-tailLength)}`;
  }

  static stringifyForPrompt(data)
  {
    if (data == null) return '';
    if (typeof data === 'string') return data.trim();

    try
    {
      return JSON.stringify(data, null, 2);
    }
    catch
    {
      return String(data);
    }
  }

  static formatToolResult(result)
  {
    if (result == null) return '';

    const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2).replace(/^[ \t]+/gm, '');
    return content;
    // return content.length <= 4000
    //   ? content
    //   : `${content.slice(0, 4000)}... [truncated ${content.length} chars]`;
  }

  static stableStringify(value)
  {
    if (Array.isArray(value))
    {
      return `[${value.map((item) => AgentUtils.stableStringify(item)).join(',')}]`;
    }

    if (value && typeof value === 'object')
    {
      return `{${Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${AgentUtils.stableStringify(value[key])}`
      ).join(',')}}`;
    }

    return JSON.stringify(value);
  }

  static indentXmlPrompt(text, indentSize = 2)
  {
    const lines = String(text || '').trim().split('\n');
    const pad = (level) => ' '.repeat(level * indentSize);

    let level = 0;
    let preserveContent = false;
    let preserveCdata = false;

    return lines.map((rawLine) =>
    {
      const line = rawLine.trim();

      if (!line)
      {
        return '';
      }

      if (line.includes('<![CDATA['))
      {
        const hasOpeningTag = /^<[^/!?][^>]*><!\[CDATA\[/.test(line);
        const isSingleLine = line.includes(']]>');

        if (hasOpeningTag)
        {
          const result = `${pad(level)}${line}`;

          if (!isSingleLine)
          {
            level += 1;
            preserveCdata = true;
          }

          return result;
        }

        preserveCdata = !isSingleLine;
        return `${pad(level)}${line}`;
      }

      if (preserveCdata)
      {
        if (line.includes(']]>'))
        {
          preserveCdata = false;

          if (/]]><\/[^>]+>$/.test(line))
          {
            level = Math.max(0, level - 1);
          }

          return `${pad(level)}${line}`;
        }

        return `${pad(level)}${line}`;
      }

      if (/^<content>$/.test(line))
      {
        const result = `${pad(level)}${line}`;
        level += 1;
        preserveContent = true;
        return result;
      }

      if (/^<\/content>$/.test(line))
      {
        preserveContent = false;
        level = Math.max(0, level - 1);
        return `${pad(level)}${line}`;
      }

      if (preserveContent)
      {
        return rawLine;
      }

      const isClosing = /^<\/[^>]+>$/.test(line);
      const isSelfClosing = /^<[^>]+\/>$/.test(line);
      const isOpening = /^<[^/!?][^>]*>$/.test(line) && !isSelfClosing;
      const isSingleLine = /^<[^>]+>.*<\/[^>]+>$/.test(line);

      if (isClosing)
      {
        level = Math.max(0, level - 1);
      }

      const result = `${pad(level)}${line}`;

      if (isOpening && !isSingleLine)
      {
        level += 1;
      }

      return result;
    }).join('\n');
  }

  static escapeXmlText(value)
  {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  static escapeXmlAttribute(value)
  {
    return this.escapeXmlText(value)
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  static escapeCdata(value)
  {
    return String(value ?? '')
      .replaceAll(']]>', ']]]]><![CDATA[>');
  }  

  static formatMultilineText(value)
  {
    const normalized = String(value ?? '')
      .replace(/\r\n/g, '\n')
      .trim();

    if (!normalized)
    {
      return '';
    }

    return AgentUtils.escapeXmlText(normalized);
  }
}
