import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { progress } from "@/lib/db/schema";
import { EMPTY_PROGRESS, isValidProgress, mergeProgress, type Progress } from "@/lib/progress-shared";

const ROW_ID = "default";

function checkSyncCode(request: Request): boolean {
  const expected = process.env.SYNC_CODE;
  if (!expected) return false; // 没配置就整体关闭同步，别意外裸奔
  return request.headers.get("x-sync-code") === expected;
}

function rowToProgress(row: typeof progress.$inferSelect): Progress {
  return {
    done: (row.done as number[]) ?? [],
    last: row.last,
    pos: (row.pos as Record<string, number>) ?? {},
    saved: (row.saved as Progress["saved"]) ?? [],
    days: (row.days as string[]) ?? [],
  };
}

export async function GET(request: Request) {
  if (!checkSyncCode(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const [row] = await db.select().from(progress).where(eq(progress.id, ROW_ID));
  return Response.json({ ok: true, progress: row ? rowToProgress(row) : EMPTY_PROGRESS });
}

export async function POST(request: Request) {
  if (!checkSyncCode(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!isValidProgress(body)) {
    return Response.json({ ok: false, error: "invalid progress" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db.select().from(progress).where(eq(progress.id, ROW_ID));
  const merged = existing ? mergeProgress(rowToProgress(existing), body) : body;

  await db
    .insert(progress)
    .values({ id: ROW_ID, ...merged, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: progress.id,
      set: { ...merged, updatedAt: new Date() },
    });

  return Response.json({ ok: true, progress: merged });
}

/**
 * 硬覆盖，不合并——POST 的并集合并是只增不减的，"清空进度"/取消某课完成
 * 这种要变少的操作走这个接口，不然合并逻辑会把删掉的东西又粘回来。
 */
export async function PUT(request: Request) {
  if (!checkSyncCode(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!isValidProgress(body)) {
    return Response.json({ ok: false, error: "invalid progress" }, { status: 400 });
  }

  const db = getDb();
  await db
    .insert(progress)
    .values({ id: ROW_ID, ...body, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: progress.id,
      set: { ...body, updatedAt: new Date() },
    });

  return Response.json({ ok: true, progress: body });
}
