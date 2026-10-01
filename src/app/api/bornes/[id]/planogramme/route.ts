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
  // On revient sur la vue qu'on avait choisie — grille ou 2D. Seule la valeur
  // connue passe : ce champ finit dans une adresse.
  const vue = String(f.get("vue") ?? "");
  const ici = (param: string) =>
    `/bornes/${id}/planogramme?${param}${vue === "2d" ? "&vue=2d" : ""}`;

  // ── Activer une spirale que le SaaS ne connait pas encore ─────────────────
  //
  // Les canaux d'une borne sont adoptes de ce que la machine annonce au premier
  // releve — c'est-a-dire, sur une machine neuve, de la vitrine de demonstration
  // codee dans l'application. Il y manque des spires qui existent physiquement :
  // l'ecran des emplacements les dessine toutes, et on active ici celle qu'on
  // touche.
  if (f.get("action") === "ajouter") {
    const rangee = Number(f.get("rangee")), colonne = Number(f.get("colonne"));
    // La machine a DIX spires, cinq rangees de deux. Le protocole en accepterait
    // cent ; la mecanique, non. Annoncer 601 promettrait une vente encaissee que
    // rien ne pourrait distribuer.
    if (!spireValide(rangee, colonne)) return versPage(req, ici("e=place"));
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

    if (fait === 0) return versPage(req, ici(`s=${lane}&e=deja`));
    await reveiller(id, "canal ajouté");
    return versPage(req, ici(`ok=${lane}`));
  }

  // ── Retirer une spirale qui n'existe pas sur la machine ───────────────────
  //
  // Uniquement si elle est vide : une spirale qui porte encore des unites ferait
  // disparaitre du stock reel d'un clic.
  const aOter = Number(f.get("oter"));
  if (Number.isInteger(aOter) && aOter > 0) {
    const r = await q(`
      DELETE FROM canal c USING borne b
       WHERE c.lane = $1 AND c.borne_id = b.id AND b.id = $2 AND b.compte_id = $3
         AND c.quantite = 0
       RETURNING c.lane`, [aOter, id, u.compte_id]);
    if (r.length > 0) await reveiller(id, "canal retiré");
    return versPage(req, r.length > 0 ? ici("retire=1") : ici(`s=${aOter}&e=pleine`));
  }

  // ── Regler une spirale (ou plusieurs) ─────────────────────────────────────
  //
  // Les champs portent la spirale dans leur nom (`p_203`, `c_203`, `s_203`) :
  // l'ecran des emplacements n'en envoie qu'une a la fois, mais rien n'empeche
  // d'en regler plusieurs d'un coup.
  // `null` : la borne n'est pas du compte, rien n'a ete touche et on ne la
  // reveille pas. Sinon, la liste des spires dont on a refuse le produit.
  const refusees = await transaction(async (c) => {
    // Sous verrou, comme le chargement : un transfert cree entre notre controle
    // et le changement de produit passerait sinon entre les deux.
    const b = await c.query(
      "SELECT 1 FROM borne WHERE id = $1 AND compte_id = $2 FOR UPDATE", [id, u.compte_id]);
    if ((b.rowCount ?? 0) === 0) return null;
    const refus: number[] = [];

    for (const [cle, valeur] of f.entries()) {
      const lane = Number(cle.slice(2));
      if (!Number.isInteger(lane)) continue;
      if (cle.startsWith("p_")) {
        // Le produit doit etre du compte : un identifiant devine ne doit pas
        // faire entrer le catalogue du voisin dans nos canaux.
        const voulu = Number(valeur) || null;
        const pid = voulu === null ? null : (await c.query<{ id: number }>(
          "SELECT id FROM produit WHERE id = $1 AND compte_id = $2", [voulu, u.compte_id])).rows[0]?.id ?? null;
        const ca = (await c.query<{ produit_id: number | null; quantite: number; en_route: number }>(`
          SELECT c.produit_id, c.quantite,
                 (SELECT COALESCE(SUM(m.quantite), 0)::int FROM mouvement m
                   WHERE m.vers_lieu_id = b.lieu_id AND m.lane = c.lane AND m.motif = 'transfert'
                     AND m.confirme_le IS NULL AND m.annule_le IS NULL) AS en_route
            FROM canal c JOIN borne b ON b.id = c.borne_id
           WHERE c.borne_id = $1 AND c.lane = $2`, [id, lane])).rows[0];
        if (!ca || ca.produit_id === pid) continue;
        // UNE SPIRE GARNIE NE CHANGE PAS DE PRODUIT. Les unites qu'elle porte —
        // ou qui sont en route vers elle — seraient comptees sous le nouvel
        // article : stock faux, ventes au mauvais prix. On la vide d'abord.
        if (ca.quantite > 0 || ca.en_route > 0) { refus.push(lane); continue; }
        await c.query("UPDATE canal SET produit_id = $1 WHERE borne_id = $2 AND lane = $3",
                      [pid, id, lane]);
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
    return refus;
  });
  if (refusees === null) return versPage(req, "/bornes");
  await reveiller(id, "planogramme modifié");
  // Le message « elle contient encore des produits » de la page couvre aussi
  // la marchandise en route : il faut la retirer ou attendre l'acquittement.
  if (refusees.length > 0) return versPage(req, ici(`s=${refusees[0]}&e=pleine`));
  const lane = Number(f.get("lane"));
  return versPage(req, Number.isInteger(lane) && lane > 0 ? ici(`ok=${lane}`) : `/bornes/${id}`);
}
