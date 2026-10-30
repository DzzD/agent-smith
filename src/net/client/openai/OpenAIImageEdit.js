/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { OpenAIClient } from './OpenAIClient.js';
import { getGptImage2Cost } from './OpenAIImageCost.js';

export class OpenAIImageEdit extends OpenAIClient
{
  constructor({
    apiKey,
    model = 'gpt-4o-mini',
    url = 'https://api.openai.com/',
    supportsMultiImageEdit = true,
    maxEditImages = null,
  } = {})
  {
    super({ apiKey, url });
    this.model = model;
    this.supportsMultiImageEdit = supportsMultiImageEdit !== false;
    this.maxEditImages = Number.isFinite(maxEditImages) ? Math.max(1, Math.floor(maxEditImages)) : null;
  }

  async editImage({
    prompt,
    images = null,
    imageBase64 = null,
    imageMimeType = 'image/png',
    maskBase64 = null,
    maskMimeType = 'image/png',
    model = undefined,
    size = null,
    output_format = 'png',
    n = 1,
    output_compression = undefined,
    signal = undefined,
  } = {})
  {
    const formData = new FormData();

    formData.append('model', model ?? this.model);
    formData.append('prompt', prompt ?? '');

    if (size != null)
    {
      formData.append('size', size);
    }

    formData.append('output_format', output_format);
    formData.append('n', String(n));

    let normalizedImages = Array.isArray(images) && images.length
      ? images
      : imageBase64
        ? [
          {
            imageBase64,
            imageMimeType,
          },
        ]
        : [];

    if (!normalizedImages.length)
    {
      throw new Error('editImage requires at least one image.');
    }

    if (!this.supportsMultiImageEdit && normalizedImages.length > 1)
    {
      normalizedImages = normalizedImages.slice(0, 1);
    }

    if (this.maxEditImages && normalizedImages.length > this.maxEditImages)
    {
      normalizedImages = normalizedImages.slice(0, this.maxEditImages);
    }

    for (let index = 0; index < normalizedImages.length; index++)
    {
      const image = normalizedImages[index];

      const currentImageMimeType = image.imageMimeType || 'image/png';
      const currentImageBase64 = image.imageBase64;

      if (!currentImageBase64)
      {
        throw new Error(`Missing imageBase64 for image ${index + 1}.`);
      }

      const imageBuffer = Buffer.from(currentImageBase64, 'base64');
      const imageBlob = new Blob([imageBuffer], { type: currentImageMimeType });

      const extension =
        currentImageMimeType === 'image/jpeg' ? 'jpg' :
        currentImageMimeType === 'image/webp' ? 'webp' :
        'png';

      formData.append(
        'image[]',
        imageBlob,
        `image-${index + 1}.${extension}`
      );
    }

    if (maskBase64)
    {
      const maskBuffer = Buffer.from(maskBase64, 'base64');
      const maskBlob = new Blob([maskBuffer], { type: maskMimeType });
      const maskExtension = maskMimeType === 'image/jpeg' ? 'jpg' : maskMimeType === 'image/webp' ? 'webp' : 'png';
      formData.append('mask', maskBlob, `mask.${maskExtension}`);
    }

    if (output_compression != null)
    {
      formData.append('output_compression', String(output_compression));
    }

    const { endpointUrl, payload } = await this.postForm('images/edits', formData, {
      errorContext: 'OpenAI image edit request failed',
      signal: signal ?? AbortSignal.timeout(360000),
    });

    const b64 = payload?.data?.[0]?.b64_json;

    if (!b64)
    {
      throw new Error('No edited image returned by OpenAI');
    }

    return {
      endpointUrl,
      payload,
      imageBuffer: Buffer.from(b64, 'base64'),
      cost: getGptImage2Cost(payload.usage),
    };
  }
}
