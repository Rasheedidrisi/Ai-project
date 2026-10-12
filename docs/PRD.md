# Product Requirements Document

## Product
NoteForge AI helps students transform notes into concise summaries, practice quizzes, and review flashcards.

## Goals
- Allow note input via paste or PDF, TXT, PNG, JPG, and JPEG upload.
- Produce grounded summaries in multiple styles.
- Generate quiz questions with answer validation and in-browser scoring.
- Help users review weak topics and retain concepts with flashcards.
- Store study data locally and persist after refresh.

## Users
- College students and self-learners.
- Learners preparing for unit tests and exam revision.

## Functional Requirements
1. Accept title, subject, and source text.
2. Extract readable text from uploaded PDFs and TXT, using OCR for scanned PDF pages and images.
3. Generate summaries using AI when configured, with local fallback when not configured.
4. Generate quiz questions with difficulty, question count, and type controls.
5. Provide an interactive quiz flow with scoring based on the validated answer key.
6. Generate flashcards for review and tracking.
7. Save and reopen resources in a local library with search and rename/delete tools.

## Non-functional Requirements
- Responsive interface for desktop and mobile.
- Validate inputs on both client and server.
- Keep API keys server-side and never expose them in the frontend.
- Gracefully recover when the LLM is unavailable.
