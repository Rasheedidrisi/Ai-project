import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { BookOpenText, BrainCircuit, Copy, FileText, FolderArchive, LibraryBig, LoaderCircle, Plus, Search, Sparkles, Trash2, Upload, Wand2, CheckCircle2, ClipboardCheck, XCircle, ArrowLeft, ArrowRight, RotateCcw, PenLine, Save, Brain, NotebookPen, BarChart3 } from 'lucide-react';
import {
  generateFlashcardsRequest,
  generateQuizRequest,
  generateSummaryRequest,
  uploadDocument,
} from './utils/api';
import {
  deleteStudySet,
  loadActiveSet,
  loadLibrary,
  persistActiveSet,
  renameStudySet,
  upsertStudySet,
} from './utils/storage';

const SAMPLE_SOURCE = `Machine learning is a branch of artificial intelligence that enables systems to learn patterns from data.\n\nSupervised learning uses labeled inputs to train a model. In classification, the goal is to predict a category such as spam or not spam. In regression, the goal is to predict a continuous value such as house price.\n\nUnsupervised learning finds structure in unlabeled data through clustering and dimensionality reduction.\n\nA model must be trained carefully to generalize to new examples. Overfitting happens when a model memorizes the training data instead of learning general patterns. Regularization, validation, and cross-validation help reduce overfitting.`;

const defaultStudySet = () => ({
  id: crypto.randomUUID(),
  title: 'Machine Learning Foundations',
  subject: 'AI and Data Science',
  sourceText: SAMPLE_SOURCE,
  summary: '',
  summaryStyle: 'quick',
  quiz: [],
  quizSettings: {
    count: 5,
    difficulty: 'Medium',
    questionType: 'multiple-choice',
  },
  flashcards: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  summaryMeta: null,
  quizMeta: null,
  flashcardMeta: null,
});

