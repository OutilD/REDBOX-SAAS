import Link from "next/link";
import { BADGES, prochainGrade, rangDe, type Profil } from "@/lib/communaute";
import { Badge } from "./badge";
import { AnneauNiveau, BarreNiveau } from "./niveau";
import { Portrait } from "./vignette-personne";

/**
 * OU J'EN SUIS, EN UNE CARTE.
 *
 * L'anneau porte le niveau et la part parcourue ; la barre dit ce qui reste ;
 * les chiffres disent d'ou viennent les points ; en bas, les badges obtenus.
 * Le portrait passe DANS l'anneau : deux ronds cote a cote se disputeraient le
 * regard.
 *
 * La meme carte sur la Communaute et sur Mon compte : sur le profil, on ne la
 * trouvait qu'en passant par « Tous les badges ». Le profil y ajoute le lien
 * vers la liste complete, que la Communaute affiche juste en dessous.
 */
export default function CarteMoi({ moi, id, monRang, ecart, lienBadges = false }: {
  moi: Profil; id: number;
  /** 0 quand on n'est pas classe. */
  monRang: number; ecart: number;
  lienBadges?: boolean;
}) {
  const suivant = prochainGrade(moi.bornes);
  return (
    <div className="carte moi-carte" style={moi.couleur ? { borderColor: moi.couleur } : undefined}>
      <div className="haut-moi">
        <div className="face">
          <AnneauNiveau points={moi.points} taille={104} couleur={moi.couleur} />
          <span className="dans-anneau">
            <Portrait image_id={moi.image_id} pseudo={moi.pseudo} couleur={moi.couleur} taille={72} />
          </span>
        </div>

        <div className="pousse" style={{ minWidth: 220 }}>
          <div className="nom-moi">
            {moi.pseudo}{moi.editeur ? <span className="etiquette editeur">RedBox</span> : null}
          </div>
          <div className="rangee" style={{ gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <span className="etiquette grade grand">{moi.grade.nom}</span>
            <span className="faible" style={{ fontSize: 13 }}>
              {moi.compte}{moi.ville ? ` · ${moi.ville}` : ""}
            </span>
          </div>
          <BarreNiveau points={moi.points} />
          <p className="faible" style={{ fontSize: 13, margin: "9px 0 0" }}>
            {moi.bornes} RedBox en service
            {suivant ? ` — ${suivant.manque} de plus et vous êtes ${suivant.grade.nom}.` : " — le sommet."}
            {monRang === 1 ? " En tête du classement."
              : monRang > 1 ? ` ${monRang}e au classement, ${ecart > 0 ? `à ${ecart} pts de` : "à égalité avec"} la place au-dessus.`
              : ""}
          </p>
        </div>

        <div className="rangee actions-moi" style={{ gap: 8 }}>
          <Link href={`/communaute/${id}`} className="bouton petit">Mon profil public</Link>
          <Link href="/communaute/moi" className="bouton petit primaire">Personnaliser</Link>
        </div>
      </div>

      {/* D'ou viennent les points. Sans ce compte, « 1109 » est un nombre
          tombe du ciel, et on ne sait pas quoi faire pour l'augmenter. */}
      <div className="mesures-moi">
        <div><b className="num">{moi.points}</b><span>points</span></div>
        <div><b className="num">{moi.badges.length}</b><span>badge{moi.badges.length > 1 ? "s" : ""} sur {BADGES.length}</span></div>
        <div><b className="num">{moi.messages}</b><span>message{moi.messages > 1 ? "s" : ""}</span></div>
        <div><b className="num">{moi.reactions}</b><span>réaction{moi.reactions > 1 ? "s" : ""} reçue{moi.reactions > 1 ? "s" : ""}</span></div>
      </div>

      {moi.badges.length > 0 ? (
        <div className="badges-rangee" style={{ marginTop: 14 }}>
          {moi.badges.map((b) => (
            <Link key={b.cle} href={`/communaute/badges/${b.cle}`} data-badge={b.cle}
                  className="badge-item" title={`${b.nom} — ${b.quoi}`}>
              <Badge forme={b.forme} taille={34} rang={rangDe(b)} />
              <span>{b.nom}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {lienBadges ? (
        <p className="faible" style={{ margin: "12px 0 0", fontSize: 13 }}>
          {moi.badges.length > 0 ? null : "Pas encore de badge. "}
          <Link href="/communaute">
            {moi.badges.length > 0 ? "Tous les badges et comment les gagner ›" : "Voir comment en gagner ›"}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
