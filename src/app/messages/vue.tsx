import Link from "next/link";
import { Entete, NavBasse } from "../chrome";
import { estRestreint, peutConfigurer, type Utilisateur } from "@/lib/auth";
import { assurerSalons, FONDS, LECTEURS_PAR_PAGE, lecteursDe, marquerLu, messagesDe, peutEcrire,
         peutReglerFond, salonDe, salonsDe, salonsFermes, SUPPORT,
         type Lecteurs, type Salon, type SalonFerme } from "@/lib/salons";
import { Personne, Portrait } from "../communaute/vignette-personne";
import { VoirPlus } from "../voir-plus";
import Fil from "./fil";
import MesureEntete from "./mesure";

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
export default async function Messagerie({ u, salon_id, nouveau, erreur, qui, lecteursN, fondOuvert }:
  { u: Utilisateur; salon_id?: number; nouveau?: boolean; erreur?: string; qui?: boolean;
    /** Combien de lecteurs montrer dans le panneau « qui lit ici ». */
    lecteursN?: number;
    /** Le choix du fond est ouvert (`?fond=1`). */
    fondOuvert?: boolean }) {
  await assurerSalons(u);
  const [salons, fermes] = await Promise.all([salonsDe(u), salonsFermes(u)]);
  const salon = salon_id !== undefined ? await salonDe(u, salon_id) : null;
  const [messages, lecteurs] = salon
    ? await Promise.all([messagesDe(salon.id, { limite: 80, moi: u.id }), lecteursDe(u, salon, lecteursN)])
    : [[], null];
  if (salon && messages.length > 0) await marquerLu(u.id, salon.id, messages[messages.length - 1].id);

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

  return (
    <>
      <Entete page="messages" />
      <MesureEntete />
      <main className="ecran messagerie" data-vue={salon ? "fil" : "liste"}>
        <aside className="salons">
          <div className="tete">
            <h1 style={{ margin: 0, fontSize: 20 }}>Messages</h1>
            {peutCreer ? (
              <Link href="/messages?nouveau=1" className="bouton petit" title="Nouveau salon" aria-label="Nouveau salon">＋</Link>
            ) : null}
          </div>
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
            <div className="section">Équipe</div>
            {equipe.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id} />)}
            {bornes.length > 0 ? <div className="section">Vos RedBox</div> : null}
            {bornes.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id} />)}
            {redbox.length + fermesRedbox.length > 0 || savFerme ? <div className="section">RedBox</div> : null}
            {redbox.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id} />)}
            {fermesRedbox.map((s) => <Ferme key={s.id} s={s} />)}
            {savFerme ? (
              <Ferme s={{ id: 0, nom: SUPPORT.nom, sujet: null, portee: "support", groupe: "proprietaires", ordre: 90 }} />
            ) : null}
            {communaute.length + fermesCommu.length > 0 ? <div className="section">Communauté</div> : null}
            {/* Ouverts et fermes melanges, dans l'ordre de la plateforme : le
                cadenas dit ou l'on n'entre pas, la place reste la meme. */}
            {[...communaute.map((s) => ({ ouvert: true as const, s })),
              ...fermesCommu.map((s) => ({ ouvert: false as const, s }))]
              .sort((a, z) => a.s.ordre - z.s.ordre || a.s.nom.localeCompare(z.s.nom))
              .map((x) => x.ouvert
                ? <Entree key={x.s.id} s={x.s} actif={salon?.id === x.s.id} />
                : <Ferme key={x.s.id} s={x.s} />)}
            {comptes.length > 0 ? <div className="section">SAV</div> : null}
            {comptes.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id}
                                        etiquette={[s.personne, s.compte].filter(Boolean).join(" · ") || undefined} />)}
          </nav>
        </aside>

        <section className="fil-cadre">
          {salon ? (
            <Fil salon={{ id: salon.id, nom: salon.portee === "support" && !moi(salon)
                                          ? `${salon.nom} · ${salon.personne ?? salon.compte ?? ""}` : salon.nom,
                          sujet: salon.sujet, borne: salon.borne, traverse: salon.portee !== "compte" }}
                 initial={messages} moi={u.id} peutEcrire={peutEcrire(u, salon)} retour="/messages"
                 raisonMuet={salon.portee === "annonces" ? "Ici, seule l’équipe RedBox écrit." : undefined}
                 fond={salon.fond}
                 reglageFond={peutReglerFond(u, salon)
                   ? { ouvert: Boolean(fondOuvert), panneau: <ChoixFond salon={salon} /> } : undefined}
                 lecteurs={{ total: lecteurs?.total ?? 0, ouvert: Boolean(qui) }}
                 panneau={lecteurs ? <Qui salon={salon} l={lecteurs} erreur={erreur === "droit" ? ERREURS.droit : undefined} /> : null}
                 erreur={erreur && erreur !== "nom" && erreur !== "pris" && erreur !== "droit" ? ERREURS[erreur] : undefined} />
          ) : (
            <div className="vide" style={{ paddingTop: 80 }}>
              <span className="grand">#</span>
              Choisissez un salon pour lire ce qui s’y dit.
            </div>
          )}
        </section>
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

function Entree({ s, actif, etiquette }: { s: Salon; actif: boolean; etiquette?: string }) {
  return (
    <Link href={`/messages/${s.id}`}
          className={`salon${actif ? " actif" : ""}${s.non_lus > 0 ? " non-lu" : ""}`}
          aria-current={actif ? "page" : undefined}>
      <span className="diese" aria-hidden>#</span>
      <span className="nom">
        {etiquette ?? s.nom}
        {etiquette ? <span className="sujet">#{s.nom}</span>
         : s.sujet ? <span className="sujet">{s.sujet}</span> : null}
      </span>
      {s.non_lus > 0 ? <span className="badge num">{s.non_lus > 99 ? "99+" : s.non_lus}</span> : null}
    </Link>
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
    <div className="salon ferme" aria-disabled="true" title={condition}>
      <span className="diese" aria-hidden>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="9" width="12" height="8.5" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
        </svg>
      </span>
      <span className="nom">
        {s.nom}
        <span className="sujet">{condition}</span>
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
