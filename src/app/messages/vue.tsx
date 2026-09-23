import Link from "next/link";
import { notFound } from "next/navigation";
import { apres } from "@/lib/apres";
import { MESSAGES_PAR_LOT } from "@/lib/fil";
import { Entete, NavBasse } from "../chrome";
import { estRestreint, peutConfigurer, type Utilisateur } from "@/lib/auth";
import { assurerSalons, FONDS, LECTEURS_PAR_PAGE, lecteursDe, marquerLu, messagesDe, peutEcrire, peutReagir,
         peutReglerFond, salonDe, salonsDe, salonsFermes, SUPPORT,
         type Lecteurs, type Salon, type SalonFerme } from "@/lib/salons";
import { Personne, Portrait } from "../communaute/vignette-personne";
import { VoirPlus } from "../voir-plus";
import { ColonneFil, LienSalon, Messagerie as Bascule, type MetaSalon } from "./bascule";
import MesureEntete from "./mesure";
import RechercheSalons from "./recherche-salons";
import { FUSEAU } from "@/lib/fuseau";
import { IcoBorne, IcoBulle, IcoCommunaute, IcoEquipe, IcoPlus, IcoPub, IcoSav } from "../icones";

const ERREURS: Record<string, string> = {
  vide:    "Le message est vide.",
  long:    "Le message est trop long (deux mille caractères au plus).",
  lecture: "Votre rôle ne permet que de lire.",
  salon:   "Ce salon n’existe pas, ou ne vous est pas ouvert.",
  nom:     "Donnez un nom au salon.",
  pris:    "Un salon porte déjà ce nom.",
  droit:   "Seul un gérant ou le redboxer du compte règle qui lit un salon d’équipe.",
};

/**
 * LA MESSAGERIE, VUE DE DISCORD.
 *
 * Deux colonnes sur un ecran large : les salons a gauche, le fil a droite.
 * Au telephone, l'une ou l'autre : la liste sur /messages, le fil sur
 * /messages/<id>, avec un « ‹ » pour revenir. C'est le meme rendu, et c'est
 * `data-vue` qui dit a la feuille de style laquelle montrer — la page ne
 * connait pas la largeur de l'ecran, et n'a pas a la connaitre.
 *
 * Les salons se rangent en deux groupes : ceux de l'equipe, et ceux des
 * bornes — ou la machine parle la premiere.
 */
const ASSURES = new Map<number, number>();
const ASSURE_MS = 15 * 60_000;
function assureRecemment(compte_id: number): boolean {
  const le = ASSURES.get(compte_id);
  if (le !== undefined && Date.now() - le < ASSURE_MS) return true;
  ASSURES.set(compte_id, Date.now());
  return false;
}

