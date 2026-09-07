/**
 * Les journaux que la borne recopie ici, et comment on les lit.
 *
 * Deux fichiers, deux formes :
 *
 *   commandes    1757026620123|VEND_END|order=ORD-52E3AF3F|idx=0|outcome=NO_DROP_DETECTED|drop=false
 *                l'instant en millisecondes, le type, puis des champs cle=valeur.
 *                Il est ecrit avant chaque geste irreversible et jamais purge : c'est
 *                la piece a produire quand un client conteste.
 *
 *   diagnostic   09-05 00:43:52.118  RX  AA 0B 03 01 20 00 ... 55   reponse finale OK canal 32 chute=false
 *                mois-jour et heure locale, SANS l'annee, puis le texte. C'est la
 *                trace technique ; la borne la plafonne a 512 Ko et n'en garde donc
 *                qu'une ou deux heures. Ici on la garde soixante jours.
 *
 * On ne transforme rien : la ligne est stockee telle quelle, et on en extrait
 * seulement de quoi la retrouver — quand, et pour quelle commande.
 */

export const SOURCES = ["commandes", "diagnostic"] as const;
export type Source = (typeof SOURCES)[number];

export function estSource(s: unknown): s is Source {
  return typeof s === "string" && (SOURCES as readonly string[]).includes(s);
}

export const NOM_SOURCE: Record<Source, string> = {
  commandes:  "Commandes",
  diagnostic: "Diagnostic",
};

/** Le numero de commande que porte la ligne, s'il y en a un. */
export function commandeDe(ligne: string): string | null {
  const m = /ORD-[0-9A-Z]{8}/.exec(ligne);
  return m ? m[0] : null;
}

/** Le fuseau que la borne annonce, ou Paris si elle n'en annonce pas un valable. */
export function fuseauValide(tz: unknown): string {
  if (typeof tz === "string" && tz.length <= 64) {
    try { new Intl.DateTimeFormat("fr-FR", { timeZone: tz }); return tz; } catch { /* invalide */ }
  }
  return "Europe/Paris";
}

/**
 * L'instant d'une ligne, sous une forme que Postgres saura convertir.
 *
 *  - commandes : le nombre de millisecondes, tel quel (`to_timestamp(x / 1000.0)`).
 *  - diagnostic : « AAAA-MM-JJ HH:MM:SS.mmm » en heure locale de la borne, a
 *    interpreter dans son fuseau (`::timestamp AT TIME ZONE tz`). L'annee n'est pas
 *    dans la ligne : on prend celle d'aujourd'hui, ou la precedente si la date
 *    serait sinon dans le futur — le journal ne parle jamais de demain.
 *
 * `null` quand la ligne ne commence pas par un horodatage (ligne de troncature,
 * suite d'une ligne coupee).
 */
export function quandDe(source: Source, ligne: string, aujourdhui: { annee: number; mois: number; jour: number }): string | null {
  if (source === "commandes") {
    const m = /^(\d{12,14})\|/.exec(ligne);
    return m ? m[1] : null;
  }
  const m = /^(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})\s/.exec(ligne);
  if (!m) return null;
  const mois = Number(m[1]), jour = Number(m[2]);
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  let annee = aujourdhui.annee;
  // Plus d'un jour dans le futur : c'est l'annee derniere.
  if (mois > aujourdhui.mois || (mois === aujourdhui.mois && jour > aujourdhui.jour + 1)) annee--;
  return `${annee}-${m[1]}-${m[2]} ${m[3]}:${m[4]}:${m[5]}.${m[6]}`;
}

/** La date du jour dans un fuseau donne, pour dater les lignes qui n'ont pas d'annee. */
export function aujourdhuiDans(tz: string): { annee: number; mois: number; jour: number } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date())) p[x.type] = x.value;
  return { annee: Number(p.year), mois: Number(p.month), jour: Number(p.day) };
}

/** Le texte d'une ligne, sans son horodatage : ce qu'on affiche a cote de l'heure. */
export function texteDe(source: Source, ligne: string): string {
  if (source === "commandes") {
    const i = ligne.indexOf("|");
    return i >= 0 && /^\d{12,14}$/.test(ligne.slice(0, i)) ? ligne.slice(i + 1) : ligne;
  }
  const m = /^\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\s+/.exec(ligne);
  return m ? ligne.slice(m[0].length) : ligne;
}

/** Combien de temps on garde la trace technique. Les commandes, elles, restent. */
export const RETENTION_DIAGNOSTIC_JOURS = 60;
