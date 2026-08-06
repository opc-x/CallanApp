import { lessonIndex } from "@/lib/callan";
import { HomeToday } from "@/components/home-today";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <HomeToday locale={locale} index={lessonIndex} />;
}
