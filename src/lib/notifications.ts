import webpush from "web-push";
import { codeCanal, euros, FUSEAU, q, q1 } from "@/db";
import { deposerSysteme, type Message as MessageSalon, type Salon } from "./salons";
import { LIBELLES } from "./ventes";
import { NOM_RANG, evaluerBadges, rangDe } from "./communaute";

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

export type Genre = "ventes" | "incidents" | "vides" | "chargements" | "messages" | "annonces" | "communaute";

/** Ce qu'on peut demander, dans l'ordre ou la page le propose. */
export const GENRES: { cle: Genre; nom: string; quoi: string }[] = [
  { cle: "ventes",      nom: "Ventes",         quoi: "Chaque relevé qui apporte des ventes, avec le montant" },
  { cle: "incidents",   nom: "Incidents et coupures", quoi: "Payé, rien n’est tombé ; machine hors ligne ou de retour ; mise hors service" },
  { cle: "vides",       nom: "Stock bas et épuisé",   quoi: "Un produit passe sous son seuil, ou une spire vend son dernier article" },
  { cle: "chargements", nom: "Chargements",    quoi: "La machine a confirmé un chargement saisi ici" },
  { cle: "messages",    nom: "Messages",       quoi: "Ce que l’équipe et la communauté écrivent dans les salons" },
  { cle: "annonces",    nom: "Annonces",       quoi: "Les nouveautés de la console et des RedBox, par l’équipe RedBox" },
  { cle: "communaute",  nom: "Communauté",     quoi: "Une réaction à vos messages, un badge débloqué" },
];

export type Evenement =
  | { genre: "ventes";      ventes: { nom: string | null; prix_c: number; lane: number | null }[] }
  | { genre: "incidents";   incidents: { nom: string | null; prix_c: number; lane: number | null; statut: string }[] }
  /** `ailleurs` : ce qu'il en reste sur les autres spires de la meme borne. */
  | { genre: "vides";       canaux: { lane: number; nom: string | null; ailleurs: number }[] }
  | { genre: "chargements"; unites: number; spires: number }
  /** Une spire vient d'atteindre son seuil « bas » : il en reste `reste`. */
  | { genre: "basses";      canaux: { lane: number; nom: string | null; reste: number; ailleurs: number }[] }
  /** La machine ne donne plus signe de vie depuis `depuis` : courant ou reseau. */
  | { genre: "silence";     depuis: Date | string }
  /** Elle reparle apres `minutes` de silence. */
  | { genre: "retour";      minutes: number }
  /** Quelqu'un l'a mise hors service, ou rouverte, depuis la console. */
  | { genre: "service";     actif: boolean; texte: string | null; par: string }
  /** Son application a change de version. */
  | { genre: "version";     avant: string; apres: string };

/**
 * `genre` est la preference qui decide de l'envoi sur le telephone ; `muet`,
 * un message qui s'ecrit dans le salon sans faire vibrer personne — une mise a
 * jour de l'application se lit, elle ne reveille pas.
 */
type Message = { genre: Genre; titre: string; corps: string; url: string; tag: string; muet?: boolean };

