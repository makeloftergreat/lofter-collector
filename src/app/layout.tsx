import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LOFTER 数据收集',
  description: 'LOFTER 文章数据自动采集与展示',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
