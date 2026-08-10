import Link from "next/link";
import { getLocale } from "next-intl/server";

export default async function ProtectedPage() {
  const locale = await getLocale();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-bold">应用区域（占位）</h1>
      <p className="text-sm text-muted-foreground">数据库由 Neon 提供</p>
      <Link href={`/${locale}`} className="text-sm text-primary hover:underline">
        ← 返回首页
      </Link>
    </main>
  );
}
