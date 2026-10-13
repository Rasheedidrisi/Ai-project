import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BookOpenText, BrainCircuit, Copy, FileText, FolderArchive, LibraryBig, LoaderCircle, Plus, Search, Sparkles, Trash2, Upload, Wand2, CheckCircle2, ClipboardCheck, XCircle, ArrowLeft, ArrowRight, RotateCcw, PenLine, Save, Brain, NotebookPen, BarChart3 } from 'lucide-react';
import {
  generateFlashcardsRequest,
  generateQuizRequest,
  generateSummaryRequest,
  getCloudStatus,
  uploadDocument,
} from './utils/api';
import {
  deleteStudySet,
  loadActiveSet,
  loadLibrary,
  persistActiveSet,
  saveLibrary,
} from './utils/storage';
import {
  createCloudProcessingRecord,
  finishCloudProcessingRecord,
  deleteCloudDocument,
  deleteCloudStudySet,
  loadCloudDocuments,
  loadCloudProcessingMetrics,
  loadCloudStudySets,
  mergeStudySets,
  getSupabaseClient,
  supabaseConfigured,
  updateCloudDocumentStatus,
  uploadCloudDocument,
  upsertCloudStudySets,
} from './supabase';

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
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [studySet, setStudySet] = useState(() => loadActiveSet() || defaultStudySet());
  const [library, setLibrary] = useState(() => loadLibrary());
  const [toast, setToast] = useState('');
  const [jobState, setJobState] = useState({ summary: false, quiz: false, flashcards: false, upload: false });
  const [cloudStatus, setCloudStatus] = useState({ mode: 'local', enabled: false, metrics: {} });
  const [cloudMetrics, setCloudMetrics] = useState(null);
  const [cloudDocuments, setCloudDocuments] = useState([]);
  const [cloudUser, setCloudUser] = useState(null);
  const [authReady, setAuthReady] = useState(() => !supabaseConfigured);
  const [cloudSyncState, setCloudSyncState] = useState({ loading: false, error: '' });
  const [quizSession, setQuizSession] = useState({ currentIndex: 0, answers: {}, submitted: false, score: null, percentage: null, weakTopics: [], resultShown: false });
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [fileStatus, setFileStatus] = useState('');
  const fileInputRef = useRef(null);
  const activeSetOwnerRef = useRef('local');
  const pageTitle = pathname === '/library' ? 'Saved study library' : pathname === '/cloud' ? 'Cloud operations' : 'Study workspace';
  const pageDescription = pathname === '/library'
    ? 'Your saved notes, summaries, quizzes, and flashcards'
    : pathname === '/cloud'
      ? 'Account sync and processing activity'
      : 'Turn your notes into a focused study session';

  useEffect(() => {
    document.title = `${pageTitle} — NoteForge AI`;
  }, [pageTitle]);

  useEffect(() => {
    if (!authReady) return;
    const ownerId = cloudUser?.id || 'local';
    if (activeSetOwnerRef.current !== ownerId) {
      activeSetOwnerRef.current = ownerId;
      return;
    }
    persistActiveSet(studySet, ownerId);
  }, [studySet, cloudUser?.id, authReady]);

  useEffect(() => {
    let isMounted = true;

    async function refreshCloudStatus() {
      try {
        const status = await getCloudStatus();
        if (isMounted) {
          setCloudStatus(status);
        }
      } catch {
        if (isMounted) {
          setCloudStatus({ mode: 'local', enabled: false, metrics: {} });
        }
      }
    }

    refreshCloudStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      return undefined;
    }

    let isMounted = true;
    let unsubscribe = () => {};
    const applySession = (session, sessionError = '') => {
      setCloudUser(session?.user || null);
      setAuthReady(true);
      setCloudSyncState({ loading: false, error: sessionError });
      if (session?.user) {
        setLibrary([]);
        setStudySet(loadActiveSet(session.user.id) || defaultStudySet());
      } else {
        setLibrary(loadLibrary());
        setStudySet(loadActiveSet() || defaultStudySet());
      }
    };

    getSupabaseClient().then(async (supabase) => {
      if (!isMounted || !supabase) return;
      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        applySession(session);
      });
      unsubscribe = () => authListener.subscription.unsubscribe();
      const { data, error } = await supabase.auth.getSession();
      if (isMounted) applySession(data.session, error?.message || '');
    }).catch((error) => {
      if (isMounted) {
        applySession(null, error.message || 'Could not read Supabase session.');
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadSignedInLibrary() {
      if (!cloudUser) {
        setCloudMetrics(null);
        setCloudDocuments([]);
        return;
      }

      setCloudSyncState({ loading: true, error: '' });
      try {
        const cloudEntries = await loadCloudStudySets(cloudUser.id);
        if (isMounted) {
          setLibrary(cloudEntries);
          setStudySet(loadActiveSet(cloudUser.id) || cloudEntries[0] || defaultStudySet());
          setCloudSyncState({ loading: false, error: '' });
        }
      } catch (error) {
        if (isMounted) {
          setLibrary([]);
          setCloudSyncState({ loading: false, error: error.message || 'Cloud library could not be loaded.' });
        }
        return;
      }

      try {
        const metrics = await loadCloudProcessingMetrics(cloudUser.id);
        if (isMounted) setCloudMetrics(metrics);
      } catch (error) {
        if (isMounted) {
          setCloudSyncState({ loading: false, error: error.message || 'Cloud processing history could not be loaded.' });
        }
      }

      try {
        const documents = await loadCloudDocuments(cloudUser.id);
        if (isMounted) setCloudDocuments(documents);
      } catch (error) {
        if (isMounted) {
          setCloudSyncState({ loading: false, error: error.message || 'Cloud documents could not be loaded.' });
        }
      }
    }

    loadSignedInLibrary();
    return () => {
      isMounted = false;
    };
  }, [cloudUser]);

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

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(studySet.summary || activeSummary);
      setToast('Summary copied to clipboard.');
    } catch {
      setToast('Could not copy the summary. Check clipboard permissions and try again.');
    }
  };

  const beginCloudProcessingRecord = async (jobType) => {
    if (!cloudUser) return null;
    try {
      return await createCloudProcessingRecord(cloudUser.id, jobType);
    } catch (error) {
      setCloudSyncState({ loading: false, error: error.message || 'Could not record cloud processing activity.' });
      return null;
    }
  };

  const endCloudProcessingRecord = async (jobId, status, errorCode = null) => {
    if (!jobId) return;
    try {
      await finishCloudProcessingRecord(jobId, status, errorCode);
      const metrics = await loadCloudProcessingMetrics(cloudUser.id);
      setCloudMetrics(metrics);
      setCloudDocuments(await loadCloudDocuments(cloudUser.id));
    } catch (error) {
      setCloudSyncState({ loading: false, error: error.message || 'Could not update cloud processing activity.' });
    }
  };

  const handleDeleteCloudDocument = async (documentId) => {
    if (!cloudUser) return;
    try {
      await deleteCloudDocument(cloudUser.id, documentId);
      setCloudDocuments((current) => current.filter((document) => document.id !== documentId));
      setToast('Private cloud document deleted.');
    } catch (error) {
      setCloudSyncState({ loading: false, error: error.message || 'Could not delete cloud document.' });
    }
  };

  const handleGenerateSummary = async () => {
    if (!studySet.sourceText.trim()) {
      setToast('Add study notes before generating a summary.');
      return;
    }

    setJobState((current) => ({ ...current, summary: true }));
    const cloudJobId = await beginCloudProcessingRecord('summary');
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
      await endCloudProcessingRecord(cloudJobId, 'completed');
    } catch (error) {
      await endCloudProcessingRecord(cloudJobId, 'failed', 'summary_generation_failed');
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

    let cloudDocument = null;
    if (cloudUser) {
      try {
        cloudDocument = await uploadCloudDocument(file, cloudUser.id);
      } catch (error) {
        setCloudSyncState({ loading: false, error: error.message || 'Cloud document upload failed.' });
        setToast(`Cloud copy failed; continuing with local extraction. ${error.message}`);
      }
    }

    const cloudJobId = await beginCloudProcessingRecord('document-extraction');
    try {
      const result = await uploadDocument(file);
      await updateCloudDocumentStatus(cloudUser?.id, cloudDocument?.id, 'extracted');
      setStudySet((current) => ({
        ...current,
        sourceText: result.text,
        title: current.title || file.name.replace(/\.[^.]+$/, ''),
        subject: current.subject || 'Uploaded notes',
        updatedAt: Date.now(),
      }));
      setFileStatus(`Extracted ${result.fileName} and loaded the content.`);
      setToast('Document extracted successfully.');
      await endCloudProcessingRecord(cloudJobId, 'completed');
    } catch (error) {
      if (cloudDocument && cloudUser) {
        try {
          await updateCloudDocumentStatus(cloudUser.id, cloudDocument.id, 'extraction_failed');
        } catch (statusError) {
          setCloudSyncState({ loading: false, error: statusError.message || 'Could not update document status.' });
        }
      }
      await endCloudProcessingRecord(cloudJobId, 'failed', 'document_extraction_failed');
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
    const cloudJobId = await beginCloudProcessingRecord('quiz');
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
      await endCloudProcessingRecord(cloudJobId, 'completed');
    } catch (error) {
      await endCloudProcessingRecord(cloudJobId, 'failed', 'quiz_generation_failed');
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
    const cloudJobId = await beginCloudProcessingRecord('flashcards');
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
      await endCloudProcessingRecord(cloudJobId, 'completed');
    } catch (error) {
      await endCloudProcessingRecord(cloudJobId, 'failed', 'flashcard_generation_failed');
      setToast(error.message || 'Flashcard generation failed.');
    } finally {
      setJobState((current) => ({ ...current, flashcards: false }));
    }
  };

  const handleSaveToLibrary = async () => {
    const safeSet = {
      ...studySet,
      id: studySet.id || crypto.randomUUID(),
      updatedAt: Date.now(),
    };

    const next = [...library.filter((entry) => entry.id !== safeSet.id), safeSet];
    if (cloudUser) {
      try {
        await upsertCloudStudySets(cloudUser.id, [safeSet]);
        setLibrary(next);
        setToast('Study set saved to your Supabase library.');
      } catch (error) {
        setLibrary(next);
        setCloudSyncState({ loading: false, error: error.message });
        setToast(`Saved in this session, but cloud sync failed: ${error.message}`);
      }
      return;
    }

    saveLibrary(next);
    setLibrary(next);
    setToast('Study set saved to your library on this device.');
  };

  const handleDeleteStudySet = async (id) => {
    if (cloudUser) {
      try {
        await deleteCloudStudySet(cloudUser.id, id);
      } catch (error) {
        setCloudSyncState({ loading: false, error: error.message });
        setToast(error.message || 'Cloud study set could not be deleted.');
        return;
      }
    }
    const remaining = cloudUser
      ? library.filter((entry) => entry.id !== id)
      : deleteStudySet(id);
    setLibrary(remaining);
    setToast(cloudUser ? 'Study set deleted from your cloud library.' : 'Study set deleted.');
  };

  const handleRenameStudySet = async (id) => {
    const currentItem = library.find((item) => item.id === id);
    const nextTitle = window.prompt('Rename this study set', currentItem?.title || '');
    if (!nextTitle || !nextTitle.trim()) return;
    const updated = library.map((item) => (item.id === id ? { ...item, title: nextTitle.trim(), updatedAt: Date.now() } : item));
    if (cloudUser) {
      try {
        const renamed = updated.find((item) => item.id === id);
        await upsertCloudStudySets(cloudUser.id, [renamed]);
      } catch (error) {
        setCloudSyncState({ loading: false, error: error.message });
        setToast(error.message || 'Cloud study set could not be renamed.');
        return;
      }
    } else {
      saveLibrary(updated);
    }
    setLibrary(updated);
    setToast('Study set renamed.');
  };

  const handleImportLocalLibrary = async () => {
    if (!cloudUser) return;

    setCloudSyncState({ loading: true, error: '' });
    try {
      const localEntries = loadLibrary();
      const cloudEntries = await loadCloudStudySets(cloudUser.id);
      const mergedEntries = mergeStudySets(localEntries, cloudEntries);
      await upsertCloudStudySets(cloudUser.id, mergedEntries);
      setLibrary(mergedEntries);
      setCloudSyncState({ loading: false, error: '' });
      setToast(`Imported and merged ${localEntries.length} local study set(s). Newer cloud versions were kept.`);
    } catch (error) {
      setCloudSyncState({ loading: false, error: error.message || 'Could not import the local library.' });
    }
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

  const metrics = cloudStatus?.metrics || {};
  const dashboardMetrics = cloudUser && cloudMetrics ? cloudMetrics : metrics;

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--charcoal)]">
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-6 lg:px-8">
        <aside className="app-sidebar hidden w-72 shrink-0 rounded-3xl border p-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="brand-mark flex h-11 w-11 items-center justify-center rounded-2xl text-white">
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
            <NavLink to="/cloud" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <BarChart3 size={18} /> Cloud operations
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

        <main className="workspace-main flex-1 rounded-[32px] border p-4 lg:p-6">
          <nav aria-label="Main navigation" className="mobile-nav lg:hidden">
            <NavLink to="/" end className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}>
              <BookOpenText size={17} /> Workspace
            </NavLink>
            <NavLink to="/library" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}>
              <LibraryBig size={17} /> Library
            </NavLink>
            <NavLink to="/cloud" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}>
              <BarChart3 size={17} /> Cloud
            </NavLink>
          </nav>

          <div className="page-header mb-5 flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{pageDescription}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--charcoal)] sm:text-3xl">{pageTitle}</h2>
            </div>
            <div className="flex gap-2 self-start lg:self-auto">
              <button type="button" className="secondary-button" onClick={handleSaveToLibrary}>
                <Save size={16} /> Save
              </button>
              <button type="button" className="primary-button" onClick={() => setStudySet(defaultStudySet())}>
                <Plus size={16} /> New set
              </button>
            </div>
          </div>

          {toast ? (
            <div role="status" aria-live="polite" className="mb-6 rounded-2xl border border-[var(--forest)] bg-[var(--sage)] px-4 py-3 text-sm text-[var(--charcoal)]">
              {toast}
            </div>
          ) : null}

          <div key={pathname} className="page-enter">
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
                          <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()} disabled={jobState.upload}>
                            {jobState.upload ? <><LoaderCircle className="animate-spin" size={16} /> Processing…</> : 'Select file'}
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
                            <button type="button" className="secondary-button small-button" onClick={handleCopySummary}>
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
              path="/cloud"
              element={
                <CloudOperationsPage
                  cloudStatus={cloudStatus}
                  metrics={dashboardMetrics}
                  metricsArePersistent={Boolean(cloudUser && cloudMetrics)}
                  documents={cloudDocuments}
                  user={cloudUser}
                  authReady={authReady}
                  syncState={cloudSyncState}
                  onImportLocalLibrary={handleImportLocalLibrary}
                  onDeleteCloudDocument={handleDeleteCloudDocument}
                />
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
                  onCreateNew={() => {
                    setStudySet(defaultStudySet());
                    navigate('/');
                  }}
                />
              }
            />
          </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

