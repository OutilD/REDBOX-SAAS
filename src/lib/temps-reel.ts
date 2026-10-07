import { createHash, createHmac } from "node:crypto";

/**
 * LE TEMPS REEL DE LA MESSAGERIE, PAR PUSHER CHANNELS.
 *
 * Vercel ne tient pas de connexion ouverte : un service tiers le fait. On n'y
 * envoie AUCUN contenu, seulement un signal « le salon 12 a bouge » sur un
 * canal prive. Le navigateur qui le recoit relit le salon par /api/messages,
 * qui garde tous les controles d'acces. Le sondage reste en secours, lent.
 *
 * Les bornes l'ecoutent aussi (voir `canalDeBorne`) : c'est ce qui remplace
 * l'attente longue, qui gardait une fonction Vercel et la base eveillees.
 *
 * Sans les quatre variables, rien ne part et le fil sonde comme avant :
 *   PUSHER_APP_ID, PUSHER_SECRET, NEXT_PUBLIC_PUSHER_KEY, NEXT_PUBLIC_PUSHER_CLUSTER
 */
const APP = process.env.PUSHER_APP_ID;
const SECRET = process.env.PUSHER_SECRET;
const CLE = process.env.NEXT_PUBLIC_PUSHER_KEY;
const GRAPPE = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

export const tempsReelActif = Boolean(APP && SECRET && CLE && GRAPPE);

export const canalDuSalon = (salon_id: number) => `private-salon-${salon_id}`;

/** Le numero du salon d'un nom de canal, ou null si ce n'en est pas un. */
export function salonDuCanal(canal: string): number | null {
  const m = /^private-salon-(\d+)$/.exec(canal);
  return m ? Number(m[1]) : null;
}

/** Previent les navigateurs ouverts sur ces salons. Ne leve jamais : le sondage rattrape. */
export async function annoncer(salon_ids: number[]): Promise<void> {
  const propres = [...new Set(salon_ids)].filter(Number.isInteger);
  await diffuser("maj", propres.map(canalDuSalon));
}

/**
 * LE CANAL D'UNE BORNE : public, mais introuvable sans le secret.
 *
 * La borne n'a ni session ni cookie pour un canal prive, et ce qui y passe ne
 * dit rien — « reveille-toi », sans contenu. La borne relit tout par
 * /api/borne/etat, avec son jeton. Un canal public au nom signe suffit.
 */
export function canalDeBorne(borne_id: number): string {
  return `borne-${createHmac("sha256", SECRET ?? "").update(`borne:${borne_id}`).digest("hex").slice(0, 32)}`;
}

/** Ce que la borne doit savoir pour ecouter son canal, ou null sans temps reel. */
export function tempsReelDeBorne(borne_id: number): { cle: string; grappe: string; canal: string } | null {
  return tempsReelActif ? { cle: CLE!, grappe: GRAPPE!, canal: canalDeBorne(borne_id) } : null;
}

/**
 * Reveille ces bornes tout de suite. Ne leve jamais : la borne qui rate le
 * signal le rattrape a son echange de routine, ou par l'attente longue.
 */
export async function pousserBornes(borne_ids: number[]): Promise<void> {
  const propres = [...new Set(borne_ids)].filter(Number.isInteger);
  await diffuser("reveil", propres.map(canalDeBorne));
}

async function diffuser(evenement: string, canaux: string[]): Promise<void> {
  if (!tempsReelActif || canaux.length === 0) return;
  // Pusher accepte cent canaux par evenement.
  for (let i = 0; i < canaux.length; i += 100) {
    const lot = canaux.slice(i, i + 100);
    const corps = JSON.stringify({ name: evenement, channels: lot, data: "{}" });
    const chemin = `/apps/${APP}/events`;
    const params = new URLSearchParams({
      auth_key: CLE!, auth_timestamp: String(Math.floor(Date.now() / 1000)), auth_version: "1.0",
      body_md5: createHash("md5").update(corps).digest("hex"),
    });
    params.sort();
    const signature = createHmac("sha256", SECRET!)
      .update(`POST\n${chemin}\n${params.toString()}`).digest("hex");
    params.set("auth_signature", signature);
    try {
      const r = await fetch(`https://api-${GRAPPE}.pusher.com${chemin}?${params}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: corps,
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) console.warn(`temps réel : Pusher répond ${r.status} ${await r.text().catch(() => "")}`);
    } catch (e) {
      console.warn("temps réel : Pusher injoignable —", e);
    }
  }
}

/** La signature qui autorise un navigateur a ecouter un canal prive. */
export function autoriser(socket_id: string, canal: string): { auth: string } | null {
  if (!tempsReelActif) return null;
  const sig = createHmac("sha256", SECRET!).update(`${socket_id}:${canal}`).digest("hex");
  return { auth: `${CLE}:${sig}` };
}
