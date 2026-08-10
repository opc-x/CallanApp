import { findPronunciations } from "@/lib/youglish";
import { wordGloss } from "@/lib/callan";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const word = (searchParams.get("word") ?? "").trim();

  if (!word) {
    return Response.json({ ok: false, error: "missing word" }, { status: 400 });
  }
  if (word.length > 40) {
    return Response.json({ ok: false, error: "word too long" }, { status: 400 });
  }

  try {
    const { hits, fallback, debug } = await findPronunciations(word);
    return Response.json({ ok: true, word, gloss: wordGloss(word), hits, fallback, debug });
  } catch (error) {
    console.error("pronounce lookup failed", error);
    return Response.json({ ok: false, error: "lookup failed" }, { status: 502 });
  }
}
