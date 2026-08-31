import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { q, q1, euros } from "@/db";
import { peutConfigurer, utilisateur } from "@/lib/auth";
import { Repli } from "../../../repli";
import { IcoBorne } from "../../../icones";
import { canauxDe } from "@/lib/stock";

export const dynamic = "force-dynamic";

/** Quel produit dans quel canal. De la configuration, pas du réassort. */
export default async function Planogramme({ params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
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
        </p>

        {canaux.length === 0 ? (
          <Repli icone={<IcoBorne />} titre="Aucun canal connu"
                 texte="Les canaux apparaissent au premier relevé de la machine. Si elle est en ligne depuis un moment, vérifiez sa console de maintenance." />
        ) : (
          <form method="post" action={`/api/bornes/${id}/planogramme`}>
            {canaux.map((c) => (
              <div className="carte" key={c.canal_id}>
                <div className="rangee">
                  <span className="mono faible" style={{ width: 40, fontSize: 15 }}>{c.rangee}-{c.colonne}</span>
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