/** Le message d'un abonnement d'essai : c'est ce qu'on voit en appuyant sur « Essayer ». */
export const ESSAI: Message = {
  genre: "ventes", titre: "RedBox · notifications activées",
  corps: "Vous recevrez ici les ventes et les incidents de vos RedBox.", url: "/", tag: "essai",
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

/** « 14 h 32 » aujourd'hui, « le 9 septembre à 14 h 32 » avant. */
function heure(d: Date | string): string {
  const t = new Date(d);
  const jour = (x: Date) => x.toLocaleDateString("fr-FR", { timeZone: FUSEAU, day: "numeric", month: "long" });
  const h = t.toLocaleTimeString("fr-FR", { timeZone: FUSEAU, hour: "2-digit", minute: "2-digit" })
    .replace(":", " h ");
  return jour(t) === jour(new Date()) ? h : `le ${jour(t)} à ${h}`;
}

/** « 38 minutes », « 2 h 14 », « 3 jours ». */
function duree(minutes: number): string {
  if (minutes < 60) return pluriel(Math.max(1, Math.round(minutes)), "minute", "minutes");
  if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
    return m > 0 ? `${h} h ${String(m).padStart(2, "0")}` : pluriel(h, "heure", "heures");
  }
  return pluriel(Math.round(minutes / 1440), "jour", "jours");
}

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
      // Une spire vide dont le produit tient encore sur une autre n'est pas
      // une vente perdue : la machine prend dans l'autre. On le dit, pour
      // que personne ne parte recharger a deux heures du matin pour rien.
      const epuises = e.canaux.filter((c) => c.ailleurs <= 0);
      return { genre: "vides",
               titre: epuises.length > 0
                 ? (epuises.length === 1 ? `Produit épuisé · ${b}` : `${epuises.length} produits épuisés · ${b}`)
                 : (e.canaux.length === 1 ? `Spire vide · ${b}` : `${e.canaux.length} spires vides · ${b}`),
               corps: liste(e.canaux.map((c) =>
                 `${spire(c.lane)} ${c.nom ?? ""}`.trim()
                 + (c.ailleurs > 0 ? ` (encore ${c.ailleurs} sur une autre spire)` : ""))),
               url: `/bornes/${borne.id}?c=vides`, tag: `vides-${borne.id}` };
    }
    case "chargements": {
      if (e.unites <= 0) return null;
      return { genre: "chargements", titre: `Chargement reçu · ${b}`,
               corps: `${pluriel(e.unites, "article", "articles")} sur ${pluriel(e.spires, "spire", "spires")}, confirmés par la machine.`,
               url: `/bornes/${borne.id}`, tag: `chargements-${borne.id}` };
    }
    // BIENTOT EPUISE : la spire vient d'atteindre son seuil « bas ». C'est le
    // moment de prevoir le passage — pas celui ou elle est deja vide.
    case "basses": {
      if (e.canaux.length === 0) return null;
      return { genre: "vides",
               titre: e.canaux.length === 1 ? `Bientôt épuisé · ${b}` : `${e.canaux.length} produits bientôt épuisés · ${b}`,
               corps: liste(e.canaux.map((c) =>
                 `${spire(c.lane)} ${c.nom ?? ""}`.trim() + ` : plus que ${c.reste}`
                 + (c.ailleurs > 0 ? ` (et ${c.ailleurs} sur une autre spire)` : ""))),
               url: `/bornes/${borne.id}?c=bas`, tag: `basses-${borne.id}` };
    }
    // LE SILENCE ET LE RETOUR partagent leur `tag` : « De retour » remplace
    // « Hors ligne » sur l'ecran de verrouillage, au lieu de s'empiler dessous.
    case "silence":
      return { genre: "incidents", titre: `Hors ligne · ${b}`,
               corps: `Plus de nouvelles depuis ${heure(e.depuis)}. Coupure de courant ou de réseau ? `
                    + "Vérifiez qu’elle est allumée : éteinte, elle ne vend plus.",
               url: `/bornes/${borne.id}`, tag: `ligne-${borne.id}` };
    case "retour":
      return { genre: "incidents", titre: `De retour · ${b}`,
               corps: `Elle répond à nouveau après ${duree(e.minutes)} de silence. Ses ventes remontent.`,
               url: `/bornes/${borne.id}`, tag: `ligne-${borne.id}` };
    case "service":
      return { genre: "incidents",
               titre: e.actif ? `Mise hors service · ${b}` : `Remise en service · ${b}`,
               corps: e.actif
                 ? `Par ${e.par}${e.texte ? ` — l’écran affiche « ${e.texte} »` : ""}. Elle ne vend plus jusqu’à sa remise en service.`
                 : `Par ${e.par}. Elle vend à nouveau.`,
               url: `/bornes/${borne.id}`, tag: `service-${borne.id}` };
    case "version":
      return { genre: "incidents", muet: true, titre: `Mise à jour · ${b}`,
               corps: `L’application de la machine est passée de la version ${e.avant} à la ${e.apres}.`,
               url: `/bornes/${borne.id}`, tag: `version-${borne.id}` };
  }
}

// ---------------------------------------------------------------- l'envoi

