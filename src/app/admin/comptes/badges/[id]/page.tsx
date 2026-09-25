import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../../chrome";
import { q, q1, leJour } from "@/db";
import { estSuperAdmin, utilisateur } from "@/lib/auth";
import { nomAffiche } from "@/lib/personnes";
import { BADGES, NOM_RANG, RANGS, faitsEtMerites, progresDe, rangDe } from "@/lib/communaute";
import { Badge } from "../../../../communaute/badge";

export const dynamic = "force-dynamic";

const FILTRES = [
  { valeur: "tous", nom: "Tous" },
  { valeur: "debloques", nom: "Obtenus" },
  { valeur: "verrouilles", nom: "À donner" },
] as const;

type Personne = { id: number; email: string; pseudo: string | null; nom: string | null; comptes: string[] };

/**
 * LES BADGES D'UNE PERSONNE, POUR L'EQUIPE.
 *
 * La meme grille que la collection de la communaute — les memes tuiles, le
 * meme metal par palier, le meme cadenas —, mais chaque tuile est un bouton :
 * on la touche pour donner le badge, on la retouche pour le reprendre. Les
 * objectifs n'y changent rien : on peut offrir « Réseau » a qui n'a qu'une
 * machine.
 *
 * Ce que les faits meritent est marque « mérité » : le reprendre ne dure que
 * jusqu'a la prochaine evaluation. Ce qui ne l'est pas porte ou la personne en
 * est, pour qu'on sache ce qu'on offre en avance.
 */
export default async function BadgesDe({ params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!estSuperAdmin(u)) redirect("/");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [p, obtenus, fm] = await Promise.all([
    q1<Personne>(`
      SELECT u.id, u.email, u.pseudo, u.nom,
             COALESCE((SELECT array_agg(k.nom ORDER BY k.nom) FROM membre m JOIN compte k ON k.id = m.compte_id
                        WHERE m.utilisateur_id = u.id), '{}') AS comptes
        FROM utilisateur u WHERE u.id = $1`, [id]),
    q<{ badge: string; obtenu_le: Date }>("SELECT badge, obtenu_le FROM badge_obtenu WHERE utilisateur_id = $1", [id]),
    faitsEtMerites(id),
  ]);
  if (!p) notFound();

  const quand = new Map(obtenus.map((o) => [o.badge, o.obtenu_le]));
  const merites = new Set(fm?.merites ?? []);
  const vues = BADGES.map((b) => {
    const rang = rangDe(b);
    return { ...b, rang, palier: RANGS.indexOf(rang) + 1, obtenu: quand.has(b.cle),
             obtenuLe: quand.get(b.cle) ?? null, merite: merites.has(b.cle),
             progres: fm ? progresDe(fm.faits, b.cle) : null };
  }).sort((x, z) => Number(z.obtenu) - Number(x.obtenu) || z.palier - x.palier || z.points - x.points);

  const n = vues.filter((v) => v.obtenu).length;
  const total = vues.length;
  const comptes = { tous: total, debloques: n, verrouilles: total - n };
  const retour = `/admin/comptes/badges/${p.id}`;

  return (
    <>
      <Entete page="admin_comptes" />
      <main className="ecran">
        <div className="tete-tableau">
          <div className="quoi">
            <h1>Badges de {nomAffiche(p)}</h1>
            <p className="sous">{p.email}{p.comptes.length > 0 ? ` · ${p.comptes.join(", ")}` : ""}</p>
          </div>
          <div className="rangee-actions">
            <Link href="/admin/comptes" className="bouton">Comptes</Link>
          </div>
        </div>

        <section className="carte collection" aria-labelledby="titre-attribution" style={{ marginTop: 18 }}>
          <div className="collection-tete">
            <h2 id="titre-attribution">Donner ou reprendre</h2>
            <p className="attribution-aide">
              Touchez un badge pour le donner, même si l’objectif n’est pas atteint ; touchez-le à nouveau pour le
              reprendre. Un badge <span className="merite">mérité</span> repris revient à la prochaine évaluation.
            </p>
            <div className="collection-compte">
              <span className="num"><b>{n}</b> / {total}</span>
              <span className="mot">obtenus</span>
              <span className="piste-collection" aria-hidden><span style={{ width: `${Math.round((n / total) * 100)}%` }} /></span>
            </div>
            <div className="periodes petites filtres-collection" role="group" aria-label="Afficher les badges">
              {FILTRES.map((f) => (
                <label key={f.valeur}>
                  <input type="radio" name="filtre-badges" value={f.valeur} defaultChecked={f.valeur === "tous"} />
                  {f.nom}<span className="compte num">{comptes[f.valeur]}</span>
                </label>
              ))}
            </div>
            <ul className="collection-raretes" aria-label="Les cinq paliers">
              {RANGS.map((r) => (
                <li key={r} className={`rarete-puce ${r}`}>
                  <i aria-hidden />{NOM_RANG[r]}
                  <span className="num">{vues.filter((v) => v.rang === r && v.obtenu).length}/{vues.filter((v) => v.rang === r).length}</span>
                </li>
              ))}
            </ul>
          </div>

          <ul className="tuiles">
            {vues.map((v) => (
              <li key={v.cle} id={`b-${v.cle}`} className={`tuile ${v.rang}`} data-etat={v.obtenu ? "debloque" : "verrouille"}>
                <form method="post" action="/api/admin/badge">
                  <input type="hidden" name="utilisateur_id" value={p.id} />
                  <input type="hidden" name="badge" value={v.cle} />
                  <input type="hidden" name="valeur" value={v.obtenu ? "0" : "1"} />
                  <input type="hidden" name="retour" value={retour} />
                  <button className="tuile-lien tuile-bouton"
                          title={`${v.nom} — ${v.quoi}${v.obtenuLe ? ` · obtenu le ${leJour(v.obtenuLe)}` : ""}`}>
                    <span className="tuile-cadre">
                      <span className="tuile-foil" aria-hidden />
                      <Badge forme={v.forme} obtenu={v.obtenu} taille={58} rang={v.rang} />
                      <span className="tuile-pips" aria-hidden>
                        {Array.from({ length: v.palier }, (_, i) => <i key={i} />)}
                      </span>
                      {!v.obtenu && v.progres && v.progres.pct > 0 ? (
                        <span className="tuile-avance" aria-hidden><span style={{ width: `${v.progres.pct}%` }} /></span>
                      ) : null}
                      <span className="tuile-sceau" aria-hidden>{v.obtenu ? "✓" : "+"}</span>
                    </span>
                    <span className="tuile-nom">{v.nom}</span>
                    <span className="tuile-geste">
                      {v.obtenu
                        ? <>{v.merite ? <span className="merite">mérité</span> : null}<span className="agir">Reprendre</span></>
                        : <>{v.progres ? <span className="num">{v.progres.n}/{v.progres.sur}</span> : null}<span className="agir">Donner</span></>}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="collection-vide vide-debloques">Aucun badge pour l’instant.</p>
          <p className="collection-vide vide-verrouilles">Tous les badges sont obtenus.</p>
        </section>
      </main>
      <NavBasse page="admin_comptes" />
    </>
  );
}
