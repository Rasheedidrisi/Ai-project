const LIBRARY_KEY = 'noteforge-library-v1';
const ACTIVE_SET_KEY = 'noteforge-active-set-v1';
const STORAGE_MODE_KEY = 'noteforge-storage-mode';

export function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

export function getStorageMode() {
  if (typeof window === 'undefined') {
    return 'local';
  }

  return window.localStorage.getItem(STORAGE_MODE_KEY) || 'local';
}

export function setStorageMode(mode) {
  if (typeof window === 'undefined') {
    return mode;
  }

  const resolved = mode === 'cloud' ? 'cloud' : 'local';
  window.localStorage.setItem(STORAGE_MODE_KEY, resolved);
  return resolved;
}

export function migrateLegacyLibrary() {
  const existing = loadLibrary();
  if (!Array.isArray(existing) || existing.length === 0) {
    return [];
  }

  const migrated = existing.map((entry) => ({
    ...entry,
    storageMode: entry.storageMode || getStorageMode(),
    syncedAt: entry.syncedAt || null,
    cloudStatus: entry.cloudStatus || 'pending',
  }));

  saveLibrary(migrated);
  return migrated;
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

function getActiveSetKey(ownerId = 'local') {
  return ownerId === 'local' ? ACTIVE_SET_KEY : `${ACTIVE_SET_KEY}:${ownerId}`;
}

export function persistActiveSet(studySet, ownerId = 'local') {
  if (typeof window === 'undefined') {
    return studySet;
  }

  window.localStorage.setItem(getActiveSetKey(ownerId), JSON.stringify(studySet));
  return studySet;
}

export function loadActiveSet(ownerId = 'local') {
  if (typeof window === 'undefined') {
    return null;
  }

  return safeJsonParse(window.localStorage.getItem(getActiveSetKey(ownerId)), null);
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
