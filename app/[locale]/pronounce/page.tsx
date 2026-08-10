import type { Metadata } from "next";
import { PronounceSearch } from "@/components/pronounce-search";

export const metadata: Metadata = { title: "发音 · CallanApp" };

export default function PronouncePage() {
  return <PronounceSearch />;
}
