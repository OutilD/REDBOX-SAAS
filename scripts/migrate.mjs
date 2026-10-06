// Applique le schema. A lancer avec `npm run migrate`.
//
// Passe par la connexion NON POOLEE : pgbouncer en mode transaction refuse une
// partie du DDL, et un schema applique a moitie est pire qu'un schema absent.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

// Jamais de repli sur DATABASE_URL : c'est le pooler, et un SET (meme LOCAL
// mal ferme) y fuirait vers les connexions de l'application.
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED absent : il faut l'URL DIRECTE de la base (Neon : " +
                "l'hote sans « -pooler »). DATABASE_URL, le pooler, n'est pas accepte.");
  process.exit(1);
}
if (/-pooler\./.test(url)) {
  console.error("DATABASE_URL_UNPOOLED pointe sur le pooler (« -pooler ») : donnez l'URL directe.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const sql = readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8");
try {
  await client.query("BEGIN");
  // Un verrou qui tarde (une table tenue par l'application) fait echouer la
  // migration au lieu de bloquer toute la production derriere elle.
  await client.query("SET LOCAL lock_timeout = '5s'");
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
