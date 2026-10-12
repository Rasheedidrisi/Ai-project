import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { generateSummary, generateQuiz, generateFlashcards } from './aiService.js';
import { extractTextFromFile } from './documentService.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5000);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const valid = /\.(pdf|txt|png|jpg|jpeg)$/i.test(file.originalname)
      || file.mimetype === 'application/pdf'
      || file.mimetype.includes('text/plain')
      || file.mimetype.startsWith('image/');
    if (!valid) {
      cb(new Error('Only PDF, TXT, PNG, JPG, and JPEG files are supported.'));
      return;
    }
    cb(null, true);
  },
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'NoteForge AI' });
});

app.post('/api/extract-text', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file was uploaded.' });
    }

    const text = await extractTextFromFile(req.file);
    res.json({
      text,
      fileName: req.file.originalname,
      extracted: true,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate-summary', async (req, res, next) => {
  try {
    const { text, title, style } = req.body || {};
    const result = await generateSummary({ text, title, style });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate-quiz', async (req, res, next) => {
  try {
    const { text, count, difficulty, questionType } = req.body || {};
    const result = await generateQuiz({ text, count, difficulty, questionType });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate-flashcards', async (req, res, next) => {
  try {
    const { text } = req.body || {};
    const result = await generateFlashcards({ text });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const message = error && error.message ? error.message : 'Unexpected server error';
  const status = error && error.statusCode ? error.statusCode : 400;
  res.status(status).json({ error: message });
});

app.listen(port, () => {
  console.log(`NoteForge AI server running on http://localhost:${port}`);
});
