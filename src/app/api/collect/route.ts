import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: cookieData, error: cookieError } = await supabase
    .from('lofter_cookies')
    .select('cookie, blog_name, status')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (cookieError || !cookieData) {
    await logCollect('failed', 0, 'No cookie found');
    return NextResponse.json({ error: 'No cookie. Run sync script locally.' }, { status: 500 });
  }

  if (cookieData.status === 'expired') {
    await logCollect('cookie_expired', 0, 'Cookie expired');
    return NextResponse.json({ error: 'Cookie expired. Re-login and run sync.' }, { status: 401 });
  }

  const { cookie, blog_name: blogName } = cookieData;

  try {
    const posts = await collectPosts(blogName, cookie);
    let inserted = 0;
    for (const post of posts) {
      const { error } = await supabase
        .from('lofter_posts')
        .upsert({
          post_id: post.postId,
          blog_name: post.blogName,
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
    return NextResponse.json({ success: true, postsCollected: inserted, total: posts.length });
  } catch (err: any) {
    if (err.message?.includes('cookie') || err.message?.includes('401')) {
      await supabase.from('lofter_cookies').update({ status: 'expired' }).order('updated_at', { ascending: false }).limit(1);
    }
    await logCollect('failed', 0, err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function collectPosts(blogName: string, cookie: string) {
  const allPosts: any[] = [];
  const maxPages = 5;

  for (let offset = 0; offset < maxPages * 20; offset += 20) {
    const url = `https://www.lofter.com/newweb/blog/homepage.json?blogName=${blogName}&offset=${offset}&limit=20&_=${Date.now()}`;
    const resp = await fetch(url, {
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `https://www.lofter.com/`,
      },
    });

    if (!resp.ok) throw new Error(`LOFTER API returned ${resp.status}`);

    const data = await resp.json();
    if (data.code !== 0) break;

    const items = data?.data?.items || [];
    if (items.length === 0) break;

    for (const item of items) {
      const postData = item.postData || {};
      const postView = postData.postView || {};
      const id = postView.id;
      if (!id) continue;

      const tags: string[] = [];
      const tagList = postData.tagList || postView.tags || [];
      if (Array.isArray(tagList)) {
        for (const t of tagList) {
          if (typeof t === 'string') tags.push(t);
          else if (t?.name) tags.push(t.name);
        }
      }

      let pubDate = null;
      if (postView.publishTime) {
        pubDate = new Date(postView.publishTime).toISOString();
      }

      allPosts.push({
        postId: id,
        blogName: blogName,
        title: postView.title || '(无标题)',
        summary: (postView.digest || '').substring(0, 500),
        postUrl: `https://www.lofter.com/post/${id}`,
        likeCount: postData.likeCount || postView.likeCount || 0,
        commentCount: postData.commentCount || postView.commentCount || 0,
        reblogCount: postData.reblogCount || postView.reblogCount || 0,
        tags,
        publishedAt: pubDate,
      });
    }

    if (items.length < 20) break;
  }

  return allPosts;
}

async function logCollect(status: string, count: number, error: string | null) {
  await supabase.from('lofter_collect_logs').insert({
    status, posts_collected: count, error_message: error,
  });
}
