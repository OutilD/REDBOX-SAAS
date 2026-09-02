import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../../../chrome";
import { q1 } from "@/db";
import { peutCharger, utilisateur, peutVoirBorne } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Canal = {
  lane: number; quantite: number; quantite_borne: number | null; capacite: number;
  nom: string | null; sku: string | null; borne: string;
};

/**
 * Mettre d'accord les deux compteurs d'une spire.
 *
 * La page ne demande pas « quel compteur a raison » mais « combien y en a-t-il
 * ». C'est la seule question a laquelle l'exploitant peut repondre devant la
 * vitrine, et les deux compteurs decoulent de la reponse — nos livres par un
 * mouvement d'inventaire, la machine par une correction qu'elle prendra a son
 * prochain appel.
 */
export default async function Reconcilier({
  params, searchParams,
}: { params: Promise<{ id: string; lane: string }>;
     searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const { id: idBrut, lane: laneBrut } = await params;
  const id = Number(idBrut), lane = Number(laneBrut);
  // Une borne hors de sa portee n'existe pas pour lui : `notFound` plutot
  // qu'un refus, qui confirmerait au passage qu'elle existe.
  if (!peutVoirBorne(u, id)) notFound();
  const { e } = await searchParams;
  if (!peutCharger(u)) redirect(`/bornes/${id}`);

  const c = await q1<Canal>(`
    SELECT c.lane, c.quantite, c.quantite_borne, c.capacite,
           p.nom, p.sku, b.nom AS borne
      FROM canal c
      JOIN borne b ON b.id = c.borne_id
      LEFT JOIN produit p ON p.id = c.produit_id
     WHERE c.borne_id = $1 AND c.lane = $2 AND b.compte_id = $3`,
    [id, lane, u.compte_id]);
  if (!c) notFound();

  const machine = c.quantite_borne;
  const ecart = machine === null ? null : machine - c.quantite;

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <h1>Réconcilier la spire {c.lane}</h1>
        <p className="faible" style={{ margin: "6px 0 0", fontSize: 14 }}>
          {c.borne} · {c.nom ?? "canal libre"}
        </p>

        {e ? (
          <div className="carte chaude" style={{ marginTop: 14 }}>
            <strong>Indiquez un nombre entre 0 et la capacité de la spire.</strong>
          </div>
        ) : null}

        <div className="bandeau" style={{ marginTop: 16 }}>
          <div><div className="stat">
            <span className="valeur num">{c.quantite}</span>
            <span className="libelle">nos livres</span></div></div>
          <div><div className={`stat ${ecart ? "attention" : ""}`}>
            <span className="valeur num">{machine ?? "—"}</span>
            <span className="libelle">la machine</span></div></div>
          <div><div className="stat">
            <span className="valeur num">{c.capacite}</span>
            <span className="libelle">capacité</span></div></div>
        </div>

        <p className="note-lecture">
          La question n’est pas « qui a raison » mais <b>combien y en a-t-il</b>.
          Les deux compteurs se rangeront sur votre réponse : nos livres par un
          mouvement d’inventaire, la machine par une correction qu’elle prendra à
          sa prochaine synchronisation.
        </p>

        <div className="actions-cle">
          {machine !== null && ecart !== 0 ? (
            <form method="post" action={`/api/bornes/${id}/reconcilier`}>
              <input type="hidden" name="lane" value={lane} />
              <input type="hidden" name="valeur" value={machine} />
              <button className="bouton large">
                La machine a raison — retenir {machine}
              </button>
            </form>
          ) : null}

          <form method="post" action={`/api/bornes/${id}/reconcilier`}>
            <input type="hidden" name="lane" value={lane} />
            <input type="hidden" name="valeur" value={c.quantite} />
            <button className="bouton large">
              Nos livres ont raison — imposer {c.quantite} à la machine
            </button>
          </form>
        </div>

        <form method="post" action={`/api/bornes/${id}/reconcilier`}
              className="carte" style={{ marginTop: 14 }}>
          <input type="hidden" name="lane" value={lane} />
          <label htmlFor="valeur">J’ai compté devant la vitrine</label>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
            <input id="valeur" name="valeur" type="number" inputMode="numeric"
                   min={0} max={c.capacite} defaultValue={c.quantite} required
                   style={{ maxWidth: 120 }} />
            <button className="bouton primaire">Enregistrer</button>
          </div>
        </form>

        <div style={{ marginTop: 14 }}>
          <Link href={`/bornes/${id}`} className="bouton">Annuler</Link>
        </div>
      </main>
      <NavBasse page="bornes" />
    </>
  );
}
