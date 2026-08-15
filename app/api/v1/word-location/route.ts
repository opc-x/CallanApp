import { wordLocation } from "@/lib/callan";

export async function GET(req: Request) {
  const word = new URL(req.url).searchParams.get("word");
  if (!word) return Response.json({ error: "missing word" }, { status: 400 });

  const loc = wordLocation(word);
  if (!loc) return Response.json({ error: "not found" }, { status: 404 });

  return Response.json(loc);
}
