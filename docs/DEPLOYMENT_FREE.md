# Public deployment using the existing Vercel configuration

The repository already contains Vercel configuration for the Vite frontend and serverless API routes. This guide prepares a manual deployment; it does not log into Vercel, publish the repository, or create cloud resources.

## $0 precautions

- Vercel's plan availability and limits can change. Review the current plan terms before deploying and do not upgrade or enable paid features.
- Never deploy with a Supabase service-role key or Gemini key exposed to frontend variables.
- Supabase auth/database/storage and Gemini have their own quotas and terms. A free hosting tier does not make every connected service unlimited or guaranteed to cost $0.
- Do not add a payment method if you require a strict no-payment setup; stop if the provider requires it.

## Deploy

1. Ensure the Git repository contains the changes you intend to publish. Do not add `.env`; it is ignored by Git.
2. Create/sign into your Vercel account and import this existing Git repository.
3. Keep the included Vercel build settings: `npm run build`, output `dist`.
4. In Vercel's project environment settings, set for Preview and Production:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (public anon/publishable key only)
   - `GEMINI_API_KEY` only if you intend to use Gemini and have separately reviewed its billing/quota terms.
5. Deploy using the provider's dashboard. Do not enable paid add-ons or change plans.
6. In Supabase Authentication URL Configuration, add the deployed site URL to the allowed redirect/site URLs.
7. Test signup/sign-in, study-set save/reload, RLS isolation, document upload, and summary/quiz/flashcard generation on the deployed URL.
8. Keep `docs/SUPABASE_SETUP.md` SQL and policies applied. If the Storage bucket isn't available on the project's free plan, do not upgrade: the app retains local document processing.

## Deployment boundaries

- This Vercel configuration exposes the existing files in `api/` as serverless endpoints; it does not deploy `server/server.js` as a persistent Express process.
- The `server/worker.js` polling process is not deployed by this configuration.
- A Vercel serverless API request extracts a document synchronously. There is no managed queue, durable worker, or infrastructure monitoring in this deployment.
- No deployment has been performed by this workspace change. Live publication requires the owner to authorize the provider and review its current terms.

## Rollback

Use the provider dashboard to roll back to a previous deployment. To disable Supabase in the frontend, remove the two `VITE_SUPABASE_*` variables and redeploy; do not delete database records or Storage objects unless you explicitly want to erase them.
