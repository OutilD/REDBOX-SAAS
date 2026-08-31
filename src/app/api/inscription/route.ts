import { transaction } from "@/db";
import { chiffrer, creerSession, enTeteBiscuit, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Creation d'un compte.
 *
 * Le compte et son premier utilisateur naissent dans la MEME transaction : un
 * compte sans proprietaire serait un compte que plus personne ne peut reprendre,
 * et un utilisateur sans compte n'aurait nulle part ou ranger son stock.
 *
 * L'inscription peut etre fermee par un code, pose dans l'environnement
 * (REDBOX_CODE_INSCRIPTION). Non renseigne, elle reste ouverte — c'est le
 * reglage qui convient tant qu'on cherche des clients ; le jour ou l'on veut
 * n'ouvrir qu'a ceux qui ont achete une borne, il suffit de poser la variable.
 */
export async function POST(req: Request) {
  const f = await req.formData();
  const compte = String(f.get("compte") ?? "").trim();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const mdp = String(f.get("mdp") ?? "");
  const mdp2 = String(f.get("mdp2") ?? "");

  const vers = (e: string) => versPage(req,
    `/inscription?e=${e}&compte=${encodeURIComponent(compte)}&email=${encodeURIComponent(email)}`);

  const attendu = process.env.REDBOX_CODE_INSCRIPTION;
  if (attendu && String(f.get("code") ?? "").trim() !== attendu) return vers("code");

  if (!compte) return vers("compte");
  // Verification volontairement large : c'est le facteur de forme qu'on controle
  // ici, pas l'existence de la boite. Refuser une adresse valable parce qu'elle
  // sort de l'ordinaire coute plus cher qu'accepter une faute de frappe.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return vers("email");
  if (mdp.length < 8 || mdp !== mdp2) return vers("mdp");

  const issue = await transaction<{ souci: string | null; id: number }>(async (c) => {
    const deja = await c.query("SELECT 1 FROM utilisateur WHERE email = $1", [email]);
    if ((deja.rowCount ?? 0) > 0) return { souci: "pris", id: 0 };

    const k = (await c.query<{ id: number }>(
      "INSERT INTO compte (nom) VALUES ($1) RETURNING id", [compte])).rows[0];
    const u = (await c.query<{ id: number }>(`
      INSERT INTO utilisateur (compte_id, email, mdp, role)
      VALUES ($1, $2, $3, 'proprietaire') RETURNING id`,
      [k.id, email, chiffrer(mdp)])).rows[0];
    // La reserve nait avec le compte : sans elle, la premiere reception n'aurait
    // nulle part ou entrer.
    await c.query("INSERT INTO lieu (compte_id, genre, nom) VALUES ($1,'reserve','Ma réserve')",
                  [k.id]);
    return { souci: null, id: u.id };
  });

  if (issue.souci) return vers(issue.souci);
  return versPage(req, "/", enTeteBiscuit(await creerSession(issue.id)));
}
