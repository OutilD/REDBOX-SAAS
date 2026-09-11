import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { utilisateur } from "@/lib/auth";
import { leJour } from "@/db";
import { BADGES, classement, objectifs, prochainGrade, profilDe, rangDe } from "@/lib/communaute";
import { Badge } from "../badge";
import { Portrait } from "../vignette-personne";
import { AnneauNiveau, BarreNiveau } from "../niveau";

export const dynamic = "force-dynamic";

/**
 * LE PROFIL PUBLIC DE QUELQU'UN. Ce qu'il a choisi de montrer : la photo, le
 * pseudo, la ville, deux lignes sur lui, son exploitation ; et ce que la
 * console sait : le grade, le niveau, l'anciennete, les badges. Un profil
 * ferme ne montre que le pseudo, le grade et les badges.
 */
export default async function ProfilPublic({ params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [p, tous] = await Promise.all([profilDe(id, u), classement(1000)]);
  if (!p) notFound();
  const ouvert = p.public || p.moi || u.editeur;
  const suivant = prochainGrade(p.bornes);
  // Le rang dans toute la communaute, pas dans le haut de liste : un profil dit
  // ou en est la personne, meme a la trente-quatrieme place.
  const rang = tous.findIndex((c) => c.id === p.id) + 1;
  // Les prochains objectifs, sur SON profil seulement : ce qu'on vise est une
  // affaire privee, et ceux d'un autre ne disent rien de ce qu'on peut faire.
  const vises = p.moi ? objectifs(p.faits, p.badges.map((b) => b.cle)) : [];

  return (
    <>
      <Entete page="communaute" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/communaute" className="bouton petit" aria-label="Retour à la communauté">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0 }}>{p.moi ? "Mon profil" : "Profil"}</h1></div>
          {p.moi ? (
            <>
              <Link href="/communaute/moi" className="bouton petit">Personnaliser</Link>
              <Link href="/profil" className="bouton petit">Mon compte</Link>
            </>
          ) : null}
        </div>

        {/* LE PROFIL COMPLET. Le niveau entoure le visage, comme sur la page
            Communaute : la part parcourue se lit autour du portrait, et le
            chiffre se pose dessous. `moi-carte` en reprend la forme. */}
        <div className="carte moi-carte profil-public" style={p.couleur ? { borderColor: p.couleur } : undefined}>
          <div className="rangee" style={{ gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div className="face">
              <AnneauNiveau points={p.points} taille={112} couleur={p.couleur} />
              <span className="dans-anneau">
                <Portrait image_id={p.image_id} pseudo={p.pseudo} couleur={p.couleur} taille={80} />
              </span>
            </div>
            <div className="pousse" style={{ minWidth: 220 }}>
              <div style={{ fontSize: 24, fontWeight: 750, letterSpacing: "-.02em" }}>
                {p.pseudo}{p.editeur ? <span className="etiquette editeur">RedBox</span> : null}
              </div>
              {ouvert ? (
                <div className="faible" style={{ fontSize: 13.5 }}>
                  {p.compte}{p.ville ? ` · ${p.ville}` : ""}
                </div>
              ) : null}
              <div className="rangee" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                <span className="etiquette grade grand">{p.grade.nom}</span>
                <span className="faible num" style={{ fontSize: 13 }}>
                  {p.points} pts{rang > 0 ? ` · ${rang}${rang === 1 ? "er" : "e"} au classement` : ""}
                </span>
              </div>
              <BarreNiveau points={p.points} />
              {ouvert && p.bio ? <p style={{ margin: "12px 0 0", fontSize: 14.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{p.bio}</p> : null}
              {!ouvert ? <p className="faible" style={{ margin: "12px 0 0", fontSize: 13 }}>Ce profil est fermé : son propriétaire ne montre que son grade et ses badges.</p> : null}
            </div>
          </div>

          <div className="bandeau quatre" style={{ marginTop: 16 }}>
            <div><div className="faible" style={{ fontSize: 12 }}>RedBox en service</div>
                 <div className="num" style={{ fontSize: 22, fontWeight: 750 }}>{p.bornes}</div>
                 {suivant ? <div className="faible" style={{ fontSize: 11.5 }}>{suivant.manque} de plus → {suivant.grade.nom}</div> : null}</div>
            <div><div className="faible" style={{ fontSize: 12 }}>Redboxer depuis</div>
                 <div className="num" style={{ fontSize: 22, fontWeight: 750 }}>{p.jours} j</div>
                 <div className="faible" style={{ fontSize: 11.5 }}>le {leJour(p.cree_le)}</div></div>
            <div><div className="faible" style={{ fontSize: 12 }}>Messages</div>
                 <div className="num" style={{ fontSize: 22, fontWeight: 750 }}>{ouvert ? p.messages : "—"}</div></div>
            <div><div className="faible" style={{ fontSize: 12 }}>Badges</div>
                 <div className="num" style={{ fontSize: 22, fontWeight: 750 }}>{p.badges.length} / {BADGES.length}</div></div>
          </div>
        </div>

        {vises.length > 0 ? (
          <>
            <div className="titre-section">
              <h2>Vos prochains objectifs</h2>
              <span className="faible" style={{ fontSize: 12.5 }}>les plus proches d’abord</span>
            </div>
            <div className="objectifs">
              {vises.map((b) => (
                <Link key={b.cle} href={`/communaute/badges/${b.cle}`} className={`objectif ${rangDe(b)}`}>
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

        <div className="titre-section">
          <h2>Badges</h2>
          <span className="faible num" style={{ fontSize: 12.5 }}>{p.badges.length} sur {BADGES.length}</span>
          {p.moi ? <Link href="/communaute" className="faible" style={{ fontSize: 12.5, marginLeft: "auto" }}>Tous les badges ›</Link> : null}
        </div>
        <div className="carte plate">
          {p.badges.length === 0 ? (
            <p className="vide" style={{ padding: 20 }}>Aucun badge encore.</p>
          ) : (
            <div className="badges-grille">
              {/* CHAQUE BADGE MENE A SA PAGE. Voir celui d'un autre donne envie de
                  l'avoir ; la page dit comment, ou j'en suis moi, et montre la
                  piece en volume. Une page plutot qu'une fenetre par-dessus :
                  elle a une adresse qu'on partage, et le retour arriere y ramene. */}
              {p.badges.map((b) => (
                <Link key={b.cle} href={`/communaute/badges/${b.cle}`} className={`badge-fiche ${rangDe(b)}`}
                      title={`${b.nom} — comment l’obtenir`}>
                  <Badge forme={b.forme} taille={44} rang={rangDe(b)} />
                  <div className="dit">
                    <div className="nom">{b.nom}</div>
                    <div className="faible quoi">{b.quoi}</div>
                    <div className="pied num">
                      <span className="faible">obtenu le {leJour(b.obtenu_le)}</span>
                      <span style={{ color: "var(--rouge-vif)", fontWeight: 650 }}>Comment l’obtenir ›</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <NavBasse page="communaute" />
    </>
  );
}
