import { q, transaction } from "@/db";
import { peutConfigurer, utilisateurDe, versPage, estRestreint } from "@/lib/auth";
import { reveillerLeCompte } from "@/lib/borne";
import { prefixeSku } from "@/lib/sku";
import { laneDe, spireValide } from "@/lib/machine";
import { balayerImages, rangerImage } from "@/lib/image";
import { CLES_PICTO } from "@/lib/pictos";
import { DESC_MAX, MENTION_MAX } from "@/lib/fiche";
// Le meme lecteur de montant que les prix par borne : « 4,50 », « 4.50 » ou
// « 4,50 € » doivent donner le meme nombre de centimes des deux cotes, sinon
// un prix general et un prix de borne s'arrondiraient differemment.
import { centimes } from "@/lib/prix";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  // Le compte n'est pas le sien : une portee par borne ne donne pas la main
  // sur le catalogue, le depot ou le parc de l'exploitant.
  if (estRestreint(u)) return versPage(req, "/reglages/catalogue");
  if (!peutConfigurer(u)) return versPage(req, "/reglages/catalogue");
  const f = await req.formData();

  const RETOUR = "/reglages/catalogue";

  // ── Supprimer un produit, quand c'est encore possible ─────────────────────
  //
  // Des qu'un produit a bouge — une reception, un transfert, une vente — le
  // supprimer trouerait le grand livre, qui est la seule verite du stock. La
  // base l'interdit d'ailleurs (mouvement.produit_id est en RESTRICT). On le dit
  // ici plutot que de laisser remonter une erreur Postgres incomprehensible, et
  // on renvoie vers la suspension, qui fait ce que la personne voulait.
  const aSupprimer = Number(f.get("supprimer"));
  if (Number.isInteger(aSupprimer) && aSupprimer > 0) {
    // On ENREGISTRE D'ABORD. Le bouton de suppression vit dans le meme
    // formulaire que les noms, les prix et l'ordre : partir directement sur la
    // suppression jetterait tout ce qui a ete modifie avant le clic.
    await enregistrer(f, u.compte_id);

    const issue = await transaction<string | null>(async (c) => {
      const mien = await c.query(
        "SELECT 1 FROM produit WHERE id = $1 AND compte_id = $2", [aSupprimer, u.compte_id]);
      if ((mien.rowCount ?? 0) === 0) return null;

      // ON RETIRE, ON N'EFFACE PAS.
      //
      // `vente.produit_id` est en ON DELETE SET NULL : supprimer un produit
      // orphelinait toutes ses ventes passees, qui devenaient « produit retire »
      // dans les statistiques. Un exploitant qui retire un article veut le sortir
      // de l'etal, pas reecrire son historique.
      //
      // Le refus « vecu » n'a donc plus lieu d'etre : un produit qui a bouge se
      // retire aussi bien qu'un autre, et il garde son passe.
      await c.query("UPDATE produit SET actif = false WHERE id = $1 AND compte_id = $2",
                    [aSupprimer, u.compte_id]);
      return null;
    });
    if (!issue) await reveillerLeCompte(u.compte_id, "catalogue modifié");
    return versPage(req, issue ? `${RETOUR}?e=${issue}` : `${RETOUR}?fait=supprime`);
  }

  // ── Enregistrer noms, prix, categories et ordre en une passe ──────────────
  if (f.get("action") === "prix") {
    await enregistrer(f, u.compte_id);
    await reveillerLeCompte(u.compte_id, "catalogue modifié");
    return versPage(req, `${RETOUR}?fait=enregistre`);
  }

  const saisi = String(f.get("sku") ?? "").trim().toUpperCase();
  const nom = String(f.get("nom") ?? "").trim();
  if (!nom) return versPage(req, `${RETOUR}?e=sku`);
  const cat = Number(f.get("categorie_id"));
  if (!Number.isInteger(cat) || cat <= 0) return versPage(req, "/reglages/catalogue?e=cat");
  // ON LE PLACE DANS LA FOULEE.
  //
  // Un produit cree sans canal n'existe pour personne : il est au catalogue,
  // il part sur les bornes, et aucune ne peut le sortir. C'etait la panne la
  // plus sournoise du systeme — tout marche, et rien n'apparait. Autant
  // demander tout de suite ou il va, pendant qu'on y pense.
  const place = String(f.get("place") ?? "");
  const souci = await transaction<string | null>(async (c) => {
    // SKU LAISSE VIDE : on le fabrique. « BAT-003 » — le rayon, puis un rang.
    // Pas derive du nom : deux parfums d'une meme puff donneraient la meme
    // reference, et deux produits ne peuvent pas la partager.
    let sku = saisi;
    if (!sku) {
      const nomCat = (await c.query<{ nom: string }>(
        "SELECT nom FROM categorie WHERE id = $1 AND compte_id = $2", [cat, u.compte_id])).rows[0];
      if (!nomCat) return "cat";
      const p = prefixeSku(nomCat.nom);
      const suite = (await c.query<{ n: number }>(`
        SELECT COALESCE(MAX(substring(sku from '[0-9]+$')::int), 0) + 1 AS n
          FROM produit
         WHERE compte_id = $1 AND sku ~ ('^' || $2 || '-[0-9]+$')`,
        [u.compte_id, p])).rows[0].n;
      sku = `${p}-${String(suite).padStart(3, "0")}`;
    }

    // La reference doit etre unique par compte. Deux ajouts simultanes peuvent
    // viser le meme rang : on avance plutot que d'echouer, mais seulement quand
    // c'est NOUS qui avons choisi le numero. Un SKU saisi a la main, lui, est
    // refuse — c'est le sien, on ne va pas lui en substituer un autre.
    let cree = null, essai = 0;
    for (;;) {
      const r = await c.query<{ id: number }>(`
        INSERT INTO produit (compte_id, sku, nom, categorie_id, prix_vente_c, age_min, ordre)
        SELECT $1,$2,$3, cat.id, $5, $6,
               COALESCE((SELECT MAX(p.ordre) + 10 FROM produit p
                          WHERE p.compte_id = $1 AND p.categorie_id = $4), 10)
          FROM categorie cat WHERE cat.id = $4 AND cat.compte_id = $1
        ON CONFLICT (compte_id, sku) DO NOTHING
        RETURNING id`,
        [u.compte_id, sku, nom, cat,
         centimes(String(f.get("prix") ?? "")) ?? 0, Number(f.get("age_min") ?? 0)]);
      if ((r.rowCount ?? 0) > 0) { cree = r.rows[0]; break; }
      if (saisi || ++essai > 20) return "sku";
      const base = sku.replace(/-\d+$/, "");
      const n = Number(sku.slice(base.length + 1)) + 1;
      sku = `${base}-${String(n).padStart(3, "0")}`;
    }
    const produit_id = cree.id;

    // « canal:<id> » — une spire deja connue et libre.
    if (place.startsWith("canal:")) {
      await c.query(`
        UPDATE canal SET produit_id = $1
          FROM borne b
         WHERE canal.id = $2 AND canal.borne_id = b.id AND b.compte_id = $3
           AND canal.produit_id IS NULL`,
        [produit_id, Number(place.slice(6)), u.compte_id]);
      return null;
    }

    // « neuf:<borne> » — une spire que le SaaS ne connaissait pas encore.
    if (place.startsWith("neuf:")) {
      const rangee = Number(f.get("rangee")), colonne = Number(f.get("colonne"));
      if (!spireValide(rangee, colonne)) return "place";
      await c.query(`
        INSERT INTO canal (borne_id, lane, rangee, colonne, produit_id, quantite, capacite, seuil_bas)
        SELECT b.id, $2, $3, $4, $5, 0, 10, 2 FROM borne b
         WHERE b.id = $1 AND b.compte_id = $6
        ON CONFLICT (borne_id, lane) DO UPDATE
          SET produit_id = COALESCE(canal.produit_id, EXCLUDED.produit_id)`,
        [Number(place.slice(5)), laneDe(rangee, colonne), rangee, colonne,
         produit_id, u.compte_id]);
      return null;
    }

    return null;
  });

  if (souci) return versPage(req, `${RETOUR}?e=${souci}`);
  // Un produit ajoute change ce que les bornes doivent vendre.
  await reveillerLeCompte(u.compte_id, "catalogue modifié");
  return versPage(req, `${RETOUR}?fait=${place ? "place" : "ajoute"}`);
}