export default async function Messagerie({ u, salon_id, nouveau, erreur, qui, lecteursN, fondOuvert }:
  { u: Utilisateur; salon_id?: number; nouveau?: boolean; erreur?: string; qui?: boolean;
    /** Combien de lecteurs montrer dans le panneau « qui lit ici ». */
    lecteursN?: number;
    /** Le choix du fond est ouvert (`?fond=1`). */
    fondOuvert?: boolean }) {
  // LES SALONS DU COMPTE EXISTENT — verifie une fois par compte et par quart
  // d'heure, pas a chaque page : ce sont quatre ecritures qui ne changent rien
  // le reste du temps.
  if (!assureRecemment(u.compte_id)) await assurerSalons(u);
  // TOUT EN MEME TEMPS. La liste, les portes fermees, le salon ouvert, ses
  // derniers messages et ses lecteurs ne dependent pas les uns des autres :
  // un seul aller-retour de latence au lieu de cinq a la file.
  const salonP = salon_id !== undefined ? salonDe(u, salon_id) : Promise.resolve(null);
  const [salons, fermes, salon, messages, lecteurs] = await Promise.all([
    salonsDe(u), salonsFermes(u), salonP,
    salon_id !== undefined ? messagesDe(salon_id, { limite: MESSAGES_PAR_LOT, moi: u.id }) : Promise.resolve([]),
    salonP.then((s) => (s ? lecteursDe(u, s, lecteursN) : null)),
  ]);
  if (salon_id !== undefined && !salon) notFound();
  // Lu jusque-la : apres la reponse, la page n'attend pas la base pour ca.
  if (salon && messages.length > 0) {
    const dernier = messages[messages.length - 1].id;
    apres("lecture", () => marquerLu(u.id, salon.id, dernier));
  }

  const miens = salons.filter((s) => s.portee === "compte");
  const equipe = miens.filter((s) => s.borne_id === null);
  const bornes = miens.filter((s) => s.borne_id !== null);
  // « RedBox » : son SAV, et les annonces de l'editeur.
  const moi = (s: Salon) => Number(s.utilisateur_id) === Number(u.id);
  const redbox = salons.filter((s) => s.portee === "annonces" || (s.portee === "support" && moi(s)));
  // Sans RedBox en service, ni SAV ni annonces : leurs portes se montrent
  // fermees, avec la condition pour entrer — la raison d'appairer sa machine.
  const fermesRedbox = fermes.filter((s) => s.portee === "annonces");
  const fermesCommu = fermes.filter((s) => s.portee === "communaute");
  const savFerme = !u.editeur && !salons.some((s) => s.portee === "support" && moi(s));
  const communaute = salons.filter((s) => s.portee === "communaute");
  // Pour l'editeur : le SAV de chaque personne, les plus recemment actifs en
  // premier.
  const comptes = salons.filter((s) => s.portee === "support" && !moi(s))
    .sort((a, z) => (z.non_lus - a.non_lus)
      || ((z.dernier_le ? +new Date(z.dernier_le) : 0) - (a.dernier_le ? +new Date(a.dernier_le) : 0)));
  const peutCreer = peutConfigurer(u) && !estRestreint(u);
  // Ce que le navigateur doit savoir de chaque salon pour l'ouvrir sur place.
  const nomDe = (s: Salon) => s.portee === "support" && !moi(s) ? `${s.nom} · ${s.personne ?? s.compte ?? ""}` : s.nom;
  const metas: Record<number, MetaSalon> = Object.fromEntries(salons.map((s) => [s.id, {
    id: s.id, nom: nomDe(s), sujet: s.sujet, borne: s.borne, traverse: s.portee !== "compte",
    peutEcrire: peutEcrire(u, s), peutReagir: peutReagir(u, s),
    raisonMuet: s.portee === "annonces" ? "Ici, seule l’équipe RedBox écrit — vous pouvez réagir aux messages." : undefined,
    fond: s.fond, peutReglerFond: peutReglerFond(u, s),
  }]));
  const totalNonLus = salons.reduce((t, x) => t + x.non_lus, 0);

  return (
    <>
      <Entete page="messages" />
      <MesureEntete />
      <main className="ecran messagerie rail-focus" data-vue={salon ? "fil" : "liste"}>
       <Bascule metas={metas} initialId={salon?.id ?? null} initialMessages={messages}>
        <aside className="salons">
          <div className="tete">
            <div className="titre-messages">
              <h1>Messages</h1>
              {totalNonLus > 0 ? <span className="non-lus-total num">{totalNonLus > 99 ? "99+" : totalNonLus} non lu{totalNonLus > 1 ? "s" : ""}</span> : null}
            </div>
            {peutCreer ? (
              <Link href="/messages?nouveau=1" className="bouton icone" title="Nouveau salon" aria-label="Nouveau salon"><IcoPlus /></Link>
            ) : null}
          </div>
          <RechercheSalons />
          {nouveau && peutCreer ? (
            <form method="post" action="/api/salons" className="carte plate nouveau-salon">
              <div className="champ">
                <label htmlFor="nom">Nom du salon</label>
                <input id="nom" name="nom" required maxLength={40} placeholder="tournees, achats, week-end…" />
              </div>
              <div className="champ">
                <label htmlFor="sujet">De quoi on y parle</label>
                <input id="sujet" name="sujet" maxLength={120} placeholder="facultatif" />
              </div>
              {erreur && (erreur === "nom" || erreur === "pris") ? <p className="erreur">{ERREURS[erreur]}</p> : null}
              <div className="rangee" style={{ marginTop: 12, gap: 8 }}>
                <button className="bouton petit primaire">Créer</button>
                <Link href="/messages" className="bouton petit discret">Annuler</Link>
              </div>
            </form>
          ) : null}
          <nav aria-label="Salons">
            <Groupe titre="Équipe" liste={equipe}>
              {equipe.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id} genre="equipe" />)}
            </Groupe>
            <Groupe titre="Vos RedBox" liste={bornes}>
              {bornes.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id} genre="borne" />)}
            </Groupe>
            <Groupe titre="RedBox" liste={redbox} fermes={fermesRedbox.length + (savFerme ? 1 : 0)}>
              {redbox.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id} genre={s.portee === "annonces" ? "annonces" : "support"} />)}
              {fermesRedbox.map((s) => <Ferme key={s.id} s={s} />)}
              {savFerme ? (
                <Ferme s={{ id: 0, nom: SUPPORT.nom, sujet: null, portee: "support", groupe: "proprietaires", ordre: 90 }} />
              ) : null}
            </Groupe>
            <Groupe titre="Communauté" liste={communaute} fermes={fermesCommu.length}>
              {/* Ouverts et fermes melanges, dans l'ordre de la plateforme : le
                  cadenas dit ou l'on n'entre pas, la place reste la meme. */}
              {[...communaute.map((s) => ({ ouvert: true as const, s })),
                ...fermesCommu.map((s) => ({ ouvert: false as const, s }))]
                .sort((a, z) => a.s.ordre - z.s.ordre || a.s.nom.localeCompare(z.s.nom))
                .map((x) => x.ouvert
                  ? <Entree key={x.s.id} s={x.s} actif={salon?.id === x.s.id} genre="communaute" />
                  : <Ferme key={x.s.id} s={x.s} />)}
            </Groupe>
            <Groupe titre="SAV" liste={comptes}>
              {comptes.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id} genre="support"
                                          etiquette={[s.personne, s.compte].filter(Boolean).join(" · ") || undefined} />)}
            </Groupe>
            <p className="aucun-salon" hidden>Aucun salon ne porte ce nom.</p>
          </nav>
        </aside>

        <section className="fil-cadre">
          <ColonneFil moi={u.id}
            initial={salon ? { id: salon.id, fil: {
              salon: { id: salon.id, nom: nomDe(salon), sujet: salon.sujet, borne: salon.borne, traverse: salon.portee !== "compte" },
              peutEcrire: peutEcrire(u, salon), peutReagir: peutReagir(u, salon), retour: "/messages",
              raisonMuet: metas[salon.id]?.raisonMuet, fond: salon.fond,
              reglageFond: peutReglerFond(u, salon) ? { ouvert: Boolean(fondOuvert), panneau: <ChoixFond salon={salon} /> } : undefined,
              lecteurs: { total: lecteurs?.total ?? 0, ouvert: Boolean(qui) },
              panneau: lecteurs ? <Qui salon={salon} l={lecteurs} erreur={erreur === "droit" ? ERREURS.droit : undefined} /> : null,
              erreur: erreur && erreur !== "nom" && erreur !== "pris" && erreur !== "droit" ? ERREURS[erreur] : undefined,
            } } : null}
            accueil={
              <div className="messagerie-accueil">
              <span className="halo" aria-hidden="true"><IcoBulle size={34} /></span>
              <h2>Vos conversations</h2>
              <p>Choisissez un salon à gauche : l’équipe, vos RedBox qui écrivent d’elles-mêmes, la communauté des redboxers.</p>
              <ul className="astuces">
                <li><kbd>/</kbd> chercher un salon</li>
                <li><kbd>Entrée</kbd> envoyer</li>
                <li><kbd>Maj</kbd> + <kbd>Entrée</kbd> aller à la ligne</li>
              </ul>
            </div>
            } />
        </section>
       </Bascule>
      </main>
      <NavBasse page="messages" />
    </>
  );
}

