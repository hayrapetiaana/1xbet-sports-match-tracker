import { db, hasDatabase } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabase || !db) {
    return Response.json({ ok: true, mode: "in-memory", database: false });
  }

  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, mode: "postgres", database: true });
  } catch (error) {
    return Response.json({
      ok: true,
      mode: "in-memory-fallback",
      database: false,
      warning: error instanceof Error ? error.message : "Database unavailable",
    });
  }
}
