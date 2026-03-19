create table if not exists public.direct_add_papers (
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

alter table public.direct_add_papers add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());
alter table public.direct_add_papers add column if not exists deleted_at timestamptz;
alter table public.direct_add_papers add column if not exists client_updated_at timestamptz;
alter table public.direct_add_papers add column if not exists device_id text;
create index if not exists direct_add_papers_user_updated_at_idx on public.direct_add_papers (user_id, updated_at desc);

alter table public.direct_add_papers enable row level security;

drop policy if exists "Only owner can read direct adds" on public.direct_add_papers;
drop policy if exists "Only owner can insert direct adds" on public.direct_add_papers;
drop policy if exists "Only owner can update direct adds" on public.direct_add_papers;
drop policy if exists "Only owner can delete direct adds" on public.direct_add_papers;

create policy "Only owner can read direct adds"
on public.direct_add_papers
for select
to authenticated
using (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can insert direct adds"
on public.direct_add_papers
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can update direct adds"
on public.direct_add_papers
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

create policy "Only owner can delete direct adds"
on public.direct_add_papers
for delete
to authenticated
using (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);
