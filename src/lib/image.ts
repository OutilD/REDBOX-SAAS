import { createHash } from "node:crypto";
import type { PgClient } from "@/db";

/**
 * LES IMAGES DU CATALOGUE.
 *
 * Le navigateur les reduisait avant l'envoi : deux megaoctets suffisaient donc
 * largement, une photo de telephone arrivant a cent kilo-octets. On ne les
 * touche plus — ni rognage ni reencodage — et c'est le fichier d'origine qui
 * monte. Le plafond suit, sinon la moitie des photos serait refusee.
 *
 * IL RESTE UN PLAFOND, et bas pour ce que peut peser une photo moderne : ces
 * images partent sur CHAQUE borne, par la 4G d'une cave, et la machine doit
 * pouvoir les afficher instantanement une fois en cache. Un fichier de vingt
 * megaoctets ferait la meme vignette, en trente fois plus lourd sur le reseau.
 */
export const IMAGE_MAX = 8 * 1024 * 1024;

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

/**
 * Range une image et rend son identifiant.
 *
 * DEDOUBLONNEE PAR L'EMPREINTE : reposer la meme photo sur un deuxieme produit
 * ne stocke rien de plus et ne fait rien retelecharger a la borne, dont le cache
 * est lui aussi nomme par l'empreinte. C'est le meme principe que la publicite,
 * et il vaut ici pour la meme raison.
 *
 * Rend `null` si le fichier est refuse — mauvais format, vide, ou trop lourd —
 * pour que l'appelant decide quoi en dire.
 */
export async function rangerImage(
  c: PgClient, compte_id: number, fichier: File,
): Promise<number | null> {
  if (!IMAGE_TYPES[fichier.type] || fichier.size === 0 || fichier.size > IMAGE_MAX) return null;
  const octets = Buffer.from(await fichier.arrayBuffer());
  // La taille annoncee par le navigateur n'engage personne : on mesure.
  if (octets.length === 0 || octets.length > IMAGE_MAX) return null;

  const empreinte = createHash("sha256").update(octets).digest("hex");
  const r = await c.query<{ id: number }>(`
    INSERT INTO image (compte_id, type_mime, octets, taille, empreinte)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (compte_id, empreinte) DO UPDATE SET type_mime = EXCLUDED.type_mime
    RETURNING id`,
    [compte_id, fichier.type, octets, octets.length, empreinte]);
  return r.rows[0].id;
}

/**
 * LE BALAYAGE N'EFFACE PLUS RIEN.
 *
 * Il supprimait les images que plus aucune fiche ne designait — « sans ce menage,
 * remplacer dix fois la photo d'un produit laisse neuf images mortes dans une
 * base ou l'on paie l'octet ». Le raisonnement etait juste et la consequence
 * mauvaise : il suffisait d'oublier un porteur dans sa liste de garde pour
 * effacer des photos vivantes, silencieusement, au premier changement de
 * catalogue venu. Ca m'est arrive avec les bornes, puis avec les portraits.
 *
 * Une base ne doit pas supprimer de donnees saisies par l'exploitant. On garde
 * donc l'appel — les vingt endroits qui l'invoquent n'ont pas a le savoir — et
 * il ne fait plus rien. Le poids des images mortes est un probleme de facture,
 * pas de correction : il se traitera par un inventaire qu'on REGARDE avant
 * d'effacer, jamais par un effacement automatique.
 */
export async function balayerImages(_c: PgClient, _compte_id: number): Promise<void> {
  return;
}
