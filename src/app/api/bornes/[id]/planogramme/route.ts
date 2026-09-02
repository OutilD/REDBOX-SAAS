import { q, transaction } from "@/db";
import { peutConfigurer, peutVoirBorne, utilisateurDe, versPage } from "@/lib/auth";
import { reveiller } from "@/lib/borne";
import { laneDe, spireValide } from "@/lib/machine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const id = Number((await ctx.params).id);
  if (!peutConfigurer(u)) return versPage(req, `/bornes/${id}`);
  // CETTE BORNE LUI EST-ELLE OUVERTE ? Le compte ne suffit plus : quelqu'un
  // invite pour une seule machine appartient bien au compte, et pourrait
  // agir sur les autres en tapant leur numero dans l'adresse.
  if (!peutVoirBorne(u, id)) return versPage(req, "/bornes");

  const f = await req.formData();

  // ── Declarer une spire que le SaaS ne connait pas encore ──────────────────
  //
  // Les canaux d'une borne sont adoptes de ce que la machine annonce au premier
  // releve — c'est-a-dire, sur une machine neuve, de la vitrine de demonstration
  // codee dans l'application. Cette liste n'a rien d'un inventaire materiel : il
  // y manque des spires qui existent physiquement. Sans ce formulaire, un produit
  // de plus que la vitrine n'avait nulle part ou aller, et il fallait sacrifier
  // un autre article pour lui faire une place.
  if (f.get("action") === "ajouter") {
    const rangee = Number(f.get("rangee")), colonne = Number(f.get("colonne"));
    // La machine a DIX spires, cinq rangees de deux. Le protocole en accepterait
    // cent ; la mecanique, non. Annoncer 601 promettrait une vente encaissee que
    // rien ne pourrait distribuer.
    if (!spireValide(rangee, colonne)) return versPage(req, `/bornes/${id}/planogramme?e=place`);
    const lane = laneDe(rangee, colonne);

    const fait = await transaction(async (c) => {
      const mienne = await c.query(
        "SELECT 1 FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
      if ((mienne.rowCount ?? 0) === 0) return 0;
      const r = await c.query(`
        INSERT INTO canal (borne_id, lane, rangee, colonne, produit_id, quantite, capacite, seuil_bas)
        SELECT $1, $2, $3, $4,
               (SELECT id FROM produit WHERE id = $5 AND compte_id = $6),
               0, $7, 2
        ON CONFLICT (borne_id, lane) DO NOTHING`,
        [id, lane, rangee, colonne, Number(f.get("produit_id")) || null, u.compte_id,
         Math.min(60, Math.max(1, Number(f.get("capacite")) || 10))]);
      return r.rowCount ?? 0;
    });

    if (fait === 0) return versPage(req, `/bornes/${id}/planogramme?e=deja`);
    await reveiller(id, "canal ajouté");
    return versPage(req, `/bornes/${id}/planogramme`);
  }

  // ── Retirer une spire qui n'existe pas sur la machine ─────────────────────
  //
  // Uniquement si elle est vide : un canal qui porte encore des unites ferait
  // disparaitre du stock reel d'un clic.
  const aOter = Number(f.get("oter"));
  if (Number.isInteger(aOter) && aOter > 0) {
    const r = await q(`
      DELETE FROM canal c USING borne b
       WHERE c.lane = $1 AND c.borne_id = b.id AND b.id = $2 AND b.compte_id = $3
         AND c.quantite = 0
       RETURNING c.lane`, [aOter, id, u.compte_id]);
    if (r.length > 0) await reveiller(id, "canal retiré");
    return versPage(req, r.length > 0 ? `/bornes/${id}/planogramme` : `/bornes/${id}/planogramme?e=pleine`);
  }

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
