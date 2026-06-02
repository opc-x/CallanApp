import Link from "next/link";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import { isDevBypassAuth } from "@/lib/dev-config";

export default async function ProtectedPage() {
  const locale = await getLocale();
  let userEmail: string | null = null;

  if (hasEnvVars) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userEmail = data.user?.email ?? null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-bold">受保护区（占位）</h1>
      <p className="text-sm text-muted-foreground">
        Supabase {hasEnvVars ? "已连接" : "未配置"}
        {isDevBypassAuth() ? " · DEV_BYPASS_AUTH" : ""}
      </p>
      {userEmail && (
        <p className="text-sm">
          当前用户：<code className="rounded bg-muted px-1">{userEmail}</code>
        </p>
      )}
      <Link href={`/${locale}`} className="text-sm text-primary hover:underline">
        ← 返回首页
      </Link>
    </main>
  );
}
