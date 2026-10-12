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
- Browser localStorage keeps saved study library metadata.
- Data persists across refreshes for a single-user prototype.

## Security and reliability
- API keys remain in the backend environment.
- Generated outputs are validated before being displayed to the user.
- Deterministic scoring is done only in the frontend from the validated answer key.
