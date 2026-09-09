import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { utilisateur } from "@/lib/auth";
import { BADGES, PAS_NIVEAU, badgesVus, classement, evaluerBadges, prochainGrade, profilDe } from "@/lib/communaute";
import { salonsDe } from "@/lib/salons";
import { Badge } from "./badge";
import { Personne, Portrait } from "./vignette-personne";

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
  const [moi, classe, salons] = await Promise.all([profilDe(u.id, u), classement(20), salonsDe(u)]);
  if (!moi) redirect("/");
  const nouveaux = moi.badges.filter((b) => b.nouveau);
  if (nouveaux.length > 0) await badgesVus(u.id);
  const suivant = prochainGrade(moi.bornes);
  const versNiveau = PAS_NIVEAU - (moi.points % PAS_NIVEAU);
  const monRang = classe.findIndex((c) => c.id === u.id) + 1;
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

        {/* ---------------------------------------------------------- moi */}
        <div className="carte moi-carte" style={moi.couleur ? { borderColor: moi.couleur } : undefined}>
          <div className="rangee" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Portrait image_id={moi.image_id} pseudo={moi.pseudo} couleur={moi.couleur} taille={72} />
            <div className="pousse" style={{ minWidth: 200 }}>
              <div style={{ fontSize: 20, fontWeight: 750, letterSpacing: "-.02em" }}>
                {moi.pseudo}{moi.editeur ? <span className="etiquette editeur">RedBox</span> : null}
              </div>
              <div className="faible" style={{ fontSize: 13 }}>{moi.compte}{moi.ville ? ` · ${moi.ville}` : ""}</div>
              <div className="rangee" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                <span className="etiquette grade grand">{moi.grade.nom}</span>
                <span className="etiquette">Niveau {moi.niveau}</span>
                <span className="faible" style={{ fontSize: 13 }}>{moi.points} pts · encore {versNiveau} pour le niveau {moi.niveau + 1}</span>
              </div>
              <p className="faible" style={{ fontSize: 13, margin: "8px 0 0" }}>
                {moi.bornes} borne{moi.bornes > 1 ? "s" : ""} en service
                {suivant ? ` — ${suivant.manque} de plus et vous êtes ${suivant.grade.nom}.` : " — le sommet."}
                {" "}{monRang > 0 ? `${monRang}e au classement.` : ""}
              </p>
            </div>
            <div className="rangee" style={{ gap: 8 }}>
              <Link href={`/communaute/${u.id}`} className="bouton petit">Mon profil public</Link>
              <Link href="/communaute/moi" className="bouton petit primaire">Personnaliser</Link>
            </div>
          </div>
          {moi.badges.length > 0 ? (
            <div className="badges-rangee" style={{ marginTop: 14 }}>
              {moi.badges.map((b) => (
                <span key={b.cle} className="badge-item" title={b.quoi}>
                  <Badge forme={b.forme} taille={36} />
                  <span>{b.nom}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {nouveaux.length > 0 || neufs.length > 0 ? (
          <div className="carte chaude" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {nouveaux.length > 1 ? "Nouveaux badges !" : "Nouveau badge !"}
            </div>
            <div className="badges-rangee">
              {nouveaux.map((b) => (
                <span key={b.cle} className="badge-item">
                  <Badge forme={b.forme} taille={40} />
                  <span><b>{b.nom}</b><br /><span className="faible">{b.quoi}</span></span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* ---------------------------------------------------- classement */}
        <h2>Classement</h2>
        <div className="carte plate">
          <ol className="classement">
            {classe.map((c, i) => (
              <li key={c.id} className={c.id === u.id ? "moi" : ""}>
                <span className="rang num">{i + 1}</span>
                <Personne id={c.id} image_id={c.image_id} pseudo={c.pseudo} couleur={c.couleur}
                          editeur={c.editeur}
                          sous={`${c.grade.nom}${c.compte ? ` · ${c.compte}` : ""}`} />
                <span className="chiffres">
                  <span className="num" style={{ fontWeight: 700 }}>{c.points} pts</span>
                  <span className="faible num" style={{ fontSize: 12 }}>
                    niv. {c.niveau} · {c.bornes} borne{c.bornes > 1 ? "s" : ""} · {c.badges} badge{c.badges > 1 ? "s" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* -------------------------------------------------------- badges */}
        <h2>Les badges</h2>
        <div className="carte plate">
          <div className="badges-grille">
            {BADGES.map((b) => {
              const a = moi.badges.find((x) => x.cle === b.cle);
              return (
                <div key={b.cle} className={`badge-fiche${a ? "" : " eteint"}`}>
                  <Badge forme={b.forme} obtenu={Boolean(a)} taille={44} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{b.nom}</div>
                    <div className="faible" style={{ fontSize: 12.5 }}>{b.quoi}</div>
                    <div className="faible num" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {b.points > 0 ? `${b.points} pts` : ""}
                      {a ? ` · obtenu le ${new Date(a.obtenu_le).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", year: "numeric" })}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