function SupabaseAuthPanel({ user, authReady, syncState }) {
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [requestState, setRequestState] = useState({ loading: false, message: '', error: '' });

  const handleSubmit = async (event) => {
    event.preventDefault();

    setRequestState({ loading: true, message: '', error: '' });
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        setRequestState({ loading: false, message: '', error: 'Supabase configuration is missing.' });
        return;
      }
      const result = mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

      if (result.error) {
        setRequestState({ loading: false, message: '', error: result.error.message });
        return;
      }

      setPassword('');
      setRequestState({
        loading: false,
        message: mode === 'sign-up' && !result.data.session
          ? 'Account created. Check your email to confirm it, then sign in.'
          : 'Signed in successfully.',
        error: '',
      });
    } catch (error) {
      setRequestState({ loading: false, message: '', error: error.message || 'Supabase authentication failed.' });
    }
  };

  const handleSignOut = async () => {
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        setRequestState({ loading: false, message: '', error: 'Supabase configuration is missing.' });
        return;
      }
      const { error } = await supabase.auth.signOut();
      if (error) {
        setRequestState({ loading: false, message: '', error: error.message });
        return;
      }
      setRequestState({ loading: false, message: 'Signed out.', error: '' });
    } catch (error) {
      setRequestState({ loading: false, message: '', error: error.message || 'Could not sign out.' });
    }
  };

  if (!supabaseConfigured) {
    return (
      <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
        <h4 className="text-lg font-semibold text-[var(--charcoal)]">Connect Supabase</h4>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your local
          <code> .env</code> file, then restart the dev server. Until then, study sets stay in this browser.
        </p>
      </section>
    );
  }

  if (!authReady) {
    return <p className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4 text-sm text-[var(--muted)]">Checking Supabase session…</p>;
  }

  return (
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
      {user ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-lg font-semibold text-[var(--charcoal)]">Supabase account</h4>
            <p className="mt-1 text-sm text-[var(--muted)]">Signed in as {user.email}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Your study library is isolated by Supabase Row Level Security.</p>
          </div>
          <button type="button" className="secondary-button" onClick={handleSignOut}>Sign out</button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h4 className="text-lg font-semibold text-[var(--charcoal)]">Sign in to sync your library</h4>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Create a Supabase account or sign in to access your cloud-saved study sets on another device.
              Local uploads and document processing remain on this app.
            </p>
          </div>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="flex gap-2">
              <button type="button" className={mode === 'sign-in' ? 'primary-button' : 'secondary-button'} onClick={() => setMode('sign-in')}>Sign in</button>
              <button type="button" className={mode === 'sign-up' ? 'primary-button' : 'secondary-button'} onClick={() => setMode('sign-up')}>Create account</button>
            </div>
            <label className="block text-sm font-medium text-[var(--charcoal)]">
              Email
              <input className="field mt-1 w-full" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="block text-sm font-medium text-[var(--charcoal)]">
              Password
              <input className="field mt-1 w-full" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" className="primary-button" disabled={requestState.loading}>
              {requestState.loading ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </button>
            {requestState.message ? <p className="text-sm text-[var(--forest)]">{requestState.message}</p> : null}
            {requestState.error ? <p className="text-sm text-[#a13e32]">{requestState.error}</p> : null}
          </form>
        </div>
      )}
      {syncState?.loading ? <p className="mt-4 text-sm text-[var(--muted)]">Loading your cloud study library…</p> : null}
      {syncState?.error ? <p role="alert" className="mt-4 text-sm text-[#a13e32]">{syncState.error}</p> : null}
    </section>
  );
}