/**
 * QUI LIT ICI. La regle en une phrase, le nombre, les visages. Et pour un
 * salon d'equipe regle par un gerant, la liste du compte a cocher : aucune
 * case, tout le monde ; des cases, seulement eux.
 */
function Qui({ salon, l, erreur }: { salon: Salon; l: Lecteurs; erreur?: string }) {
  return (
    <div className="carte plate qui-lit">
      <div style={{ fontWeight: 700, fontSize: 14 }}>
        Qui peut lire ici
        <span className="faible" style={{ fontWeight: 500 }}> · {l.total} personne{l.total > 1 ? "s" : ""}</span>
      </div>
      <p className="faible" style={{ margin: "4px 0 10px", fontSize: 13 }}>{l.regle}</p>
      {erreur ? <p className="erreur">{erreur}</p> : null}
      {l.reglable ? (
        <form method="post" action="/api/salons/lecteurs">
          <input type="hidden" name="salon_id" value={salon.id} />
          <div className="lecteurs-choix">
            {l.equipe.map((p) => (
              <label key={p.id} className="coche">
                <input type="checkbox" name="membre" value={p.id} defaultChecked={p.choisi} />
                <Portrait image_id={p.image_id} pseudo={p.pseudo} couleur={p.couleur} taille={26} />
                <span>{p.pseudo}{p.editeur ? <span className="etiquette editeur">RedBox</span> : null}</span>
              </label>
            ))}
          </div>
          <p className="faible" style={{ fontSize: 12.5, margin: "8px 0 10px" }}>
            Aucune case cochée : tout le compte lit. Vous restez toujours dans la liste.
          </p>
          <button className="bouton petit">Enregistrer</button>
        </form>
      ) : (
        // UNE LISTE, PAS UN NUAGE DE VISAGES. Les portraits se tassaient en
        // vrac a la suite l'un de l'autre, et le salon de la communaute
        // s'arretait sur « et 212 autres » sans qu'on puisse voir qui. Chacun a
        // maintenant sa ligne — son portrait, son nom, l'etiquette RedBox — et
        // la liste s'allonge par paquets.
        <>
          <div className="lecteurs-liste">
            {l.gens.map((p, i) => (
              <div key={p.id} id={`l${i + 1}`}>
                <Personne id={p.id} image_id={p.image_id} pseudo={p.pseudo}
                          couleur={p.couleur} editeur={p.editeur} />
              </div>
            ))}
          </div>
          <VoirPlus href={`/messages/${salon.id}?qui=1&n=${l.gens.length + LECTEURS_PAR_PAGE}#l${l.gens.length + 1}`}
                    montres={l.gens.length} total={l.total} plus={l.plus}
                    pas={LECTEURS_PAR_PAGE} unite={["personne", "personnes"]} />
        </>
      )}
    </div>
  );
}

