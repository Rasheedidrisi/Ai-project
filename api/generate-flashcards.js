import { generateFlashcards } from '../server/aiService.js';
import { readJsonBody } from './_lib/readJson.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await generateFlashcards({ text: body.text });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Flashcard generation failed.' });
  }
}
