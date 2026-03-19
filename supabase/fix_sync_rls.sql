-- Fix Supabase RLS so the current account can read/write sync tables.
-- Apply this to the existing database if the app was already provisioned.

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
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can insert likes"
on public.liked_papers
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can update likes"
on public.liked_papers
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

create policy "Only owner can delete likes"
on public.liked_papers
for delete
to authenticated
using (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

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
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can insert reviews"
on public.reviewed_pages
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can update reviews"
on public.reviewed_pages
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

create policy "Only owner can delete reviews"
on public.reviewed_pages
for delete
to authenticated
using (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

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
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can insert to-read snapshots"
on public.to_read_snapshots
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can update to-read snapshots"
on public.to_read_snapshots
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

create policy "Only owner can delete to-read snapshots"
on public.to_read_snapshots
for delete
to authenticated
using (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

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
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can insert queue"
on public.paper_queue
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);

create policy "Only owner can update queue"
on public.paper_queue
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

create policy "Only owner can delete queue"
on public.paper_queue
for delete
to authenticated
using (
  auth.uid() = user_id
  and (
    auth.uid() = 'd23b2601-08ef-465c-b1d9-4159ca38e159'::uuid
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'misakiwang74@gmail.com'
  )
);
