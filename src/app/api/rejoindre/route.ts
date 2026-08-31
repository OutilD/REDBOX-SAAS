import { transaction } from "@/db";
import { chiffrer, creerSession, enTeteBiscuit, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * L'invite entre. Le code est consomme dans la meme transaction que la creation
 * du compte : deux personnes ne peuvent pas entrer avec le meme.
 */
export async function POST(req: Request) {
  const f = await req.formData();
  const code = String(f.get("code") ?? "").trim().toUpperCase();
  const mdp = String(f.get("mdp") ?? "");
  const mdp2 = String(f.get("mdp2") ?? "");
  const vers = (e: string) => versPage(req, `/rejoindre?e=${e}&code=${encodeURIComponent(code)}`);

  if (mdp.length < 8 || mdp !== mdp2) return vers("mdp");

  const issue = await transaction<{ souci: string | null; id: number }>(async (c) => {
    const inv = (await c.query<{ id: number; compte_id: number; email: string; role: string }>(
      "SELECT id, compte_id, email, role FROM invitation WHERE code = $1 AND utilisee_le IS NULL",
      [code])).rows[0];
    if (!inv) return { souci: "code", id: 0 };

    const deja = await c.query("SELECT 1 FROM utilisateur WHERE email = $1", [inv.email]);
    if ((deja.rowCount ?? 0) > 0) return { souci: "deja", id: 0 };

    const u = (await c.query<{ id: number }>(
      "INSERT INTO utilisateur (compte_id, email, mdp, role) VALUES ($1,$2,$3,$4) RETURNING id",
      [inv.compte_id, inv.email, chiffrer(mdp), inv.role])).rows[0];
    await c.query("UPDATE invitation SET utilisee_le = now() WHERE id = $1", [inv.id]);
    return { souci: null, id: u.id };
  });

  if (issue.souci) return vers(issue.souci);
  return versPage(req, "/", enTeteBiscuit(await creerSession(issue.id)));
}