type Genre = "equipe" | "borne" | "annonces" | "support" | "communaute";

/** L'icone d'un salon, selon qui y parle. */
function IconeSalon({ genre }: { genre: Genre }) {
  switch (genre) {
    case "borne": return <IcoBorne size={16} />;
    case "annonces": return <IcoPub size={16} />;
    case "support": return <IcoSav size={16} />;
    case "communaute": return <IcoCommunaute size={16} />;
    default: return <IcoEquipe size={16} />;
  }
}

/** L'heure du dernier message : l'heure aujourd'hui, « hier », puis la date. */
function quand(d: Date | null): string {
  if (!d) return "";
  const jour = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: FUSEAU });
  const ici = new Date(d);
  if (jour(ici) === jour(new Date())) {
    return ici.toLocaleTimeString("fr-FR", { timeZone: FUSEAU, hour: "2-digit", minute: "2-digit" });
  }
  if (jour(ici) === jour(new Date(Date.now() - 86400e3))) return "hier";
  return ici.toLocaleDateString("fr-FR", { timeZone: FUSEAU, day: "2-digit", month: "2-digit" });
}

/**
 * UNE SECTION DE LA LISTE, QUI SE REPLIE. Ouverte par defaut ; le nombre de
 * non-lus qu'elle contient reste visible repliee — c'est ce qu'on cherche.
 */
function Groupe({ titre, liste, fermes = 0, children }: {
  titre: string; liste: Salon[]; fermes?: number; children: React.ReactNode;
}) {
  if (liste.length + fermes === 0) return null;
  const n = liste.reduce((t, x) => t + x.non_lus, 0);
  return (
    <details className="groupe-salons" open>
      <summary>
        <span className="titre">{titre}</span>
        {n > 0 ? <span className="n num">{n > 99 ? "99+" : n}</span> : null}
      </summary>
      <div className="liste">{children}</div>
    </details>
  );
}

