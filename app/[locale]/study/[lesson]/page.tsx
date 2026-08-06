import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLesson, lessonIndex, lessonIpa, TOTAL_LESSONS } from "@/lib/callan";
import { LessonDrill } from "@/components/lesson-drill";

export function generateStaticParams() {
  return lessonIndex.map((l) => ({ lesson: String(l.lesson) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lesson: string }>;
}): Promise<Metadata> {
  const { lesson } = await params;
  return { title: `Lesson ${lesson} · CallanApp` };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ locale: string; lesson: string }>;
}) {
  const { locale, lesson: raw } = await params;
  const num = Number(raw);
  if (!Number.isInteger(num)) notFound();

  const lesson = getLesson(num);
  if (!lesson) notFound();

  return (
    <LessonDrill
      lesson={lesson}
      ipa={lessonIpa(lesson)}
      locale={locale}
      next={num < TOTAL_LESSONS ? num + 1 : null}
    />
  );
}
