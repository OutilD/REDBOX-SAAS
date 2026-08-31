// Applique le schema. A lancer avec `npm run migrate`.
//
// Passe par la connexion NON POOLEE : pgbouncer en mode transaction refuse une
// partie du DDL, et un schema applique a moitie est pire qu'un schema absent.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED absent — voir .env.local");

const client = new pg.Client({ connectionString: url });
await client.connect();

const sql = readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8");
try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`);
  console.log("Schema applique. Tables et vues :");
  for (const r of rows) console.log("  " + r.table_name);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("Migration refusee, rien n'a ete applique :\n  " + e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
