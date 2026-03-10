# Project Handoff

Last updated: 2026-03-10

## Goal

This repository is a paper observatory with four site branches:

- `Cool Daily`
- `Conference`
- `HF Daily`
- `Like`

Core capabilities:

- Crawl HTML from `papers.cool` and Hugging Face
- Extract titles, authors, abstracts, links, and metadata
- Classify papers into topics
- Generate Markdown and JSON reports
- Build a static site in `site/`
- Sync liked papers with GitHub OAuth + Supabase

## Repo and Deployment

- Local path: `/Users/misaki/Code/cool_paper`
- GitHub repo: `https://github.com/Misaki-Wang/mipaper`
- Live site: `https://mipaper.pages.dev/`
- Deployment: Cloudflare Pages + Pages Functions
- Supabase project: `https://kvblsafypaabchoxbcpw.supabase.co`

## Main Entrypoints

Python scripts:

- [generate_daily_report.py](/Users/misaki/Code/cool_paper/scripts/generate_daily_report.py)
- [generate_conference_report.py](/Users/misaki/Code/cool_paper/scripts/generate_conference_report.py)
- [generate_hf_daily_report.py](/Users/misaki/Code/cool_paper/scripts/generate_hf_daily_report.py)
- [build_site_data.py](/Users/misaki/Code/cool_paper/scripts/build_site_data.py)
- [run_scheduled_job.py](/Users/misaki/Code/cool_paper/scripts/run_scheduled_job.py)

Python modules:

- [fetcher.py](/Users/misaki/Code/cool_paper/cool_paper/fetcher.py)
- [topics.py](/Users/misaki/Code/cool_paper/cool_paper/topics.py)
- [reporting.py](/Users/misaki/Code/cool_paper/cool_paper/reporting.py)
- [conference_reporting.py](/Users/misaki/Code/cool_paper/cool_paper/conference_reporting.py)
- [hf_reporting.py](/Users/misaki/Code/cool_paper/cool_paper/hf_reporting.py)
- [site_data.py](/Users/misaki/Code/cool_paper/cool_paper/site_data.py)
- [scheduler.py](/Users/misaki/Code/cool_paper/cool_paper/scheduler.py)

Frontend pages:

- [index.html](/Users/misaki/Code/cool_paper/site/index.html)
- [conference.html](/Users/misaki/Code/cool_paper/site/conference.html)
- [hf-daily-paper.html](/Users/misaki/Code/cool_paper/site/hf-daily-paper.html)
- [like.html](/Users/misaki/Code/cool_paper/site/like.html)

Frontend logic:

- [app.js](/Users/misaki/Code/cool_paper/site/app.js)
- [conference.js](/Users/misaki/Code/cool_paper/site/conference.js)
- [hf_daily.js](/Users/misaki/Code/cool_paper/site/hf_daily.js)
- [like.js](/Users/misaki/Code/cool_paper/site/like.js)
- [likes.js](/Users/misaki/Code/cool_paper/site/likes.js)
- [supabase.js](/Users/misaki/Code/cool_paper/site/supabase.js)

Operational templates:

- [ops/launchd](/Users/misaki/Code/cool_paper/ops/launchd)
- [ops/wsl](/Users/misaki/Code/cool_paper/ops/wsl)

## Current Runtime Configuration

Cloudflare Pages environment variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `GITHUB_REDIRECT_TO`
- `ALLOWED_EMAILS`
- `ALLOWED_USER_IDS`

Supabase auth:

- GitHub provider enabled
- GitHub OAuth callback must point to Supabase `/auth/v1/callback`
- `Site URL` and `Redirect URLs` must match the deployed site and `like.html`

Schema:

- [likes_schema.sql](/Users/misaki/Code/cool_paper/supabase/likes_schema.sql)

## Operational Notes

- The site reads runtime config from `/api/config`
- Likes can fall back to local storage when Supabase is not configured
- Scheduled jobs can auto-commit generated artifacts and push them to GitHub
- Auto-push only stages generated outputs, not active source edits

## Known Sensitive Areas

- OAuth redirect configuration
- Browser caching after redeployments
- Background like sync after sign-in
- RLS and allowlist alignment for the single-user Like workflow

## Recommended Next Checks

1. Run `git status`
2. Run `python3 -m unittest discover -s tests`
3. Verify Cloudflare Pages deployment
4. Verify Like sign-in and Supabase writes
5. Verify scheduled jobs on the target machine

## Quick Commands

```bash
git status
python3 -m unittest discover -s tests
python3 scripts/build_site_data.py
cd site && python3 -m http.server 4173
```
