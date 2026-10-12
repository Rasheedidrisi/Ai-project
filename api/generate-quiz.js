import { generateQuiz } from '../server/aiService.js';
import { readJsonBody } from './_lib/readJson.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await generateQuiz({
      text: body.text,
      count: body.count,
      difficulty: body.difficulty,
      questionType: body.questionType,
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Quiz generation failed.' });
  }
}
