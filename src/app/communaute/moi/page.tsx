import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q1 } from "@/db";
import { utilisateur } from "@/lib/auth";
import { COULEURS } from "@/lib/communaute";

export const dynamic = "force-dynamic";

type Moi = { pseudo: string | null; ville: string | null; bio: string | null; couleur: string | null; profil_public: boolean };

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
  const moi = (await q1<Moi>(
    "SELECT pseudo, ville, bio, couleur, profil_public FROM utilisateur WHERE id = $1", [u.id]))!;

  return (
    <>
      <Entete page="communaute" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/communaute" className="bouton petit" aria-label="Retour à la communauté">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0 }}>Mon profil public</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12 }}>
          Ce que les autres redboxers voient de vous. La photo se change sur{" "}
          <Link href="/profil" style={{ textDecoration: "underline" }}>Mon compte</Link>.
        </p>
        {e ? <p className="erreur">{e === "pseudo" ? "Le pseudo est trop long (trente caractères)." : "Impossible."}</p> : null}

        <form method="post" action="/api/communaute/profil" className="carte">
          <div className="champ">
            <label htmlFor="pseudo">Pseudo</label>
            <input id="pseudo" name="pseudo" defaultValue={moi.pseudo ?? ""} maxLength={30}
                   placeholder={u.nom || u.email.split("@")[0]} />
            <p className="faible" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
              Il remplace votre nom dans la communauté. Vide, c’est votre nom qui sert.
            </p>
          </div>
          <div className="champ">
            <label htmlFor="ville">Ville</label>
            <input id="ville" name="ville" defaultValue={moi.ville ?? ""} maxLength={60} placeholder="Où tournent vos bornes" />
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
