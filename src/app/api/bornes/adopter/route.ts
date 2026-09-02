import { transaction } from "@/db";
import { peutConfigurer, utilisateurDe, versPage, estRestreint } from "@/lib/auth";
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
  // Le compte n'est pas le sien : une portee par borne ne donne pas la main
  // sur le catalogue, le depot ou le parc de l'exploitant.
  if (estRestreint(u)) return versPage(req, "/bornes");
  if (!peutConfigurer(u)) return versPage(req, "/bornes");

  const f = await req.formData();
  const code = String(f.get("code") ?? "").trim().toUpperCase();
  const nom = String(f.get("nom") ?? "").trim();
  const adresse = String(f.get("adresse") ?? "").trim() || null;
  const vers = (e: string) => versPage(req, `/bornes/ajouter?e=${e}&code=${encodeURIComponent(code)}`);
  if (!nom) return vers("nom");

  const issue = await transaction<{ souci: string | null; borne: number }>(async (c) => {
    const d = (await c.query<{
      id: number; borne_id: number | null; version: string | null; machine: string | null;
    }>(`
      SELECT id, borne_id, version, machine FROM appairage
       WHERE code = $1 AND expire_le > now() FOR UPDATE`, [code])).rows[0];
    if (!d) return { souci: "code", borne: 0 };
    if (d.borne_id) return { souci: "prise", borne: 0 };

    // UNE BORNE, UN COMPTE.
    //
    // La machine porte une identite qui survit aux appairages. Si elle repond
    // deja a un compte, on refuse ici plutot que de creer un second titulaire :
    // deux SaaS qui pilotent le meme distributeur, ce sont deux catalogues qui
    // s'ecrasent l'un l'autre et des ventes comptees a moitie. Il faut la delier
    // d'abord — les anciennes lignes depairees, elles, restent et gardent leur
    // historique.
    if (d.machine) {
      const prise = (await c.query<{ n: number }>(
        "SELECT COUNT(*)::int n FROM borne WHERE machine = $1 AND jeton IS NOT NULL",
        [d.machine])).rows[0];
      if (prise.n > 0) return { souci: "deja", borne: 0 };
    }

    const lieu = (await c.query<{ id: number }>(
      "INSERT INTO lieu (compte_id, genre, nom) VALUES ($1,'borne',$2) RETURNING id",
      [u.compte_id, nom])).rows[0];
    const jeton = nouveauJeton();
    const b = (await c.query<{ id: number }>(`
      INSERT INTO borne (compte_id, lieu_id, nom, adresse, jeton, appairee_le, version, machine)
      VALUES ($1,$2,$3,$4,$5, now(), $6, $7) RETURNING id`,
      [u.compte_id, lieu.id, nom, adresse, jeton, d.version, d.machine])).rows[0];
    await c.query("UPDATE appairage SET borne_id = $1, jeton = $2 WHERE id = $3", [b.id, jeton, d.id]);
    return { souci: null, borne: b.id };
  });

  if (issue.souci) return vers(issue.souci);
  return versPage(req, `/bornes/${issue.borne}`);
}
