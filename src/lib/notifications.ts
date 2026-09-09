import webpush from "web-push";
import { codeCanal, euros, q, q1 } from "@/db";
import { deposerSysteme, type Message as MessageSalon, type Salon } from "./salons";
import { LIBELLES } from "./ventes";

/**
 * LES NOTIFICATIONS POUSSEES VERS LE TELEPHONE.
 *
 * Une borne vend a deux heures du matin, avale un paiement, se vide. La
 * console le sait a la seconde ou la machine fait son releve ; la personne qui
 * exploite, elle, ne le saura qu'en ouvrant la console — c'est-a-dire trop
 * tard pour un litige, et jamais pour une vente. Ce fichier envoie ces
 * moments-la sur les appareils qui ont demande a les recevoir.
 *
 * Trois regles :
 *
 *  1. UN RELEVE, UN MESSAGE PAR SUJET. La machine remonte ses ventes par
 *     paquets, et une nuit de bar fait trente ventes : trente notifications
 *     feraient couper le tout. On envoie « Le Duplex · 3 ventes · 38,70 € »,
 *     pas trois fois « 12,90 € ». Meme chose pour les incidents et les spires
 *     vides. Le `tag` remplace le message precedent du meme sujet sur la meme
 *     borne : l'ecran de verrouillage ne s'empile pas.
 *
 *  2. ON N'ATTEND JAMAIS L'ENVOI. Le releve d'une borne, le passage des bornes
 *     fictives : ce qui declenche a deja fini son travail et repondu. L'envoi
 *     part apres, et un echec ne remonte a personne — il se compte, et
 *     l'abonnement saute au dixieme echec de suite ou des que le service dit
 *     que l'appareil n'existe plus.
 *
 *  3. LA PORTEE EST CELLE DE LA CONSOLE. Un membre du compte recoit ce que le
 *     compte voit ; quelqu'un restreint a une borne ne recoit que celle-la.
 *     C'est `acces_borne` qui tranche, comme pour les pages.
 */

export type Genre = "ventes" | "incidents" | "vides" | "chargements" | "messages";

/** Ce qu'on peut demander, dans l'ordre ou la page le propose. */
export const GENRES: { cle: Genre; nom: string; quoi: string }[] = [
  { cle: "ventes",      nom: "Ventes",         quoi: "Chaque relevé qui apporte des ventes, avec le montant" },
  { cle: "incidents",   nom: "Incidents",      quoi: "Payé, rien n’est tombé : litige, chute non détectée, spirale bloquée" },
  { cle: "vides",       nom: "Spires vides",   quoi: "Une spire vient de vendre son dernier article" },
  { cle: "chargements", nom: "Chargements",    quoi: "La machine a confirmé un chargement saisi ici" },
  { cle: "messages",    nom: "Messages",       quoi: "Ce que l’équipe écrit dans les salons" },
];

export type Evenement =
  | { genre: "ventes";      ventes: { nom: string | null; prix_c: number; lane: number | null }[] }
  | { genre: "incidents";   incidents: { nom: string | null; prix_c: number; lane: number | null; statut: string }[] }
  | { genre: "vides";       canaux: { lane: number; nom: string | null }[] }
  | { genre: "chargements"; unites: number; spires: number };

type Message = { genre: Genre; titre: string; corps: string; url: string; tag: string };

/** Le message d'un abonnement d'essai : c'est ce qu'on voit en appuyant sur « Essayer ». */
export const ESSAI: Message = {
  genre: "ventes", titre: "RedBox · notifications activées",
  corps: "Vous recevrez ici les ventes et les incidents de vos bornes.", url: "/", tag: "essai",
};

// ---------------------------------------------------------------- les cles

type Cles = { publique: string; privee: string };
let cles: Cles | null = null;

