import crypto from 'node:crypto';

const jobs = new Map();

function normalizeJob(job) {
  return {
    ...job,
    metadata: job.metadata || {},
    result: job.result || null,
    error: job.error || null,
  };
}

export function createProcessingJob({ type, ownerId = 'demo-user', request = {}, idempotencyKey } = {}) {
  const key = idempotencyKey || `${type}:${JSON.stringify(request)}`;
  const existing = [...jobs.values()].find((job) => job.idempotencyKey === key && ['queued', 'processing', 'completed'].includes(job.status));

  if (existing) {
    return normalizeJob(existing);
  }

  const now = new Date().toISOString();
  const job = normalizeJob({
    id: crypto.randomUUID(),
    type: type || 'study-processing',
    ownerId,
    idempotencyKey: key,
    status: 'queued',
    attempts: 0,
    retries: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    metadata: request,
    result: null,
    error: null,
  });

  jobs.set(job.id, job);
  return normalizeJob(job);
}

export function getJob(jobId) {
  const job = jobs.get(jobId);
  return job ? normalizeJob(job) : null;
}

export function getJobs() {
  return [...jobs.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(normalizeJob);
}

export function setJobStatus(jobId, status, patch = {}) {
  const current = jobs.get(jobId);
  if (!current) {
    return null;
  }

  const next = normalizeJob({
    ...current,
    ...patch,
    status,
    updatedAt: new Date().toISOString(),
  });

  if (status === 'processing' && !current.startedAt) {
    next.startedAt = new Date().toISOString();
  }

  if (status === 'completed' || status === 'failed') {
    next.completedAt = new Date().toISOString();
  }

  jobs.set(jobId, next);
  return normalizeJob(next);
}

export function markJobProcessing(jobId) {
  const current = jobs.get(jobId);
  if (!current) {
    return null;
  }

  const attempts = (current.attempts || 0) + 1;
  return setJobStatus(jobId, 'processing', { attempts, retries: current.retries || 0, error: null });
}

export function markJobCompleted(jobId, result = {}) {
  const current = jobs.get(jobId);
  if (!current) {
    return null;
  }

  return setJobStatus(jobId, 'completed', {
    result,
    error: null,
  });
}

export function markJobFailed(jobId, error) {
  const current = jobs.get(jobId);
  if (!current) {
    return null;
  }

  const retries = Number(current.retries || 0) + 1;
  return setJobStatus(jobId, 'failed', {
    retries,
    error: error instanceof Error ? error.message : String(error || 'Unknown failure'),
  });
}

export function retryJob(jobId) {
  const current = jobs.get(jobId);
  if (!current) {
    return null;
  }

  return setJobStatus(jobId, 'queued', {
    error: null,
    retries: current.retries || 0,
  });
}

export function getJobMetrics() {
  const allJobs = getJobs();
  const totals = {
    total: allJobs.length,
    queued: allJobs.filter((job) => job.status === 'queued').length,
    processing: allJobs.filter((job) => job.status === 'processing').length,
    completed: allJobs.filter((job) => job.status === 'completed').length,
    failed: allJobs.filter((job) => job.status === 'failed').length,
    retryCount: allJobs.reduce((sum, job) => sum + Number(job.retries || 0), 0),
  };

  const completedDurations = allJobs
    .filter((job) => job.startedAt && job.completedAt)
    .map((job) => Date.parse(job.completedAt) - Date.parse(job.startedAt));

  totals.averageDurationMs = completedDurations.length
    ? Math.round(completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length)
    : 0;
  totals.medianDurationMs = completedDurations.length
    ? completedDurations.slice().sort((a, b) => a - b)[Math.floor(completedDurations.length / 2)]
    : 0;

  totals.recentErrors = allJobs
    .filter((job) => job.error)
    .slice(-5)
    .map((job) => ({ id: job.id, error: job.error, type: job.type }));

  return totals;
}

export function getNextQueuedJob() {
  const job = getJobs().find((entry) => entry.status === 'queued');
  return job || null;
}
