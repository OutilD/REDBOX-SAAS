import pg, { Pool, type QueryResultRow } from "pg";

/**
 * Les BIGINT reviennent en NOMBRES, pas en chaines.
 *
 * Par defaut `pg` rend les entiers 64 bits sous forme de texte, par prudence :
 * au-dela de 2^53 un nombre JavaScript perd des chiffres. Mais tant qu'on les
 * laisse en chaines, `id === 3` est faux, une somme concatene, et un identifiant
 * passe en parametre repart en texte. Un distributeur automatique n'atteindra
 * jamais neuf millions de milliards de mouvements ; le risque theorique coute
 * moins cher que les comparaisons silencieusement fausses.
 */
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // int8
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric

/**
 * Acces a la base.
 *
 * Tout le SQL de l'application passe par ici et par les fichiers de ce dossier.
 * Pas d'ORM : le schema est assez simple pour que le SQL reste lisible, et un
 * stock qui se calcule doit pouvoir se lire.
 *
 * Le pool survit aux rechargements a chaud du developpement — sans ca, chaque
 * modification de fichier ouvrirait un nouveau lot de connexions jusqu'a ce que
 * Neon refuse.
 */
const global_ = globalThis as unknown as { _rbxPool?: Pool };

export function pool(): Pool {
  if (!global_._rbxPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL absent — voir .env.local");
    global_._rbxPool = new Pool({
      connectionString: url,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return global_._rbxPool;
}

export async function q<T extends QueryResultRow>(
  sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool().query<T>(sql, params);
  return r.rows;
}

/** La premiere ligne, ou null. Pour les lectures dont on sait qu'elles sont uniques. */
export async function q1<T extends QueryResultRow>(
  sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Une transaction.
 *
 * Obligatoire des qu'on ecrit plus d'une ligne liee : un transfert touche le
 * mouvement ET la borne, un chargement en touche plusieurs. A moitie ecrit, un
 * stock ment.
 */
export async function transaction<T>(travail: (c: PgClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const r = await travail(client as unknown as PgClient);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export type PgClient = {
  query<T extends QueryResultRow>(sql: string, params?: unknown[]):
    Promise<{ rows: T[]; rowCount: number | null }>;
};

// ------------------------------------------------------------------ formatage

export function euros(centimes: number | null | undefined): string {
  return ((centimes ?? 0) / 100).toLocaleString("fr-FR",
    { style: "currency", currency: "EUR" });
}

/** Une borne est consideree en ligne si elle a donne signe de vie recemment. */
export function enLigne(vue_le: Date | string | null): boolean {
  if (!vue_le) return false;
  return Date.now() - new Date(vue_le).getTime() < 15 * 60 * 1000;
}

export function depuis(d: Date | string | null): string {
  if (!d) return "jamais";
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "à l’instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

export function leJour(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR",
    { day: "2-digit", month: "short", year: "numeric" });
}
