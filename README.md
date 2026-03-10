# cool_paper

每天抓取 `papers.cool` 的 `cs.AI`、`cs.CL`、`cs.CV` 页面，按论文标题做 topic 分类，输出 Markdown 和 JSON 报告，并可选通过邮件发送日报。

## 功能

- 抓取 `https://papers.cool/arxiv/cs.AI`
- 抓取 `https://papers.cool/arxiv/cs.CL`
- 抓取 `https://papers.cool/arxiv/cs.CV`
- 读取每篇 paper 的标题和 arXiv 链接
- 按标题关键词归入 topic
- 在报告开头输出 topic 占比分析
- 按 topic 列出所有 paper 标题和链接
- 支持工作日自动更新，周六周日跳过
- 支持 macOS `launchd` 每日自动执行
- 支持通过 SMTP 邮件推送完整日报
- 支持首页汇总最近的 `cs.AI / cs.CL / cs.CV` 三类快照

## 目录

```text
cool_paper/
├── cool_paper/                  # 抓取、分类、报告、站点数据构建逻辑
├── scripts/                     # 各分支生成脚本与每日入口
├── site/                        # 静态站点页面、样式与前端脚本
│   └── data/
│       ├── daily/               # Cool Daily 站点 manifest 与报告 JSON
│       ├── conference/          # Conference 站点 manifest 与报告 JSON
│       └── hf-daily/            # HF Daily 站点 manifest 与报告 JSON
├── reports/
│   ├── daily/                   # Cool Daily Markdown / JSON 报告
│   ├── conference/              # Conference Markdown / JSON 报告
│   ├── hf-daily/                # HF Daily Markdown / JSON 报告
│   └── debug/                   # 调试或实验性输出
├── samples/
│   ├── daily/                   # papers.cool 日报 HTML 快照
│   ├── conference/              # venue HTML 快照
│   └── hf-daily/                # Hugging Face daily HTML 快照
├── tests/                       # 单元测试
└── launchd/                     # macOS 定时任务模板
```

## 使用

先运行一次手动生成：

```bash
python3 scripts/generate_daily_report.py --date 2026-03-06
```

默认行为：

- 类别为 `cs.AI`
- 日期为 `yesterday`
- 时区为 `Asia/Shanghai`
- 输出到 `reports/daily/`
- 同时生成 `.md` 和 `.json`

如果要显式生成其他分类：

```bash
python3 scripts/generate_daily_report.py --category cs.CL --date 2026-03-06
python3 scripts/generate_daily_report.py --category cs.CV --date 2026-03-06
```

如果要一次性生成同一天的三类日报：

```bash
python3 scripts/generate_daily_report.py --category cs.AI --date 2026-03-06
python3 scripts/generate_daily_report.py --category cs.CL --date 2026-03-06
python3 scripts/generate_daily_report.py --category cs.CV --date 2026-03-06
```

## Conference 分析

当前也支持抓取 `papers.cool/venue/*` 页面，并生成单独的 conference 分析报告。

例如：

```bash
python3 scripts/generate_conference_report.py --venue CVPR.2025
python3 scripts/generate_conference_report.py --venue CVPR.2024
python3 scripts/generate_conference_report.py --venue ICLR.2026
```

说明：

- conference 抓取会先从 `show=1000` 开始，再根据页面里的 `Total` 自动扩张 `show`，直到覆盖全量结果
- 报告输出到 `reports/conference/`
- 站点会生成独立的 `conference.html` 页面
- conference 页支持按 `Subject`、`Topic`、标题关键词和 `focus-only` 联合过滤
- 报告和页面都会显示抓取完整度，例如 `1000/5357`

如果要离线生成：

```bash
curl -L --fail --silent --show-error 'https://papers.cool/venue/CVPR.2025?show=1000' -o samples/conference/CVPR.2025.html
python3 scripts/generate_conference_report.py --venue CVPR.2025 --html-path samples/conference/CVPR.2025.html
```