type Abonnement = {
  id: number; endpoint: string; p256dh: string; auth: string; origine: string | null;
  ventes: boolean; incidents: boolean; vides: boolean; chargements: boolean; messages: boolean;
  annonces: boolean; communaute: boolean;
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

  // Ce qui s'ecrit sans faire vibrer — une mise a jour — s'arrete au salon.
  const sonores = messages.filter((m) => !m.muet);
  if (sonores.length === 0) return;

  // Les appareils des membres du compte qui ont le droit de voir cette borne.
  const cibles = await q<Abonnement>(`
    SELECT a.id, a.endpoint, a.p256dh, a.auth, a.origine,
           a.ventes, a.incidents, a.vides, a.chargements, a.messages, a.annonces, a.communaute
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
    for (const m of sonores) if (a[m.genre]) envois.push(pousser(a, m));
  }
  await Promise.allSettled(envois);
}

/**
 * QUELQU'UN A ECRIT. Vers les appareils de ceux qui voient ce salon — sauf
 * l'auteur, qui sait ce qu'il vient de dire. L'audience depend de la portee :
 *
 *   compte       les membres du compte, restreints a la borne du salon s'il en a une
 *   support      la personne dont c'est le SAV, et les membres de l'editeur
 *   annonces     tout le monde — sujet « annonces », a part des messages
 *   communaute   tout le monde pour « tous », sinon les comptes du groupe
 *
 * Le tag est celui du salon : trois messages de suite font une ligne, mise a
 * jour, pas trois.
 */
export async function signalerMessage(salon: Salon, m: MessageSalon): Promise<void> {
  if (m.utilisateur_id === null) return;
  const colonnes = `a.id, a.endpoint, a.p256dh, a.auth, a.origine,
                    a.ventes, a.incidents, a.vides, a.chargements, a.messages, a.annonces, a.communaute`;
  let cibles: Abonnement[];
  if (salon.portee === "compte") {
    cibles = await q<Abonnement>(`
      SELECT ${colonnes} FROM abonnement_push a
        JOIN membre mb ON mb.utilisateur_id = a.utilisateur_id AND mb.compte_id = $1
       WHERE a.messages AND a.utilisateur_id <> $3
         AND ($2::bigint IS NULL
              OR NOT EXISTS (SELECT 1 FROM acces_borne x JOIN borne b ON b.id = x.borne_id
                              WHERE x.utilisateur_id = a.utilisateur_id AND b.compte_id = $1)
              OR EXISTS (SELECT 1 FROM acces_borne x
                          WHERE x.utilisateur_id = a.utilisateur_id AND x.borne_id = $2))`,
      [salon.compte_id, salon.borne_id, m.utilisateur_id]);
  } else if (salon.portee === "support") {
    // Prive : son equipe n'en recoit rien.
    cibles = await q<Abonnement>(`
      SELECT ${colonnes} FROM abonnement_push a
       WHERE a.messages AND a.utilisateur_id <> $2
         AND (a.utilisateur_id = $1
              OR EXISTS (SELECT 1 FROM membre mb JOIN compte k ON k.id = mb.compte_id
                          WHERE mb.utilisateur_id = a.utilisateur_id AND k.editeur))`,
      [salon.utilisateur_id, m.utilisateur_id]);
  } else if (salon.portee === "annonces") {
    cibles = await q<Abonnement>(`
      SELECT ${colonnes} FROM abonnement_push a WHERE a.annonces AND a.utilisateur_id <> $1`,
      [m.utilisateur_id]);
  } else {
    // La communaute : « tous », ou les comptes du groupe — proprietaires
    // d'au moins une vraie borne, ou prospects sans aucune.
    cibles = await q<Abonnement>(`
      SELECT DISTINCT ${colonnes} FROM abonnement_push a
        JOIN membre mb ON mb.utilisateur_id = a.utilisateur_id
        JOIN compte k ON k.id = mb.compte_id
       WHERE a.messages AND a.utilisateur_id <> $2
         AND ($1 = 'tous' OR k.editeur OR
              ($1 = 'proprietaires') = EXISTS (SELECT 1 FROM borne b WHERE b.compte_id = k.id
                                                  AND b.jeton IS NOT NULL AND b.jeton NOT LIKE 'demo\\_%'))`,
      [salon.groupe ?? "tous", m.utilisateur_id]);
  }
  if (cibles.length === 0) return;
  const texte = m.texte.replace(/\s+/g, " ").trim();
  const message: Message = {
    genre: salon.portee === "annonces" ? "annonces" : "messages",
    titre: `#${salon.nom} · ${m.auteur ?? "quelqu’un"}`,
    corps: texte.length > 140 ? texte.slice(0, 137) + "…" : texte,
    url: `/messages/${salon.id}`, tag: `salon-${salon.id}`,
  };
  await Promise.allSettled(cibles.map((a) => pousser(a, message)));
}

