-- ⚠️ MIGRATION SCRIPT ONLY - DO NOT USE FOR INITIAL SETUP
-- This file is for migrating existing data from liked_papers to paper_queue.
-- For initial table creation, use likes_schema.sql which contains the complete schema.
--
-- Purpose: One-time migration to consolidate liked_papers data into paper_queue table
-- Run this AFTER creating tables via likes_schema.sql

-- Migration: Move existing liked_papers to paper_queue with status='later'
insert into public.paper_queue (user_id, paper_id, status, saved_at, updated_at, deleted_at, client_updated_at, device_id, payload)
select
  user_id,
  like_id as paper_id,
  'later' as status,
  saved_at,
  coalesce(updated_at, saved_at) as updated_at,
  deleted_at,
  client_updated_at,
  device_id,
  payload
from public.liked_papers
on conflict (user_id, paper_id) do nothing;
