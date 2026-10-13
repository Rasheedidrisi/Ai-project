export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload?.error || 'Request failed.';
    throw new Error(message);
  }

  return payload;
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/extract-text', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'The uploaded document could not be processed.');
  }

  return payload;
}

export async function getCloudStatus() {
  return apiRequest('/api/cloud/status');
}

export async function createProcessingJob(payload) {
  return apiRequest('/api/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getProcessingJob(jobId) {
  return apiRequest(`/api/jobs/${jobId}`);
}

export async function generateSummaryRequest(payload) {
  return apiRequest('/api/generate-summary', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function generateQuizRequest(payload) {
  return apiRequest('/api/generate-quiz', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function generateFlashcardsRequest(payload) {
  return apiRequest('/api/generate-flashcards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
