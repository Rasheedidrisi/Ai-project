const LIBRARY_KEY = 'noteforge-library-v1';
const ACTIVE_SET_KEY = 'noteforge-active-set-v1';

export function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

export function loadLibrary() {
  if (typeof window === 'undefined') {
    return [];
  }

  return safeJsonParse(window.localStorage.getItem(LIBRARY_KEY), []);
}

export function saveLibrary(entries) {
  if (typeof window === 'undefined') {
    return entries;
  }

  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
  return entries;
}

export function persistActiveSet(studySet) {
  if (typeof window === 'undefined') {
    return studySet;
  }

  window.localStorage.setItem(ACTIVE_SET_KEY, JSON.stringify(studySet));
  return studySet;
}

export function loadActiveSet() {
  if (typeof window === 'undefined') {
    return null;
  }

  return safeJsonParse(window.localStorage.getItem(ACTIVE_SET_KEY), null);
}

export function upsertStudySet(studySet) {
  const existing = loadLibrary();
  const nextEntries = [...existing.filter((entry) => entry.id !== studySet.id), studySet];
  saveLibrary(nextEntries);
  return nextEntries;
}

export function deleteStudySet(id) {
  const nextEntries = loadLibrary().filter((entry) => entry.id !== id);
  saveLibrary(nextEntries);
  return nextEntries;
}

export function renameStudySet(id, title) {
  const nextEntries = loadLibrary().map((entry) => (entry.id === id ? { ...entry, title, updatedAt: Date.now() } : entry));
  saveLibrary(nextEntries);
  return nextEntries;
}
