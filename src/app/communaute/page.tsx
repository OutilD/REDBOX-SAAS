import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { utilisateur } from "@/lib/auth";
import { badgesVus, classement, evaluerBadges, objectifs, profilDe,
         rangDe, rareteDesBadges, type Classe } from "@/lib/communaute";
import { salonsDe } from "@/lib/salons";
import { Badge } from "./badge";
import CarteMoi from "./carte-moi";
import Collection from "./collection";
import { vuesBadges } from "./vues-badges";
import { Portrait } from "./vignette-personne";
import { VoirPlus, aMontrer } from "../voir-plus";

export const dynamic = "force-dynamic";

/** Le palmares s'ouvre sur les vingt premiers, et s'allonge de vingt en vingt. */
const PALMARES_PAR_PAGE = 20;

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
export default async function Communaute({ searchParams }:
  { searchParams: Promise<{ n?: string; classement?: string }> }) {
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
  // Avant `badgesVus` : les nouveaux gardent leur marque, et leur revelation se joue.
  const vues = vuesBadges(moi, rarete);
  const acquis = moi.badges.map((b) => b.cle);
  const vises = objectifs(moi.faits, acquis);
  const sp = await searchParams;
  // Sur un telephone le palmares est replie sur ma seule ligne ; il s'ouvre
  // par l'adresse, pour que le retour le retrouve ouvert.
  const ouvert = sp.classement === "tout";
  const HAUT = aMontrer(sp.n, PALMARES_PAR_PAGE);
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

        {/* ---------------------------------------------------------- moi */}
        <CarteMoi moi={moi} id={u.id} monRang={monRang} ecart={ecart} />

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
                <Link key={b.cle} href={`/communaute/badges/${b.cle}`} data-badge={b.cle}
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
        <div className="titre-section" id="classement">
          <h2>Classement</h2>
          <span className="faible num" style={{ fontSize: 12.5 }}>
            {tous.length} redboxer{tous.length > 1 ? "s" : ""} · par points
          </span>
        </div>
        <ol className={ouvert ? "palmares ouvert" : "palmares"}>
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
        {!ouvert && tous.length > 1 ? (
          <Link href="/communaute?classement=tout#classement" scroll={false} className="palmares-tout">
            Voir tout le classement ›
          </Link>
        ) : null}
        <div className={ouvert ? "palmares-suite" : "palmares-suite ferme"}>
          <VoirPlus href={`/communaute?n=${HAUT + PALMARES_PAR_PAGE}${ouvert ? "&classement=tout" : ""}#r${HAUT + 1}`}
                    montres={HAUT} total={tous.length} plus={tous.length > HAUT}
                    pas={PALMARES_PAR_PAGE} unite={["redboxer", "redboxers"]} />
        </div>

        {/* -------------------------------------------------------- badges
            TOUT CE QUI EXISTE, en tuiles : obtenu en couleur, le reste en
            creux. Le detail de chacun est dans sa bulle. */}
        <Collection vues={vues} />

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
    <li id={`r${rang}`} className={[moi ? "moi" : "", medaille].filter(Boolean).join(" ")}>
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
