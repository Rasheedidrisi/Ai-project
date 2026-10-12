import fs from 'node:fs/promises';
import { formidable } from 'formidable';
import { extractTextFromFile } from '../server/documentService.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Allow', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: `Method ${req.method} is not allowed. Use POST.` });
    return;
  }

  try {
    const form = formidable({
      maxFiles: 1,
      maxFileSize: 5 * 1024 * 1024,
      allowEmptyFiles: false,
    });

    const [, files] = await form.parse(req);
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!uploadedFile) {
      res.status(400).json({ error: 'No file was uploaded.' });
      return;
    }

    const buffer = await fs.readFile(uploadedFile.filepath);
    const text = await extractTextFromFile({
      buffer,
      mimetype: uploadedFile.mimetype || '',
      originalname: uploadedFile.originalFilename || uploadedFile.newFilename || 'upload',
    });

    res.status(200).json({
      text,
      fileName: uploadedFile.originalFilename || uploadedFile.newFilename || 'upload',
      extracted: true,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'The uploaded document could not be processed.' });
  }
}
