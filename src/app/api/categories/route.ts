import { q, transaction } from "@/db";
import { peutConfigurer, utilisateurDe, versPage } from "@/lib/auth";
import { reveillerLeCompte } from "@/lib/borne";
import { balayerImages, rangerImage } from "@/lib/image";
import { CLES_PICTO } from "@/lib/pictos";

export const dynamic = "force-dynamic";

const RETOUR = "/reglages/categories";

export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutConfigurer(u)) return versPage(req, "/reglages");
  const f = await req.formData();

  // Le bouton « Supprimer » porte son identifiant : un seul formulaire, pas un
  // par ligne, et rien ne se supprime par accident en validant l'ensemble.
  //
  // ON REACTIVE AUSSI. Retirer n'efface plus rien : il faut donc pouvoir revenir
  // dessus, sans quoi « retirer » resterait une porte a sens unique — c'est-a-dire
  // une suppression avec un autre nom.
  const aRendre = Number(f.get("reactiver"));
  if (Number.isInteger(aRendre) && aRendre > 0) {
    await q("UPDATE categorie SET actif = true WHERE id = $1 AND compte_id = $2",
            [aRendre, u.compte_id]);
    await reveillerLeCompte(u.compte_id, "catégories modifiées");
    return versPage(req, `${RETOUR}?fait=rendue`);
  }

  // UNE CATEGORIE PLEINE SE RETIRE AUSSI. On refusait jusqu'ici tant qu'elle
  // portait des produits — ce qui obligeait a les reclasser un par un avant de
  // pouvoir se debarrasser d'un rangement qu'on avait cesse d'utiliser. Les
  // produits gardent maintenant leur categorie : elle disparait des listes ou
  // l'on choisit et de l'ecran de la machine, et l'historique reste lisible.
  const aSupprimer = Number(f.get("supprimer"));
  if (Number.isInteger(aSupprimer) && aSupprimer > 0) {
    const detaches = await transaction(async (c) => {
      // On verifie l'appartenance AVANT de detacher : sans ce garde, un
      // identifiant devine viderait la categorie d'un autre compte, meme si la
      // suppression qui suit ne trouvait rien.
      const mienne = await c.query(
        "SELECT 1 FROM categorie WHERE id = $1 AND compte_id = $2", [aSupprimer, u.compte_id]);
      if ((mienne.rowCount ?? 0) === 0) return -1;

      // ON LA RETIRE, ET ON NE DETACHE RIEN.
      //
      // Elle etait supprimee et ses produits detaches : deux mois de ventes
      // basculaient dans « sans categorie » pour un menage d'aujourd'hui. Les
      // produits gardent donc leur categorie — c'est ce qui rend l'historique
      // lisible — et elle disparait seulement des listes ou l'on choisit.
      await c.query("UPDATE categorie SET actif = false WHERE id = $1 AND compte_id = $2",
                    [aSupprimer, u.compte_id]);
      const d = await c.query(
        "SELECT COUNT(*)::int n FROM produit WHERE categorie_id = $1 AND compte_id = $2",
        [aSupprimer, u.compte_id]);
      return d.rows[0].n as number;
    });

    if (detaches < 0) return versPage(req, RETOUR);
    await reveillerLeCompte(u.compte_id, "catégories modifiées");
    return versPage(req, detaches > 0 ? `${RETOUR}?detaches=${detaches}` : `${RETOUR}?fait=supprime`);
  }

  if (f.get("action") === "ajouter") {
    const nom = String(f.get("nom") ?? "").trim();
    if (!nom) return versPage(req, `${RETOUR}?e=nom`);
    const ordre = Number(f.get("ordre"));
    const r = await transaction(async (c) => c.query(
      "INSERT INTO categorie (compte_id, nom, ordre) VALUES ($1,$2,$3) ON CONFLICT (compte_id, nom) DO NOTHING",
      [u.compte_id, nom, Number.isInteger(ordre) && ordre > 0 ? ordre : 100]));
    if ((r.rowCount ?? 0) > 0) await reveillerLeCompte(u.compte_id, "catégories modifiées");
    return versPage(req, r.rowCount === 0 ? `${RETOUR}?e=nom` : `${RETOUR}?fait=ajoute`);
  }

  // Les images arrivent avec le meme envoi que les noms et l'ordre : un seul
  // formulaire, un seul enregistrement. Un fichier vide ne veut rien dire —
  // le navigateur en envoie un pour chaque champ non rempli — donc on ne touche
  // a l'image que si quelque chose a reellement ete choisi.
  await transaction(async (c) => {
    for (const [cle, valeur] of f.entries()) {
      if (cle.startsWith("img_") && valeur instanceof File && valeur.size > 0) {
        const id = await rangerImage(c, u.compte_id, valeur);
        if (id !== null) {
          await c.query("UPDATE categorie SET image_id = $1 WHERE id = $2 AND compte_id = $3",
                        [id, Number(cle.slice(4)), u.compte_id]);
        }
      } else if (cle.startsWith("imgoter_")) {
        await c.query("UPDATE categorie SET image_id = NULL WHERE id = $1 AND compte_id = $2",
                      [Number(cle.slice(8)), u.compte_id]);
      } else if (cle.startsWith("icone_")) {
        // On ne retient qu'une cle connue : une valeur inventee dans le
        // formulaire ne doit pas se retrouver en base, ou la machine chercherait
        // un dessin qui n'existe pas.
        const k = String(valeur);
        await c.query("UPDATE categorie SET icone = $1 WHERE id = $2 AND compte_id = $3",
                      [CLES_PICTO.has(k) ? k : null, Number(cle.slice(6)), u.compte_id]);
      }
    }
    await balayerImages(c, u.compte_id);
  });

  // Renommage et reordonnancement en une passe.
  const souci = await transaction<string | null>(async (c) => {
    for (const [cle, valeur] of f.entries()) {
      const id = Number(cle.slice(2));
      if (!Number.isInteger(id) || id <= 0) continue;
      if (cle.startsWith("n_")) {
        const nom = String(valeur).trim();
        if (!nom) return "nom";
        // On verifie AVANT d'ecrire. Dans une transaction Postgres, une erreur
        // n'est pas rattrapable : elle abandonne toute la transaction, et les
        // requetes suivantes echouent en cascade. Un `catch` autour d'un UPDATE
        // ne sauve rien, il masque juste ou ca a casse.
        const pris = await c.query(
          "SELECT 1 FROM categorie WHERE compte_id = $1 AND lower(nom) = lower($2) AND id <> $3",
          [u.compte_id, nom, id]);
        if ((pris.rowCount ?? 0) > 0) return "nom";
        await c.query("UPDATE categorie SET nom = $1 WHERE id = $2 AND compte_id = $3",
                      [nom, id, u.compte_id]);
      } else if (cle.startsWith("o_")) {
        const n = Number(valeur);
        if (Number.isInteger(n) && n >= 1 && n <= 999)
          await c.query("UPDATE categorie SET ordre = $1 WHERE id = $2 AND compte_id = $3",
                        [n, id, u.compte_id]);
      }
    }
    return null;
  });
  // L'ordre a bouge : les bornes doivent representer leur ecran d'accueil.
  if (!souci) await reveillerLeCompte(u.compte_id, "catégories réordonnées");
  return versPage(req, souci ? `${RETOUR}?e=${souci}` : `${RETOUR}?fait=enregistre`);
}
