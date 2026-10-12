import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function pickTopicKeywords(text) {
  const tokens = normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 4);

  const counts = {};
  for (const token of tokens) {
    counts[token] = (counts[token] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word]) => word);
}

function buildFallbackSummary(text, style) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const sourceText = sentences.length > 0 ? sentences : [text.trim()];
  const focused = sourceText.slice(0, Math.min(sourceText.length, 5));

  if (style === 'quick') {
    return `Key ideas: ${focused.map((sentence) => sentence.replace(/\s+/g, ' ')).join(' ')}.`;
  }

  if (style === 'exam') {
    return `Main concepts to review:\n- ${focused.join('\n- ')}\n\nFocus on definitions, mechanisms, examples, and likely exam applications from this material.`;
  }

  return `Summary:\n${focused.map((sentence, index) => `${index + 1}. ${sentence}`).join('\n')}\n\nThis overview captures the primary concepts and supporting examples from the provided notes.`;
}

function buildFallbackQuiz({ text, count, difficulty, questionType }) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 30);

  const safeSentences = sentences.length ? sentences : [text.trim()].filter(Boolean);
  const topicList = pickTopicKeywords(text);

  const questions = [];
  const total = Math.min(Number(count) || 5, safeSentences.length || 5);

  for (let index = 0; index < total; index += 1) {
    const sentence = safeSentences[index % safeSentences.length];
    const topic = topicList[index % topicList.length] || 'Core concept';

    if (questionType === 'true-false') {
      const statement = sentence.length > 120 ? sentence.slice(0, 120).trim() : sentence;
      const isTrue = index % 2 === 0;
      questions.push({
        question: `True or false: ${statement}`,
        options: ['True', 'False'],
        correctAnswer: isTrue ? 'True' : 'False',
        explanation: `The statement ${isTrue ? 'matches' : 'does not match'} the provided source material and is based on the original notes.`,
        topic,
        reference: statement,
      });
      continue;
    }

    const baseText = sentence.replace(/\s+/g, ' ');
    const correctIndex = 0;
    const options = [
      `The statement is directly supported by the study material (${baseText.slice(0, 40)})`,
      `The statement reflects a likely misconception or extrapolation (${baseText.slice(20, 60)})`,
      `The statement is unrelated to the notes and should be ignored`,
      `The statement is an unsupported assumption without textual evidence`,
    ];

    questions.push({
      question: `Which option best reflects the meaning of this note: "${baseText.slice(0, 90)}"?`,
      options,
      correctAnswer: options[correctIndex],
      explanation: `The correct answer is based on the original wording in the notes and aligns with the highlighted concept: ${topic}.`,
      topic,
      reference: baseText,
    });
  }

  return questions.map((question, index) => ({
    ...question,
    id: `q-${index + 1}`,
    difficulty: (difficulty || 'Medium').toLowerCase(),
  }));
}

function buildFallbackFlashcards(text) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 25);

  const cards = (sentences.slice(0, 8).length ? sentences.slice(0, 8) : [text.trim()])
    .map((sentence, index) => ({
      id: `card-${index + 1}`,
      front: `Concept ${index + 1}: ${sentence.slice(0, 60)}${sentence.length > 60 ? '…' : ''}`,
      back: sentence,
      mastered: false,
      topic: `Topic ${index + 1}`,
    }));

  return cards;
}

function validateQuizQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('The AI returned no valid quiz questions.');
  }

  return questions.map((question, index) => {
    const safeQuestion = {
      id: question.id || `q-${index + 1}`,
      question: String(question.question || '').trim(),
      options: Array.isArray(question.options) ? question.options.map((option) => String(option || '').trim()) : [],
      correctAnswer: String(question.correctAnswer || '').trim(),
      explanation: String(question.explanation || '').trim(),
      topic: String(question.topic || 'General').trim(),
      reference: String(question.reference || '').trim(),
      difficulty: String(question.difficulty || 'Medium').trim(),
    };

    if (!safeQuestion.question || !safeQuestion.explanation) {
      throw new Error('Question validation failed: missing required fields or options.');
    }

    if (safeQuestion.options.length === 4) {
      const answerIndex = ['A', 'B', 'C', 'D'].indexOf(safeQuestion.correctAnswer.toUpperCase());
      if (answerIndex >= 0) {
        safeQuestion.correctAnswer = safeQuestion.options[answerIndex];
      }

      if (!safeQuestion.options.includes(safeQuestion.correctAnswer)) {
        throw new Error(`Question ${safeQuestion.id} has a correct answer not listed in the options.`);
      }
    } else if (safeQuestion.options.length === 2) {
      const normalized = safeQuestion.correctAnswer.toLowerCase();
      const accepted = safeQuestion.options.map((option) => option.toLowerCase());
      if (normalized === 'true' && accepted.includes('true')) {
        safeQuestion.correctAnswer = safeQuestion.options[accepted.indexOf('true')];
      } else if (normalized === 'false' && accepted.includes('false')) {
        safeQuestion.correctAnswer = safeQuestion.options[accepted.indexOf('false')];
      } else if (accepted.includes(normalized)) {
        safeQuestion.correctAnswer = safeQuestion.options[accepted.indexOf(normalized)];
      }

      if (!safeQuestion.options.includes(safeQuestion.correctAnswer)) {
        throw new Error(`Question ${safeQuestion.id} has a correct answer not listed in the options.`);
      }
    } else {
      throw new Error('Question validation failed: each question must include 2 or 4 options.');
    }

    return safeQuestion;
  });
}