/**
 * La paire VAPID. L'environnement d'abord ; sinon la base, ou elle est
 * generee au premier besoin. `ON CONFLICT DO NOTHING` puis relecture : deux
 * abonnements simultanes sur une base vierge ne peuvent pas faire deux paires.
 */
export async function clesVapid(): Promise<Cles> {
  if (cles) return cles;
  const pub = process.env.REDBOX_VAPID_PUBLIQUE, priv = process.env.REDBOX_VAPID_PRIVEE;
  if (pub && priv) return (cles = { publique: pub, privee: priv });
  let l = await q1<Cles>("SELECT publique, privee FROM cle_vapid WHERE id = 1");
  if (!l) {
    const k = webpush.generateVAPIDKeys();
    await q("INSERT INTO cle_vapid (id, publique, privee) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING",
            [k.publicKey, k.privateKey]);
    l = await q1<Cles>("SELECT publique, privee FROM cle_vapid WHERE id = 1");
  }
  return (cles = l!);
}

/**
 * Qui se presente au service de push. Une adresse https de la console, celle
 * que l'appareil a utilisee pour s'abonner ; a defaut — en developpement, sur
 * localhost — une adresse mailto de forme, que les services acceptent.
 */
function sujet(origine: string | null): string {
  if (process.env.REDBOX_VAPID_SUJET) return process.env.REDBOX_VAPID_SUJET;
  if (origine && origine.startsWith("https://")) return origine;
  return "mailto:redbox@localhost";
}

// ------------------------------------------------------------- les messages

/** « RedBox — Le Duplex » se dit « Le Duplex » sur un ecran de verrouillage. */
function court(nom: string): string {
  return nom.replace(/^\s*redbox\s*[—–-]\s*/i, "").trim() || nom;
}

function pluriel(n: number, un: string, des: string): string {
  return `${n} ${n > 1 ? des : un}`;
}

/** Une liste de noms qui tient dans un corps de notification. */
function liste(noms: (string | null)[], max = 110): string {
  const propres = noms.map((n) => n ?? "article");
  let s = "";
  for (let i = 0; i < propres.length; i++) {
    const suite = (s ? s + ", " : "") + propres[i];
    if (suite.length > max) { s += ` et ${propres.length - i} autre${propres.length - i > 1 ? "s" : ""}`; break; }
    s = suite;
  }
  return s;
}

const spire = (lane: number) => codeCanal(Math.ceil(lane / 10), ((lane - 1) % 10) + 1);

function composer(borne: { id: number; nom: string }, e: Evenement): Message | null {
  const b = court(borne.nom);
  switch (e.genre) {
    case "ventes": {
      if (e.ventes.length === 0) return null;
      const total = e.ventes.reduce((s, v) => s + v.prix_c, 0);
      if (e.ventes.length === 1) {
        const v = e.ventes[0];
        return { genre: "ventes", titre: `${b} · ${euros(v.prix_c)}`,
                 corps: (v.nom ?? "Un article") + (v.lane ? ` · spire ${spire(v.lane)}` : ""),
                 url: `/ventes?b=${borne.id}`, tag: `ventes-${borne.id}` };
      }
      return { genre: "ventes", titre: `${b} · ${pluriel(e.ventes.length, "vente", "ventes")} · ${euros(total)}`,
               corps: liste(e.ventes.map((v) => v.nom)), url: `/ventes?b=${borne.id}`, tag: `ventes-${borne.id}` };
    }
    case "incidents": {
      if (e.incidents.length === 0) return null;
      const lignes = e.incidents.map((i) =>
        `${euros(i.prix_c)} · ${LIBELLES[i.statut] ?? i.statut}` + (i.lane ? ` (spire ${spire(i.lane)})` : ""));
      return { genre: "incidents",
               titre: e.incidents.length === 1 ? `Incident · ${b}` : `${e.incidents.length} incidents · ${b}`,
               corps: lignes.slice(0, 3).join(" — ") + (lignes.length > 3 ? " — …" : ""),
               url: `/ventes?b=${borne.id}`, tag: `incidents-${borne.id}` };
    }
    case "vides": {
      if (e.canaux.length === 0) return null;
      return { genre: "vides",
               titre: e.canaux.length === 1 ? `Spire vide · ${b}` : `${e.canaux.length} spires vides · ${b}`,
               corps: liste(e.canaux.map((c) => `${spire(c.lane)} ${c.nom ?? ""}`.trim())),
               url: `/bornes/${borne.id}?c=vides`, tag: `vides-${borne.id}` };
    }
    case "chargements": {
      if (e.unites <= 0) return null;
      return { genre: "chargements", titre: `Chargement reçu · ${b}`,
               corps: `${pluriel(e.unites, "article", "articles")} sur ${pluriel(e.spires, "spire", "spires")}, confirmés par la machine.`,
               url: `/bornes/${borne.id}`, tag: `chargements-${borne.id}` };
    }
  }
}

