import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 获取已采集的文章列表
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const sort = searchParams.get('sort') || 'published_at'; // published_at | like_count
  const blogName = searchParams.get('blog_name');

  const offset = (page - 1) * limit;

  let query = supabase
    .from('lofter_posts')
    .select('*', { count: 'exact' })
    .order(sort, { ascending: false })
    .range(offset, offset + limit - 1);

  if (blogName) {
    query = query.eq('blog_name', blogName);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    posts: data,
    total: count,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  });
}
