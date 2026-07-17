import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 手动更新 Cookie 接口（也可被本地脚本调用）
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { cookie, blog_name, secret } = body;

  // 简单密钥验证
  if (secret !== process.env.COOKIE_SYNC_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
  }

  if (!cookie) {
    return NextResponse.json({ error: 'Cookie is required' }, { status: 400 });
  }

  // 删除旧记录
  await supabase.from('lofter_cookies').delete().neq('id', 0);

  // 插入新记录
  const { error } = await supabase.from('lofter_cookies').insert({
    cookie,
    blog_name: blog_name || null,
    status: 'active',
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Cookie updated' });
}

// 查询 Cookie 状态
export async function GET() {
  const { data, error } = await supabase
    .from('lofter_cookies')
    .select('status, blog_name, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return NextResponse.json({ status: 'none', message: 'No cookie found' });
  }

  return NextResponse.json({
    status: data.status,
    blogName: data.blog_name,
    updatedAt: data.updated_at,
  });
}
