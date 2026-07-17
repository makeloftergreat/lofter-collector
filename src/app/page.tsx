'use client';

import { useState, useEffect, useCallback } from 'react';

interface Post {
  id: number;
  post_id: number;
  blog_name: string;
  title: string;
  summary: string;
  post_url: string;
  like_count: number;
  comment_count: number;
  reblog_count: number;
  tags: string[];
  published_at: string;
  collected_at: string;
}

interface CookieStatus {
  status: string;
  blogName?: string;
  updatedAt?: string;
}

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [sort, setSort] = useState<'published_at' | 'like_count'>('published_at');
  const [loading, setLoading] = useState(true);
  const [cookieStatus, setCookieStatus] = useState<CookieStatus>({ status: 'none' });
  const [collecting, setCollecting] = useState(false);
  const [lastLog, setLastLog] = useState<string>('');

  const fetchCookieStatus = useCallback(async () => {
    const resp = await fetch('/api/cookie-status');
    const data = await resp.json();
    setCookieStatus(data);
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const resp = await fetch(`/api/posts?page=${page}&limit=20&sort=${sort}`);
    const data = await resp.json();
    setPosts(data.posts || []);
    setTotal(data.total || 0);
    setTotalPages(data.totalPages || 0);
    setLoading(false);
  }, [page, sort]);

  useEffect(() => {
    fetchCookieStatus();
    fetchPosts();
  }, [fetchCookieStatus, fetchPosts]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const resp = await fetch('/api/collect');
      const data = await resp.json();
      if (data.success) {
        setLastLog(`采集成功：${data.postsCollected} 篇文章，共 ${data.total} 篇`);
        fetchPosts();
      } else {
        setLastLog(`采集失败：${data.error}`);
      }
    } catch (err: any) {
      setLastLog(`采集出错：${err.message}`);
    }
    setCollecting(false);
  };

  const statusText: Record<string, string> = {
    active: 'Cookie 有效',
    expired: 'Cookie 已过期，请重新登录',
    none: '未配置 Cookie',
  };

  const formatDate = (d: string) => {
    if (!d) return '';
    return new Date(d).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="container">
      <div className="header">
        <h1>LOFTER 数据收集</h1>
        <div className="status-bar">
          <span className={`status-badge ${cookieStatus.status}`}>
            <span className={`status-dot ${cookieStatus.status}`}></span>
            {statusText[cookieStatus.status] || cookieStatus.status}
          </span>
          {cookieStatus.blogName && <span>博客: {cookieStatus.blogName}</span>}
          {cookieStatus.updatedAt && <span>更新于: {formatDate(cookieStatus.updatedAt)}</span>}
          <span>共 {total} 篇文章</span>
        </div>
      </div>

      {cookieStatus.status !== 'active' && (
        <div className="alert alert-warning">
          Cookie 不可用。请在本地运行 <code>python scripts/sync_cookie.py</code> 同步 Cookie，
          或先在浏览器登录 LOFTER 后再运行脚本。
        </div>
      )}

      {lastLog && (
        <div className="alert alert-warning">{lastLog}</div>
      )}

      <div className="controls">
        <button
          className="btn btn-primary"
          onClick={handleCollect}
          disabled={collecting || cookieStatus.status !== 'active'}
        >
          {collecting ? '采集中...' : '立即采集'}
        </button>
        <button className="btn btn-secondary" onClick={fetchCookieStatus}>
          刷新状态
        </button>
      </div>

      <div className="sort-tabs">
        <div
          className={`sort-tab ${sort === 'published_at' ? 'active' : ''}`}
          onClick={() => { setSort('published_at'); setPage(1); }}
        >
          按发布时间
        </div>
        <div
          className={`sort-tab ${sort === 'like_count' ? 'active' : ''}`}
          onClick={() => { setSort('like_count'); setPage(1); }}
        >
          按点赞数
        </div>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : posts.length === 0 ? (
        <div className="empty">
          暂无数据。{cookieStatus.status === 'active' ? '点击"立即采集"开始收集。' : '请先配置 Cookie。'}
        </div>
      ) : (
        <>
          <div className="posts-grid">
            {posts.map((post) => (
              <div key={post.id} className="post-card">
                <h3>
                  <a href={post.post_url} target="_blank" rel="noopener noreferrer">
                    {post.title || `文章 #${post.post_id}`}
                  </a>
                </h3>
                {post.summary && <p className="post-summary">{post.summary}</p>}
                <div className="post-stats">
                  <span>❤ {post.like_count}</span>
                  <span>💬 {post.comment_count}</span>
                  <span>🔄 {post.reblog_count}</span>
                </div>
                {post.tags && post.tags.length > 0 && (
                  <div className="post-tags">
                    {post.tags.map((tag, i) => (
                      <span key={i} className="post-tag">{tag}</span>
                    ))}
                  </div>
                )}
                <div className="post-date">{formatDate(post.published_at)}</div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                上一页
              </button>
              <button className="current">{page}</button>
              <span style={{ padding: '6px 4px' }}>/ {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
