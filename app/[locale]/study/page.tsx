import type { Metadata } from "next";
import { stageOutline } from "@/lib/callan";
import { StudyIndex } from "@/components/study-index";

export const metadata: Metadata = { title: "课程 · CallanApp" };

export default async function StudyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <StudyIndex outline={stageOutline()} locale={locale} />;
}
