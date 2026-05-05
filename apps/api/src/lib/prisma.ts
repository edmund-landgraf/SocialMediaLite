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

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}