/**
 * Une seule passe pour tout ce qui se regle en liste : nom, prix, categorie,
 * ordre, et le fait d'etre propose ou non.
 *
 * Chaque requete porte `compte_id` : un identifiant devine dans le formulaire ne
 * doit toucher aucune ligne. C'est la garde la moins couteuse et la plus facile
 * a oublier.
 */
async function enregistrer(f: FormData, compte_id: number): Promise<void> {
  await transaction(async (c) => {
    for (const [cle, valeur] of f.entries()) {
      if (cle.startsWith("prix_")) {
        const n = centimes(String(valeur));
        if (n === null) continue;
        await c.query("UPDATE produit SET prix_vente_c = $1 WHERE id = $2 AND compte_id = $3",
                      [n, Number(cle.slice(5)), compte_id]);
      } else if (cle.startsWith("pnom_")) {
        const nom = String(valeur).trim().slice(0, 120);
        if (!nom) continue;   // un nom vide effacerait l'identite du produit
        await c.query("UPDATE produit SET nom = $1 WHERE id = $2 AND compte_id = $3",
                      [nom, Number(cle.slice(5)), compte_id]);
      } else if (cle.startsWith("desc_")) {
        // LA FICHE PEUT ETRE VIDEE. Un texte efface est une intention : on ne
        // garde pas une description dont l'exploitant ne veut plus.
        const t = String(valeur).trim().slice(0, DESC_MAX);
        await c.query("UPDATE produit SET description = $1 WHERE id = $2 AND compte_id = $3",
                      [t || null, Number(cle.slice(5)), compte_id]);
      } else if (cle.startsWith("ment_")) {
        const t = String(valeur).trim().slice(0, MENTION_MAX);
        await c.query("UPDATE produit SET mention = $1 WHERE id = $2 AND compte_id = $3",
                      [t || null, Number(cle.slice(5)), compte_id]);
      } else if (cle.startsWith("pfiche_")) {
        // LE « I » DE LA CARTE. Comme `pactif_`, il arrive en champ cache et non
        // en case a cocher : une case decochee n'envoie rien, et cette boucle ne
        // touche que ce qu'elle recoit — le bouton n'aurait jamais pu s'eteindre.
        await c.query("UPDATE produit SET fiche_visible = $1 WHERE id = $2 AND compte_id = $3",
                      [String(valeur) === "1", Number(cle.slice(7)), compte_id]);
      } else if (cle.startsWith("pord_")) {
        const n = Number(valeur);
        if (!Number.isInteger(n)) continue;
        await c.query("UPDATE produit SET ordre = $1 WHERE id = $2 AND compte_id = $3",
                      [n, Number(cle.slice(5)), compte_id]);
      } else if (cle.startsWith("pactif_")) {
        await c.query("UPDATE produit SET actif = $1 WHERE id = $2 AND compte_id = $3",
                      [String(valeur) === "1", Number(cle.slice(7)), compte_id]);
      } else if (cle.startsWith("img_") && valeur instanceof File && valeur.size > 0) {
        const img = await rangerImage(c, compte_id, valeur);
        if (img !== null) {
          await c.query("UPDATE produit SET image_id = $1 WHERE id = $2 AND compte_id = $3",
                        [img, Number(cle.slice(4)), compte_id]);
        }
      } else if (cle.startsWith("imgoter_")) {
        await c.query("UPDATE produit SET image_id = NULL WHERE id = $1 AND compte_id = $2",
                      [Number(cle.slice(8)), compte_id]);
      } else if (cle.startsWith("icone_")) {
        const k = String(valeur);
        await c.query("UPDATE produit SET icone = $1 WHERE id = $2 AND compte_id = $3",
                      [CLES_PICTO.has(k) ? k : null, Number(cle.slice(6)), compte_id]);
      } else if (cle.startsWith("cat_")) {
        // La categorie doit etre du compte : un identifiant devine ne doit pas
        // ranger notre produit dans le classement du voisin.
        await c.query(`
          UPDATE produit SET categorie_id = (
            SELECT id FROM categorie WHERE id = $1 AND compte_id = $2)
           WHERE id = $3 AND compte_id = $2`,
          [Number(valeur) || null, compte_id, Number(cle.slice(4))]);
      }
    }
    // Ce que plus rien ne designe quitte la base : remplacer dix fois une photo
    // ne doit pas laisser neuf images mortes.
    await balayerImages(c, compte_id);
  });
}
