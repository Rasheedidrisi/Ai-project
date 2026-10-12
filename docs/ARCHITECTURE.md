# Architecture Overview

## Frontend
- React + Vite single-page app.
- Tailwind-based design system for a study-focused interface.
- React Router for workspace and library views.

## Backend
- Express API for file processing and AI orchestration.
- Multer handles uploaded PDF/TXT files.
- PDF.js extracts readable text from PDFs.
- AI orchestration checks for a Gemini API key and uses it when present.

## Storage
- Browser localStorage keeps saved study library metadata.
- Data persists across refreshes for a single-user prototype.

## Security and reliability
- API keys remain in the backend environment.
- Generated outputs are validated before being displayed to the user.
- Deterministic scoring is done only in the frontend from the validated answer key.
