/**
 * PostgreSQL via `pg` + `@prisma/adapter-pg`, aligned with Prisma’s Postgres quickstart.
 * @see https://www.prisma.io/docs/prisma-orm/quickstart/postgresql
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to the repo-root `.env` (see `.env.example`).",
  );
}

const pool = new Pool({
  connectionString,
  /** Small pool on VPS — override with PG_POOL_MAX if needed. */
  max: Number(process.env.PG_POOL_MAX ?? 5),
  /** Drop idle connections so a restarted Postgres does not leave stale sockets. */
  idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_TIMEOUT_MS ?? 30_000),
  /** Fail fast instead of hanging nginx when Postgres is slow to accept auth. */
  connectionTimeoutMillis: Number(process.env.PG_POOL_CONNECTION_TIMEOUT_MS ?? 5_000),
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}
