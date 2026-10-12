import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import Tesseract, { createWorker } from 'tesseract.js';

function cleanText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function extractImageText(buffer) {
  const result = await Tesseract.recognize(buffer, 'eng', {
    logger: () => undefined,
  });

  const text = cleanText(result.data?.text || '');
  if (!text) {
    throw new Error('No readable text could be detected in this image. Please upload a clearer image or a text-based PDF.');
  }

  return text;
}

export async function extractPdfText(buffer) {
 const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  let ocrWorker;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      let pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!pageText) {
        ocrWorker ||= await createWorker('eng');
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({
          canvasContext: canvas.getContext('2d'),
          viewport,
        }).promise;
        const result = await ocrWorker.recognize(canvas.toBuffer('image/png'));
        pageText = cleanText(result.data?.text || '');
      }

      if (pageText) {
        pages.push(pageText);
      }
    }
  } finally {
    if (ocrWorker) {
      await ocrWorker.terminate();
    }
  }

  const combined = cleanText(pages.join('\n\n'));
  if (!combined) {
    throw new Error('No readable text could be detected in this PDF. Please upload a clearer PDF or image.');
  }

  return combined;
}

export async function extractTextFromFile(file) {
  const mimetype = file.mimetype || '';
  const extension = (file.originalname || '').split('.').pop()?.toLowerCase();

  if (extension === 'txt' || mimetype.includes('text/plain')) {
    const raw = file.buffer.toString('utf8');
    const cleaned = cleanText(raw);
    if (!cleaned) {
      throw new Error('The TXT file was empty or unreadable.');
    }
    return cleaned;
  }

  if (extension === 'pdf' || mimetype.includes('pdf')) {
    return extractPdfText(file.buffer);
  }

  if (['png', 'jpg', 'jpeg'].includes(extension) || ['image/png', 'image/jpeg', 'image/jpg'].includes(mimetype)) {
    return extractImageText(file.buffer);
  }

  throw new Error('Unsupported file type. Please upload a PDF, TXT, PNG, JPG, or JPEG file.');
}