// ------------------------------------------------------------- la communaute

/** Les appareils d'UNE personne qui veulent entendre parler de la communaute. */
async function appareilsCommunaute(utilisateur_id: number): Promise<Abonnement[]> {
  return q<Abonnement>(`
    SELECT id, endpoint, p256dh, auth, origine, ventes, incidents, vides, chargements, messages, annonces,
           communaute
      FROM abonnement_push WHERE utilisateur_id = $1 AND communaute`, [utilisateur_id]);
}

/**
 * QUELQU'UN A REAGI A MON MESSAGE. Vers l'auteur seul : c'est a lui qu'on
 * repond. Le tag est celui du message — cinq pouces sur la meme phrase font
 * une notification mise a jour, pas cinq qui vibrent l'une apres l'autre.
 * On ne previent jamais d'une reaction retiree : un « on ne vous applaudit
 * plus » n'apprend rien a personne.
 */
export async function signalerReaction(r: {
  auteur_id: number; par: string; emoji: string;
  message_id: number; salon_id: number; salon: string; texte: string;
}): Promise<void> {
  const cibles = await appareilsCommunaute(r.auteur_id);
  if (cibles.length === 0) return;
  const extrait = r.texte.replace(/\s+/g, " ").trim();
  const m: Message = {
    genre: "communaute",
    titre: `${r.emoji} ${r.par} a réagi à votre message`,
    corps: `#${r.salon} · « ${extrait.length > 90 ? extrait.slice(0, 87) + "…" : extrait} »`,
    url: `/messages/${r.salon_id}`, tag: `reaction-${r.message_id}`,
  };
  await Promise.allSettled(cibles.map((a) => pousser(a, m)));
}

/**
 * LES BADGES SE GAGNENT AUSSI QUAND ON N'EST PAS LA.
 *
 * Ils n'etaient evalues qu'a l'ouverture de la page Communaute : un badge merite
 * pendant la nuit — la centieme vente, le vingt-cinquieme pouce — attendait
 * qu'on vienne le chercher, et la surprise tombait a plat. On les evalue
 * maintenant la ou les faits changent : apres un message, une reaction, un
 * releve de ventes. Ce qui tombe part sur le telephone, avec sa rarete dans le
 * titre — « legendaire » se lit sur un ecran de verrouillage.
 *
 * Jamais depuis la page Communaute elle-meme : on y voit deja la carte
 * « Nouveau badge ! », faire vibrer le telephone en plus serait du bruit.
 * A appeler sans l'attendre : `void evaluerEtSignaler(id)`.
 */
export async function evaluerEtSignaler(utilisateur_id: number): Promise<void> {
  const neufs = await evaluerBadges(utilisateur_id);
  if (neufs.length === 0) return;
  const cibles = await appareilsCommunaute(utilisateur_id);
  if (cibles.length === 0) return;
  const b = neufs[0];
  const m: Message = neufs.length === 1
    ? { genre: "communaute",
        titre: `Badge ${NOM_RANG[rangDe(b)].toLowerCase()} débloqué : ${b.nom}`,
        corps: `${b.quoi}${b.points > 0 ? ` · +${b.points} pts` : ""}`,
        url: `/communaute/badges/${b.cle}`, tag: `badge-${b.cle}` }
    : { genre: "communaute",
        titre: `${neufs.length} badges débloqués`,
        corps: neufs.map((x) => x.nom).join(", "),
        url: "/communaute", tag: "badges" };
  await Promise.allSettled(cibles.map((a) => pousser(a, m)));
}

/**
 * Toute l'equipe d'un compte, apres un releve de ventes : la centieme vente
 * compte pour chacun de ceux qui font tourner la machine, pas pour elle.
 */
export async function evaluerLeCompte(compte_id: number): Promise<void> {
  const gens = await q<{ utilisateur_id: number }>(
    "SELECT utilisateur_id FROM membre WHERE compte_id = $1", [compte_id]);
  await Promise.allSettled(gens.map((g) => evaluerEtSignaler(Number(g.utilisateur_id))));
}

/** Un message d'essai vers tous les appareils d'une personne. Rend le nombre atteint. */
export async function essayer(utilisateur_id: number): Promise<number> {
  const siens = await q<Abonnement>(`
    SELECT id, endpoint, p256dh, auth, origine, ventes, incidents, vides, chargements, messages, annonces,
           communaute
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