如果要使用本地 `codex` CLI 做分类：

```bash
python3 scripts/generate_daily_report.py --date 2026-03-06 --html-path samples/daily/cs.AI-2026-03-06.html --classifier codex
```

说明：

- 该模式调用本机已登录的 `codex exec`
- 脚本里不需要显式提供 API key
- 报告头部会写明本次使用的分类器

如果当前环境不方便直接让 Python 联网，也可以先保存 HTML 再离线生成：

```bash
curl -L --fail --silent --show-error 'https://papers.cool/arxiv/cs.AI?date=2026-03-06&show=1000' -o samples/daily/cs.AI-2026-03-06.html
python3 scripts/generate_daily_report.py --date 2026-03-06 --html-path samples/daily/cs.AI-2026-03-06.html
```

三分类离线生成示例：

```bash
curl -L --fail --silent --show-error 'https://papers.cool/arxiv/cs.CL?date=2026-03-06&show=1000' -o samples/daily/cs.CL-2026-03-06.html
curl -L --fail --silent --show-error 'https://papers.cool/arxiv/cs.CV?date=2026-03-06&show=1000' -o samples/daily/cs.CV-2026-03-06.html
python3 scripts/generate_daily_report.py --category cs.CL --date 2026-03-06 --html-path samples/daily/cs.CL-2026-03-06.html
python3 scripts/generate_daily_report.py --category cs.CV --date 2026-03-06 --html-path samples/daily/cs.CV-2026-03-06.html
```

如果要邮件推送：

1. 参考 `.env.example` 补齐 `.env`
2. 设置 `COOL_PAPER_NOTIFY=email`
3. 运行：

```bash
./scripts/run_daily.sh
```

## 网站预览

当前仓库新增了一个参考 `hf_bot` 信息架构重做的静态站点：

- 首页三分类快照卡片，可在 `cs.AI / cs.CL / cs.CV` 间切换
- `conference.html` 提供 conference 分析分支，可在不同 venue 间切换
- 顶部 Hero 概览
- 重点关注 topic 雷达
- topic 占比条形图
- 按 topic 分组的论文卡片区
- 标题搜索、日期切换、focus-only 过滤
- conference 页面支持按 `Subject` 过滤
- `hf-daily-paper.html` 提供 Hugging Face daily papers 分支，支持按日期、Topic、作者和标题过滤
- `like.html` 提供 Like 分支，支持通过 GitHub OAuth + Supabase 同步收藏论文

## HF Daily Papers

当前也支持抓取 `https://huggingface.co/papers/date/YYYY-MM-DD` 页面，并生成单独的 Hugging Face daily papers 报告。

例如：

```bash
python3 scripts/generate_hf_daily_report.py --date 2026-03-09
```

说明：

- 解析方式参考 `hf_bot`，优先读取页面内嵌的 `DailyPapers` JSON，而不是脆弱地抓卡片 DOM
- 输出目录默认是 `reports/hf-daily/`
- 站点会生成独立的 `hf-daily-paper.html` 页面

先同步站点数据：

```bash
python3 scripts/build_site_data.py
```

然后本地预览：

```bash
cd site
python3 -m http.server 4173
```

打开 `http://127.0.0.1:4173` 即可。

conference 页面入口：

- `http://127.0.0.1:4173/conference.html`

## GitHub + Cloudflare Pages + Supabase

推荐部署方案：

- 代码托管在 GitHub
- 静态页面部署到 Cloudflare Pages
- 收藏数据和登录状态放在 Supabase

Like 分支现在支持用 Supabase 持久化收藏，并通过 GitHub OAuth 登录同步到同一个账号下。前端会优先读取 Cloudflare Pages Function 暴露的 `/api/config`，本地开发时则回退到 [config.js](/Users/misaki/Code/cool_paper/site/config.js)。

配置步骤：

