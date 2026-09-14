import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { utilisateur } from "@/lib/auth";
import { leJour } from "@/db";
import { BADGES, NOM_RANG, badgeDe, porteursDe, profilDe, progresDe, rangDe, rareteDesBadges }
  from "@/lib/communaute";
import { Badge } from "../../badge";
import PieceVivante from "../../piece3d/piece-vivante";
import { Personne } from "../../vignette-personne";
import { VoirPlus, aMontrer } from "../../../voir-plus";

export const dynamic = "force-dynamic";

/** Les porteurs d'un badge, par paquets de vingt-quatre — quatre rangees de six. */
const PORTEURS_PAR_PAGE = 24;

/**
 * UN BADGE, ET COMMENT ON L'OBTIENT.
 *
 * La grille de la communaute dit ce qui existe ; elle ne dit pas par ou
 * commencer. « Cent messages » n'apprend rien a qui n'a jamais ouvert un
 * salon. Cette page repond a une seule question — qu'est-ce que je fais,
 * maintenant, pour l'avoir — et met la piece au milieu, en volume, pour que
 * la reponse vaille la peine d'etre lue.
 *
 * Quatre choses, dans cet ordre : la piece et ce qu'elle vaut ; ou j'en suis ;
 * la manoeuvre ; qui l'a deja eu. Les visages en dernier, parce qu'ils sont
 * une preuve, pas une consigne : quelqu'un l'a fait, donc c'est faisable, et
 * on peut aller lui demander comment.
 */
export default async function PageBadge({ params, searchParams }: {
  params: Promise<{ cle: string }>; searchParams: Promise<{ n?: string }>;
}) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const { cle } = await params;
  const n = aMontrer((await searchParams).n, PORTEURS_PAR_PAGE);
  const b = badgeDe(cle);
  if (!b) notFound();

  const [moi, porteurs, rarete] = await Promise.all([
    // Un de plus que ce qu'on montre : c'est lui qui dit s'il reste une suite.
    profilDe(u.id, u), porteursDe(cle, n + 1), rareteDesBadges(),
  ]);
  if (!moi) redirect("/");
  const encore = porteurs.length > n;
  const visibles = porteurs.slice(0, n);

  const rang = rangDe(b);
  const a = moi.badges.find((x) => x.cle === b.cle) ?? null;
  const p = a ? null : progresDe(moi.faits, b.cle);
  const combien = rarete.get(b.cle);
  const i = BADGES.findIndex((x) => x.cle === b.cle);
  const avant = BADGES[i - 1], apres = BADGES[i + 1];

  return (
    <>
      <Entete page="communaute" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/communaute" className="bouton petit" aria-label="Retour à la communauté">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0 }}>{b.nom}</h1></div>
        </div>

        <div className={`carte fiche-badge ${rang}${a ? "" : " eteint"}`}>
          <div className="presentoir">
            <PieceVivante taille={280} elan={a ? 9 : 0}
                          libelle={`Pièce du badge ${b.nom}, ${NOM_RANG[rang]}. Faites-la tourner au doigt, à la souris ou aux flèches.`}
                          options={{ image: `/badges/${b.forme}.png`, rang, obtenu: Boolean(a), nom: b.nom,
                                     distinction: NOM_RANG[rang], date: a ? leJour(a.obtenu_le) : null, points: b.points }} />
            <p className="indice">Faites-la tourner — au doigt, à la souris, ou aux flèches. Le revers est gravé.</p>
          </div>

          <div className="dit">
            <div className="rangee" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className={`etiquette rang ${rang}`}>{NOM_RANG[rang]}</span>
              {b.points > 0 ? <span className="etiquette">+{b.points} pts</span> : null}
              {a ? <span className="etiquette grade">obtenu</span> : null}
            </div>
            <p className="devise">« {b.devise} »</p>
            <p className="quoi">{b.quoi}</p>

            {/* OU J'EN SUIS. La reponse la plus attendue de la page : avant de
                lire la manoeuvre, on veut savoir s'il reste loin. */}
            {a ? (
              <p className="etat bon">
                Vous l’avez depuis le {leJour(a.obtenu_le)}.
              </p>
            ) : p ? (
              <div className="etat">
                <div className="piste"><span style={{ width: `${p.pct}%` }} /></div>
                <div className="chiffres num">
                  <span><b>{p.n}</b> / {p.sur}</span>
                  <span className="faible">{p.pct} %{p.sur - p.n > 0 ? ` · encore ${p.sur - p.n}` : ""}</span>
                </div>
              </div>
            ) : (
              <p className="etat faible">
                {b.patience ? "Il ne se compte pas : il arrive, ou il est déjà passé."
                            : "Vous ne l’avez pas encore. Il tombe d’un coup, sans étape intermédiaire."}
              </p>
            )}

            <h2>Comment l’obtenir</h2>
            <p className="comment">{b.comment}</p>

            <div className="socle-chiffres">
              <div>
                <b className="num">{combien?.n ?? 0}</b>
                <span>{(combien?.n ?? 0) > 1 ? "redboxers l’ont" : "redboxer l’a"}</span>
              </div>
              <div>
                <b className="num">{combien && combien.pct > 0 ? `${combien.pct} %` : "< 1 %"}</b>
                <span>de la communauté</span>
              </div>
              <div>
                <b className="num">{b.points > 0 ? `+${b.points}` : "—"}</b>
                <span>{b.points > 0 ? "points au classement" : "aucun point"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* QUI L'A DEJA EU. Une preuve, pas une consigne. */}
        {porteurs.length > 0 ? (
          <>
            <div className="titre-section">
              <h2>Ils l’ont</h2>
              <span className="faible" style={{ fontSize: 12.5 }}>les premiers d’abord</span>
            </div>
            <div className="carte plate">
              <div className="porteurs">
                {visibles.map((x, i) => (
                  <div key={x.id} id={`p${i + 1}`} className="porteur">
                    <Personne id={x.id} image_id={x.image_id} pseudo={x.pseudo}
                              couleur={x.couleur} editeur={x.editeur}
                              sous={`depuis le ${leJour(x.obtenu_le)}`} />
                  </div>
                ))}
              </div>
            </div>
            <VoirPlus href={`/communaute/badges/${cle}?n=${n + PORTEURS_PAR_PAGE}#p${n + 1}`}
                      montres={n} total={Math.max(combien?.n ?? 0, porteurs.length)} plus={encore}
                      pas={PORTEURS_PAR_PAGE} unite={["redboxer", "redboxers"]} />
          </>
        ) : (
          <p className="vide" style={{ padding: 20 }}>
            Personne ne l’a encore. La première place est libre.
          </p>
        )}

        {/* Feuilleter le catalogue sans repasser par la grille. */}
        <div className="feuillets">
          {avant ? (
            <Link href={`/communaute/badges/${avant.cle}`} className="feuillet">
              <span className="sens">‹ précédent</span>
              <span className="rangee" style={{ gap: 9 }}>
                <Badge forme={avant.forme} taille={26} rang={rangDe(avant)} />
                <b>{avant.nom}</b>
              </span>
            </Link>
          ) : <span />}
          {apres ? (
            <Link href={`/communaute/badges/${apres.cle}`} className="feuillet fin">
              <span className="sens">suivant ›</span>
              <span className="rangee" style={{ gap: 9 }}>
                <b>{apres.nom}</b>
                <Badge forme={apres.forme} taille={26} rang={rangDe(apres)} />
              </span>
            </Link>
          ) : <span />}
        </div>
      </main>
      <NavBasse page="communaute" />
    </>
  );
}
