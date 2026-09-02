import { createHash } from "node:crypto";
import { q, transaction } from "@/db";
import { peutConfigurer, utilisateurDe, versPage, estRestreint } from "@/lib/auth";
import { reveillerLeCompte } from "@/lib/borne";
import { TAILLE_MAX, TYPES } from "@/lib/pub";
import { oterIllustration, poserIllustration } from "@/lib/illustration";

export const dynamic = "force-dynamic";

const RETOUR = "/reglages/pub";

/** Une date de formulaire vide vaut « pas de limite », pas « le 1er janvier ». */
function date(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  // Le compte n'est pas le sien : une portee par borne ne donne pas la main
  // sur le catalogue, le depot ou le parc de l'exploitant.
  if (estRestreint(u)) return versPage(req, "/reglages/pub");
  if (!peutConfigurer(u)) return versPage(req, "/reglages");
  const f = await req.formData();

  // ── L'illustration d'un ecran de la borne ─────────────────────────────────
  //
  // Poser un fichier remplace l'animation dessinee ; le retirer la rend. Le
  // defaut n'est pas une valeur enregistree, c'est l'absence de ligne — on ne
  // peut donc pas se retrouver avec un ecran « configure pour ne rien montrer ».
  const ecran = String(f.get("ecran") ?? "");
  if (ecran) {
    if (f.get("oter") !== null) {
      await oterIllustration(u.compte_id, ecran);
      await reveillerLeCompte(u.compte_id, "illustration modifiée");
      return versPage(req, `${RETOUR}?fait=retire`);
    }
    const fichier = f.get("illustration");
    if (!(fichier instanceof File) || fichier.size === 0) return versPage(req, `${RETOUR}?e=vide`);
    const souci = await poserIllustration(u.compte_id, ecran, fichier);
    if (souci) return versPage(req, `${RETOUR}?e=${souci}`);
    await reveillerLeCompte(u.compte_id, "illustration modifiée");
    return versPage(req, `${RETOUR}?fait=enregistre`);
  }

  // ── Suspendre ou reprendre une playlist ───────────────────────────────────
  //
  // L'action reversible d'un seul clic, sans passer par l'enregistrement de tout
  // le formulaire. Arreter une campagne du jour au lendemain ne devrait jamais
  // obliger a la re-televerser la semaine suivante : on la met en pause, les
  // fichiers restent, les dates restent, les bornes restent.
  const aBasculer = Number(f.get("basculer"));
  if (Number.isInteger(aBasculer) && aBasculer > 0) {
    const r = await q<{ actif: boolean }>(
      "UPDATE playlist SET actif = NOT actif WHERE id = $1 AND compte_id = $2 RETURNING actif",
      [aBasculer, u.compte_id]);
    await reveillerLeCompte(u.compte_id, "publicité modifiée");
    return versPage(req, `${RETOUR}?fait=${r[0]?.actif ? "repris" : "suspendu"}`);
  }

  // ── Retirer un seul media d'une playlist ──────────────────────────────────
  const mediaOte = Number(f.get("oter_media"));
  if (Number.isInteger(mediaOte) && mediaOte > 0) {
    await q(`DELETE FROM visuel v USING playlist p
              WHERE v.id = $1 AND v.playlist_id = p.id AND p.compte_id = $2`,
            [mediaOte, u.compte_id]);
    await reveillerLeCompte(u.compte_id, "publicité modifiée");
    return versPage(req, `${RETOUR}?fait=retire`);
  }

  // ── Retirer une playlist, pour de bon ─────────────────────────────────────
  //
  // Le formulaire ne poste `supprimer` qu'apres etre passe par l'ecran de
  // confirmation (?retirer=<id>). Des fichiers televerses ne doivent pas
  // disparaitre sur un clic mal place a cote de « Suspendre » : c'est
  // irreversible, la base ne garde pas les octets d'un media efface.
  const aSupprimer = Number(f.get("supprimer"));
  if (Number.isInteger(aSupprimer) && aSupprimer > 0) {
    await q("DELETE FROM playlist WHERE id = $1 AND compte_id = $2", [aSupprimer, u.compte_id]);
    await reveillerLeCompte(u.compte_id, "publicité modifiée");
    return versPage(req, `${RETOUR}?fait=supprime`);
  }

  // ── Creer une playlist, ou ajouter des medias a une existante ─────────────
  //
  // Une selection de douze photos fait UNE playlist de douze medias, pas douze
  // campagnes a regler une par une. C'est tout l'objet du decoupage.
  if (f.get("action") === "ajouter") {
    const proposes = f.getAll("fichier")
      .filter((x): x is File => x instanceof File && x.size > 0);
    if (proposes.length === 0) return versPage(req, `${RETOUR}?e=vide`);

    const dans = Number(f.get("dans"));         // ajouter a une playlist existante
    const versExistante = Number.isInteger(dans) && dans > 0;

    const partout = f.get("partout") !== null;
    // Ni « partout », ni une seule borne cochee : rien ne passerait nulle part
    // et rien ne le dirait. On refuse plutot que de creer un fantome.
    if (!versExistante && !partout && f.getAll("borne").length === 0) {
      return versPage(req, `${RETOUR}?e=cible`);
    }

    const duree = Number(f.get("duree_s"));
    const dureeRetenue = Number.isInteger(duree) && duree >= 2 && duree <= 60 ? duree : 7;

    let entres = 0, ignores = 0, lourds = 0;

    const issue = await transaction<string | null>(async (c) => {
      let playlist_id: number;

      if (versExistante) {
        const p = await c.query<{ id: number }>(
          "SELECT id FROM playlist WHERE id = $1 AND compte_id = $2", [dans, u.compte_id]);
        if (p.rowCount === 0) return "introuvable";
        playlist_id = p.rows[0].id;
      } else {
        const nom = String(f.get("nom") ?? "").trim().slice(0, 120)
          || (proposes.length === 1 ? proposes[0].name.slice(0, 120) : "Nouvelle playlist");
        const p = await c.query<{ id: number }>(`
          INSERT INTO playlist (compte_id, nom, ordre, partout, debut_le, fin_le)
          VALUES ($1, $2,
                  COALESCE((SELECT MAX(ordre) + 1 FROM playlist WHERE compte_id = $1), 1),
                  $3, $4, $5)
          RETURNING id`,
          [u.compte_id, nom, partout, date(f.get("debut_le")), date(f.get("fin_le"))]);
        playlist_id = p.rows[0].id;
        await cibler(c, playlist_id, u.compte_id, f.getAll("borne"));
      }

      for (const fichier of proposes) {
        const genre = TYPES[fichier.type];
        if (!genre)                     { ignores++; continue; }
        if (fichier.size > TAILLE_MAX)  { lourds++;  continue; }
        const octets = Buffer.from(await fichier.arrayBuffer());
        // La taille annoncee par le navigateur n'engage personne : on mesure.
        if (octets.length > TAILLE_MAX) { lourds++;  continue; }

        await c.query(`
          INSERT INTO visuel (compte_id, playlist_id, nom, genre, type_mime, octets,
                              taille, empreinte, duree_s, ordre)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
                  COALESCE((SELECT MAX(ordre) + 1 FROM visuel WHERE playlist_id = $2), 1))`,
          [u.compte_id, playlist_id, fichier.name.slice(0, 120), genre, fichier.type,
           octets, octets.length, createHash("sha256").update(octets).digest("hex"),
           dureeRetenue]);
        entres++;
      }

      // Une playlist neuve sans un seul media jouable n'a pas lieu d'exister :
      // la transaction la remporte avec elle.
      if (entres === 0) return lourds > 0 ? "poids" : "type";
      return null;
    });

    if (issue) return versPage(req, `${RETOUR}?e=${issue}`);
    await reveillerLeCompte(u.compte_id, "publicité modifiée");
    const sautes = ignores + lourds;
    return versPage(req, sautes > 0 ? `${RETOUR}?ignores=${sautes}` : `${RETOUR}?fait=ajoute`);
  }

  // ── Enregistrer les reglages de toutes les playlists en une passe ─────────
  //
  // On verifie AVANT d'ecrire : une playlist sans aucune borne serait invisible
  // en silence. Comme on enregistre tout d'un bloc, une seule mal ciblee refuse
  // la passe entiere — sinon on validerait des changements en en perdant un.
  const listes = await q<{ id: number }>(
    "SELECT id FROM playlist WHERE compte_id = $1", [u.compte_id]);
  for (const l of listes) {
    if (f.get(`partout_${l.id}`) === null && f.getAll(`borne_${l.id}`).length === 0) {
      return versPage(req, `${RETOUR}?e=cible`);
    }
  }

  await transaction(async (c) => {
    for (const { id } of listes) {
      const partout = f.get(`partout_${id}`) !== null;
      await c.query(`
        UPDATE playlist SET nom = COALESCE($2, nom), actif = $3, partout = $4,
                            debut_le = $5, fin_le = $6, ordre = $7
         WHERE id = $1`,
        [id,
         String(f.get(`nom_${id}`) ?? "").trim().slice(0, 120) || null,
         f.get(`actif_${id}`) !== null, partout,
         date(f.get(`debut_${id}`)), date(f.get(`fin_${id}`)),
         Number(f.get(`ordre_${id}`)) || 1]);
      await c.query("DELETE FROM playlist_borne WHERE playlist_id = $1", [id]);
      if (!partout) await cibler(c, id, u.compte_id, f.getAll(`borne_${id}`));
    }

    // Les durees, media par media. Seules les images en ont une : un film dure
    // ce qu'il dure, et le champ est desactive dans le formulaire.
    for (const [cle, valeur] of f.entries()) {
      if (!cle.startsWith("mduree_")) continue;
      const mid = Number(cle.slice(7));
      const n = Number(valeur);
      if (!Number.isInteger(mid) || !Number.isInteger(n) || n < 2 || n > 60) continue;
      await c.query(`
        UPDATE visuel v SET duree_s = $3 FROM playlist p
         WHERE v.id = $1 AND v.playlist_id = p.id AND p.compte_id = $2`,
        [mid, u.compte_id, n]);
    }
  });

  await reveillerLeCompte(u.compte_id, "publicité modifiée");
  return versPage(req, `${RETOUR}?fait=enregistre`);
}

/**
 * Le ciblage.
 *
 * On ne prend que des bornes du compte : un identifiant devine dans le
 * formulaire ne doit pas faire diffuser notre affiche chez le voisin — ni nous
 * apprendre que sa borne existe.
 */
async function cibler(
  c: { query: (t: string, v?: unknown[]) => Promise<unknown> },
  playlist_id: number, compte_id: number, brut: FormDataEntryValue[],
): Promise<void> {
  const ids = [...new Set(brut.map((v) => Number(v)).filter(Number.isInteger))];
  if (ids.length === 0) return;
  await c.query(`
    INSERT INTO playlist_borne (playlist_id, borne_id)
    SELECT $1, b.id FROM borne b
     WHERE b.compte_id = $2 AND b.id = ANY($3::bigint[])
    ON CONFLICT DO NOTHING`, [playlist_id, compte_id, ids]);
}