1. 在 Supabase SQL editor 里执行 [likes_schema.sql](/Users/misaki/Code/cool_paper/supabase/likes_schema.sql)
2. 在 GitHub Developer Settings 里创建一个 OAuth App
   - `Homepage URL`: 你的站点首页，例如 `https://cool-paper.pages.dev/`
   - `Authorization callback URL`: 你的 Supabase callback，例如 `https://<project-ref>.supabase.co/auth/v1/callback`
3. 在 Supabase Authentication 里开启 GitHub provider，并填入上一步生成的 `Client ID` / `Client Secret`
4. 在 Supabase Authentication -> URL Configuration 里设置：
   - `Site URL`: 你的站点首页，例如 `https://cool-paper.pages.dev/`
   - `Redirect URLs`: 至少加上 `https://cool-paper.pages.dev/like.html`
5. 在 Cloudflare Pages 项目里添加环境变量：
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `GITHUB_REDIRECT_TO`
     - 可以直接填 `https://cool-paper.pages.dev/like.html`
6. 将 GitHub 仓库连接到 Cloudflare Pages
   - `Build command`: `python3 scripts/build_site_data.py`
   - `Build output directory`: `site`
7. 首次部署完成后，打开 `https://cool-paper.pages.dev/like.html`，点击 `GitHub Sign in`

说明：

- 这是前端直连 Supabase 的静态站点方案，`supabasePublishableKey` 可以公开放在浏览器端
- 未配置 Supabase 时，Like 仍然会退回浏览器本地存储
- 配置完成并登录后，Like 会同步到 Supabase，支持跨设备回看
- Cloudflare Pages 的运行时配置接口在 [functions/api/config.js](/Users/misaki/Code/cool_paper/functions/api/config.js)
- 本地开发可参考 [.dev.vars.example](/Users/misaki/Code/cool_paper/.dev.vars.example)；如果你只是本地预览静态页，也可以直接填 [config.js](/Users/misaki/Code/cool_paper/site/config.js)
- 当前代码同时兼容旧的 `SUPABASE_ANON_KEY` / `supabaseAnonKey`，但新项目建议统一使用 `publishable key`
- 如果你后续绑定自定义域名，只需要同步更新 Supabase 的 `Site URL`、`Redirect URLs` 和 Cloudflare Pages 的 `GITHUB_REDIRECT_TO`

## 每日自动执行

当前仓库提供了 `launchd` 模板，适合 macOS：

1. 将 `launchd/com.coolpaper.daily.plist.template` 中的 `__PROJECT_ROOT__` 替换为项目绝对路径
2. 确保 `scripts/run_daily.sh` 可执行
3. 用 `launchctl load` 或 `launchctl bootstrap` 注册任务

模板默认每天 09:05 运行，但 `scripts/run_daily.sh` 只会在周一到周五执行；周六、周日会直接跳过。
工作日默认抓取“前一个工作日”的页面，例如周一会抓取上周五的 `cs.AI / cs.CL / cs.CV` 三类页面。
仓库里已经预置了 `logs/` 目录，方便 `launchd` 直接写标准输出和错误日志。

## 分类说明

当前分类是“标题级启发式分类”，优先追求稳定可运行和可解释。主要 topic 包括：

- 生成模型理论基础
- 多模态生成建模
- 多模态智能体
- 通用智能体与规划
- 机器人与具身智能
- 多模态理解与视觉
- 检索、知识与RAG
- 数据集与基准
- 推理、对齐与评测
- 医疗、科学与行业应用
- 学习、优化与理论
- 大模型与语言
- 其他 AI

其中前三类是面向个人研究兴趣单独强化的 focus topics，采用“组合规则”优先识别：

- `生成模型理论基础`: 必须同时命中“生成模型”线索和“理论/基础”线索
- `多模态生成建模`: 必须同时命中“多模态”线索和“生成建模”线索
- `多模态智能体`: 必须同时命中“多模态”线索和“智能体/规划/具身”线索

如果后续你想把分类升级成 LLM 判别，也可以在这个结构上继续扩展。
