import { q, q1, transaction } from "@/db";
import { APK } from "./apk";
import { anterieureA, comparerVersions } from "./borne";

/**
 * LES ORDRES DONNES A UNE MACHINE (table `ordre_borne`).
 *
 * La borne les prend a sa synchronisation, les execute sur son propre fil et
 * en remonte l'issue au releve suivant.
 *
 * - `reset_paiement` : reinitialiser le terminal de paiement (5.15).
 * - `mise_a_jour` : installer l'APK publie (5.17). `cible` garde la version
 *   visee. La borne ne remonte que ses echecs : en cas de succes Android
 *   remplace son processus, et c'est la version du releve suivant qui
 *   confirme l'ordre (`confirmerMisesAJour`).
 */
export type Genre = "reset_paiement" | "mise_a_jour";

export type Ordre = {
  id: number; genre: Genre; par: string | null; cible: string | null;
  demande_le: Date; execute_le: Date | null; ok: boolean | null; detail: string | null;
};

/** Passe ce delai, un ordre sans reponse n'est plus presente a la machine. */
export const ORDRE_VALIDITE_MIN = 10;

/** La premiere application qui sait recevoir un ordre. */
export const VERSION_ORDRES = "5.15";

export function saitRecevoirDesOrdres(version: string | null | undefined): boolean {
  return !anterieureA(version, 5, 15);
}

/** La premiere application qui sait se mettre a jour seule. */
export const VERSION_MISE_A_JOUR = "5.17";

export function saitSeMettreAJour(version: string | null | undefined): boolean {
  return !anterieureA(version, 5, 17);
}

/** Une version plus recente que celle de la machine est publiee. */
export function miseAJourDisponible(version: string | null | undefined): boolean {
  return comparerVersions(version, APK.version) < 0;
}

/**
 * Ce qui empeche la mise a jour a distance, ou null si elle est possible.
 * `sante.proprietaire` n'existe qu'a partir de la 5.17 : absent, on ne sait pas.
 */
export function empechementMiseAJour(b: { jeton: string | null; version: string | null;
                                          sante: { proprietaire?: unknown } | null }): string | null {
  if (!b.jeton) return "machine non appairée";
  if (!miseAJourDisponible(b.version)) return "déjà à jour";
  if (!saitSeMettreAJour(b.version)) return `la ${VERSION_MISE_A_JOUR} s’installe une dernière fois à la main`;
  if (b.sante?.proprietaire === false) return "la machine n’est pas propriétaire de l’appareil";
  return null;
}

const VIF = `execute_le IS NULL AND demande_le > now() - interval '${ORDRE_VALIDITE_MIN} minutes'`;

/** Ce que la borne doit encore faire. */
export async function ordresPour(borne_id: number): Promise<Record<string, unknown>[]> {
  const ordres = await q<{ id: number; genre: Genre }>(
    `SELECT id, genre FROM ordre_borne WHERE borne_id = $1 AND ${VIF} ORDER BY id`, [borne_id]);
  // La mise a jour part avec l'APK publie au moment ou la borne la lit.
  return ordres.map(o => o.genre === "mise_a_jour"
    ? { ...o, version: APK.version, version_code: APK.version_code, url: APK.fichier,
        taille: APK.taille, sha256: APK.sha256 }
    : o);
}

/**
 * La machine annonce `version` : les mises a jour en attente qui visaient
 * cette version ou une plus ancienne sont faites. Sans limite de validite :
 * une installation reussie apres dix minutes reste une reussite.
 */
export async function confirmerMisesAJour(borne_id: number, version: string | null | undefined,
                                          executer: (sql: string, p: unknown[]) => Promise<unknown> = q) {
  // La requete lit « majeure.mineure » en entiers : une version d'une autre
  // forme ferait echouer le cast, et avec lui le releve qui l'appelle.
  if (typeof version !== "string" || !/^\d+\.\d+/.test(version)) return;
  await executer(`
    UPDATE ordre_borne SET execute_le = now(), ok = true, detail = 'installée : ' || $2
     WHERE borne_id = $1 AND genre = 'mise_a_jour' AND execute_le IS NULL
       AND demande_le > now() - interval '1 day'
       AND split_part(cible, '.', 1)::int * 1000 + split_part(cible, '.', 2)::int
        <= split_part($2, '.', 1)::int * 1000 + split_part($2, '.', 2)::int`,
    [borne_id, version]);
}

/** Le dernier ordre de ce genre, pour dire ou il en est. */
export function dernierOrdre(borne_id: number, genre: Genre): Promise<Ordre | null> {
  return q1<Ordre>(`
    SELECT id, genre, par, cible, demande_le, execute_le, ok, detail FROM ordre_borne
     WHERE borne_id = $1 AND genre = $2 ORDER BY id DESC LIMIT 1`, [borne_id, genre]);
}

/** Encore attendu par la machine ? Faux s'il a expire sans reponse. */
export function enAttente(o: Ordre | null): boolean {
  return !!o && o.execute_le === null
      && Date.now() - new Date(o.demande_le).getTime() < ORDRE_VALIDITE_MIN * 60_000;
}

/**
 * Donne un ordre. Rend null s'il y en a deja un en attente : deux
 * reinitialisations de suite feraient repartir de zero un terminal qui
 * redemarre, et il ne finirait jamais de revenir.
 */
export async function donnerOrdre(borne_id: number, genre: Genre,
                                  par: { id: number; nom: string }): Promise<number | null> {
  const cible = genre === "mise_a_jour" ? APK.version : null;
  // LE DOUBLE CLIC. Deux requetes simultanees voyaient toutes deux « rien en
  // attente » et inseraient chacune leur ordre. Le verrou par borne les met en
  // file ; la seconde voit alors la premiere. Pas d'index unique : un ordre
  // expire garde `execute_le` NULL pour toujours et bloquerait les suivants.
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(4243, $1::int)", [borne_id]);
    const l = (await c.query<{ id: number }>(`
      INSERT INTO ordre_borne (borne_id, genre, par_id, par, cible)
      SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (SELECT 1 FROM ordre_borne WHERE borne_id = $1 AND genre = $2 AND ${VIF})
      RETURNING id`, [borne_id, genre, par.id, par.nom, cible])).rows[0];
    return l?.id ?? null;
  });
}
