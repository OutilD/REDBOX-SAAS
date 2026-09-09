import Link from "next/link";
import { Entete, NavBasse } from "../chrome";
import { estRestreint, peutConfigurer, type Utilisateur } from "@/lib/auth";
import { assurerSalons, marquerLu, messagesDe, salonDe, salonsDe, type Salon } from "@/lib/salons";
import Fil from "./fil";
import MesureEntete from "./mesure";

const ERREURS: Record<string, string> = {
  vide:    "Le message est vide.",
  long:    "Le message est trop long (deux mille caractères au plus).",
  lecture: "Votre rôle ne permet que de lire.",
  salon:   "Ce salon n’existe pas, ou ne vous est pas ouvert.",
  nom:     "Donnez un nom au salon.",
  pris:    "Un salon porte déjà ce nom.",
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
export default async function Messagerie({ u, salon_id, nouveau, erreur }:
  { u: Utilisateur; salon_id?: number; nouveau?: boolean; erreur?: string }) {
  await assurerSalons(u.compte_id);
  const salons = await salonsDe(u);
  const salon = salon_id !== undefined ? await salonDe(u, salon_id) : null;
  const messages = salon ? await messagesDe(salon.id, { limite: 80 }) : [];
  if (salon && messages.length > 0) await marquerLu(u.id, salon.id, messages[messages.length - 1].id);

  const equipe = salons.filter((s) => s.borne_id === null);
  const bornes = salons.filter((s) => s.borne_id !== null);
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
            {bornes.length > 0 ? <div className="section">Bornes</div> : null}
            {bornes.map((s) => <Entree key={s.id} s={s} actif={salon?.id === s.id} />)}
          </nav>
        </aside>

        <section className="fil-cadre">
          {salon ? (
            <Fil salon={{ id: salon.id, nom: salon.nom, sujet: salon.sujet, borne: salon.borne }}
                 initial={messages} moi={u.id} peutEcrire={u.role !== "lecture"} retour="/messages"
                 erreur={erreur && erreur !== "nom" && erreur !== "pris" ? ERREURS[erreur] : undefined} />
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

function Entree({ s, actif }: { s: Salon; actif: boolean }) {
  return (
    <Link href={`/messages/${s.id}`}
          className={`salon${actif ? " actif" : ""}${s.non_lus > 0 ? " non-lu" : ""}`}
          aria-current={actif ? "page" : undefined}>
      <span className="diese" aria-hidden>#</span>
      <span className="nom">
        {s.nom}
        {s.sujet ? <span className="sujet">{s.sujet}</span> : null}
      </span>
      {s.non_lus > 0 ? <span className="badge num">{s.non_lus > 99 ? "99+" : s.non_lus}</span> : null}
    </Link>
  );
}