export async function generateSummary({ text, title, style }) {
  const safeText = normalizeText(text);
  const safeStyle = style || 'quick';

  if (!safeText) {
    throw new Error('Study notes are required before creating a summary.');
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are summarizing study notes for a student. Use only the supplied source material. Do not invent facts.\n\nTitle: ${title || 'Untitled notes'}\nStyle: ${safeStyle}\nSource material:\n${safeText}\n\nReturn a concise summary in plain text. Avoid unsupported claims, speculation, and teacher commentary. Keep the content grounded in the notes.`;
      const response = await ai.models.generateContent({ model: DEFAULT_MODEL, contents: prompt });
      const summary = response.text?.trim();
      if (summary) {
        return { summary, provider: 'gemini', mode: 'ai' };
      }
    } catch (error) {
      console.warn('Gemini summary generation failed; using local fallback.', error.message);
    }
  }

  return {
    summary: buildFallbackSummary(safeText, safeStyle),
    provider: 'local-fallback',
    mode: 'fallback',
    message: 'No Gemini API key was configured, so NoteForge used a deterministic local summary generator.',
  };
}

export async function generateQuiz({ text, count, difficulty, questionType }) {
  const safeText = normalizeText(text);
  const safeCount = Number(count) || 5;
  const safeType = questionType === 'true-false' ? 'true-false' : 'multiple-choice';

  if (!safeText) {
    throw new Error('Study notes are required before generating a quiz.');
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Create a quiz from the supplied notes. Use only source-grounded material. Never invent answers. The quiz must be valid JSON.\n\nRequirements:\n- questionCount: ${safeCount}\n- difficulty: ${difficulty || 'Medium'}\n- questionType: ${safeType}\n- Each question must include: id, question, options, correctAnswer, explanation, topic, reference\n- For multiple-choice questions, exactly 4 options with one correct answer\n- For true/false questions, use exactly 2 options: ["True", "False"]\n- Avoid duplicate questions\n- Keep the topics related to the notes\n\nSource material:\n${safeText}\n\nReturn only valid JSON in this exact format:\n[{"id":"q-1","question":"...","options":["...","...","...","..."],"correctAnswer":"...","explanation":"...","topic":"...","reference":"..."}]`;
      const response = await ai.models.generateContent({ model: DEFAULT_MODEL, contents: prompt });
      const raw = response.text || '';
      const jsonText = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(jsonText);
      const questions = validateQuizQuestions(parsed);
      return { questions, provider: 'gemini', mode: 'ai' };
    } catch (error) {
      console.warn('Gemini quiz generation failed; using local fallback.', error.message);
    }
  }

  const fallbackQuestions = buildFallbackQuiz({ text: safeText, count: safeCount, difficulty: difficulty || 'Medium', questionType: safeType });
  return {
    questions: fallbackQuestions.slice(0, safeCount),
    provider: 'local-fallback',
    mode: 'fallback',
    message: 'AI service unavailable, so NoteForge generated a deterministic quiz from the uploaded notes.',
  };
}

export async function generateFlashcards({ text }) {
  const safeText = normalizeText(text);

  if (!safeText) {
    throw new Error('Study notes are required before creating flashcards.');
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Create flashcards from the source material. Use only the supplied notes. Return valid JSON with cards array. Each card must include front, back, topic, mastered.\n\nSource material:\n${safeText}\n\nJSON format: [{"front":"...","back":"...","topic":"...","mastered":false}]`;
      const response = await ai.models.generateContent({ model: DEFAULT_MODEL, contents: prompt });
      const raw = response.text || '';
      const jsonText = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(jsonText);
      const cards = Array.isArray(parsed) ? parsed : parsed.cards || [];
      if (cards.length > 0) {
        return { cards: cards.map((card, index) => ({ id: `card-${index + 1}`, front: String(card.front || '').trim(), back: String(card.back || '').trim(), topic: String(card.topic || 'General').trim(), mastered: Boolean(card.mastered) })), provider: 'gemini', mode: 'ai' };
      }
    } catch (error) {
      console.warn('Gemini flashcard generation failed; using local fallback.', error.message);
    }
  }

  return {
    cards: buildFallbackFlashcards(safeText),
    provider: 'local-fallback',
    mode: 'fallback',
    message: 'AI service unavailable, so NoteForge generated a local flashcard set based on key ideas from your notes.',
  };
}
