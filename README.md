# cool_paper

This project crawls `papers.cool` and Hugging Face daily papers, classifies papers into topics, generates Markdown and JSON reports, and serves a static research dashboard with cross-device likes powered by Supabase.

## Features

- Crawl `https://papers.cool/arxiv/cs.AI`
- Crawl `https://papers.cool/arxiv/cs.CL`
- Crawl `https://papers.cool/arxiv/cs.CV`
- Crawl `https://huggingface.co/papers/date/YYYY-MM-DD`
- Crawl `https://papers.cool/venue/*` conference pages
- Extract titles, authors, abstracts, links, and metadata
- Classify papers with rules or local `codex exec`
- Generate Markdown and JSON reports
- Build a static site for Cool Daily, Conference, HF Daily, and Like
- Run scheduled jobs on macOS `launchd` or WSL `cron`
- Auto-commit generated artifacts and push them to GitHub

## Layout

```text
cool_paper/
├── cool_paper/                  # Python package: fetch, classify, report, schedule
├── docs/                        # Handoff and project notes
├── ops/                         # Operational templates
│   ├── launchd/                 # macOS launchd templates
│   └── wsl/                     # WSL cron templates
├── scripts/                     # Report generators and scheduled entrypoints
├── site/                        # Static site pages, styles, and browser scripts
├── reports/                     # Generated Markdown / JSON outputs
├── samples/                     # Offline HTML snapshots
├── supabase/                    # SQL schema
└── tests/                       # Unit tests
```

## Manual Usage

Generate one Cool Daily report:

```bash
python3 scripts/generate_daily_report.py --category cs.AI --date 2026-03-06
```

Generate the three Cool Daily tracks for one date:

```bash
python3 scripts/generate_daily_report.py --category cs.AI --date 2026-03-06
python3 scripts/generate_daily_report.py --category cs.CL --date 2026-03-06
python3 scripts/generate_daily_report.py --category cs.CV --date 2026-03-06
```

Generate conference reports:

```bash
python3 scripts/generate_conference_report.py --venue CVPR.2025
python3 scripts/generate_conference_report.py --venue CVPR.2024
python3 scripts/generate_conference_report.py --venue ICLR.2026
```

Generate an HF Daily report:

```bash
python3 scripts/generate_hf_daily_report.py --date 2026-03-09
```

Use local Codex classification:

```bash
python3 scripts/generate_daily_report.py --category cs.AI --date 2026-03-06 --classifier codex
python3 scripts/generate_hf_daily_report.py --date 2026-03-09 --classifier codex
python3 scripts/generate_conference_report.py --venue ICLR.2026 --classifier codex
```

Offline generation from saved HTML:

```bash
python3 scripts/generate_daily_report.py --category cs.AI --date 2026-03-06 --html-path samples/daily/cs.AI-2026-03-06.html
python3 scripts/generate_conference_report.py --venue CVPR.2025 --html-path samples/conference/CVPR.2025.html
python3 scripts/generate_hf_daily_report.py --date 2026-03-09 --html-path samples/hf-daily/hf-daily-2026-03-09.html
```

Rebuild site data:

```bash
python3 scripts/build_site_data.py
```

Local preview:

```bash
cd site
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Site Branches

- `index.html`: Cool Daily across `cs.AI`, `cs.CL`, and `cs.CV`
- `conference.html`: conference snapshots with `Subject` and `Topic` filters
- `hf-daily-paper.html`: Hugging Face daily papers by date
- `like.html`: saved papers with GitHub OAuth + Supabase sync

## Supabase and Cloudflare Pages

Recommended deployment:

- Code on GitHub
- Static site on Cloudflare Pages
- Likes and auth on Supabase

Run the schema:

- [likes_schema.sql](/Users/misaki/Code/cool_paper/supabase/likes_schema.sql)

Required Cloudflare Pages environment variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `GITHUB_REDIRECT_TO`
- `ALLOWED_EMAILS`
- `ALLOWED_USER_IDS`

Supabase auth setup:

- Enable GitHub provider
- Use Supabase `/auth/v1/callback` as the GitHub OAuth callback
- Set `Site URL` to your deployed site
- Add `.../like.html` to `Redirect URLs`

Runtime config endpoint:

- [config.js](/Users/misaki/Code/cool_paper/functions/api/config.js)

Local fallback config:

- [config.js](/Users/misaki/Code/cool_paper/site/config.js)
- [\.dev.vars.example](/Users/misaki/Code/cool_paper/.dev.vars.example)

## Scheduled Jobs

There are two scheduled jobs. Both default to local Codex classification and can auto-push generated artifacts to GitHub.

- `Cool Daily`
  - `11:00`
  - `launchd` / `cron` can trigger every day
  - The job catches up every missed business day from the persisted state
  - Crawls the current business day for `cs.AI`, `cs.CL`, and `cs.CV`
- `HF Daily`
  - `23:00`
  - Monday to Friday: crawl the current day and catch up any missed business days
  - Saturday and Sunday: refresh the current week from Monday to Friday to update `upvotes` and `comments`
  - Also catches up older missed business days from the persisted state

The scheduler keeps its own local state in `state/scheduled_jobs.json` by default. If the machine is off for several days, the next scheduled run resumes from the last successful business date instead of skipping the gap.

Entrypoints:

- [run_cool_daily_job.sh](/Users/misaki/Code/cool_paper/scripts/run_cool_daily_job.sh)
- [run_hf_daily_job.sh](/Users/misaki/Code/cool_paper/scripts/run_hf_daily_job.sh)
- [run_scheduled_job.py](/Users/misaki/Code/cool_paper/scripts/run_scheduled_job.py)

Relevant environment variables:

- `COOL_PAPER_TIMEZONE`
- `COOL_PAPER_CATEGORIES`
- `COOL_PAPER_SCHEDULE_START_DATE`
- `COOL_PAPER_STATE_PATH`
- `COOL_PAPER_DAILY_CLASSIFIER`
- `COOL_PAPER_HF_CLASSIFIER`
- `COOL_PAPER_CODEX_MODEL`
- `COOL_PAPER_CODEX_TIMEOUT_SECONDS`
- `COOL_PAPER_GIT_REMOTE`
- `COOL_PAPER_GIT_BRANCH`
- `COOL_PAPER_NOTIFY`

Run one job manually without pushing:

```bash
python3 scripts/run_scheduled_job.py --job cool_daily --skip-push
python3 scripts/run_scheduled_job.py --job hf_daily --skip-push
```

Backfill from the configured start date through the current date:

```bash
python3 scripts/run_scheduled_job.py --job cool_daily --skip-push
python3 scripts/run_scheduled_job.py --job hf_daily --skip-push
```

Use an explicit test clock:

```bash
python3 scripts/run_scheduled_job.py --job cool_daily --skip-push --now 2026-03-10T11:00:00+08:00
python3 scripts/run_scheduled_job.py --job hf_daily --skip-push --now 2026-03-10T23:00:00+08:00
```

### macOS launchd

Templates:

- [com.coolpaper.cool-daily.plist.template](/Users/misaki/Code/cool_paper/ops/launchd/com.coolpaper.cool-daily.plist.template)
- [com.coolpaper.hf-daily.plist.template](/Users/misaki/Code/cool_paper/ops/launchd/com.coolpaper.hf-daily.plist.template)

Register them after replacing `__PROJECT_ROOT__`:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.coolpaper.cool-daily.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.coolpaper.hf-daily.plist
```

### WSL cron

Template:

- [crontab.example](/Users/misaki/Code/cool_paper/ops/wsl/crontab.example)

Install:

```bash
crontab ops/wsl/crontab.example
```

## Topic Taxonomy

Current topic labels:

- `Generative Foundations`
- `Multimodal Generative Modeling`
- `Multimodal Agents`
- `Agents and Planning`
- `Robotics and Embodied AI`
- `Multimodal Understanding and Vision`
- `Retrieval, Knowledge, and RAG`
- `Datasets and Benchmarks`
- `Reasoning, Alignment, and Evaluation`
- `Domain Applications`
- `Learning, Optimization, and Theory`
- `LLMs and Language`
- `Other AI`

The first three are the focus topics and use stricter cue combinations than the broader buckets.
