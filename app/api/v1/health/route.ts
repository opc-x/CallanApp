import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);

    return Response.json({
      ok: true,
      service: "callanapp",
      database: "connected",
      version: "0.1.0",
    });
  } catch (error) {
    console.error("Database health check failed", error);
    return Response.json(
      {
        ok: false,
        service: "callanapp",
        database: "disconnected",
        version: "0.1.0",
      },
      { status: 503 },
    );
  }
}
