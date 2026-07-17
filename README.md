# LOFTER 数据收集网站

自动采集 LOFTER 博客文章数据并展示的网站。

## 架构

```
本地 Edge（登录 LOFTER，CDP 9222）
    │ python scripts/sync_cookie.py
    ▼
Supabase（存储 Cookie + 文章数据）
    ▲
    │ /api/collect（Vercel Cron 每2小时）
Next.js App（Vercel 部署）
    └── 前端展示采集的文章数据
```

## 使用流程

### 1. 初始化数据库

在 Supabase SQL Editor 中执行 `scripts/schema.sql`。

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local`，填入 Supabase 密钥：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://zrxvibalglblsjbzlzut.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon_key
SUPABASE_SERVICE_ROLE_KEY=你的service_role_key
CRON_SECRET=随机字符串
COOKIE_SYNC_SECRET=随机字符串
```

### 3. 配置本地同步脚本

复制 `scripts/.env.example` 为 `scripts/.env`，填入：

```bash
SUPABASE_URL=https://zrxvibalglblsjbzlzut.supabase.co
SUPABASE_SERVICE_KEY=你的service_role_key
BLOG_NAME=你的LOFTER博客名
```

### 4. 启动 Edge 并登录 LOFTER

```bash
start msedge --remote-debugging-port=9222
```

在浏览器中访问 www.lofter.com 并 QQ 扫码登录。

### 5. 同步 Cookie

```bash
cd scripts
python sync_cookie.py
```

### 6. 本地开发

```bash
npm install
npm run dev
```

### 7. 部署到 Vercel

```bash
# 推送到 GitHub
git init
git add .
git commit -m "init: lofter-collector"
git remote add origin https://github.com/你的用户名/lofter-collector.git
git push -u origin main

# 在 Vercel 中导入项目，配置环境变量
```

## Cookie 续期

Cookie 有效期约 7-30 天。过期后：

1. 打开 Edge 访问 LOFTER（通常还保持登录态，无需重新扫码）
2. 运行 `python scripts/sync_cookie.py`
3. 完成

## 技术栈

- Next.js 14 (App Router)
- Supabase (数据库)
- Vercel Cron (定时采集)
- Python (本地 Cookie 同步)
- CDP (Chrome DevTools Protocol)
