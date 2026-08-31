import { transaction } from "@/db";
import { peutCharger, utilisateurDe, versPage } from "@/lib/auth";
import { reserveDe } from "@/lib/stock";

export const dynamic = "force-dynamic";

/** « 12,50 » ou « 12.5 » ou vide → centimes, ou null. */
function centimes(brut: string): number | null {
  const t = brut.trim().replace(/[^\d,.-]/g, "").replace(",", ".");
  if (!t) return null;
  const n = Math.round(parseFloat(t) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Enregistre une livraison entiere.
 *
 * Toutes les lignes portent le MEME horodatage et la meme reference : c'est ce
 * qui permet de les relire ensuite comme un seul bon de livraison plutot que
 * comme dix entrees sans rapport. Et tout passe dans une transaction — une
 * livraison a moitie saisie fausse le stock sans que rien ne le dise.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutCharger(u)) return versPage(req, "/");

  const f = await req.formData();
  const reference = String(f.get("reference") ?? "").trim() || null;
  const fournisseur = String(f.get("fournisseur") ?? "").trim() || null;

  const lignes: { produit: number; quantite: number; prix: number | null }[] = [];
  for (const [cle, valeur] of f.entries()) {
    if (!cle.startsWith("q_")) continue;
    const produit = Number(cle.slice(2));
    const quantite = Number(valeur);
    if (!Number.isInteger(produit) || produit <= 0) continue;
    if (!Number.isInteger(quantite) || quantite <= 0) continue;
    lignes.push({ produit, quantite, prix: centimes(String(f.get(`p_${produit}`) ?? "")) });
  }
  if (lignes.length === 0) return versPage(req, "/reception?e=rien");

  const bilan = await transaction(async (c) => {
    const reserve = await reserveDe(u.compte_id, c);
    let unites = 0, refs = 0;
    for (const l of lignes) {
      // Le produit doit appartenir au compte : sans ce controle, un identifiant
      // devine dans le formulaire ferait entrer du stock chez le voisin.
      const r = await c.query(`
        INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, vers_lieu_id, quantite,
                               motif, prix_achat_c, reference, note, par, fait_le, confirme_le)
        SELECT $1, p.id, NULL, $2, $3, 'reception', $4, $5, $6, $7, now(), now()
          FROM produit p WHERE p.id = $8 AND p.compte_id = $1`,
        [u.compte_id, reserve, l.quantite, l.prix, reference, fournisseur, u.email, l.produit]);
      if ((r.rowCount ?? 0) > 0) { refs++; unites += l.quantite; }
    }
    return { unites, refs };
  });

  return versPage(req, `/reception?ok=${bilan.unites}&refs=${bilan.refs}`);
}
