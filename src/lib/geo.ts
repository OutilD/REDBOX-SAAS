import { q, q1 } from "@/db";

/**
 * OU EST UNE BORNE.
 *
 * L'exploitant ecrit une adresse pour l'ecran d'assistance de la machine ; la
 * carte a besoin de deux nombres. La Base Adresse Nationale fait le passage :
 * publique, gratuite, sans cle, et c'est elle qui connait le mieux les adresses
 * francaises. On lui demande UN resultat et on ne le garde que s'il est
 * plausible — « Bar du Coin » sans ville ne doit pas tomber au milieu du pays.
 */
const BAN = "https://api-adresse.data.gouv.fr/search/";
const SCORE_MIN = 0.5;
const DELAI_MS = 4000;

export type Position = { latitude: number; longitude: number; ville: string };

type Reponse = {
  features?: { geometry?: { coordinates?: [number, number] };
               properties?: { score?: number; city?: string } }[];
};

/** Jette si le geocodeur ne repond pas ; rend null s'il ne connait pas l'adresse. */
export async function situer(adresse: string): Promise<Position | null> {
  const a = adresse.trim();
  if (a.length < 3) return null;
  const r = await fetch(`${BAN}?q=${encodeURIComponent(a)}&limit=1`, {
    signal: AbortSignal.timeout(DELAI_MS), headers: { accept: "application/json" },
  });
  if (!r.ok) throw new Error(`BAN ${r.status}`);
  const j = (await r.json()) as Reponse;
  const f = j.features?.[0];
  const c = f?.geometry?.coordinates;
  // Sans ville, ce n'est pas une adresse : un lieu-dit isole, un nom de rue
  // trouve n'importe ou. On ne pose rien plutot que de poser faux.
  const ville = f?.properties?.city?.trim();
  if (!c || !ville || (f?.properties?.score ?? 0) < SCORE_MIN) return null;
  return { longitude: c[0], latitude: c[1], ville };
}

/** Une adresse proposee : ce qu'on lit dans la liste, et ou elle tombe. */
export type Suggestion = { libelle: string; ville: string; latitude: number; longitude: number };

type ReponseLarge = {
  features?: { geometry?: { coordinates?: [number, number] };
               properties?: { label?: string; city?: string } }[];
};

function lire(j: ReponseLarge): Suggestion[] {
  return (j.features ?? []).flatMap((f) => {
    const c = f.geometry?.coordinates;
    const libelle = f.properties?.label?.trim();
    const ville = f.properties?.city?.trim();
    return c && libelle && ville ? [{ libelle, ville, longitude: c[0], latitude: c[1] }] : [];
  });
}

/**
 * LES ADRESSES QUI COMMENCENT COMME CE QU'ON TAPE. Au fil de la frappe, la BAN
 * en mode `autocomplete` : « 12 rue des li » propose deja la bonne rue. Pres
 * d'un point connu, elle classe d'abord les adresses voisines. Jette si elle
 * ne repond pas.
 */
export async function suggerer(texte: string, pres?: { latitude: number; longitude: number }): Promise<Suggestion[]> {
  const a = texte.trim().slice(0, 200);
  if (a.length < 3) return [];
  const p = new URLSearchParams({ q: a, limit: "6", autocomplete: "1" });
  if (pres) { p.set("lat", String(pres.latitude)); p.set("lon", String(pres.longitude)); }
  const r = await fetch(`${BAN}?${p}`, { signal: AbortSignal.timeout(DELAI_MS), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`BAN ${r.status}`);
  return lire((await r.json()) as ReponseLarge);
}

/**
 * L'ADRESSE LA PLUS PROCHE D'UN POINT, quand on a pose la machine a la main sur
 * la carte : elle donne la ville — c'est elle qui range la machine — et une
 * adresse a proposer. Les coordonnees rendues sont celles de l'adresse, pas du
 * point : on garde le point.
 */
export async function adresseIci(latitude: number, longitude: number): Promise<Suggestion | null> {
  const p = new URLSearchParams({ lat: String(latitude), lon: String(longitude), limit: "1" });
  const r = await fetch(`https://api-adresse.data.gouv.fr/reverse/?${p}`, {
    signal: AbortSignal.timeout(DELAI_MS), headers: { accept: "application/json" },
  });
  if (!r.ok) throw new Error(`BAN ${r.status}`);
  return lire((await r.json()) as ReponseLarge)[0] ?? null;
}

/**
 * Situe une borne d'apres son adresse, si ce n'est pas deja fait pour cette
 * adresse. Ne jette jamais : la carte ne casse pas parce que le geocodeur est
 * en panne — la borne reste simplement « a situer » et on reessaiera.
 */
export async function situerBorne(id: number): Promise<void> {
  const b = await q1<{ adresse: string | null; situee_pour: string | null }>(
    "SELECT adresse, situee_pour FROM borne WHERE id = $1", [id]);
  if (!b) return;
  const adresse = (b.adresse ?? "").trim();
  if (!adresse) {
    await q("UPDATE borne SET latitude = NULL, longitude = NULL, ville = NULL, situee_pour = NULL WHERE id = $1", [id]);
    return;
  }
  if (b.situee_pour === adresse) return;
  let p: Position | null;
  try { p = await situer(adresse); }
  catch { return; }
  // `AND adresse = $4` : si l'adresse a change pendant qu'on cherchait, on ne
  // pose pas des coordonnees qui repondent a l'ancienne.
  await q(`UPDATE borne SET latitude = $2, longitude = $3, ville = $5, situee_pour = $4
            WHERE id = $1 AND adresse = $4`,
          [id, p?.latitude ?? null, p?.longitude ?? null, adresse, p?.ville ?? null]);
}

/**
 * Les bornes qui ont une adresse mais AUCUNE place sur la carte, par petits
 * lots : une page qui attend vingt geocodages ne s'ouvre plus. Le reste viendra
 * a l'ouverture suivante.
 *
 * Une machine deja placee ne bouge plus d'ici, meme si son adresse a change :
 * le client ecrit l'adresse de son ecran d'assistance, c'est le super-admin
 * qui place. Le tableau de bord de la plateforme signale l'ecart.
 */
export async function situerLesBornes(compte_id: number | null, max = 8): Promise<void> {
  const a = await q<{ id: number }>(`
    SELECT id FROM borne
     WHERE ($1::bigint IS NULL OR compte_id = $1) AND COALESCE(adresse, '') <> ''
       AND latitude IS NULL AND situee_pour IS DISTINCT FROM adresse
     ORDER BY id LIMIT $2`, [compte_id, max]);
  await Promise.all(a.map((b) => situerBorne(b.id)));
}

/** Vrai si le point tombe en France metropolitaine ou en Corse, a peu pres : une machine a l'etranger n'a rien a faire sur cette carte. */
export function dansLeCadre(latitude: number, longitude: number): boolean {
  return latitude >= 41.2 && latitude <= 51.3 && longitude >= -5.4 && longitude <= 9.9;
}
