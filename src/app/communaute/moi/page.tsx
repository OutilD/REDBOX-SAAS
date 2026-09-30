import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q, q1 } from "@/db";
import { utilisateur } from "@/lib/auth";
import { BADGES, COULEURS, PSEUDO_MAX, VEDETTES_MAX, rangDe } from "@/lib/communaute";
import { Badge } from "../badge";
import { initiales } from "@/lib/personnes";
import ChangerPhoto from "../../profil/changer-photo";

export const dynamic = "force-dynamic";

type Moi = { pseudo: string | null; ville: string | null; bio: string | null; couleur: string | null; profil_public: boolean;
             badges_vedettes: string[] };

/**
 * PERSONNALISER SON PROFIL. Le pseudo, la ville, deux lignes, une couleur,
 * et si l'on se montre. La photo se change sur « Mon compte », avec le reste
 * de ce que l'equipe voit : c'est la meme.
 */
export default async function Personnaliser({ searchParams }:
  { searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const { e } = await searchParams;
  const [moi, obtenus] = await Promise.all([
    q1<Moi>("SELECT pseudo, ville, bio, couleur, profil_public, badges_vedettes FROM utilisateur WHERE id = $1", [u.id]),
    q<{ badge: string }>("SELECT badge FROM badge_obtenu WHERE utilisateur_id = $1", [u.id]),
  ]).then(([m, o]) => [m!, new Set(o.map((x) => x.badge))] as const);
  const siens = BADGES.filter((b) => obtenus.has(b.cle));

  return (
    <>
      <Entete page="communaute" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/communaute" className="bouton petit" aria-label="Retour à la communauté">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0 }}>Mon profil public</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12 }}>
          Ce que les autres redboxers voient de vous.
        </p>
        {/* La photo aussi, ici : c'est la qu'on la cherche en regardant son
            profil. C'est la meme que sur « Mon compte », et elle s'enregistre
            des qu'on la choisit. */}
        <div className="carte" style={{ marginBottom: 12 }}>
          <ChangerPhoto imageId={u.image_id} initiales={initiales(moi.pseudo || u.nom || u.email)}
                        couleur={moi.couleur} retour="/communaute/moi" taille={72} />
        </div>
        {e ? <p className="erreur">{e === "pseudo" ? "Le pseudo est trop long (trente caractères)."
                                    : e === "vitrine" ? `Trois badges au plus dans la vitrine.` : "Impossible."}</p> : null}

        <form method="post" action="/api/communaute/profil" className="carte">
          <div className="champ">
            <label htmlFor="pseudo">Pseudo</label>
            <input id="pseudo" name="pseudo" defaultValue={moi.pseudo ?? ""} maxLength={PSEUDO_MAX}
                   placeholder="Le nom que tout le monde verra" />
            <p className="faible" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
              C’est sous ce nom que l’équipe et tous les redboxers vous voient, dans la console comme dans la communauté.
            </p>
          </div>
          <div className="champ">
            <label htmlFor="ville">Ville</label>
            <input id="ville" name="ville" defaultValue={moi.ville ?? ""} maxLength={60} placeholder="Où tournent vos RedBox" />
          </div>
          <div className="champ">
            <label htmlFor="bio">Deux lignes sur vous</label>
            <textarea id="bio" name="bio" defaultValue={moi.bio ?? ""} maxLength={300} rows={3}
                      style={{ padding: "10px 14px", lineHeight: 1.45 }}
                      placeholder="Ce que vous vendez, où, depuis quand…" />
          </div>
          <fieldset className="cadre-choix">
            <legend>Couleur</legend>
            <div className="couleurs">
              <label className="couleur-choix" title="Aucune">
                <input type="radio" name="couleur" value="" defaultChecked={!moi.couleur} />
                <span className="pastille-couleur aucune">—</span>
              </label>
              {COULEURS.map((c) => (
                <label key={c} className="couleur-choix" title={c}>
                  <input type="radio" name="couleur" value={c} defaultChecked={moi.couleur === c} />
                  <span className="pastille-couleur" style={{ background: c }} />
                </label>
              ))}
            </div>
          </fieldset>
          {siens.length > 0 ? (
            <fieldset className="cadre-choix" id="vitrine" style={{ marginTop: 14 }}>
              <legend>Vitrine · {VEDETTES_MAX} badges au plus</legend>
              <p className="faible" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
                Ils s’affichent en grand sur votre profil, et le premier à côté de votre nom dans les
                messages et le classement. Aucun coché : vos plus rares.
              </p>
              <div className="rangee" style={{ gap: 10, flexWrap: "wrap" }}>
                {siens.map((b) => (
                  <label key={b.cle} className="coche" title={b.quoi}
                         style={{ display: "flex", alignItems: "center", gap: 6, margin: 0, minWidth: 150 }}>
                    <input type="checkbox" name="vedette" value={b.cle}
                           defaultChecked={(moi.badges_vedettes ?? []).includes(b.cle)} />
                    <Badge forme={b.forme} taille={26} rang={rangDe(b)} />
                    <span style={{ fontSize: 13 }}>{b.nom}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label className="coche" style={{ marginTop: 14 }}>
            <input type="checkbox" name="public" defaultChecked={moi.profil_public} />
            <span><b>Profil ouvert</b> — les autres voient votre exploitation, votre ville et vos deux lignes. Fermé, ils ne voient que votre pseudo, votre grade et vos badges.</span>
          </label>
          <div style={{ height: 16 }} />
          <button className="bouton primaire">Enregistrer</button>
        </form>
      </main>
      <NavBasse page="communaute" />
    </>
  );
}
