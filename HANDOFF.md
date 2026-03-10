# 项目交接文档 (Handoff)

> 本文档供下一工具或开发者接手时参考。最后更新：2026-03-10

## 项目目标

这是一个**论文观察站**，当前有 4 个 branch/page：

| 分支 | 数据源 |
|------|--------|
| **Cool Daily** | `papers.cool/arxiv/cs.AI` / `cs.CL` / `cs.CV` |
| **Conference** | `papers.cool/venue/*` |
| **HF Daily** | `huggingface.co/papers/date/YYYY-MM-DD` |
| **Like** | 收藏与回看（GitHub OAuth + Supabase 持久化） |

**核心能力：**

- 抓取 HTML
- 解析 `title` / `authors` / `abstract` / `links`
- 做 topic 分类
- 生成 `reports/*.md` + `*.json`
- 构建静态站点 `site/`
- Like 通过 GitHub OAuth + Supabase 持久化

---

## 仓库与部署

| 项目 | 值 |
|------|-----|
| 本地目录 | `/Users/misaki/Code/cool_paper` |
| GitHub 仓库 | `https://github.com/Misaki-Wang/mipaper` |
| 线上站点 | `https://mipaper.pages.dev/` |
| 部署方式 | Cloudflare Pages + Pages Functions |
| Supabase 项目 | `https://kvblsafypaabchoxbcpw.supabase.co` |

---

## 当前架构

### 后端 / 生成脚本

- `scripts/generate_daily_report.py`
- `scripts/generate_conference_report.py`
- `scripts/generate_hf_daily_report.py`
- `scripts/build_site_data.py`

### Python 核心模块

- `cool_paper/fetcher.py`
- `cool_paper/topics.py`
- `cool_paper/reporting.py`
- `cool_paper/conference_reporting.py`
- `cool_paper/hf_reporting.py`
- `cool_paper/site_data.py`

### 前端页面

- `site/index.html`
- `site/conference.html`
- `site/hf-daily-paper.html`
- `site/like.html`

### 前端逻辑

- `site/app.js`
- `site/conference.js`
- `site/hf_daily.js`
- `site/like.js`
- `site/likes.js`
- `site/supabase.js`

### Cloudflare Pages Functions

- `functions/api/config.js`

### Supabase SQL

- `supabase/likes_schema.sql`

---

## 当前配置方式

### Cloudflare Pages 环境变量

```
SUPABASE_URL=https://kvblsafypaabchoxbcpw.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_B-WO0ngDh5623tV9ilkLbg_StbTMn-I
GITHUB_REDIRECT_TO=https://mipaper.pages.dev/like.html
```

### Supabase Auth

- **Site URL**: `https://mipaper.pages.dev/`
- **Redirect URLs**: `https://mipaper.pages.dev/like.html`

### GitHub OAuth

- callback 应该是 Supabase 的 `/auth/v1/callback`
- **不是** `like.html`

---

## 重要 handoff 信息

### 已推送到 GitHub 的最新 commit

- `1e3264c` — `Support Supabase publishable keys`

### 本地未推送改动（下一工具需注意）

**1. 缓存修复**

| 文件 | 改动 |
|------|------|
| `functions/api/config.js` | `Cache-Control: no-store` |
| `site/app.js` | 缓存相关 |
| `site/conference.js` | 缓存相关 |
| `site/hf_daily.js` | 缓存相关 |
| `site/_headers` | 新增，设置 `Cache-Control: no-cache` |

**2. Like 登录后自动同步**

| 文件 | 改动 |
|------|------|
| `site/likes.js` | 登录后自动同步逻辑 |
| `site/like.js` | 相关改动 |

**操作建议：** 接手后先执行 `git status`，确认上述改动，再决定是否提交并推送。

---

## 当前已确认状态

- 线上 `https://mipaper.pages.dev/api/config` 正常返回配置
- 线上 `manifest.json` 和 report JSON 返回 `200`
- Supabase `publishable key` 兼容已接入
- `Like` 同步逻辑已存在，基于 `liked_papers`
- 本地测试曾通过：
  - `python3 -m unittest discover -s tests`
  - `node --check ...`

---

## 最近踩过的坑

| 现象 | 根因 |
|------|------|
| OAuth 曾错误回跳到 `localhost` | Supabase `Site URL` / `Redirect URLs` 或旧缓存 |
| 某浏览器打开页面内容空白，换浏览器正常 | 旧缓存，不是数据没部署 |
| `/api/config` 安全 | 只能返回 `supabaseUrl` / `publishable key` / `redirectTo`；**绝不能**返回 `service_role`、GitHub `Client Secret` |

---

## 推荐下一步

1. **先提交并推送**本地未推送改动
2. **重新部署** Cloudflare Pages
3. **验证** `Like` 登录后是否自动写入 `liked_papers`
4. **给首页加明确 Loading 状态**，避免初始 `-` 被误判为空白
5. **长期维护**：更新 `.gitignore`，减少报告/样例大文件进入仓库

---

## 快速命令参考

```bash
# 检查本地状态
git status

# 运行测试
python3 -m unittest discover -s tests
node --check site/app.js  # 等

# 本地预览
python3 scripts/build_site_data.py
cd site && python3 -m http.server 4173
```
