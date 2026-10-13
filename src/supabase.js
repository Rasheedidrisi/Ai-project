const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function normalizeSupabaseUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.pathname = url.pathname.replace(/\/rest\/v1\/?$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

const normalizedSupabaseUrl = normalizeSupabaseUrl(supabaseUrl);
export const supabaseConfigured = Boolean(normalizedSupabaseUrl && supabaseAnonKey);
let supabaseClientPromise;

export function getSupabaseClient() {
  if (!supabaseConfigured) return Promise.resolve(null);
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(normalizedSupabaseUrl, supabaseAnonKey));
  }
  return supabaseClientPromise;
}

export async function loadCloudStudySets(userId) {
  const supabase = await getSupabaseClient();
  if (!supabase || !userId) {
    throw new Error('Supabase is not configured or you are not signed in.');
  }

  const rows = [];
  const pageSize = 100;
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from('study_sets')
      .select('id, study_set, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      throw new Error(`Could not load cloud study sets: ${error.message}`);
    }

    rows.push(...(data || []));
    if (!data || data.length < pageSize) {
      break;
    }
    page += 1;
  }

  return rows.map((row) => ({
    ...row.study_set,
    id: row.id,
    updatedAt: Date.parse(row.updated_at) || row.study_set?.updatedAt || Date.now(),
  }));
}

export async function upsertCloudStudySets(userId, entries) {
  const supabase = await getSupabaseClient();
  if (!supabase || !userId) {
    throw new Error('Supabase is not configured or you are not signed in.');
  }
  if (!entries.length) {
    return [];
  }

  const rows = entries.map((entry) => ({
    id: entry.id,
    user_id: userId,
    study_set: entry,
  }));
  const { error } = await supabase
    .from('study_sets')
    .upsert(rows, { onConflict: 'user_id,id' });

  if (error) {
    throw new Error(`Could not save study sets to the cloud: ${error.message}`);
  }

  return entries;
}

export async function deleteCloudStudySet(userId, id) {
  const supabase = await getSupabaseClient();
  if (!supabase || !userId) {
    throw new Error('Supabase is not configured or you are not signed in.');
  }

  const { error } = await supabase
    .from('study_sets')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);

  if (error) {
    throw new Error(`Could not delete cloud study set: ${error.message}`);
  }
}

const DOCUMENT_BUCKET = 'study-documents';
const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;
const DOCUMENT_TYPES = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export async function uploadCloudDocument(file, userId) {
  const supabase = await getSupabaseClient();
  if (!supabase || !userId) {
    throw new Error('Sign in before uploading a document to cloud storage.');
  }
  if (file.size > MAX_DOCUMENT_SIZE) {
    throw new Error('Documents must be 5 MB or smaller.');
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  const contentType = DOCUMENT_TYPES[extension];
  if (!contentType) {
    throw new Error('Only PDF, TXT, PNG, JPG, and JPEG files are supported.');
  }

  const id = crypto.randomUUID();
  const storagePath = `${userId}/${id}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Could not upload the document to private cloud storage: ${uploadError.message}`);
  }

  const { data, error: metadataError } = await supabase
    .from('study_documents')
    .insert({
      id,
      user_id: userId,
      storage_path: storagePath,
      original_name: file.name,
      content_type: contentType,
      file_size: file.size,
      processing_status: 'uploaded',
    })
    .select('id')
    .single();

  if (metadataError) {
    const { error: cleanupError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .remove([storagePath]);
    if (cleanupError) {
      throw new Error(`Document metadata could not be saved (${metadataError.message}) and the uploaded file could not be removed (${cleanupError.message}).`);
    }
    throw new Error(`Document metadata could not be saved: ${metadataError.message}`);
  }

  return { id: data.id, storagePath };
}

export async function updateCloudDocumentStatus(userId, documentId, status) {
  const supabase = await getSupabaseClient();
  if (!supabase || !userId || !documentId) return;

  const { error } = await supabase
    .from('study_documents')
    .update({ processing_status: status })
    .eq('id', documentId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Could not update cloud document status: ${error.message}`);
  }
}

export async function loadCloudDocuments(userId) {
  const supabase = await getSupabaseClient();
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from('study_documents')
    .select('id, original_name, content_type, file_size, processing_status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Could not load cloud document metadata: ${error.message}`);
  }
  return data || [];
}

export async function deleteCloudDocument(userId, documentId) {
  const supabase = await getSupabaseClient();
  if (!supabase || !userId) {
    throw new Error('Sign in before deleting a cloud document.');
  }

  const { data: document, error: lookupError } = await supabase
    .from('study_documents')
    .select('storage_path')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single();

  if (lookupError) {
    throw new Error(`Could not find the cloud document: ${lookupError.message}`);
  }

  const { error: storageError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .remove([document.storage_path]);
  if (storageError) {
    throw new Error(`Could not remove the private document file: ${storageError.message}`);
  }

  const { error: metadataError } = await supabase
    .from('study_documents')
    .delete()
    .eq('id', documentId)
    .eq('user_id', userId);

  if (metadataError) {
    throw new Error(`The private file was removed, but its metadata could not be deleted: ${metadataError.message}`);
  }
}

export async function createCloudProcessingRecord(userId, jobType) {
  const supabase = await getSupabaseClient();
  if (!supabase || !userId) {
    throw new Error('Sign in before recording cloud processing activity.');
  }

  const { data, error } = await supabase
    .from('processing_jobs')
    .insert({
      user_id: userId,
      job_type: jobType,
      status: 'processing',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Could not record processing activity: ${error.message}`);
  }
  return data.id;
}

export async function finishCloudProcessingRecord(jobId, status, errorCode = null) {
  const supabase = await getSupabaseClient();
  if (!supabase || !jobId) return;

  const { error } = await supabase
    .from('processing_jobs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      error_code: status === 'failed' ? errorCode || 'processing_failed' : null,
    })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Could not update processing activity: ${error.message}`);
  }
}

export async function loadCloudProcessingMetrics(userId) {
  const supabase = await getSupabaseClient();
  if (!supabase || !userId) return null;

  const rows = [];
  const pageSize = 100;
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('status, started_at, completed_at, error_code')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      throw new Error(`Could not load cloud processing metrics: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    page += 1;
  }

  const durations = rows
    .filter((row) => row.started_at && row.completed_at)
    .map((row) => Date.parse(row.completed_at) - Date.parse(row.started_at))
    .filter((duration) => Number.isFinite(duration) && duration >= 0)
    .sort((a, b) => a - b);
  const errors = rows.filter((row) => row.status === 'failed');

  return {
    total: rows.length,
    processing: rows.filter((row) => row.status === 'processing').length,
    completed: rows.filter((row) => row.status === 'completed').length,
    failed: errors.length,
    averageDurationMs: durations.length
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : 0,
    medianDurationMs: durations.length
      ? durations[Math.floor(durations.length / 2)]
      : 0,
    recentErrors: errors.slice(0, 5).map((row, index) => ({
      id: `${row.started_at}-${index}`,
      type: 'Cloud-tracked processing',
      error: row.error_code || 'processing_failed',
    })),
  };
}

export function mergeStudySets(localEntries, cloudEntries) {
  const merged = new Map();
  for (const entry of [...cloudEntries, ...localEntries]) {
    const existing = merged.get(entry.id);
    if (!existing || Number(entry.updatedAt || 0) > Number(existing.updatedAt || 0)) {
      merged.set(entry.id, entry);
    }
  }
  return [...merged.values()].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}
