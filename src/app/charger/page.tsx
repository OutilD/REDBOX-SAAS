import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { q, depuis, enLigne } from "@/db";
import { peutCharger, utilisateur } from "@/lib/auth";
import { Repli } from "../repli";
import { IcoBorne, IcoFleche } from "../icones";

export const dynamic = "force-dynamic";

/**
 * Choisir la RedBox qu'on va charger.
 *
 * L'entree « Reassort » du menu mene ici : on est devant une machine, on la
 * touche, et on est sur son ecran de chargement. Un seul geste entre le menu
 * et le travail — la fiche de la borne, avec ses chiffres et ses reglages,
 * n'est pas sur ce chemin.
 *
 * Les plus vides en tete, comme sur la fiche d'approvisionnement : c'est le
 * meme ordre d'urgence, et celle qu'on vient servir y est presque toujours.
 */

type L = {
  id: number; nom: string; adresse: string | null; vue_le: Date | null;
  canaux: number; vides: number; sous_seuil: number;
};

export default async function ChoisirReassort() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!peutCharger(u)) redirect("/bornes");

  const bornes = await q<L>(`
    SELECT b.id, b.nom, b.adresse, b.vue_le,
           COUNT(c.id) FILTER (WHERE c.produit_id IS NOT NULL)::int AS canaux,
           COUNT(c.id) FILTER (WHERE c.produit_id IS NOT NULL AND c.quantite = 0)::int AS vides,
           COUNT(c.id) FILTER (WHERE c.produit_id IS NOT NULL
                                 AND c.quantite > 0 AND c.quantite <= c.seuil_bas)::int AS sous_seuil
      FROM borne b LEFT JOIN canal c ON c.borne_id = b.id
     WHERE b.compte_id = $1
       AND ($2::bigint[] IS NULL OR b.id = ANY($2))
     GROUP BY b.id ORDER BY vides DESC, sous_seuil DESC, b.nom`, [u.compte_id, u.bornes]);

  const servables = bornes.filter((b) => b.canaux > 0);
  // Une seule machine a servir : il n'y a rien a choisir.
  if (servables.length === 1) redirect(`/bornes/${servables[0].id}/charger`);

  return (
    <>
      <Entete page="charger" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <div className="pousse"><h1 style={{ margin: 0, fontSize: 22 }}>Réassort</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12 }}>
          Quelle RedBox allez-vous remplir ? Les plus vides sont en tête.
        </p>

        {servables.length === 0 ? (
          <Repli icone={<IcoBorne />} titre="Aucune RedBox à remplir"
                 texte="Une RedBox apparaît ici dès qu’un produit est affecté à l’un de ses canaux."
                 action={{ nom: "Voir mes RedBox", vers: "/bornes" }} />
        ) : (
          <>
            <div className="carte plate"><div className="lignes">
              {servables.map((b) => (
                <Link className="ligne" key={b.id} href={`/bornes/${b.id}/charger`}>
                  <div className="corps">
                    <div className="nom">{b.nom}</div>
                    <div className="meta">
                      {b.adresse ?? "lieu non renseigné"} ·
                      {" "}{enLigne(b.vue_le) ? "en ligne" : `vue ${depuis(b.vue_le)}`}
                    </div>
                  </div>
                  <div className="fin" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {b.vides > 0
                      ? <span className="pilule mal"><i />{b.vides} vide{b.vides > 1 ? "s" : ""}</span>
                      : null}
                    {b.sous_seuil > 0
                      ? <span className="pilule attente"><i />{b.sous_seuil} bas</span>
                      : null}
                    {b.vides === 0 && b.sous_seuil === 0
                      ? <span className="pilule ok"><i />pleine</span> : null}
                  </div>
                  <span className="fin faible" aria-hidden="true"><IcoFleche size={15} /></span>
                </Link>
              ))}
            </div></div>
            <p className="faible" style={{ fontSize: 13.5, marginTop: 14 }}>
              Une tournée de plusieurs RedBox à préparer ?{" "}
              <Link href="/reassort" style={{ textDecoration: "underline" }}>Éditer une fiche d’approvisionnement</Link>
            </p>
          </>
        )}
      </main>
      <NavBasse page="charger" />
    </>
  );
}
