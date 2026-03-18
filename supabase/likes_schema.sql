create table if not exists public.liked_papers (
  user_id uuid not null references auth.users (id) on delete cascade,
  like_id text not null,
  saved_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  deleted_at timestamptz,
  client_updated_at timestamptz,
  device_id text,
  payload jsonb not null,
  primary key (user_id, like_id)
);

alter table public.liked_papers add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());
alter table public.liked_papers add column if not exists deleted_at timestamptz;
alter table public.liked_papers add column if not exists client_updated_at timestamptz;
alter table public.liked_papers add column if not exists device_id text;
create index if not exists liked_papers_user_updated_at_idx on public.liked_papers (user_id, updated_at desc);

alter table public.liked_papers enable row level security;

drop policy if exists "Users can read their own likes" on public.liked_papers;
drop policy if exists "Users can insert their own likes" on public.liked_papers;
drop policy if exists "Users can update their own likes" on public.liked_papers;
drop policy if exists "Users can delete their own likes" on public.liked_papers;
drop policy if exists "Only owner can read likes" on public.liked_papers;
drop policy if exists "Only owner can insert likes" on public.liked_papers;
drop policy if exists "Only owner can update likes" on public.liked_papers;
drop policy if exists "Only owner can delete likes" on public.liked_papers;

create policy "Only owner can read likes"
on public.liked_papers
for select
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can insert likes"
on public.liked_papers
for insert
to authenticated
with check (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can update likes"
on public.liked_papers
for update
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
)
with check (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can delete likes"
on public.liked_papers
for delete
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create table if not exists public.reviewed_pages (
  user_id uuid not null references auth.users (id) on delete cascade,
  review_id text not null,
  reviewed_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  deleted_at timestamptz,
  client_updated_at timestamptz,
  device_id text,
  payload jsonb not null,
  primary key (user_id, review_id)
);

alter table public.reviewed_pages add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());
alter table public.reviewed_pages add column if not exists deleted_at timestamptz;
alter table public.reviewed_pages add column if not exists client_updated_at timestamptz;
alter table public.reviewed_pages add column if not exists device_id text;
create index if not exists reviewed_pages_user_updated_at_idx on public.reviewed_pages (user_id, updated_at desc);

alter table public.reviewed_pages enable row level security;

drop policy if exists "Users can read their own reviews" on public.reviewed_pages;
drop policy if exists "Users can insert their own reviews" on public.reviewed_pages;
drop policy if exists "Users can update their own reviews" on public.reviewed_pages;
drop policy if exists "Users can delete their own reviews" on public.reviewed_pages;
drop policy if exists "Only owner can read reviews" on public.reviewed_pages;
drop policy if exists "Only owner can insert reviews" on public.reviewed_pages;
drop policy if exists "Only owner can update reviews" on public.reviewed_pages;
drop policy if exists "Only owner can delete reviews" on public.reviewed_pages;

create policy "Only owner can read reviews"
on public.reviewed_pages
for select
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can insert reviews"
on public.reviewed_pages
for insert
to authenticated
with check (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can update reviews"
on public.reviewed_pages
for update
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
)
with check (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can delete reviews"
on public.reviewed_pages
for delete
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create table if not exists public.to_read_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot_id text not null,
  queued_at timestamptz not null default timezone('utc'::text, now()),
  payload jsonb not null,
  primary key (user_id, snapshot_id)
);

alter table public.to_read_snapshots enable row level security;

drop policy if exists "Users can read their own to-read snapshots" on public.to_read_snapshots;
drop policy if exists "Users can insert their own to-read snapshots" on public.to_read_snapshots;
drop policy if exists "Users can update their own to-read snapshots" on public.to_read_snapshots;
drop policy if exists "Users can delete their own to-read snapshots" on public.to_read_snapshots;
drop policy if exists "Only owner can read to-read snapshots" on public.to_read_snapshots;
drop policy if exists "Only owner can insert to-read snapshots" on public.to_read_snapshots;
drop policy if exists "Only owner can update to-read snapshots" on public.to_read_snapshots;
drop policy if exists "Only owner can delete to-read snapshots" on public.to_read_snapshots;

create policy "Only owner can read to-read snapshots"
on public.to_read_snapshots
for select
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can insert to-read snapshots"
on public.to_read_snapshots
for insert
to authenticated
with check (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can update to-read snapshots"
on public.to_read_snapshots
for update
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
)
with check (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can delete to-read snapshots"
on public.to_read_snapshots
for delete
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create table if not exists public.paper_queue (
  user_id uuid not null references auth.users (id) on delete cascade,
  paper_id text not null,
  status text not null,
  saved_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  deleted_at timestamptz,
  client_updated_at timestamptz,
  device_id text,
  payload jsonb not null,
  primary key (user_id, paper_id)
);

alter table public.paper_queue add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());
alter table public.paper_queue add column if not exists deleted_at timestamptz;
alter table public.paper_queue add column if not exists client_updated_at timestamptz;
alter table public.paper_queue add column if not exists device_id text;
create index if not exists paper_queue_user_updated_at_idx on public.paper_queue (user_id, updated_at desc);

alter table public.paper_queue enable row level security;

drop policy if exists "Only owner can read queue" on public.paper_queue;
drop policy if exists "Only owner can insert queue" on public.paper_queue;
drop policy if exists "Only owner can update queue" on public.paper_queue;
drop policy if exists "Only owner can delete queue" on public.paper_queue;

create policy "Only owner can read queue"
on public.paper_queue
for select
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can insert queue"
on public.paper_queue
for insert
to authenticated
with check (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can update queue"
on public.paper_queue
for update
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
)
with check (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can delete queue"
on public.paper_queue
for delete
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);
