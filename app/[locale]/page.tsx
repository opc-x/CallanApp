import { HomeHero } from "@/components/home-hero";
import { getLocale } from "next-intl/server";

export default async function Home() {
  const locale = await getLocale();
  return <HomeHero locale={locale} />;
}
