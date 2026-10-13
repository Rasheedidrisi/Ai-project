# Architecture Overview

## Frontend
- React + Vite single-page app.
- Tailwind-based design system for a study-focused interface.
- React Router for workspace and library views.

## Backend
- Express API for file processing and AI orchestration.
- Multer and the Vercel upload handler accept PDF, TXT, PNG, JPG, and JPEG files up to 5 MB.
- PDF.js extracts selectable PDF text and renders scanned pages for Tesseract OCR.
- Tesseract OCR extracts text from image notes and image-only PDF pages.
- AI orchestration checks for a Gemini API key and uses it when present.

## Storage
- Browser localStorage keeps the signed-out/offline study library and active set.
- When Supabase is configured and the user signs in, the study library is read from and written to Supabase Postgres.
- Supabase Row Level Security scopes database access to the authenticated user's `user_id`.
- Signed-in uploads are copied to a private Supabase Storage bucket and file metadata/status is recorded in Postgres when the bucket and SQL policies are configured.
- The same upload still goes through the existing API for extraction; OCR and AI generation remain synchronous.
- Signed-in processing activity is persisted in Supabase. The local job store remains in-memory and there is no durable background queue.

## Security and reliability
- API keys remain in the backend environment.
- Generated outputs are validated before being displayed to the user.
- Deterministic scoring is done only in the frontend from the validated answer key.
- The browser uses only the Supabase public anon/publishable key; never use a service-role key in the frontend.
- Apply the per-user table and private storage policies documented in `SUPABASE_SETUP.md` before enabling document copies.
