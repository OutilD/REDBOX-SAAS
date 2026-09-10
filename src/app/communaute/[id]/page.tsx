import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { utilisateur } from "@/lib/auth";
import { leJour } from "@/db";
import { BADGES, prochainGrade, profilDe, rangDe } from "@/lib/communaute";
import { Badge } from "../badge";
import { Portrait } from "../vignette-personne";

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
  const p = await profilDe(id, u);
  if (!p) notFound();
  const ouvert = p.public || p.moi || u.editeur;
  const suivant = prochainGrade(p.bornes);

  return (
    <>
      <Entete page="communaute" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/communaute" className="bouton petit" aria-label="Retour à la communauté">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0 }}>Profil</h1></div>
          {p.moi ? <Link href="/communaute/moi" className="bouton petit">Personnaliser</Link> : null}
        </div>

        <div className="carte profil-public" style={p.couleur ? { borderColor: p.couleur } : undefined}>
          <div className="rangee" style={{ gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Portrait image_id={p.image_id} pseudo={p.pseudo} couleur={p.couleur} taille={96} />
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
                <span className="etiquette">Niveau {p.niveau}</span>
                <span className="faible num" style={{ fontSize: 13 }}>{p.points} pts</span>
              </div>
              {ouvert && p.bio ? <p style={{ margin: "12px 0 0", fontSize: 14.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{p.bio}</p> : null}
              {!ouvert ? <p className="faible" style={{ margin: "12px 0 0", fontSize: 13 }}>Ce profil est fermé : son propriétaire ne montre que son grade et ses badges.</p> : null}
            </div>
          </div>

          <div className="bandeau quatre" style={{ marginTop: 16 }}>
            <div><div className="faible" style={{ fontSize: 12 }}>Bornes en service</div>
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

        <h2>Badges</h2>
        <div className="carte plate">
          {p.badges.length === 0 ? (
            <p className="vide" style={{ padding: 20 }}>Aucun badge encore.</p>
          ) : (
            <div className="badges-grille">
              {p.badges.map((b) => (
                <div key={b.cle} className="badge-fiche">
                  <Badge forme={b.forme} taille={44} rang={rangDe(b)} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{b.nom}</div>
                    <div className="faible" style={{ fontSize: 12.5 }}>{b.quoi}</div>
                    <div className="faible num" style={{ fontSize: 11.5, marginTop: 2 }}>obtenu le {leJour(b.obtenu_le)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <NavBasse page="communaute" />
    </>
  );
}
