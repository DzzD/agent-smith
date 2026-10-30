/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { OpenApiSkill } from '../ext/OpenApiSkill.js';

export class OpenApiPdfSkill extends OpenApiSkill
{
  constructor({ stirlingPdfUrl } = {})
  {
    if (!stirlingPdfUrl?.trim())
    {
      throw new Error('stirlingPdfUrl is required.');
    }

    const normalizedStirlingPdfUrl = stirlingPdfUrl.replace(/\/+$/, '');

    super({
      id: 'pdf',
      specUrl: normalizedStirlingPdfUrl + '/v1/api-docs/file-processing',
      apiBaseUrl: normalizedStirlingPdfUrl,
      description: 'API for processing PDF documents and related files. It can be used to inspect, convert, merge, split, compress, repair, rotate, watermark, extract pages or content, and perform other file-processing operations. Use it when a user asks to manipulate, transform, optimize, or analyze PDF files.',
    });
  }


  get usage()
  {
    return `
      ${super.usage}
      
      PDF rules :
      - When receiving a PDF file, do not trigger any operation on it unless the user explicitly asks for it.
      - Do not list endpoints. Use the Well known endpoints below directly.
      - Only call pdf_openapi_describe_endpoint when a Well known endpoint does not cover the need or when additional parameter details are required.
      - To find an endpoint, use concrete keywords only: html, markdown, pdf, convert, merge, split, rotate, extract, ocr, content, text, image, repair, info.

      Well known endpoints:

      /api/v1/convert/file/pdf :
      - convert any office file to pdf : PPTX, DOCX, XLSX, ODT, ODS, RTF, etc.
      - fileInput (tempFileName, required)

      /api/v1/general/rotate-pdf :
      - rotate a PDF by a specified angle (must be a multiple of 90)
      - fileInput (tempFileName, optional) or fileId (string, optional)
      - angle (integer, required) — enum: 0, 90, 180, 270

      /api/v1/general/merge-pdfs :
      - merge multiple PDF files into one
      - fileInput (tempFileName array, required) — multiple files
      - sortType (string, required) — enum: orderProvided, byFileName, byDateModified, byDateCreated, byPDFTitle
      - removeCertSign (boolean, required)
      - generateToc (boolean, optional) — generate a table of contents using filenames

      /api/v1/general/split-pages :
      - split a PDF into separate documents by page numbers or ranges
      - fileInput (tempFileName, optional) or fileId (string, optional)
      - pageNumbers (string, required) — e.g. "1,3,5-9" or "all"

      /api/v1/general/remove-pages :
      - remove specific pages from a PDF
      - fileInput (tempFileName, optional) or fileId (string, optional)
      - pageNumbers (string, required) — e.g. "1,3,5-9" or "all"

      /api/v1/convert/pdf/img :
      - convert PDF pages to image(s)
      - fileInput (tempFileName, optional) or fileId (string, optional)
      - pageNumbers (string, required) — e.g. "1,3,5-9" or "all"
      - imageFormat (string, required) — enum: png, jpeg, jpg, gif, webp
      - singleOrMultiple (string, required) — enum: single, multiple
      - colorType (string, required) — enum: color, greyscale, blackwhite
      - dpi (integer, required) — default: 300

      /api/v1/convert/pdf/text :
      - convert a PDF to plain text or RTF
      - fileInput (tempFileName, optional) or fileId (string, optional)
      - outputFormat (string, required) — enum: rtf, txt

      /api/v1/convert/pdf/markdown :
      - convert a PDF to Markdown
      - fileInput (tempFileName, required)

      /api/v1/misc/repair :
      - repair a corrupted or damaged PDF
      - fileInput (tempFileName, required)

      /api/v1/misc/ocr-pdf :
      - run OCR on a PDF using OCRmyPDF or Tesseract
      - fileInput (tempFileName, optional) or fileId (string, optional)
      - languages (string array, required) — e.g. "eng", "fra"
      - ocrType (string, required) — enum: skip-text, force-ocr, Normal
      - ocrRenderType (string, required) — enum: hocr, sandwich
      - deskew (boolean, optional)
      - clean (boolean, optional)
      - sidecar (boolean, optional) — include OCR text in a sidecar file
      - To OCR only selected pages, first extract them with /api/v1/general/split-pages, then run OCR on the resulting PDF.

      /api/v1/security/get-info-on-pdf :
      - extract comprehensive metadata and information from a PDF (output: JSON)
      - fileInput (tempFileName, required)

      Endpoint selection rules:
      - For normal PDF text work, use /api/v1/convert/pdf/text.
      - Use /api/v1/convert/pdf/text-editor only when editable layout JSON is explicitly requested.
      - If endpoint search returns too many results, retry with one concrete keyword.


      `.trim();
      
  }
}
