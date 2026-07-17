import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Vercel Cron 定时调用的采集接口
// 每 30 分钟执行一次，从 Supabase 读取 Cookie，用 Cookie 调用 LOFTER 移动端 API 采集文章

export async function GET(request: NextRequest) {
  // 验证 Vercel Cron 密钥
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 从 Supabase 获取最新 Cookie
  const { data: cookieData, error: cookieError } = await supabase
    .from('lofter_cookies')
    .select('cookie, blog_name, status')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (cookieError || !cookieData) {
    await logCollect('failed', 0, 'No cookie found in database');
    return NextResponse.json({ error: 'No cookie available. Please run sync_cookie.py locally.' }, { status: 500 });
  }

  if (cookieData.status === 'expired') {
    await logCollect('cookie_expired', 0, 'Cookie marked as expired');
    return NextResponse.json({ error: 'Cookie expired. Please re-login and run sync_cookie.py.' }, { status: 401 });
  }

  const { cookie, blog_name: blogName } = cookieData;

  try {
    // 调用 LOFTER 移动端 API 采集文章
    const posts = await collectPosts(blogName, cookie);

    // 写入数据库
    let inserted = 0;
    for (const post of posts) {
      const { error } = await supabase
        .from('lofter_posts')
        .upsert({
          post_id: post.postId,
          blog_name: blogName,
          title: post.title,
          summary: post.summary,
          post_url: post.postUrl,
          like_count: post.likeCount,
          comment_count: post.commentCount,
          reblog_count: post.reblogCount,
          tags: post.tags,
          published_at: post.publishedAt,
        }, { onConflict: 'post_id' });

      if (!error) inserted++;
    }

    await logCollect('success', inserted, null);
    return NextResponse.json({
      success: true,
      postsCollected: inserted,
      total: posts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    // 如果是 Cookie 失效，标记为 expired
    if (err.message?.includes('cookie') || err.message?.includes('401') || err.message?.includes('302')) {
      await supabase
        .from('lofter_cookies')
        .update({ status: 'expired' })
        .order('updated_at', { ascending: false })
        .limit(1);
    }
    await logCollect('failed', 0, err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function collectPosts(blogName: string, cookie: string) {
  const allPosts: any[] = [];
  const maxPages = 5; // 每次采集最近 5 页
  const pageSize = 20;

  for (let offset = 0; offset < maxPages * pageSize; offset += pageSize) {
    // 移动端 API，可获取文章列表（含点赞/评论数）
    const url = `https://www.lofter.com/newweb/blog/homepage.json?blogName=${encodeURIComponent(blogName)}&offset=${offset}&limit=${pageSize}`;

    const resp = await fetch(url, {
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `https://www.lofter.com/blog/${blogName}`,
      },
    });

    if (!resp.ok) {
      throw new Error(`LOFTER API returned ${resp.status}`);
    }

    const data = await resp.json();
    const posts = data?.data?.posts || data?.posts || [];

    if (posts.length === 0) break;

    for (const post of posts) {
      allPosts.push({
        postId: post.postId || post.id,
        title: post.title || '',
        summary: (post.summary || post.content || '').substring(0, 500),
        postUrl: `https://www.lofter.com/post/${post.postId || post.id}`,
        likeCount: post.likeCount || post.like || 0,
        commentCount: post.commentCount || post.comment || 0,
        reblogCount: post.reblogCount || post.reblog || 0,
        tags: post.tag || post.tags || [],
        publishedAt: post.publishTime || post.publishedAt || null,
      });
    }

    // 如果不足一页，说明没有更多了
    if (posts.length < pageSize) break;
  }

  return allPosts;
}

async function logCollect(status: string, count: number, error: string | null) {
  await supabase.from('lofter_collect_logs').insert({
    status,
    posts_collected: count,
    error_message: error,
  });
}
