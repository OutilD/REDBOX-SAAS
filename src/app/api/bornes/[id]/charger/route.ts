import { transaction } from "@/db";
import { peutCharger, peutVoirBorne, utilisateurDe, versPage } from "@/lib/auth";
import { reserveDe } from "@/lib/stock";
import { reveiller } from "@/lib/borne";

export const dynamic = "force-dynamic";

/**
 * Valider un chargement.
 *
 * Chaque canal servi devient un TRANSFERT : reserve → borne, non confirme. La
 * reserve baisse tout de suite (la marchandise est dans vos mains), la borne ne
 * monte qu'a l'acquittement de la machine.
 *
 * Tout est verifie ici, pas seulement dans le navigateur : la quantite demandee
 * doit tenir dans le canal ET exister en reserve. Un formulaire se bricole ; une
 * transaction, non.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const id = Number((await ctx.params).id);
  if (!peutCharger(u)) return versPage(req, `/bornes/${id}`);
  // CETTE BORNE LUI EST-ELLE OUVERTE ? Le compte ne suffit plus : quelqu'un
  // invite pour une seule machine appartient bien au compte, et pourrait
  // agir sur les autres en tapant leur numero dans l'adresse.
  if (!peutVoirBorne(u, id)) return versPage(req, "/bornes");

  const f = await req.formData();
  const demandes = new Map<number, number>();
  for (const [cle, valeur] of f.entries()) {
    if (!cle.startsWith("q_")) continue;
    const lane = Number(cle.slice(2));
    const n = Number(valeur);
    if (Number.isInteger(lane) && Number.isInteger(n) && n > 0) demandes.set(lane, n);
  }
  if (demandes.size === 0) return versPage(req, `/bornes/${id}/charger`);

  const bilan = await transaction(async (c) => {
    const b = (await c.query<{ id: number; lieu_id: number | null }>(
      "SELECT id, lieu_id FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id])).rows[0];
    if (!b || !b.lieu_id) return { canaux: 0, unites: 0, refuses: 0 };

    const reserve = await reserveDe(u.compte_id, c);
    let canaux = 0, unites = 0, refuses = 0;

    for (const [lane, demande] of demandes) {
      const ca = (await c.query<{ produit_id: number | null; quantite: number; capacite: number }>(
        "SELECT produit_id, quantite, capacite FROM canal WHERE borne_id = $1 AND lane = $2",
        [b.id, lane])).rows[0];
      if (!ca?.produit_id) { refuses++; continue; }

      // Ce qui est deja en route compte : sinon deux chargements successifs
      // feraient deborder le canal sans que rien ne l'ait dit.
      const enRoute = (await c.query<{ n: number }>(`
        SELECT COALESCE(SUM(quantite),0)::int n FROM mouvement
         WHERE vers_lieu_id = $1 AND lane = $2 AND motif = 'transfert'
           AND confirme_le IS NULL AND annule_le IS NULL`, [b.lieu_id, lane])).rows[0].n;

      const dispo = (await c.query<{ n: number }>(
        "SELECT COALESCE(SUM(quantite),0)::int n FROM v_stock WHERE lieu_id = $1 AND produit_id = $2",
        [reserve, ca.produit_id])).rows[0].n;

      const place = Math.max(0, ca.capacite - ca.quantite - enRoute);
      const quantite = Math.min(demande, place, dispo);
      if (quantite <= 0) { refuses++; continue; }

      await c.query(`
        INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, vers_lieu_id, quantite,
                               motif, lane, par)
        VALUES ($1,$2,$3,$4,$5,'transfert',$6,$7)`,
        [u.compte_id, ca.produit_id, reserve, b.lieu_id, quantite, lane, u.email]);
      canaux++; unites += quantite;
      if (quantite < demande) refuses++;
    }
    return { canaux, unites, refuses };
  });

  // La borne est prevenue tout de suite : elle tient une question ouverte, elle
  // aura le chargement dans la seconde plutot qu'a son prochain reveil.
  if (bilan.canaux > 0) await reveiller(id, "chargement à appliquer");

  return versPage(req,
    `/bornes/${id}?charge=${bilan.unites}&canaux=${bilan.canaux}&refuses=${bilan.refuses}`);
}
