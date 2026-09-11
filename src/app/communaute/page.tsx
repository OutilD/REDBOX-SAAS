import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { utilisateur } from "@/lib/auth";
import { BADGES, badgesVus, classement, evaluerBadges, objectifs, prochainGrade, profilDe,
         progresDe, rangDe, rareteDesBadges, NOM_RANG, type Classe } from "@/lib/communaute";
import { salonsDe } from "@/lib/salons";
import { Badge } from "./badge";
import { AnneauNiveau, BarreNiveau } from "./niveau";
import { Portrait } from "./vignette-personne";

export const dynamic = "force-dynamic";

/**
 * LA COMMUNAUTE.
 *
 * Quatre blocs : soi — grade, niveau, badges, et ce qu'il manque pour le
 * grade d'apres — ; les nouveaux badges, s'il y en a, annonces une fois ; le
 * classement de tous les redboxers ; et tous les badges qui existent, ceux
 * qu'on a en couleur, les autres en gris. En bas, les salons ou l'on se
 * retrouve.
 *
 * Les badges sont reevalues a chaque ouverture : c'est ici qu'on vient voir
 * si l'on a gagne quelque chose, donc ici qu'on le calcule.
 */
export default async function Communaute() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const neufs = await evaluerBadges(u.id);
  // Tout le monde, pas seulement le haut de liste : mon rang ne se lit que
  // dans la liste entiere, et la 34e place a autant besoin de se voir que la
  // 4e. Le calcul est en code, la limite n'est qu'une coupe.
  const [moi, tous, salons, rarete] = await Promise.all([
    profilDe(u.id, u), classement(1000), salonsDe(u), rareteDesBadges(),
  ]);
  if (!moi) redirect("/");
  const nouveaux = moi.badges.filter((b) => b.nouveau);
  if (nouveaux.length > 0) await badgesVus(u.id);
  const suivant = prochainGrade(moi.bornes);
  const acquis = moi.badges.map((b) => b.cle);
  const vises = objectifs(moi.faits, acquis);
  const HAUT = 20;
  const haut = tous.slice(0, HAUT);
  const monRang = tous.findIndex((c) => c.id === u.id) + 1;
  const maLigne = monRang > HAUT ? tous[monRang - 1] : null;
  const ecart = monRang > 1 ? tous[monRang - 2].points - tous[monRang - 1].points : 0;
  const echelle = Math.max(1, tous[0]?.points ?? 1);
  const communs = salons.filter((s) => s.portee === "communaute" || s.portee === "annonces");

  return (
    <>
      <Entete page="communaute" />
      <main className="ecran">
        <h1>Communauté</h1>
        <p className="sous" style={{ maxWidth: 720 }}>
          Tous ceux qui font tourner des RedBox, et ceux qui y pensent. Un profil, un grade
          qui dit la taille de votre parc, des badges pour ce que vous avez traversé.
        </p>

        {/* ---------------------------------------------------------- moi
            OU J'EN SUIS, EN UNE CARTE. L'anneau porte le niveau et la part
            parcourue ; la barre dit ce qui reste ; les trois chiffres disent
            d'ou viennent les points. Le portrait passe DANS l'anneau : deux
            ronds cote a cote se disputeraient le regard. */}
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
              <Link href={`/communaute/${u.id}`} className="bouton petit">Mon profil public</Link>
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
                <Link key={b.cle} href={`/communaute/badges/${b.cle}`}
                      className="badge-item" title={`${b.nom} — ${b.quoi}`}>
                  <Badge forme={b.forme} taille={34} rang={rangDe(b)} />
                  <span>{b.nom}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {/* ------------------------------------------------------ objectifs
            LES TROIS BADGES LES PLUS PROCHES. C'est la difference entre une
            liste de recompenses et une liste d'objectifs : on voit ou l'on en
            est, et ce que ca rapporte. */}
        {vises.length > 0 ? (
          <>
            <div className="titre-section">
              <h2>Vos prochains objectifs</h2>
              <span className="faible" style={{ fontSize: 12.5 }}>les plus proches d’abord</span>
            </div>
            <div className="objectifs">
              {vises.map((b) => (
                <Link key={b.cle} href={`/communaute/badges/${b.cle}`}
                      className={`objectif ${rangDe(b)}`}>
                  <Badge forme={b.forme} taille={40} rang={rangDe(b)} obtenu={false} />
                  <div className="quoi">
                    <div className="nom">{b.nom}</div>
                    <div className="faible">{b.quoi}</div>
                  </div>
                  <div className="ou">
                    <div className="piste"><span style={{ width: `${b.progres.pct}%` }} /></div>
                    <div className="chiffres num">
                      <span><b>{b.progres.n}</b> / {b.progres.sur}</span>
                      <span className="gain">+{b.points} pts</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : null}

        {nouveaux.length > 0 || neufs.length > 0 ? (
          <div className="carte chaude" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {nouveaux.length > 1 ? "Nouveaux badges !" : "Nouveau badge !"}
            </div>
            <div className="badges-rangee">
              {nouveaux.map((b) => (
                <span key={b.cle} className="badge-item">
                  <Badge forme={b.forme} taille={40} rang={rangDe(b)} />
                  <span><b>{b.nom}</b><br /><span className="faible">{b.quoi}</span></span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* ---------------------------------------------------- classement */}
        <div className="titre-section">
          <h2>Classement</h2>
          <span className="faible num" style={{ fontSize: 12.5 }}>
            {tous.length} redboxer{tous.length > 1 ? "s" : ""} · par points
          </span>
        </div>
        <ol className="palmares">
          {haut.map((c, i) => (
            <LignePalmares key={c.id} c={c} rang={i + 1} moi={c.id === u.id} echelle={echelle} />
          ))}
          {maLigne ? (
            <>
              <li className="ellipse" aria-hidden="true">···</li>
              <LignePalmares c={maLigne} rang={monRang} moi echelle={echelle} />
            </>
          ) : null}
        </ol>

        {/* -------------------------------------------------------- badges
            TOUT CE QUI EXISTE, obtenu en couleur, le reste en gris — avec ou
            l'on en est quand ca se compte, et combien de gens l'ont deja.
            « Obtenu par 4 % » vaut toutes les etiquettes de rarete : c'est la
            rarete reelle, pas celle qu'on a decretee.

            Les non-obtenus passent apres : la vitrine d'abord, la liste des
            courses ensuite. */}
        <div className="titre-section">
          <h2>Les badges</h2>
          <span className="faible num" style={{ fontSize: 12.5 }}>
            {moi.badges.length} sur {BADGES.length}
          </span>
        </div>
        <div className="badges-grille">
          {[...BADGES]
            .sort((x, z) => Number(acquis.includes(z.cle)) - Number(acquis.includes(x.cle)) || z.points - x.points)
            .map((b) => {
              const a = moi.badges.find((x) => x.cle === b.cle);
              const rang = rangDe(b);
              const p = a ? null : progresDe(moi.faits, b.cle);
              const combien = rarete.get(b.cle);
              return (
                <Link key={b.cle} href={`/communaute/badges/${b.cle}`}
                      className={`badge-fiche ${rang}${a ? "" : " eteint"}`}>
                  <Badge forme={b.forme} obtenu={Boolean(a)} taille={42} rang={rang} />
                  <div className="dit">
                    <div className="nom">
                      {b.nom}
                      <span className={`etiquette rang ${rang}`}>{NOM_RANG[rang]}</span>
                    </div>
                    <div className="faible quoi">{b.quoi}</div>

                    {p && p.pct > 0 ? (
                      <div className="avance">
                        <div className="piste"><span style={{ width: `${p.pct}%` }} /></div>
                        <span className="num">{p.n} / {p.sur}</span>
                      </div>
                    ) : null}

                    <div className="pied num">
                      {b.points > 0 ? <span className="gain">+{b.points} pts</span> : null}
                      {combien && combien.n > 0
                        ? <span className="faible">{combien.pct > 0 ? `${combien.pct} %` : "moins de 1 %"} des redboxers</span>
                        : <span className="faible">personne ne l’a encore</span>}
                      {a ? (
                        <span className="faible">
                          obtenu le {new Date(a.obtenu_le).toLocaleDateString("fr-FR",
                            { timeZone: "Europe/Paris", day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
        </div>

        {/* -------------------------------------------------------- salons */}
        {communs.length > 0 ? (
          <>
            <h2>Où l’on se retrouve</h2>
            <div className="rubriques">
              {communs.map((s) => (
                <Link key={s.id} href={`/messages/${s.id}`} className="rubrique">
                  <span className="rond" aria-hidden="true" style={{ fontWeight: 800, fontSize: 18 }}>#</span>
                  <span className="dit">
                    <span className="nom">{s.nom}</span>
                    <span className="quoi">{s.sujet}</span>
                  </span>
                  <span className="etat num">{s.non_lus > 0 ? `${s.non_lus} nouveau${s.non_lus > 1 ? "x" : ""}` : ""}</span>
                  <span className="fleche" aria-hidden="true">›</span>
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </main>
      <NavBasse page="communaute" />
    </>
  );
}

/**
 * Une ligne du palmares. Le rang en ordinal — « 1er », « 2e » —, les trois
 * premiers colores ; la barre est sur l'echelle du premier, si bien que deux
 * lignes se comparent d'un coup d'oeil sans lire les chiffres.
 */
function LignePalmares({ c, rang, moi, echelle }:
  { c: Classe; rang: number; moi: boolean; echelle: number }) {
  const medaille = rang === 1 ? "or" : rang === 2 ? "argent" : rang === 3 ? "bronze" : "";
  const part = Math.max(0, Math.min(100, Math.round((c.points / echelle) * 100)));
  return (
    <li className={[moi ? "moi" : "", medaille].filter(Boolean).join(" ")}>
      <Link href={`/communaute/${c.id}`} className="ligne">
        <span className="rang num">{rang}<sup>{rang === 1 ? "er" : "e"}</sup></span>
        <Portrait image_id={c.image_id} pseudo={c.pseudo} couleur={c.couleur} taille={44} />
        <span className="qui">
          <span className="nom">
            <span>{c.pseudo}</span>
            {/* Le badge le plus rare qu'elle porte : un seul se lit, quinze ne
                se lisent pas. */}
            {c.meilleur ? (
              <Badge forme={c.meilleur.forme} taille={18} rang={rangDe(c.meilleur)}
                     titre={`${c.meilleur.nom} — ${c.meilleur.quoi}`} />
            ) : null}
            {c.editeur ? <span className="etiquette editeur">RedBox</span> : null}
            {moi ? <span className="etiquette">vous</span> : null}
          </span>
          <span className="dessous">
            <span className="etiquette grade">{c.grade.nom}</span>
            {c.compte ? <span className="compte">{c.compte}</span> : null}
          </span>
        </span>
        <span className="part" aria-hidden="true">
          <span className="piste"><span style={{ width: `${part}%` }} /></span>
          <span className="quoi num">
            {c.bornes} RedBox · {c.badges} badge{c.badges > 1 ? "s" : ""}
          </span>
        </span>
        <span className="pts">
          <span className="n num">{c.points}<small>pts</small></span>
          <span className="niv num">niveau {c.niveau}</span>
        </span>
      </Link>
    </li>
  );
}
