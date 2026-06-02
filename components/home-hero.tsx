"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { hasEnvVars } from "@/lib/utils";

export function HomeHero({ locale }: { locale: string }) {
  const t = useTranslations("home");
  const tc = useTranslations("common");

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-16">
      <p className="mb-2 text-sm font-medium text-primary">{tc("tagline")}</p>
      <h1 className="mb-4 text-center text-4xl font-bold tracking-tight text-foreground md:text-5xl">
        {t("headline")}
      </h1>
      <p className="mb-10 max-w-md text-center text-muted-foreground">{t("subtext")}</p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href={`/${locale}/protected`}>{t("protected")}</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <a href="/api/v1/health" target="_blank" rel="noreferrer">
            {t("health")}
          </a>
        </Button>
      </div>

      <p className="mt-10 text-xs text-muted-foreground">
        Supabase: {hasEnvVars ? "已配置 env" : "未配置 — 见 .env.example"}
      </p>
    </main>
  );
}
