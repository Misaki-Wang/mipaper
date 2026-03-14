-- Paper queue table for Later and Like functionality
create table if not exists public.paper_queue (
  user_id uuid not null references auth.users (id) on delete cascade,
  paper_id text not null,
  status text not null check (status in ('later', 'like')),
  saved_at timestamptz not null default timezone('utc'::text, now()),
  payload jsonb not null,
  primary key (user_id, paper_id)
);

alter table public.paper_queue enable row level security;

drop policy if exists "Only owner can read paper queue" on public.paper_queue;
drop policy if exists "Only owner can insert paper queue" on public.paper_queue;
drop policy if exists "Only owner can update paper queue" on public.paper_queue;
drop policy if exists "Only owner can delete paper queue" on public.paper_queue;

create policy "Only owner can read paper queue"
on public.paper_queue
for select
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can insert paper queue"
on public.paper_queue
for insert
to authenticated
with check (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

create policy "Only owner can update paper queue"
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

create policy "Only owner can delete paper queue"
on public.paper_queue
for delete
to authenticated
using (
  auth.uid() = user_id
  and auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
);

-- Migration: Move existing liked_papers to paper_queue with status='later'
insert into public.paper_queue (user_id, paper_id, status, saved_at, payload)
select
  user_id,
  like_id as paper_id,
  'later' as status,
  saved_at,
  payload
from public.liked_papers
on conflict (user_id, paper_id) do nothing;
