# Supabase Free Plan Setup

This setup enables email/password authentication, per-user cloud study sets, private copies of uploaded documents, and persistent records of processing activity. Document extraction and AI generation still run synchronously through the existing API; this does not provide a managed background queue or cloud-hosted OCR.

## Keep this at $0

1. Create a project at [supabase.com](https://supabase.com/) and select the **Free** plan.
2. Do not add a paid subscription or upgrade the project.
3. Do not enable paid add-ons. Free plans have quotas and provider-defined availability limits; this project cannot guarantee that an external provider will never change its terms.
4. If Supabase asks you to choose an organization billing plan, stay on the free plan and do not confirm a paid upgrade.

## Configure the project

1. In Supabase, open **Project Settings → API** (or the project's API keys page).
2. Copy the project URL and the public anon/publishable key.
3. Copy `.env.example` to `.env` and set:

   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
   ```

4. Never put a `service_role` or secret key in `.env` variables prefixed with `VITE_`, frontend code, screenshots, or chat messages.
5. In **Authentication → Providers**, enable **Email**. For a demo, email confirmation may be turned off in the provider's auth settings; otherwise users must confirm the sign-up email before signing in.
6. Add your local app URL to **Authentication → URL Configuration** if the provider requires it: `http://localhost:5173`.
7. Run the study-set SQL below in **SQL Editor**. Then run the private Storage and processing-history SQL only if your Free plan offers Storage without an upgrade prompt.
8. Restart the local app using `npm run dev`, open `/cloud`, create an account, and sign in.

## Create the per-user study-set table

Run this SQL in Supabase SQL Editor. Row Level Security ensures each signed-in user can only access rows whose `user_id` matches their verified Supabase identity.

```sql
create table if not exists public.study_sets (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  study_set jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create or replace function public.set_study_sets_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_study_sets_updated_at on public.study_sets;
create trigger set_study_sets_updated_at
  before update on public.study_sets
  for each row execute function public.set_study_sets_updated_at();

alter table public.study_sets enable row level security;

create policy "Users can read their own study sets"
  on public.study_sets for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own study sets"
  on public.study_sets for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own study sets"
  on public.study_sets for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own study sets"
  on public.study_sets for delete
  to authenticated
  using (auth.uid() = user_id);
```

If re-running the study-set statements, remove existing study-set policies first or use a fresh table; PostgreSQL reports an error when a policy with the same name already exists. The later Storage and processing-history statements use `drop policy if exists` for their policies.

## Add private document storage and processing history

The processing-history table is just Postgres metadata and does not create a worker or queue. Run its SQL independently. The Storage section is optional: only run it if the Supabase Free project allows Storage without asking you to upgrade. If the dashboard requires a paid plan, stop there; the app continues the local upload/extraction path.

### Persistent synchronous processing history

Run this block in the Supabase SQL Editor:

```sql
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null check (job_type in ('summary', 'quiz', 'flashcards', 'document-extraction')),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text
);

alter table public.processing_jobs enable row level security;
grant select, insert, update on public.processing_jobs to authenticated;

drop policy if exists "Users can read their own processing history" on public.processing_jobs;
create policy "Users can read their own processing history"
  on public.processing_jobs for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own processing records" on public.processing_jobs;
create policy "Users can create their own processing records"
  on public.processing_jobs for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own processing records" on public.processing_jobs;
create policy "Users can update their own processing records"
  on public.processing_jobs for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

The activity records measure synchronous UI operations. They are persistent per-user metrics but are not queued background tasks, retries, or infrastructure monitoring.

### Optional private document copies

The bucket is private and limited to the app's existing 5 MB upload limit. The object path begins with the authenticated user's UUID; Storage policies enforce ownership. The `study_documents` table contains metadata only, not document contents. Do not execute this block if creating the bucket requires an upgrade.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'study-documents',
  'study-documents',
  false,
  5242880,
  array['application/pdf', 'text/plain', 'image/png', 'image/jpeg']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.study_documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  content_type text not null,
  file_size bigint not null check (file_size between 1 and 5242880),
  processing_status text not null default 'uploaded'
    check (processing_status in ('uploaded', 'extracted', 'extraction_failed')),
  created_at timestamptz not null default now()
);

alter table public.study_documents enable row level security;
grant select, insert, update, delete on public.study_documents to authenticated;

drop policy if exists "Users can manage their own document metadata" on public.study_documents;
create policy "Users can manage their own document metadata"
  on public.study_documents for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their own private study documents" on storage.objects;
create policy "Users can read their own private study documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'study-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload their own private study documents" on storage.objects;
create policy "Users can upload their own private study documents"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'study-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own private study documents" on storage.objects;
create policy "Users can delete their own private study documents"
  on storage.objects for delete to authenticated
  using (bucket_id = 'study-documents' and (storage.foldername(name))[1] = auth.uid()::text);
```

## Sync behavior

- Signing in loads that user's cloud study sets; local browser records are not automatically uploaded or overwritten.
- Use **Import local library** on the Cloud Operations page to deliberately merge this browser's local sets into the signed-in account.
- For matching study-set IDs, the record with the later `updatedAt` timestamp is selected.
- Save, rename, and delete operations update the authenticated user's Supabase rows.
- When signed out or when Supabase config is absent, the existing localStorage library remains in use.
- A cloud sync error is shown in the app. A save that fails to sync is retained in the current UI session; retry by saving again. Avoid signing out before resolving/copying unsynced work.

## Verification

1. Register a test user on `/cloud` and sign in.
2. Save a study set; verify the row appears in `public.study_sets` with that account's `user_id`.
3. Sign out; confirm the local browser library is available.
4. Sign in again and verify the cloud library loads.
5. Create a second test user and confirm that user does not see the first user's study sets.
6. Open the SQL editor and test RLS using authenticated users; do not disable RLS to make an error go away.

## What remains local

- PDF/OCR extraction and Gemini generation remain in the existing Express API.
- A private original-file copy is uploaded only when signed in and the storage bucket and policies have been created. The file also still goes through the existing API for extraction.
- The local fallback library remains available when signed out or when Supabase is unconfigured.
- Processing records are persisted to Supabase for signed-in users; unsigned local job counters remain in-memory. Neither is a managed job queue or infrastructure monitoring.
