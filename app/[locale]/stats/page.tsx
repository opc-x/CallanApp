import type { Metadata } from "next";
import { lessonIndex } from "@/lib/callan";
import { StatsBoard } from "@/components/stats-board";

export const metadata: Metadata = { title: "数据 · CallanApp" };

export default function StatsPage() {
  return <StatsBoard index={lessonIndex} />;
}
