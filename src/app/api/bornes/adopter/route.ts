import { transaction } from "@/db";
import { peutConfigurer, utilisateurDe, versPage } from "@/lib/auth";
import { nouveauJeton } from "@/lib/borne";

export const dynamic = "force-dynamic";

/**
 * Le proprietaire adopte la borne qui a demande.
 *
 * Tout se joue dans une transaction : la demande est verrouillee, la borne creee
 * avec son lieu, le jeton depose. Deux personnes qui saisiraient le meme code au
 * meme instant ne peuvent pas creer deux bornes.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutConfigurer(u)) return versPage(req, "/bornes");

  const f = await req.formData();
  const code = String(f.get("code") ?? "").trim().toUpperCase();
  const nom = String(f.get("nom") ?? "").trim();
  const adresse = String(f.get("adresse") ?? "").trim() || null;
  const vers = (e: string) => versPage(req, `/bornes/ajouter?e=${e}&code=${encodeURIComponent(code)}`);
  if (!nom) return vers("nom");

  const issue = await transaction<{ souci: string | null; borne: number }>(async (c) => {
    const d = (await c.query<{ id: number; borne_id: number | null; version: string | null }>(`
      SELECT id, borne_id, version FROM appairage
       WHERE code = $1 AND expire_le > now() FOR UPDATE`, [code])).rows[0];
    if (!d) return { souci: "code", borne: 0 };
    if (d.borne_id) return { souci: "prise", borne: 0 };

    const lieu = (await c.query<{ id: number }>(
      "INSERT INTO lieu (compte_id, genre, nom) VALUES ($1,'borne',$2) RETURNING id",
      [u.compte_id, nom])).rows[0];
    const jeton = nouveauJeton();
    const b = (await c.query<{ id: number }>(`
      INSERT INTO borne (compte_id, lieu_id, nom, adresse, jeton, appairee_le, version)
      VALUES ($1,$2,$3,$4,$5, now(), $6) RETURNING id`,
      [u.compte_id, lieu.id, nom, adresse, jeton, d.version])).rows[0];
    await c.query("UPDATE appairage SET borne_id = $1, jeton = $2 WHERE id = $3", [b.id, jeton, d.id]);
    return { souci: null, borne: b.id };
  });

  if (issue.souci) return vers(issue.souci);
  return versPage(req, `/bornes/${issue.borne}`);
}
