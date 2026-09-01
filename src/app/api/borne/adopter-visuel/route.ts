import { createHash } from "node:crypto";
import { q1, transaction } from "@/db";
import { parJeton } from "@/lib/borne";
import { TAILLE_MAX, TYPES } from "@/lib/pub";

export const dynamic = "force-dynamic";

/**
 * LA BORNE REND CE QU'ELLE PORTE.
 *
 * Appelee uniquement quand le compte n'a AUCUNE playlist. Une machine qui change
 * de mains arrive chargee : ses affiches sont deja la, sur son disque. Obliger le
 * nouveau proprietaire a retrouver douze fichiers et a les retelverser un par un
 * serait absurde — et la plupart du temps il ne les a pas.
 *
 * Le corps est le fichier BRUT ; les metadonnees voyagent en en-tetes. Pas de
 * multipart : cote Android, ecrire un encodeur multipart a la main pour un seul
 * fichier ajoute cinquante lignes et autant d'occasions de se tromper.
 *
 * IDEMPOTENTE PAR L'EMPREINTE. La borne peut rejouer son lot entier apres une
 * coupure : un contenu deja present n'entre pas deux fois. Et l'empreinte est
 * RECALCULEE ici — celle annoncee par la machine ne sert qu'a se reconnaitre,
 * jamais a nommer ce qu'on stocke.
 */
function decoder(brut: string): string {
  try { return decodeURIComponent(brut.replace(/\+/g, "%20")).trim(); }
  catch { return brut.trim(); }
}

export async function POST(req: Request) {
  const borne = await parJeton(req.headers);
  if (!borne || !borne.compte_id) return Response.json({ erreur: "jeton invalide" }, { status: 401 });

  // On ne prend QUE d'une machine dont le compte n'a rien : sans cette porte,
  // une borne pourrait injecter des visuels dans un catalogue publicitaire deja
  // constitue, et le proprietaire verrait apparaitre des affiches qu'il n'a
  // jamais choisies.
  // On ignore la playlist nee de CETTE reprise : sans quoi le premier fichier
  // du lot la creerait, et le deuxieme se verrait refuser au motif que le compte
  // n'est plus vierge. Une machine ne rendrait jamais qu'une seule affiche.
  const dejaPourvu = await q1<{ n: number }>(`
    SELECT COUNT(*)::int n FROM playlist
     WHERE compte_id = $1 AND (reprise_de IS NULL OR reprise_de <> $2)`,
    [borne.compte_id, borne.id]);
  if ((dejaPourvu?.n ?? 0) > 0) return Response.json({ ignore: "compte deja pourvu" });

  const type = req.headers.get("x-type") ?? "";
  const genre = TYPES[type];
  if (!genre) return Response.json({ erreur: "type refuse" }, { status: 415 });

  const octets = Buffer.from(await req.arrayBuffer());
  if (octets.length === 0) return Response.json({ erreur: "corps vide" }, { status: 400 });
  if (octets.length > TAILLE_MAX) return Response.json({ erreur: "trop lourd" }, { status: 413 });

  const empreinte = createHash("sha256").update(octets).digest("hex");
  // Le nom voyage encode : les en-tetes HTTP ne prennent que de l'ASCII, et un
  // fichier s'appelle « Promo été.jpg ». Android encode en form-urlencoded, ou
  // l'espace est un « + » — que decodeURIComponent ne rend pas. D'ou les deux
  // temps. Un en-tete malforme ne doit pas faire tomber la reprise : on retombe
  // sur le brut.
  const nom = decoder(req.headers.get("x-nom") ?? "").slice(0, 120)
              || `Visuel ${empreinte.slice(0, 8)}`;
  const d = Number(req.headers.get("x-duree"));
  const duree_s = Number.isInteger(d) && d >= 2 && d <= 60 ? d : 7;

  const bilan = await transaction(async (c) => {
    // Deja la ? On n'ajoute rien. La borne peut renvoyer son lot sans compter.
    const vu = await c.query(
      "SELECT 1 FROM visuel WHERE compte_id = $1 AND empreinte = $2", [borne.compte_id, empreinte]);
    if ((vu.rowCount ?? 0) > 0) return { adopte: false };

    // Une seule playlist de reprise, creee au premier fichier puis retrouvee.
    let liste = (await c.query<{ id: number }>(
      "SELECT id FROM playlist WHERE compte_id = $1 AND reprise_de = $2",
      [borne.compte_id, borne.id])).rows[0];
    if (!liste) {
      liste = (await c.query<{ id: number }>(`
        INSERT INTO playlist (compte_id, nom, ordre, partout, reprise_de)
        VALUES ($1, $2, 1, FALSE, $3) RETURNING id`,
        [borne.compte_id, `Repris de ${borne.nom}`, borne.id])).rows[0];
      // Elle ne vise QUE cette borne : ce sont ses affiches a elle. Les etendre
      // d'office a tout le parc serait decider a la place du proprietaire.
      await c.query("INSERT INTO playlist_borne (playlist_id, borne_id) VALUES ($1,$2)",
                    [liste.id, borne.id]);
    }

    await c.query(`
      INSERT INTO visuel (compte_id, playlist_id, nom, genre, type_mime, octets,
                          taille, empreinte, duree_s, ordre)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
              COALESCE((SELECT MAX(ordre) + 1 FROM visuel WHERE playlist_id = $2), 1))`,
      [borne.compte_id, liste.id, nom, genre, type, octets, octets.length, empreinte, duree_s]);
    return { adopte: true };
  });

  return Response.json(bilan);
}
