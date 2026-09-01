import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { q, q1, euros, codeCanal } from "@/db";
import { peutConfigurer, utilisateur } from "@/lib/auth";
import { Repli } from "../../../repli";
import { IcoBorne } from "../../../icones";
import { canauxDe } from "@/lib/stock";

export const dynamic = "force-dynamic";

/** Quel produit dans quel canal. De la configuration, pas du réassort. */
export default async function Planogramme({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  const { e } = await searchParams;
  if (!peutConfigurer(u)) redirect(`/bornes/${id}`);

  const b = await q1<{ nom: string }>(
    "SELECT nom FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  if (!b) notFound();

  const canaux = await canauxDe(id, u.compte_id);
  const produits = await q<{ id: number; sku: string; nom: string;
                            prix_vente_c: number; categorie: string }>(`
    SELECT p.id, p.sku, p.nom, p.prix_vente_c,
           COALESCE(cat.nom, 'sans catégorie') AS categorie
      FROM produit p LEFT JOIN categorie cat ON cat.id = p.categorie_id
     WHERE p.compte_id = $1 AND p.actif
     ORDER BY COALESCE(cat.ordre, 999), COALESCE(cat.nom, 'zzz'), p.nom`, [u.compte_id]);

  const parCategorie = [...produits.reduce((m, p) => {
    (m.get(p.categorie) ?? m.set(p.categorie, []).get(p.categorie)!).push(p);
    return m;
  }, new Map<string, typeof produits>())];

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href={`/bornes/${id}`} className="bouton petit">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0, fontSize: 22 }}>Planogramme</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12 }}>
          {b.nom} — quel produit occupe quel canal, et jusqu’à combien il tient.
          Le code se lit <b>rangée</b> puis <b>colonne</b> : 101 = première rangée,
          première spire ; 201 = deuxième rangée.
        </p>

        {e === "place" ? <p className="erreur">Rangée et colonne vont de 1 à 10.</p> : null}
        {e === "deja" ? <p className="erreur">Ce canal existe déjà sur cette borne.</p> : null}
        {e === "pleine" ? <p className="erreur">
          Ce canal contient encore des unités : videz-le avant de le retirer, sinon
          le stock disparaîtrait des comptes.
        </p> : null}

        {/* Ajouter une spire. Les canaux connus viennent de ce que la machine a
            annoncé au premier relevé — sur une borne neuve, la vitrine de
            démonstration de l’application. Ce n’est pas un inventaire matériel :
            il y manque des spires qui existent bel et bien. */}
        <form method="post" action={`/api/bornes/${id}/planogramme`} className="carte">
          <input type="hidden" name="action" value="ajouter" />
          <h2 style={{ marginTop: 0 }}>Déclarer une spire</h2>
          <p className="faible" style={{ fontSize: 13, marginTop: 0 }}>
            Votre machine en a peut-être plus que ce que le SaaS connaît : les canaux
            listés ci-dessous ont été repris de ce qu’elle a annoncé au premier relevé.
          </p>
          <div className="rangee" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ width: 96 }}>
              <label htmlFor="rangee">Rangée</label>
              <input id="rangee" name="rangee" type="number" min={1} max={10}
                     defaultValue={1} inputMode="numeric" required />
            </div>
            <div style={{ width: 96 }}>
              <label htmlFor="colonne">Colonne</label>
              <input id="colonne" name="colonne" type="number" min={1} max={10}
                     defaultValue={1} inputMode="numeric" required />
            </div>
            <div style={{ flex: 1, minWidth: 190 }}>
              <label htmlFor="produit_id">Produit</label>
              <select id="produit_id" name="produit_id" defaultValue="">
                <option value="">— laisser libre —</option>
                {parCategorie.map(([cat, liste]) => (
                  <optgroup key={cat} label={cat}>
                    {liste.map((p) => (
                      <option key={p.id} value={p.id}>{p.nom} · {euros(p.prix_vente_c)}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div style={{ width: 110 }}>
              <label htmlFor="capacite">Capacité</label>
              <input id="capacite" name="capacite" type="number" min={1} max={60}
                     defaultValue={10} inputMode="numeric" />
            </div>
            <button className="bouton primaire">Ajouter</button>
          </div>
        </form>

        {canaux.length === 0 ? (
          <Repli icone={<IcoBorne />} titre="Aucun canal connu"
                 texte="Les canaux apparaissent au premier relevé de la machine. Si elle est en ligne depuis un moment, vérifiez sa console de maintenance." />
        ) : (
          <form method="post" action={`/api/bornes/${id}/planogramme`}>
            {canaux.map((c) => (
              <div className="carte" key={c.canal_id}>
                <div className="rangee">
                  <span className="mono faible" style={{ width: 40, fontSize: 15 }}>{codeCanal(c.rangee, c.colonne)}</span>
                  {c.quantite === 0 ? (
                    <button formAction={`/api/bornes/${id}/planogramme`} name="oter" value={c.lane}
                            className="bouton petit discret oter" aria-label={`Retirer le canal ${codeCanal(c.rangee, c.colonne)}`}
                            title="Cette spire n’existe pas sur la machine ?">✕</button>
                  ) : null}
                  <div className="pousse">
                    <label htmlFor={`p_${c.lane}`}>Produit</label>
                    <select id={`p_${c.lane}`} name={`p_${c.lane}`} defaultValue={c.produit_id ?? ""}>
                      <option value="">— canal libre —</option>
                      {parCategorie.map(([cat, liste]) => (
                        <optgroup key={cat} label={cat}>
                          {liste.map((p) => (
                            <option key={p.id} value={p.id}>{p.nom} · {euros(p.prix_vente_c)}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="rangee" style={{ marginTop: 12, gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label htmlFor={`c_${c.lane}`}>Capacité</label>
                    <input id={`c_${c.lane}`} name={`c_${c.lane}`} type="number" min={1} max={60}
                           defaultValue={c.capacite} inputMode="numeric" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label htmlFor={`s_${c.lane}`}>Seuil bas</label>
                    <input id={`s_${c.lane}`} name={`s_${c.lane}`} type="number" min={0} max={30}
                           defaultValue={c.seuil_bas} inputMode="numeric" />
                  </div>
                </div>
              </div>
            ))}
            <div style={{ position: "sticky", bottom: "calc(72px + env(safe-area-inset-bottom))", paddingTop: 14 }}>
              <button className="bouton primaire large">Enregistrer le planogramme</button>
            </div>
          </form>
        )}
      </main>
      <NavBasse page="bornes" />
    </>
  );
}
