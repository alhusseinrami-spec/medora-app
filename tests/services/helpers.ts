import type { Role } from "@prisma/client";
import { db } from "@/lib/db";

// Empties every table between tests. Only ever pointed at the test database.
export async function reset() {
  if (!process.env.DATABASE_URL?.includes("test")) throw new Error("Refusing to wipe a non-test database.");
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

let n = 0;
export const makeUser = (role: Role = "STAFF", name = `User ${++n}`) =>
  db.user.create({ data: { name, email: `u${n}-${Date.now()}@test.local`, role, passwordHash: "x" } });