function formatWords(text) {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

function scoreQuiz(questions, answers) {
  return questions.reduce((score, question, index) => {
    const response = answers[String(index)] ?? answers[index];
    return response === question.correctAnswer ? score + 1 : score;
  }, 0);
}

function findWeakTopics(questions, answers) {
  if (!questions.length) return [];
  const counts = {};

  questions.forEach((question, index) => {
    const response = answers[String(index)] ?? answers[index];
    if (response !== question.correctAnswer) {
      counts[question.topic || 'General'] = (counts[question.topic || 'General'] || 0) + 1;
    }
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, misses]) => ({ topic, misses }));
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const [studySet, setStudySet] = useState(() => loadActiveSet() || defaultStudySet());
  const [library, setLibrary] = useState(() => loadLibrary());
  const [toast, setToast] = useState('');
  const [jobState, setJobState] = useState({ summary: false, quiz: false, flashcards: false, upload: false });
  const [quizSession, setQuizSession] = useState({ currentIndex: 0, answers: {}, submitted: false, score: null, percentage: null, weakTopics: [], resultShown: false });
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [fileStatus, setFileStatus] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    persistActiveSet(studySet);
  }, [studySet]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const activeSummary = studySet.summary || 'No summary generated yet. Select a summary style and generate one from your notes.';

  const wordCount = useMemo(() => formatWords(studySet.sourceText), [studySet.sourceText]);

  const handleNoteChange = (key, value) => {
    setStudySet((current) => ({ ...current, [key]: value, updatedAt: Date.now() }));
  };

  const handleGenerateSummary = async () => {
    if (!studySet.sourceText.trim()) {
      setToast('Add study notes before generating a summary.');
      return;
    }

    setJobState((current) => ({ ...current, summary: true }));
    try {
      const result = await generateSummaryRequest({
        text: studySet.sourceText,
        title: studySet.title,
        style: studySet.summaryStyle,
      });

      setStudySet((current) => ({
        ...current,
        summary: result.summary,
        summaryMeta: { provider: result.provider, mode: result.mode, message: result.message || '' },
        updatedAt: Date.now(),
      }));
      setToast('Summary generated successfully.');
    } catch (error) {
      setToast(error.message || 'Summary generation failed.');
    } finally {
      setJobState((current) => ({ ...current, summary: false }));
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileStatus(`Processing ${file.name}...`);
    setJobState((current) => ({ ...current, upload: true }));

    try {
      const result = await uploadDocument(file);
      setStudySet((current) => ({
        ...current,
        sourceText: result.text,
        title: current.title || file.name.replace(/\.[^.]+$/, ''),
        subject: current.subject || 'Uploaded notes',
        updatedAt: Date.now(),
      }));
      setFileStatus(`Extracted ${result.fileName} and loaded the content.`);
      setToast('Document extracted successfully.');
    } catch (error) {
      setFileStatus(error.message || 'Upload failed.');
      setToast(error.message || 'Upload failed.');
    } finally {
      setJobState((current) => ({ ...current, upload: false }));
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleGenerateQuiz = async () => {
    if (!studySet.sourceText.trim()) {
      setToast('Add notes before building a quiz.');
      return;
    }

    setJobState((current) => ({ ...current, quiz: true }));
    try {
      const result = await generateQuizRequest({
        text: studySet.sourceText,
        count: studySet.quizSettings.count,
        difficulty: studySet.quizSettings.difficulty,
        questionType: studySet.quizSettings.questionType,
      });

      setStudySet((current) => ({
        ...current,
        quiz: result.questions || [],
        quizMeta: { provider: result.provider, mode: result.mode, message: result.message || '' },
        updatedAt: Date.now(),
      }));
      setQuizSession({ currentIndex: 0, answers: {}, submitted: false, score: null, percentage: null, weakTopics: [], resultShown: false });
      setToast('Quiz generated successfully.');
    } catch (error) {
      setToast(error.message || 'Quiz generation failed.');
    } finally {
      setJobState((current) => ({ ...current, quiz: false }));
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!studySet.sourceText.trim()) {
      setToast('Add notes before generating flashcards.');
      return;
    }

    setJobState((current) => ({ ...current, flashcards: true }));
    try {
      const result = await generateFlashcardsRequest({ text: studySet.sourceText });
      setStudySet((current) => ({
        ...current,
        flashcards: result.cards || [],
        flashcardMeta: { provider: result.provider, mode: result.mode, message: result.message || '' },
        updatedAt: Date.now(),
      }));
      setFlashcardIndex(0);
      setFlashcardFlipped(false);
      setToast('Flashcards ready for review.');
    } catch (error) {
      setToast(error.message || 'Flashcard generation failed.');
    } finally {
      setJobState((current) => ({ ...current, flashcards: false }));
    }
  };

  const handleSaveToLibrary = () => {
    const safeSet = {
      ...studySet,
      id: studySet.id || crypto.randomUUID(),
      updatedAt: Date.now(),
    };

    const next = upsertStudySet(safeSet);
    setLibrary(next);
    setToast('Study set saved to your library.');
  };

  const handleDeleteStudySet = (id) => {
    const remaining = deleteStudySet(id);
    setLibrary(remaining);
    setToast('Study set deleted.');
  };

  const handleRenameStudySet = (id) => {
    const currentItem = library.find((item) => item.id === id);
    const nextTitle = window.prompt('Rename this study set', currentItem?.title || '');
    if (!nextTitle || !nextTitle.trim()) return;
    const updated = renameStudySet(id, nextTitle.trim());
    setLibrary(updated);
    setToast('Study set renamed.');
  };

  const handleOpenStudySet = (set) => {
    setStudySet(set);
    setQuizSession({ currentIndex: 0, answers: {}, submitted: false, score: null, percentage: null, weakTopics: [], resultShown: false });
    setFlashcardIndex(0);
    setFlashcardFlipped(false);
  };

  const saveSelection = (questionIndex, option) => {
    setQuizSession((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [questionIndex]: option,
      },
    }));
  };

  const submitQuiz = () => {
    if (!studySet.quiz.length) {
      setToast('Generate a quiz before submitting an answer set.');
      return;
    }

    if (quizSession.submitted) return;

    const totalScore = scoreQuiz(studySet.quiz, quizSession.answers);
    const percentage = Math.round((totalScore / studySet.quiz.length) * 100);
    const weakTopics = findWeakTopics(studySet.quiz, quizSession.answers);

    setQuizSession((current) => ({
      ...current,
      submitted: true,
      score: totalScore,
      percentage,
      weakTopics,
      resultShown: true,
    }));
  };

  const currentQuestion = studySet.quiz[quizSession.currentIndex];
  const currentFlashcard = studySet.flashcards[flashcardIndex];

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--charcoal)]">
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-6 lg:px-8">
        <aside className="hidden w-72 shrink-0 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_18px_40px_rgba(37,40,32,0.04)] lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--forest)] text-white">
              <NotebookPen size={22} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Study lab</p>
              <h1 className="text-xl font-semibold">NoteForge AI</h1>
            </div>
          </div>

          <nav className="space-y-2">
            <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <BookOpenText size={18} /> Workspace
            </NavLink>
            <NavLink to="/library" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <LibraryBig size={18} /> Library
            </NavLink>
          </nav>

          <div className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
            <p className="mb-2 text-sm font-medium">Current set</p>
            <h2 className="text-lg font-semibold text-[var(--charcoal)]">{studySet.title}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{studySet.subject}</p>
            <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
              <span>{wordCount} words</span>
              <span>{studySet.summary ? 'Summary ready' : 'Waiting'}</span>
            </div>
          </div>
        </aside>

        <main className="flex-1 rounded-[32px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_18px_40px_rgba(37,40,32,0.04)] lg:p-6">
          <div className="mb-5 flex flex-col gap-4 border-b border-[var(--line)] pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">AI-based notes summarization and quiz generation</p>
              <h2 className="mt-2 text-3xl font-semibold text-[var(--charcoal)]">Study workspace</h2>
            </div>
            <div className="flex gap-2">
              <button type="button" className="secondary-button" onClick={handleSaveToLibrary}>
                <Save size={16} /> Save
              </button>
              <button type="button" className="primary-button" onClick={() => setStudySet(defaultStudySet())}>
                <Plus size={16} /> New set
              </button>
            </div>
          </div>

          {toast ? (
            <div className="mb-6 rounded-2xl border border-[var(--forest)] bg-[var(--sage)] px-4 py-3 text-sm text-[var(--charcoal)]">
              {toast}
            </div>
          ) : null}

          <Routes>
            <Route
              path="/"
              element={
                <div className="space-y-6">
                  <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
                      <div className="flex items-center gap-2 text-[var(--forest)]">
                        <FileText size={18} />
                        <h3 className="text-lg font-semibold">Study material input</h3>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-2 text-sm font-medium text-[var(--charcoal)]">
                          Title
                          <input
                            className="input field"
                            value={studySet.title}
                            onChange={(event) => handleNoteChange('title', event.target.value)}
                            placeholder="e.g. Cell Biology revision"
                          />
                        </label>

                        <label className="flex flex-col gap-2 text-sm font-medium text-[var(--charcoal)]">
                          Subject
                          <input
                            className="input field"
                            value={studySet.subject}
                            onChange={(event) => handleNoteChange('subject', event.target.value)}
                            placeholder="Biology, History..."
                          />
                        </label>
                      </div>

                      <div className="mt-4 rounded-2xl border border-dashed border-[var(--forest)] bg-[var(--sage)] p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <Upload size={18} className="text-[var(--forest)]" />
                            <p className="text-sm font-medium">Upload PDF or TXT notes</p>
                          </div>
                          <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
                            {jobState.upload ? <LoaderCircle className="animate-spin" size={16} /> : 'Select file'}
                          </button>
                        </div>
                        <input ref={fileInputRef} type="file" accept=".pdf,.txt,.png,.jpg,.jpeg" className="hidden" onChange={handleFileUpload} />
                        <p className="mt-3 text-xs text-[var(--muted)]">{fileStatus || 'Supports text PDFs, scanned images, PNG/JPG notes, and plain text files up to 5MB.'}</p>
                      </div>

                      <label className="mt-5 flex flex-col gap-2 text-sm font-medium text-[var(--charcoal)]">
                        Notes
                        <textarea
                          className="field min-h-[240px] resize-y"
                          value={studySet.sourceText}
                          onChange={(event) => handleNoteChange('sourceText', event.target.value)}
                          placeholder="Paste your study material here..."
                        />
                      </label>

                      <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
                        <span>{wordCount} words</span>
                        <span>{studySet.sourceText.length} characters</span>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
                        <div className="flex items-center gap-2 text-[var(--forest)]">
                          <Sparkles size={18} />
                          <h3 className="text-lg font-semibold">AI summary</h3>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {['quick', 'detailed', 'exam'].map((style) => (
                            <button
                              key={style}
                              type="button"
                              onClick={() => handleNoteChange('summaryStyle', style)}
                              className={`rounded-full px-3 py-2 text-xs font-medium transition ${studySet.summaryStyle === style ? 'bg-[var(--forest)] text-white' : 'bg-[var(--sage)] text-[var(--charcoal)]'}`}
                            >
                              {style === 'quick' ? 'Quick Revision' : style === 'detailed' ? 'Detailed Summary' : 'Exam-Focused'}
                            </button>
                          ))}
                        </div>

                        <button type="button" className="primary-button mt-4 w-full" onClick={handleGenerateSummary} disabled={jobState.summary}>
                          {jobState.summary ? <LoaderCircle className="animate-spin" size={16} /> : <Wand2 size={16} />} Generate summary
                        </button>

                        <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-medium">Preview</p>
                            <button type="button" className="secondary-button small-button" onClick={() => navigator.clipboard.writeText(studySet.summary || activeSummary)}>
                              <Copy size={14} /> Copy
                            </button>
                          </div>
                          <pre className="whitespace-pre-wrap text-sm leading-6 text-[var(--charcoal)]">{activeSummary}</pre>
                          {studySet.summaryMeta?.message ? (
                            <p className="mt-3 text-xs text-[var(--muted)]">{studySet.summaryMeta.message}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
                        <div className="flex items-center gap-2 text-[var(--forest)]">
                          <BrainCircuit size={18} />
                          <h3 className="text-lg font-semibold">Quiz generator</h3>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <label className="field-label">
                            Questions
                            <select className="field" value={studySet.quizSettings.count} onChange={(event) => handleNoteChange('quizSettings', { ...studySet.quizSettings, count: Number(event.target.value) })}>
                              <option value={5}>5</option>
                              <option value={10}>10</option>
                              <option value={15}>15</option>
                            </select>
                          </label>

                          <label className="field-label">
                            Difficulty
                            <select className="field" value={studySet.quizSettings.difficulty} onChange={(event) => handleNoteChange('quizSettings', { ...studySet.quizSettings, difficulty: event.target.value })}>
                              <option value="Easy">Easy</option>
                              <option value="Medium">Medium</option>
                              <option value="Hard">Hard</option>
                            </select>
                          </label>

                          <label className="field-label">
                            Type
                            <select className="field" value={studySet.quizSettings.questionType} onChange={(event) => handleNoteChange('quizSettings', { ...studySet.quizSettings, questionType: event.target.value })}>
                              <option value="multiple-choice">Multiple choice</option>
                              <option value="true-false">True / False</option>
                            </select>
                          </label>
                        </div>

                        <button type="button" className="primary-button mt-4 w-full" onClick={handleGenerateQuiz} disabled={jobState.quiz}>
                          {jobState.quiz ? <LoaderCircle className="animate-spin" size={16} /> : <Brain size={16} />} Generate quiz
                        </button>

                        {studySet.quizMeta?.message ? <p className="mt-3 text-xs text-[var(--muted)]">{studySet.quizMeta.message}</p> : null}
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
                      <div className="flex items-center gap-2 text-[var(--forest)]">
                        <ClipboardCheck size={18} />
                        <h3 className="text-lg font-semibold">Interactive quiz</h3>
                      </div>

                      {studySet.quiz.length ? (
                        <div className="mt-4 space-y-4">
                          <div className="flex items-center justify-between text-sm text-[var(--muted)]">
                            <span>Question {quizSession.currentIndex + 1} / {studySet.quiz.length}</span>
                            <span>{Math.round(((quizSession.currentIndex + 1) / studySet.quiz.length) * 100)}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-[var(--sage)]">
                            <div className="h-full rounded-full bg-[var(--forest)]" style={{ width: `${((quizSession.currentIndex + 1) / studySet.quiz.length) * 100}%` }} />
                          </div>

                          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{currentQuestion.topic}</p>
                            <h4 className="mt-2 text-xl font-semibold text-[var(--charcoal)]">{currentQuestion.question}</h4>

                            <div className="mt-4 space-y-3">
                              {currentQuestion.options.map((option) => {
                                const selected = quizSession.answers[quizSession.currentIndex] === option;
                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() => saveSelection(quizSession.currentIndex, option)}
                                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-[var(--forest)] bg-[var(--sage)]' : 'border-[var(--line)] bg-white hover:border-[var(--forest)]/50'}`}
                                  >
                                    <span>{option}</span>
                                    {selected ? <CheckCircle2 size={18} className="text-[var(--forest)]" /> : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <button type="button" className="secondary-button" onClick={() => setQuizSession((current) => ({ ...current, currentIndex: Math.max(0, current.currentIndex - 1) }))} disabled={quizSession.currentIndex === 0}>
                              <ArrowLeft size={16} /> Previous
                            </button>
                            <button type="button" className="secondary-button" onClick={() => setQuizSession((current) => ({ ...current, currentIndex: Math.min(studySet.quiz.length - 1, current.currentIndex + 1) }))} disabled={quizSession.currentIndex === studySet.quiz.length - 1}>
                              Next <ArrowRight size={16} />
                            </button>
                          </div>

                          <button type="button" className="primary-button w-full" onClick={submitQuiz} disabled={quizSession.submitted}>
                            {quizSession.submitted ? 'Submitted' : 'Submit answers'}
                          </button>

                          {quizSession.resultShown ? (
                            <div className="rounded-2xl border border-[var(--forest)] bg-[var(--sage)] p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Result</p>
                              <h4 className="mt-2 text-2xl font-semibold">{quizSession.score}/{studySet.quiz.length} correct</h4>
                              <p className="text-sm text-[var(--charcoal)]">Score: {quizSession.percentage}%</p>
                              {quizSession.weakTopics.length ? (
                                <div className="mt-3">
                                  <p className="text-sm font-medium">Weak topics to revisit</p>
                                  <ul className="mt-2 list-disc pl-5 text-sm text-[var(--muted)]">
                                    {quizSession.weakTopics.map((item) => (
                                      <li key={item.topic}>{item.topic} ({item.misses} missed)</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                <p className="mt-3 text-sm text-[var(--muted)]">Strong work — your answers were well aligned with the source material.</p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] bg-white p-8 text-center text-[var(--muted)]">
                          Generate a quiz to unlock the interactive practice workflow.
                        </div>
                      )}
                    </div>

                    <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
                      <div className="flex items-center gap-2 text-[var(--forest)]">
                        <BarChart3 size={18} />
                        <h3 className="text-lg font-semibold">Results and explanations</h3>
                      </div>

                      {studySet.quiz.length ? (
                        <div className="mt-4 space-y-4">
                          {studySet.quiz.map((question, index) => {
                            const userAnswer = quizSession.answers[index];
                            const isCorrect = userAnswer === question.correctAnswer;
                            return (
                              <div key={question.id || index} className="rounded-2xl border border-[var(--line)] bg-white p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Q{index + 1}</p>
                                    <h4 className="mt-2 text-base font-semibold">{question.question}</h4>
                                  </div>
                                  {quizSession.submitted ? (
                                    isCorrect ? <CheckCircle2 className="text-[var(--forest)]" size={20} /> : <XCircle className="text-[#C96F4A]" size={20} />
                                  ) : null}
                                </div>
                                <p className="mt-2 text-sm text-[var(--muted)]">Your answer: {userAnswer || 'Not answered'}</p>
                                <p className="mt-2 text-sm text-[var(--charcoal)]"><span className="font-medium">Correct answer:</span> {question.correctAnswer}</p>
                                <p className="mt-2 text-sm text-[var(--muted)]">{question.explanation}</p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] bg-white p-8 text-center text-[var(--muted)]">
                          Answer explanations appear here after generating and submitting a quiz.
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
                      <div className="flex items-center gap-2 text-[var(--forest)]">
                        <Wand2 size={18} />
                        <h3 className="text-lg font-semibold">Flashcard review</h3>
                      </div>

                      <button type="button" className="primary-button mt-4 w-full" onClick={handleGenerateFlashcards} disabled={jobState.flashcards}>
                        {jobState.flashcards ? <LoaderCircle className="animate-spin" size={16} /> : <BrainCircuit size={16} />} Generate flashcards
                      </button>

                      {studySet.flashcards.length ? (
                        <div className="mt-5 rounded-3xl border border-[var(--line)] bg-white p-4">
                          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                            <span>Card {flashcardIndex + 1} / {studySet.flashcards.length}</span>
                            <span>{currentFlashcard?.topic}</span>
                          </div>

                          <button type="button" onClick={() => setFlashcardFlipped((value) => !value)} className="flashcard-box">
                            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{flashcardFlipped ? 'Answer' : 'Prompt'}</p>
                            <p className="mt-4 text-lg font-semibold text-[var(--charcoal)]">{flashcardFlipped ? currentFlashcard.back : currentFlashcard.front}</p>
                          </button>

                          <div className="mt-4 flex gap-2">
                            <button type="button" className="secondary-button" onClick={() => setFlashcardIndex((value) => Math.max(0, value - 1))}>
                              <ArrowLeft size={16} /> Prev
                            </button>
                            <button type="button" className="secondary-button" onClick={() => setFlashcardIndex((value) => Math.min(studySet.flashcards.length - 1, value + 1))}>
                              Next <ArrowRight size={16} />
                            </button>
                          </div>
                          <div className="mt-4 flex gap-2">
                            <button type="button" className="secondary-button" onClick={() => { const next = [...studySet.flashcards]; next[flashcardIndex].mastered = true; setStudySet((current) => ({ ...current, flashcards: next })); }}>
                              <CheckCircle2 size={16} /> Known
                            </button>
                            <button type="button" className="secondary-button" onClick={() => { const next = [...studySet.flashcards]; next[flashcardIndex].mastered = false; setStudySet((current) => ({ ...current, flashcards: next })); }}>
                              <RotateCcw size={16} /> Review
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] bg-white p-8 text-center text-[var(--muted)]">
                          Save your notes and create a flashcard deck for active recall.
                        </div>
                      )}
                    </div>

                    <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
                      <div className="flex items-center gap-2 text-[var(--forest)]">
                        <FolderArchive size={18} />
                        <h3 className="text-lg font-semibold">Saved study library</h3>
                      </div>

                      <div className="mt-4 grid gap-3">
                        {library.length ? library.slice(0, 3).map((entry) => (
                          <button key={entry.id} type="button" onClick={() => handleOpenStudySet(entry)} className="rounded-2xl border border-[var(--line)] bg-white p-3 text-left transition hover:border-[var(--forest)]/60">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-[var(--charcoal)]">{entry.title}</p>
                                <p className="text-xs text-[var(--muted)]">{entry.subject}</p>
                              </div>
                              <span className="rounded-full bg-[var(--sage)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--forest)]">
                                {entry.quiz?.length ? 'quiz' : 'notes'}
                              </span>
                            </div>
                          </button>
                        )) : (
                          <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 text-center text-sm text-[var(--muted)]">No study sets saved yet.</p>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              }
            />

            <Route
              path="/library"
              element={
                <LibraryPage
                  library={library}
                  onOpenSet={handleOpenStudySet}
                  onDelete={handleDeleteStudySet}
                  onRename={handleRenameStudySet}
                />
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function LibraryPage({ library, onOpenSet, onDelete, onRename }) {
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState('updated');

  const filteredSets = useMemo(() => {
    const normalized = query.toLowerCase();
    const items = library.filter((item) => {
      const matchesQuery = !normalized || item.title.toLowerCase().includes(normalized) || item.subject.toLowerCase().includes(normalized);
      return matchesQuery;
    });

    return [...items].sort((a, b) => {
      if (sortMode === 'updated') return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      return a.title.localeCompare(b.title);
    });
  }, [library, query, sortMode]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Study archive</p>
            <h3 className="mt-2 text-2xl font-semibold text-[var(--charcoal)]">Saved study library</h3>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative">
              <Search className="absolute left-3 top-3 text-[var(--muted)]" size={16} />
              <input className="field pl-9" placeholder="Search by title or subject" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <select className="field" value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
              <option value="updated">Most recently updated</option>
              <option value="title">Title</option>
            </select>
          </div>
        </div>
      </div>

      {filteredSets.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredSets.map((set) => (
            <div key={set.id} className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{set.subject}</p>
                  <h4 className="mt-2 text-xl font-semibold text-[var(--charcoal)]">{set.title}</h4>
                </div>
                <span className="rounded-full bg-[var(--sage)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--forest)]">{set.summary ? 'ready' : 'draft'}</span>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-[var(--muted)]">
                <p>{set.summary ? 'Summary available' : 'No summary yet'}</p>
                <p>{set.quiz?.length ? `${set.quiz.length} quiz questions` : 'No generated quiz'}</p>
                <p>{set.flashcards?.length ? `${set.flashcards.length} flashcards` : 'No flashcards yet'}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="primary-button small-button" onClick={() => onOpenSet(set)}>
                  <BookOpenText size={14} /> Open
                </button>
                <button type="button" className="secondary-button small-button" onClick={() => onRename(set.id)}>
                  <PenLine size={14} /> Rename
                </button>
                <button type="button" className="secondary-button small-button" onClick={() => onDelete(set.id)}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--paper)] p-12 text-center text-[var(--muted)]">
          No saved resources match your search yet. Save a study set from the workspace to start building your library.
        </div>
      )}
    </div>
  );
}

export default App;
