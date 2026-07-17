-- LOFTER 数据收集网站 - 数据库表结构
-- 在 Supabase SQL Editor 中执行

-- 1. Cookie 存储表（单行记录，始终取最新一条）
CREATE TABLE IF NOT EXISTS lofter_cookies (
  id SERIAL PRIMARY KEY,
  cookie TEXT NOT NULL,
  blog_name TEXT,
  status TEXT DEFAULT 'active', -- active / expired
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 采集的文章数据表
CREATE TABLE IF NOT EXISTS lofter_posts (
  id SERIAL PRIMARY KEY,
  post_id BIGINT UNIQUE,
  blog_name TEXT,
  title TEXT,
  summary TEXT,
  post_url TEXT,
  like_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  reblog_count INT DEFAULT 0,
  tags TEXT[],
  published_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 采集日志表
CREATE TABLE IF NOT EXISTS lofter_collect_logs (
  id SERIAL PRIMARY KEY,
  status TEXT NOT NULL, -- success / failed / cookie_expired
  posts_collected INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_posts_blog_name ON lofter_posts(blog_name);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON lofter_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_like_count ON lofter_posts(like_count DESC);

-- 启用 RLS（但全允许，因为用 service_role key）
ALTER TABLE lofter_cookies ENABLE ROW LEVEL SECURITY;
ALTER TABLE lofter_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lofter_collect_logs ENABLE ROW LEVEL SECURITY;

-- 全部允许（service_role 绕过 RLS，这里给 anon 也放行方便前端读取）
CREATE POLICY "allow_all_cookies" ON lofter_cookies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_posts" ON lofter_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_logs" ON lofter_collect_logs FOR ALL USING (true) WITH CHECK (true);
