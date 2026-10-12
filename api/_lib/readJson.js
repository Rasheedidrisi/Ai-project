export async function readJsonBody(req) {
  if (!req || typeof req.on !== 'function') {
    return {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString('utf8');
  if (!body.trim()) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}