function Entree({ s, actif, etiquette, genre }: { s: Salon; actif: boolean; etiquette?: string; genre: Genre }) {
  const nom = etiquette ?? s.nom;
  const apercu = s.apercu
    ? `${s.apercu_mien ? "Vous" : s.apercu_de ?? (s.borne ? "La machine" : "RedBox")} : ${s.apercu}`
    : etiquette ? `#${s.nom}` : s.sujet;
  return (
    <LienSalon id={s.id} data-cherche={`${nom} ${s.nom} ${s.sujet ?? ""}`}
          className={`salon${actif ? " actif" : ""}${s.non_lus > 0 ? " non-lu" : ""}`}
          data-genre={genre}>
      <span className="icone-salon" aria-hidden><IconeSalon genre={genre} /></span>
      <span className="nom">
        <span className="ligne-haut">
          <span className="libelle">{genre === "equipe" || genre === "communaute" ? <span className="diese">#</span> : null}{nom}</span>
          {s.dernier_le ? <time className="quand" suppressHydrationWarning>{quand(s.dernier_le)}</time> : null}
        </span>
        <span className="ligne-bas">
          {apercu ? <span className="sujet">{apercu}</span> : <span className="sujet vide-apercu">Aucun message</span>}
          {s.non_lus > 0 ? <span className="badge num" aria-label={`${s.non_lus} non lus`}>{s.non_lus > 99 ? "99+" : s.non_lus}</span> : null}
        </span>
      </span>
    </LienSalon>
  );
}

/**
 * UN SALON DONT LA PORTE EST FERMEE. Ni lien ni compteur : on ne peut rien y
 * lire. Mais son nom, son sujet et la condition pour y entrer se lisent — c'est
 * tout l'interet de le montrer.
 */
function Ferme({ s }: { s: SalonFerme }) {
  const condition = s.groupe === "proprietaires"
    ? "Réservé aux redboxers : appairez votre première RedBox pour entrer"
    : s.groupe === "prospects" ? "Réservé à ceux qui n’ont pas encore de RedBox"
    : "Accès réservé";
  return (
    <div className="salon ferme" aria-disabled="true" title={condition} data-cherche={`${s.nom} ${s.sujet ?? ""}`}>
      <span className="icone-salon" aria-hidden>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="9" width="12" height="8.5" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
        </svg>
      </span>
      <span className="nom">
        <span className="ligne-haut"><span className="libelle">{s.nom}</span></span>
        <span className="ligne-bas"><span className="sujet">{condition}</span></span>
      </span>
      <span className="sr">fermé</span>
    </div>
  );
}

/**
 * LE CHOIX DU FOND. Des tuiles qui montrent le fond en mouvement plutot que
 * son nom : « Aurore » ne dit rien avant de l'avoir vue. Sans couleur d'abord,
 * en couleur ensuite — la question qu'on se pose en premier.
 */
function ChoixFond({ salon }: { salon: Salon }) {
  const groupes = [
    { titre: "Sans couleur", liste: FONDS.filter((f) => !f.couleur) },
    { titre: "En couleur", liste: FONDS.filter((f) => f.couleur) },
  ];
  return (
    <form method="post" action="/api/salons/fond" className="carte plate choix-fond">
      <input type="hidden" name="salon_id" value={salon.id} />
      <div style={{ fontWeight: 700, fontSize: 14 }}>Fond du salon</div>
      <p className="faible" style={{ margin: "4px 0 0", fontSize: 13 }}>
        Tous ceux qui lisent #{salon.nom} le voient. Il reste immobile pour qui a demandé
        moins d’animations sur son appareil.
      </p>
      {groupes.map((g) => (
        <fieldset key={g.titre}>
          <legend>{g.titre}</legend>
          <div className="tuiles-fond">
            {g.liste.map((f) => (
              <label key={f.cle} className="tuile-fond">
                <input type="radio" name="fond" value={f.cle} defaultChecked={salon.fond === f.cle} />
                <span className="apercu-fond" data-fond={f.cle} aria-hidden="true" />
                <span className="nom">{f.nom}</span>
                <span className="quoi">{f.quoi}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="rangee" style={{ marginTop: 12, gap: 8 }}>
        <button className="bouton petit primaire">Appliquer</button>
        <Link href={`/messages/${salon.id}`} className="bouton petit discret">Fermer</Link>
      </div>
    </form>
  );
}
