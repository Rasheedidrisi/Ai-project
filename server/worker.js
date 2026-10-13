import { getNextQueuedJob, markJobCompleted, markJobFailed, markJobProcessing } from './jobStore.js';

const pollIntervalMs = Number(process.env.WORKER_POLL_MS || 3000);

async function processNextJob() {
  const queuedJob = getNextQueuedJob();
  if (!queuedJob) {
    return false;
  }

  markJobProcessing(queuedJob.id);

  try {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    markJobCompleted(queuedJob.id, {
      type: queuedJob.type,
      ownerId: queuedJob.ownerId,
      processedAt: new Date().toISOString(),
      source: 'local-worker',
      summary: `Queued job ${queuedJob.id} completed successfully in local worker mode.`,
    });
    console.log(`Worker processed ${queuedJob.id}`);
    return true;
  } catch (error) {
    markJobFailed(queuedJob.id, error);
    console.error(`Worker failed on ${queuedJob.id}:`, error);
    return false;
  }
}

console.log('NoteForge Cloud worker initialized. Waiting for queued jobs...');
setInterval(() => {
  processNextJob().catch((error) => {
    console.error('Worker poll failed:', error);
  });
}, pollIntervalMs);
