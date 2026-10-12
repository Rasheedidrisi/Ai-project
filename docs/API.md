# API reference

## GET /api/health
Returns a heartbeat response for the backend service.

## POST /api/extract-text
Accepts a form-data upload with field name `file` (PDF, TXT, PNG, JPG, or JPEG; up to 5 MB).
Scanned PDF pages and image notes are processed with OCR.
Returns a JSON object with `text`, `fileName`, and `extracted`.

## POST /api/generate-summary
Body:
{
  "text": "<study notes>",
  "title": "<title>",
  "style": "quick|detailed|exam"
}

## POST /api/generate-quiz
Body:
{
  "text": "<study notes>",
  "count": 5,
  "difficulty": "Easy|Medium|Hard",
  "questionType": "multiple-choice|true-false"
}

## POST /api/generate-flashcards
Body:
{
  "text": "<study notes>"
}
