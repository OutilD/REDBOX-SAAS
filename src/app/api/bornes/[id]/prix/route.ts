import { transaction } from "@/db";
import { peutConfigurer, peutVoirBorne, utilisateurDe, versPage } from "@/lib/auth";
import { reveiller } from "@/lib/borne";
import { centimes } from "@/lib/prix";

export const dynamic = "force-dynamic";

/**
 * LES PRIX DE CETTE BORNE.
 *
 * On enregistre des EXCEPTIONS, comme pour l'affichage : un champ laisse vide,
 * ou rempli avec le prix du catalogue, ne pose rien — cette borne suivra le
 * catalogue, aujourd'hui et le jour ou il changera.
 *
 * EFFACER PLUTOT QUE POSER UNE EXCEPTION IDENTIQUE n'est pas une economie de
 * ligne, c'est la seule facon de garder le reglage lisible. Une exception qui
 * vaut le prix general ne se voit pas — elle a l'air d'un produit ordinaire —
 * et le jour ou l'exploitant passe tout son catalogue de 5,00 a 5,50, cette
 * borne-la reste a 5,00 sans que personne ne comprenne pourquoi.
 *
 * ON N'EFFACE ET NE REECRIT PAS TOUT. La table porte QUI a pose le prix et
 * QUAND : un DELETE suivi d'un INSERT, comme le fait `borne_masque`, perdrait
 * cette trace a chaque enregistrement, y compris pour les lignes qu'on n'a pas
 * touchees. On modifie donc ligne a ligne — c'est le meme nombre de requetes,
 * et l'histoire tient.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const id = Number((await ctx.params).id);
  if (!peutConfigurer(u)) return versPage(req, `/bornes/${id}`);
  // CETTE BORNE LUI EST-ELLE OUVERTE ? Le compte ne suffit pas : quelqu'un
  // invite pour une seule machine appartient bien au compte, et pourrait fixer
  // les prix des autres en tapant leur numero dans l'adresse.
  if (!peutVoirBorne(u, id)) return versPage(req, "/bornes");

  const f = await req.formData();
  const RETOUR = `/bornes/${id}/prix`;

  const bilan = await transaction<{ propres: number; refuses: number } | null>(async (c) => {
    const mienne = await c.query(
      "SELECT 1 FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
    if ((mienne.rowCount ?? 0) === 0) return null;

    // ── Tout remettre au catalogue ────────────────────────────────────────
    //
    // Le geste qui repare : on a tatonne sur douze produits, on veut repartir
    // du prix general. Sans lui, il faudrait vider douze champs a la main —
    // et on n'oserait pas essayer un tarif.
    if (f.get("action") === "aligner") {
      await c.query("DELETE FROM prix_borne WHERE borne_id = $1", [id]);
      return { propres: 0, refuses: 0 };
    }

    // Le prix du catalogue, produit par produit. Il decide de tout : c'est lui
    // qu'on compare pour savoir si la saisie est une exception ou un simple
    // rappel du prix general.
    const general = new Map<number, number>();
    for (const r of (await c.query<{ id: number; prix_vente_c: number }>(
      "SELECT id, prix_vente_c FROM produit WHERE compte_id = $1", [u.compte_id])).rows) {
      general.set(Number(r.id), Number(r.prix_vente_c));
    }

    let refuses = 0;
    for (const [cle, valeur] of f.entries()) {
      if (!cle.startsWith("prix_")) continue;
      const produit_id = Number(cle.slice(5));
      // Un identifiant devine dans le formulaire ne doit toucher aucune ligne :
      // s'il n'est pas dans le catalogue du compte, il n'existe pas ici.
      if (!general.has(produit_id)) continue;

      const brut = String(valeur).trim();
      const prix = brut === "" ? null : centimes(brut);

      // SAISIE ILLISIBLE : ON NE TOUCHE A RIEN. « 4,5O » avec un O, ou un
      // montant au-dela du plafond, n'est pas une intention d'effacer — c'est
      // une faute de frappe. Ramener ce produit au catalogue sans le dire
      // ferait changer un prix par accident, ce qui est exactement ce qu'on
      // essaie d'empecher. On compte, et la page le signale.
      if (brut !== "" && prix === null) { refuses++; continue; }

      // Vide, ou egal au catalogue : cette borne le suit.
      if (prix === null || prix === general.get(produit_id)) {
        await c.query("DELETE FROM prix_borne WHERE borne_id = $1 AND produit_id = $2",
                      [id, produit_id]);
        continue;
      }

      await c.query(`
        INSERT INTO prix_borne (borne_id, produit_id, prix_c, par)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (borne_id, produit_id) DO UPDATE
          -- La date et l'auteur ne bougent que si le PRIX bouge : reenregistrer
          -- la page sans rien changer ne doit pas s'attribuer le tarif de
          -- quelqu'un d'autre.
          SET prix_c = EXCLUDED.prix_c,
              par    = CASE WHEN prix_borne.prix_c = EXCLUDED.prix_c
                            THEN prix_borne.par ELSE EXCLUDED.par END,
              pose_le = CASE WHEN prix_borne.prix_c = EXCLUDED.prix_c
                             THEN prix_borne.pose_le ELSE now() END`,
        [id, produit_id, prix, u.nom ?? u.email]);
    }

    const propres = (await c.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM prix_borne WHERE borne_id = $1", [id])).rows[0].n;
    return { propres: Number(propres), refuses };
  });

  if (!bilan) return versPage(req, "/bornes");

  // Un prix change est la chose qu'on veut voir appliquee tout de suite : on ne
  // laisse pas la machine vendre au tarif de la veille pendant cinq minutes.
  await reveiller(id, "prix modifiés");

  const suite = f.get("action") === "aligner" ? "aligne" : "ok";
  return versPage(req, `${RETOUR}?fait=${suite}&n=${bilan.propres}`
                       + (bilan.refuses > 0 ? `&refuses=${bilan.refuses}` : ""));
}
