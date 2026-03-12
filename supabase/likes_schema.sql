create table if not exists public.liked_papers (
  user_id uuid not null references auth.users (id) on delete cascade,
  like_id text not null,
  saved_at timestamptz not null default timezone('utc'::text, now()),
  payload jsonb not null,
  primary key (user_id, like_id)
);

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
  payload jsonb not null,
  primary key (user_id, review_id)
);

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
