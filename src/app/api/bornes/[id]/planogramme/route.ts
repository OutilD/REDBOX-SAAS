import { transaction } from "@/db";
import { peutConfigurer, utilisateurDe, versPage } from "@/lib/auth";
import { reveiller } from "@/lib/borne";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const id = Number((await ctx.params).id);
  if (!peutConfigurer(u)) return versPage(req, `/bornes/${id}`);

  const f = await req.formData();
  await transaction(async (c) => {
    const b = await c.query("SELECT 1 FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
    if ((b.rowCount ?? 0) === 0) return;

    for (const [cle, valeur] of f.entries()) {
      const lane = Number(cle.slice(2));
      if (!Number.isInteger(lane)) continue;
      if (cle.startsWith("p_")) {
        const pid = Number(valeur) || null;
        // Le produit doit etre du compte : un identifiant devine ne doit pas
        // faire entrer le catalogue du voisin dans nos canaux.
        await c.query(`
          UPDATE canal SET produit_id = (
            SELECT id FROM produit WHERE id = $1 AND compte_id = $2)
           WHERE borne_id = $3 AND lane = $4`, [pid, u.compte_id, id, lane]);
      } else if (cle.startsWith("c_")) {
        const n = Number(valeur);
        if (Number.isInteger(n) && n >= 1 && n <= 60)
          await c.query("UPDATE canal SET capacite = $1 WHERE borne_id = $2 AND lane = $3", [n, id, lane]);
      } else if (cle.startsWith("s_")) {
        const n = Number(valeur);
        if (Number.isInteger(n) && n >= 0 && n <= 30)
          await c.query("UPDATE canal SET seuil_bas = $1 WHERE borne_id = $2 AND lane = $3", [n, id, lane]);
      }
    }
  });
  await reveiller(id, "planogramme modifié");
  return versPage(req, `/bornes/${id}`);
}
