import { q, q1 } from "@/db";
import { peutGererEquipe, ROLES, utilisateurDe, versPage } from "@/lib/auth";
import { nouveauCode } from "@/lib/borne";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutGererEquipe(u)) return versPage(req, "/reglages");
  const f = await req.formData();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const role = String(f.get("role") ?? "");
  if (!email.includes("@") || !ROLES.some((r) => r.cle === role))
    return versPage(req, "/reglages/equipe?e=email");

  /**
   * LA BORNE, S'IL Y EN A UNE.
   *
   * Vide veut dire tout le compte, ce que l'invitation a toujours fait. Un
   * numero restreint l'invite a cette machine et a elle seule — c'est ce qu'on
   * donne au patron du bar qui l'heberge, qui n'a rien a voir du reste du parc.
   *
   * On verifie qu'elle est bien a nous : un numero se tape, et se devine.
   */
  const brut = String(f.get("borne_id") ?? "").trim();
  let borne_id: number | null = null;
  if (brut !== "") {
    const n = Number(brut);
    if (!Number.isInteger(n)) return versPage(req, "/reglages/equipe?e=borne");
    const sienne = await q1("SELECT 1 FROM borne WHERE id = $1 AND compte_id = $2",
                            [n, u.compte_id]);
    if (!sienne) return versPage(req, "/reglages/equipe?e=borne");
    borne_id = n;
  }

  // Deja membre DE CE COMPTE : reinviter n'aurait rien a lui donner.
  if (await q1(`SELECT 1 FROM membre m JOIN utilisateur x ON x.id = m.utilisateur_id
                 WHERE m.compte_id = $1 AND x.email = $2`, [u.compte_id, email]))
    return versPage(req, "/reglages/equipe?e=email");

  // Une invitation par adresse : reinviter remplace, elle ne s'empile pas.
  await q("DELETE FROM invitation WHERE compte_id = $1 AND email = $2 AND utilisee_le IS NULL",
          [u.compte_id, email]);
  await q(`INSERT INTO invitation (compte_id, email, role, code, par, borne_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [u.compte_id, email, role, nouveauCode(8), u.email, borne_id]);
  return versPage(req, "/reglages/equipe");
}
