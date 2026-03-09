create table if not exists public.liked_papers (
  user_id uuid not null references auth.users (id) on delete cascade,
  like_id text not null,
  saved_at timestamptz not null default timezone('utc'::text, now()),
  payload jsonb not null,
  primary key (user_id, like_id)
);

alter table public.liked_papers enable row level security;

create policy "Users can read their own likes"
on public.liked_papers
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own likes"
on public.liked_papers
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own likes"
on public.liked_papers
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own likes"
on public.liked_papers
for delete
to authenticated
using (auth.uid() = user_id);
