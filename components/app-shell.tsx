"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Home, Star, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "", label: "今天", icon: Home },
  { href: "/study", label: "课程", icon: BookOpen },
  { href: "/saved", label: "生词", icon: Star },
  { href: "/pronounce", label: "发音", icon: Volume2 },
  { href: "/stats", label: "数据", icon: BarChart3 },
];

export function AppShell({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const root = `/${locale}`;

  // 刷课页是沉浸式的，藏掉 Tab 栏
  const immersive = /\/study\/[^/]+$/.test(pathname);

  if (immersive) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background">
      <div className="pb-20">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/80 pb-safe backdrop-blur-xl">
        <ul className="mx-auto flex max-w-lg items-stretch">
          {TABS.map((tab) => {
            const href = `${root}${tab.href}`;
            const active =
              tab.href === ""
                ? pathname === root || pathname === `${root}/`
                : pathname.startsWith(href);
            const Icon = tab.icon;
            return (
              <li key={tab.label} className="flex-1">
                <Link
                  href={href}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn("size-5 transition-transform", active && "scale-110")}
                    strokeWidth={active ? 2.4 : 1.9}
                  />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