function CloudOperationsPage({
  cloudStatus,
  metrics,
  metricsArePersistent,
  documents,
  user,
  authReady,
  syncState,
  onImportLocalLibrary,
  onDeleteCloudDocument,
}) {
  const statusLabel = user ? 'Supabase library connected' : supabaseConfigured ? 'Supabase ready — sign-in required' : 'Local mode';

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Operations dashboard</p>
            <h3 className="mt-2 text-2xl font-semibold text-[var(--charcoal)]">Cloud operations</h3>
          </div>
          <span className="rounded-full bg-[var(--sage)] px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-[var(--forest)]">
            {statusLabel}
          </span>
        </div>
      </div>

      <SupabaseAuthPanel user={user} authReady={authReady} syncState={syncState} />

      {user ? (
        <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-lg font-semibold text-[var(--charcoal)]">Move this device’s local study sets</h4>
              <p className="mt-1 text-sm text-[var(--muted)]">Import is explicit. For matching IDs, the newer updated study set wins.</p>
            </div>
            <button type="button" className="secondary-button" onClick={onImportLocalLibrary} disabled={syncState?.loading}>
              Import local library
            </button>
          </div>
        </section>
      ) : null}

      {user ? (
        <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
          <h4 className="text-lg font-semibold text-[var(--charcoal)]">Private document copies (optional)</h4>
          <p className="mt-1 text-sm text-[var(--muted)]">When the Storage bucket is configured, originals are private to your account. Extraction still runs through the app API.</p>
          {documents.length ? (
            <ul className="mt-4 space-y-3">
              {documents.map((document) => (
                <li key={document.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-[var(--charcoal)]">{document.original_name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {document.processing_status} · {(document.file_size / 1024).toFixed(1)} KB · {new Date(document.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button type="button" className="secondary-button small-button" onClick={() => onDeleteCloudDocument(document.id)}>
                    <Trash2 size={14} /> Delete file
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-[var(--line)] bg-white p-5 text-center text-sm text-[var(--muted)]">
              No private cloud document copies yet. Signed-in uploads are copied here after the Storage setup SQL is run.
            </p>
          )}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          [metricsArePersistent ? 'Recorded operations' : 'Local jobs', metrics.total ?? 0],
          [metricsArePersistent ? 'In progress' : 'Queued', metricsArePersistent ? metrics.processing ?? 0 : metrics.queued ?? 0],
          ['Completed', metrics.completed ?? 0],
          ['Failed', metrics.failed ?? 0],
          [metricsArePersistent ? 'Avg. duration (ms)' : 'Retry count', metricsArePersistent ? metrics.averageDurationMs ?? 0 : metrics.retryCount ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--charcoal)]">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
          <div className="flex items-center gap-2 text-[var(--forest)]">
            <BarChart3 size={18} />
            <h4 className="text-lg font-semibold">Processing health</h4>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <p className="text-sm text-[var(--muted)]">Average duration</p>
              <p className="text-xl font-semibold text-[var(--charcoal)]">{metrics.averageDurationMs ?? 0} ms</p>
            </div>
            <div>
              <p className="text-sm text-[var(--muted)]">Median duration</p>
              <p className="text-xl font-semibold text-[var(--charcoal)]">{metrics.medianDurationMs ?? 0} ms</p>
            </div>
            <div>
              <p className="text-sm text-[var(--muted)]">{metricsArePersistent ? 'Successful operations' : 'Retry count'}</p>
              <p className="text-xl font-semibold text-[var(--charcoal)]">{metricsArePersistent ? metrics.completed ?? 0 : metrics.retryCount ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
          <div className="flex items-center gap-2 text-[var(--forest)]">
            <Sparkles size={18} />
            <h4 className="text-lg font-semibold">System status</h4>
          </div>

          <div className="mt-5 space-y-3 text-sm text-[var(--muted)]">
            <p>Mode: <span className="font-medium text-[var(--charcoal)]">{cloudStatus?.mode || 'local'}</span></p>
            <p>Provider: <span className="font-medium text-[var(--charcoal)]">{cloudStatus?.provider || 'local'}</span></p>
            <p>Study library: <span className="font-medium text-[var(--charcoal)]">{user ? 'Supabase database' : 'local browser storage'}</span></p>
            <p>Documents: <span className="font-medium text-[var(--charcoal)]">{user ? 'private Supabase copy when Storage is configured; extraction stays local/API' : 'local upload and extraction'}</span></p>
            <p>Jobs: <span className="font-medium text-[var(--charcoal)]">{user ? 'persistent processing records; work runs synchronously' : 'in-memory tracking; no managed queue'}</span></p>
          </div>
        </div>
      </section>

      <p className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4 text-sm text-[var(--muted)]">
        {metricsArePersistent
          ? 'These are per-account Supabase records for synchronous app operations, not a managed queue or infrastructure telemetry.'
          : 'Local job counters reset when the API restarts. A persistent account-level activity log appears after signing in and configuring its table.'}
      </p>

      {metrics.recentErrors?.length ? (
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
          <div className="flex items-center gap-2 text-[var(--forest)]">
            <XCircle size={18} />
            <h4 className="text-lg font-semibold">Recent local errors</h4>
          </div>
          <ul className="mt-4 space-y-3 text-sm text-[var(--muted)]">
            {metrics.recentErrors.map((item) => (
              <li key={item.id} className="rounded-2xl border border-[var(--line)] bg-white p-3">
                <p className="font-medium text-[var(--charcoal)]">{item.type}</p>
                <p>{item.error}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--paper)] p-8 text-center text-sm text-[var(--muted)]">
          No processing errors have been recorded yet. This does not indicate managed queue health.
        </div>
      )}
    </div>
  );
}

function LibraryPage({ library, onOpenSet, onDelete, onRename, onCreateNew }) {
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
            <div key={set.id} className="library-card rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5">
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
      ) : library.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--paper)] p-8 text-center sm:p-12">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--sage)] text-[var(--forest)]">
            <FolderArchive size={22} />
          </div>
          <h4 className="mt-4 text-lg font-semibold text-[var(--charcoal)]">Your library is ready for its first set</h4>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">Create a study set in the workspace, then save it here to keep your notes, summaries, quizzes, and flashcards together.</p>
          <button type="button" className="primary-button mt-5" onClick={onCreateNew}>
            <Plus size={16} /> Create a study set
          </button>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--paper)] p-8 text-center sm:p-12">
          <Search className="mx-auto text-[var(--muted)]" size={22} />
          <p className="mt-3 text-sm text-[var(--muted)]">No saved study sets match “{query}”. Try another title or subject.</p>
          <button type="button" className="secondary-button mt-4" onClick={() => setQuery('')}>Clear search</button>
        </div>
      )}
    </div>
  );
}

export default App;
