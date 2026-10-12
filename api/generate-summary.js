import { generateSummary } from '../server/aiService.js';
import { readJsonBody } from './_lib/readJson.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await generateSummary({
      text: body.text,
      title: body.title,
      style: body.style,
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Summary generation failed.' });
  }
}
