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

/** Le type d'une image d'apres ses octets magiques, ou null si ce n'en est pas une acceptee. */
export function typeDesOctets(o: Uint8Array): string | null {
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return "image/jpeg";
  if (o.length >= 8 && o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47
      && o[4] === 0x0d && o[5] === 0x0a && o[6] === 0x1a && o[7] === 0x0a) return "image/png";
  const ascii = (de: number, a: number) => Buffer.from(o.subarray(de, a)).toString("latin1");
  if (o.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

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
  if (fichier.size === 0 || fichier.size > IMAGE_MAX) return null;
  const octets = Buffer.from(await fichier.arrayBuffer());
  // La taille annoncee par le navigateur n'engage personne : on mesure.
  if (octets.length === 0 || octets.length > IMAGE_MAX) return null;
  // Le type annonce non plus : un HTML deguise en « image/png » serait servi
  // tel quel. On le lit dans les premiers octets.
  const type = typeDesOctets(octets);
  if (!type) return null;

  const empreinte = createHash("sha256").update(octets).digest("hex");
  const r = await c.query<{ id: number }>(`
    INSERT INTO image (compte_id, type_mime, octets, taille, empreinte)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (compte_id, empreinte) DO UPDATE SET type_mime = EXCLUDED.type_mime
    RETURNING id`,
    [compte_id, type, octets, octets.length, empreinte]);
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