// ---------------------------------------------------------------- l'envoi

type Abonnement = {
  id: number; endpoint: string; p256dh: string; auth: string; origine: string | null;
  ventes: boolean; incidents: boolean; vides: boolean; chargements: boolean; messages: boolean;
};

/**
 * Envoie un message a un appareil. Rend faux si l'abonnement est mort : le
 * service de push repond 404 ou 410 quand l'appareil s'est desabonne ou que
 * le navigateur a ete reinstalle — on l'efface, il ne reviendra pas.
 */
async function pousser(a: Abonnement, m: Message): Promise<boolean> {
  const k = await clesVapid();
  try {
    await webpush.sendNotification(
      { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
      JSON.stringify({ titre: m.titre, corps: m.corps, url: m.url, tag: m.tag, quand: Date.now() }),
      { vapidDetails: { subject: sujet(a.origine), publicKey: k.publique, privateKey: k.privee },
        TTL: 6 * 3600, urgency: m.genre === "incidents" ? "high" : "normal" });
    await q("UPDATE abonnement_push SET echecs = 0, envoye_le = now() WHERE id = $1", [a.id]);
    return true;
  } catch (e) {
    const statut = (e as { statusCode?: number }).statusCode;
    if (statut === 404 || statut === 410) {
      await q("DELETE FROM abonnement_push WHERE id = $1", [a.id]);
    } else {
      await q("UPDATE abonnement_push SET echecs = echecs + 1 WHERE id = $1", [a.id]);
      await q("DELETE FROM abonnement_push WHERE id = $1 AND echecs >= 10", [a.id]);
      console.error("push :", statut ?? "", e instanceof Error ? e.message : e);
    }
    return false;
  }
}

/**
 * SIGNALE CE QU'UNE BORNE VIENT DE VIVRE a tous les appareils qui veulent le
 * savoir. A appeler APRES la transaction qui a enregistre le releve, et sans
 * l'attendre : `void signaler(...)`.
 */
export async function signaler(compte_id: number, borne: { id: number; nom: string },
                               evenements: Evenement[]): Promise<void> {
  const messages = evenements.map((e) => composer(borne, e)).filter((m): m is Message => m !== null);
  if (messages.length === 0) return;

  // La machine l'ecrit aussi dans son salon, ou l'equipe peut repondre. Le
  // titre porte deja le nom de la borne ; dans son propre salon on le garde,
  // il fait la premiere ligne.
  await deposerSysteme(compte_id, borne, messages.map((m) => `${m.titre}\n${m.corps}`))
    .catch((e) => console.error("salon :", e instanceof Error ? e.message : e));

  // Les appareils des membres du compte qui ont le droit de voir cette borne.
  const cibles = await q<Abonnement>(`
    SELECT a.id, a.endpoint, a.p256dh, a.auth, a.origine,
           a.ventes, a.incidents, a.vides, a.chargements, a.messages
      FROM abonnement_push a
      JOIN membre m ON m.utilisateur_id = a.utilisateur_id AND m.compte_id = $1
     WHERE NOT EXISTS (SELECT 1 FROM acces_borne x JOIN borne b ON b.id = x.borne_id
                        WHERE x.utilisateur_id = a.utilisateur_id AND b.compte_id = $1)
        OR EXISTS (SELECT 1 FROM acces_borne x
                    WHERE x.utilisateur_id = a.utilisateur_id AND x.borne_id = $2)`,
    [compte_id, borne.id]);
  if (cibles.length === 0) return;

  const envois: Promise<boolean>[] = [];
  for (const a of cibles) {
    for (const m of messages) if (a[m.genre]) envois.push(pousser(a, m));
  }
  await Promise.allSettled(envois);
}

/**
 * UN COLLEGUE A ECRIT. Vers les appareils des membres qui voient ce salon —
 * sauf ceux de l'auteur, qui sait ce qu'il vient de dire. Le tag est celui
 * du salon : trois messages de suite font une ligne, mise a jour, pas trois.
 */
export async function signalerMessage(compte_id: number, salon: Salon, m: MessageSalon): Promise<void> {
  if (m.utilisateur_id === null) return;
  const cibles = await q<Abonnement>(`
    SELECT a.id, a.endpoint, a.p256dh, a.auth, a.origine,
           a.ventes, a.incidents, a.vides, a.chargements, a.messages
      FROM abonnement_push a
      JOIN membre mb ON mb.utilisateur_id = a.utilisateur_id AND mb.compte_id = $1
     WHERE a.messages AND a.utilisateur_id <> $3
       AND ($2::bigint IS NULL
            OR NOT EXISTS (SELECT 1 FROM acces_borne x JOIN borne b ON b.id = x.borne_id
                            WHERE x.utilisateur_id = a.utilisateur_id AND b.compte_id = $1)
            OR EXISTS (SELECT 1 FROM acces_borne x
                        WHERE x.utilisateur_id = a.utilisateur_id AND x.borne_id = $2))`,
    [compte_id, salon.borne_id, m.utilisateur_id]);
  if (cibles.length === 0) return;
  const texte = m.texte.replace(/\s+/g, " ").trim();
  const message: Message = {
    genre: "messages", titre: `#${salon.nom} · ${m.auteur ?? "quelqu’un"}`,
    corps: texte.length > 140 ? texte.slice(0, 137) + "…" : texte,
    url: `/messages/${salon.id}`, tag: `salon-${salon.id}`,
  };
  await Promise.allSettled(cibles.map((a) => pousser(a, message)));
}

/** Un message d'essai vers tous les appareils d'une personne. Rend le nombre atteint. */
export async function essayer(utilisateur_id: number): Promise<number> {
  const siens = await q<Abonnement>(`
    SELECT id, endpoint, p256dh, auth, origine, ventes, incidents, vides, chargements, messages
      FROM abonnement_push WHERE utilisateur_id = $1`, [utilisateur_id]);
  const r = await Promise.all(siens.map((a) => pousser(a, ESSAI)));
  return r.filter(Boolean).length;
}

/**
 * Un nom court pour reconnaitre l'appareil dans la liste : « iPhone · Safari »,
 * « Android · Chrome », « Mac · Firefox ». Tire du User-Agent, donc approximatif
 * — c'est un libelle, pas une identite.
 */
export function nomAppareil(ua: string | null): string {
  const s = ua ?? "";
  const os = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android"
           : /Windows/.test(s) ? "Windows" : /Mac OS/.test(s) ? "Mac" : /Linux/.test(s) ? "Linux" : "Appareil";
  const nav = /Edg\//.test(s) ? "Edge" : /OPR\//.test(s) ? "Opera" : /Firefox\//.test(s) ? "Firefox"
            : /CriOS|Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "navigateur";
  return `${os} · ${nav}`;
}
