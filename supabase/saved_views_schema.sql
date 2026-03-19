create table if not exists public.like_saved_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  view_id text not null,
  saved_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  deleted_at timestamptz,
  client_updated_at timestamptz,
  device_id text,
  payload jsonb not null,
  primary key (user_id, view_id)
);

alter table public.like_saved_views add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());
alter table public.like_saved_views add column if not exists deleted_at timestamptz;
alter table public.like_saved_views add column if not exists client_updated_at timestamptz;
alter table public.like_saved_views add column if not exists device_id text;
create index if not exists like_saved_views_user_updated_at_idx on public.like_saved_views (user_id, updated_at desc);

alter table public.like_saved_views enable row level security;

drop policy if exists "Only owner can read like saved views" on public.like_saved_views;
drop policy if exists "Only owner can insert like saved views" on public.like_saved_views;
drop policy if exists "Only owner can update like saved views" on public.like_saved_views;
drop policy if exists "Only owner can delete like saved views" on public.like_saved_views;

create policy "Only owner can read like saved views"
on public.like_saved_views
for select
to authenticated
using (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can insert like saved views"
on public.like_saved_views
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can update like saved views"
on public.like_saved_views
for update
to authenticated
using (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
)
with check (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can delete like saved views"
on public.like_saved_views
for delete
to authenticated
using (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);
