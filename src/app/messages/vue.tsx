import Link from "next/link";
import { Entete, NavBasse } from "../chrome";
import { estRestreint, peutConfigurer, type Utilisateur } from "@/lib/auth";
import { assurerSalons, lecteursDe, marquerLu, messagesDe, peutEcrire, salonDe, salonsDe,
         type Lecteurs, type Salon } from "@/lib/salons";
import { Portrait } from "../communaute/vignette-personne";
import Fil from "./fil";
import MesureEntete from "./mesure";

const ERREURS: Record<string, string> = {
  vide:    "Le message est vide.",
  long:    "Le message est trop long (deux mille caractères au plus).",
  lecture: "Votre rôle ne permet que de lire.",
  salon:   "Ce salon n’existe pas, ou ne vous est pas ouvert.",
  nom:     "Donnez un nom au salon.",
  pris:    "Un salon porte déjà ce nom.",
  droit:   "Seul un gérant ou le propriétaire règle qui lit un salon d’équipe.",
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
export default async function Messagerie({ u, salon_id, nouveau, erreur, qui }:
  { u: Utilisateur; salon_id?: number; nouveau?: boolean; erreur?: string; qui?: boolean }) {
  await assurerSalons(u.compte_id);
  const salons = await salonsDe(u);
  const salon = salon_id !== undefined ? await salonDe(u, salon_id) : null;
  const [messages, lecteurs] = salon
    ? await Promise.all([messagesDe(salon.id, { limite: 80, moi: u.id }), lecteursDe(u, salon)])
    : [[], null];
  if (salon && messages.length > 0) await marquerLu(u.id, salon.id, messages[messages.length - 1].id);

  const miens = salons.filter((s) => s.portee === "compte");
  const equipe = miens.filter((s) => s.borne_id === null);
  const bornes = miens.filter((s) => s.borne_id !== null);
  // « RedBox » : la ligne directe de ce compte, et les annonces de l'editeur.
  const redbox = salons.filter((s) => s.portee === "annonces"
                                   || (s.portee === "support" && s.compte_id === u.compte_id));
  const communaute = salons.filter((s) => s.portee === "communaute");
  // Pour l'editeur : la ligne directe de chaque autre compte, les plus
  // recemment actives en premier.
  const comptes = salons.filter((s) => s.portee === "support" && s.compte_id !== u.compte_id)
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
            {bornes.length > 0 ? <div className="section">RedBox</div> : null}
            {bornes.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id} />)}
            {redbox.length > 0 ? <div className="section">RedBox</div> : null}
            {redbox.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id} />)}
            {communaute.length > 0 ? <div className="section">Communauté</div> : null}
            {communaute.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id} />)}
            {comptes.length > 0 ? <div className="section">Comptes</div> : null}
            {comptes.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id} etiquette={s.compte ?? undefined} />)}
          </nav>
        </aside>

        <section className="fil-cadre">
          {salon ? (
            <Fil salon={{ id: salon.id, nom: salon.portee === "support" && salon.compte_id !== u.compte_id
                                          ? `${salon.nom} · ${salon.compte ?? ""}` : salon.nom,
                          sujet: salon.sujet, borne: salon.borne, traverse: salon.portee !== "compte" }}
                 initial={messages} moi={u.id} peutEcrire={peutEcrire(u, salon)} retour="/messages"
                 raisonMuet={salon.portee === "annonces" ? "Ici, seule l’équipe RedBox écrit." : undefined}
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
        <div className="lecteurs-liste">
          {l.gens.map((p) => (
            <Link key={p.id} href={`/communaute/${p.id}`} className="lecteur" title={p.pseudo}>
              <Portrait image_id={p.image_id} pseudo={p.pseudo} couleur={p.couleur} taille={30} />
              <span>{p.pseudo}</span>
            </Link>
          ))}
          {l.total > l.gens.length ? <span className="faible" style={{ fontSize: 12.5 }}>et {l.total - l.gens.length} autres</span> : null}
        </div>
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
