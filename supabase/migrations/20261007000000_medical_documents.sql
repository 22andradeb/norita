-- Medical documents (lab results, reports…): a photo or PDF uploaded by anyone on the care team
-- (caregiver or family), transcribed automatically by the `transcribe-document` edge function.

create table public.medical_documents (
  id             uuid primary key,
  older_adult_id uuid not null references public.older_adults (id) on delete cascade,
  uploaded_by    uuid default auth.uid() references auth.users (id) on delete set null,
  storage_path   text not null unique,
  mime_type      text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  title          text check (char_length(title) <= 120),
  doc_type       text not null default 'lab' check (doc_type in ('lab', 'imaging', 'report', 'prescription', 'other')),
  exam_date      date,
  lab_name       text check (char_length(lab_name) <= 200),
  professional   text check (char_length(professional) <= 200),
  -- Filled in by the edge function (service role), never directly by users.
  status         text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  summary        text,
  transcript     text,
  results        jsonb not null default '[]' check (jsonb_typeof(results) = 'array'),
  error          text,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz,
  -- Files live under "<older_adult_id>/…" so storage policies can check team membership.
  check (storage_path like older_adult_id::text || '/%')
);
create index medical_documents_timeline_idx on public.medical_documents (older_adult_id, created_at desc);

alter table public.medical_documents enable row level security;
revoke all on public.medical_documents from anon, authenticated;
grant select, delete on public.medical_documents to authenticated;
grant insert (id, older_adult_id, uploaded_by, storage_path, mime_type, title, doc_type) on public.medical_documents to authenticated;
grant update (title, doc_type, exam_date) on public.medical_documents to authenticated;

create policy "Care team can read" on public.medical_documents
  for select to authenticated using (public.is_member(older_adult_id));
create policy "Care team can upload" on public.medical_documents
  for insert to authenticated
  with check (public.is_member(older_adult_id) and uploaded_by = (select auth.uid()));
create policy "Care team can correct details" on public.medical_documents
  for update to authenticated
  using (public.is_member(older_adult_id)) with check (public.is_member(older_adult_id));
create policy "Uploader can delete" on public.medical_documents
  for delete to authenticated using (uploaded_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Private storage bucket. Paths are "<older_adult_id>/<document_id>.<ext>".
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical-documents', 'medical-documents', false, 20971520, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

-- True when the first folder of a storage path is a person the caller cares for.
-- Malformed paths (not a UUID) are simply denied.
create function public.is_member_path(p_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return public.is_member(((storage.foldername(p_name))[1])::uuid);
exception when others then
  return false;
end;
$$;

create policy "Care team can read medical documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'medical-documents' and public.is_member_path(name));

create policy "Care team can upload medical documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'medical-documents' and public.is_member_path(name));
