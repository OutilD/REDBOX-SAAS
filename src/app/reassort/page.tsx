import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { q, q1, depuis, enLigne } from "@/db";
import { utilisateur } from "@/lib/auth";
import { Repli } from "../repli";
import { IcoBorne } from "../icones";

export const dynamic = "force-dynamic";

/**
 * Preparer une tournee.
 *
 * On coche les bornes qu'on va visiter, on edite la fiche. Le chiffre qui decide
 * du choix est le nombre de canaux vides : un canal vide ne vend rien, et c'est
 * la seule urgence reelle. Le reste est du confort.
 *
 * Les bornes sont pre-cochees des qu'elles ont un canal vide ou sous le seuil :
 * neuf fois sur dix c'est la tournee qu'on allait faire, et on decoche le reste.
 */

type L = {
  id: number; nom: string; adresse: string | null; vue_le: Date | null;
  canaux: number; vides: number; sous_seuil: number; manquant: number;
};

export default async function Reassort({
  searchParams,
}: { searchParams: Promise<{ p?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  // Venu depuis un produit : on precoche les bornes qui LE portent, et on le
  // dit. Sans cela, le lien depuis le catalogue ouvrait la meme page vide que
  // le menu et ne servait a rien.
  const cible = Number((await searchParams).p) || 0;
  const parProduit = cible
    ? await q1<{ nom: string; bornes: number[] }>(`
        SELECT p.nom,
               COALESCE((SELECT array_agg(DISTINCT c.borne_id)
                           FROM canal c WHERE c.produit_id = p.id), '{}')::bigint[] AS bornes
          FROM produit p WHERE p.id = $1 AND p.compte_id = $2`, [cible, u.compte_id])
    : null;
  const visees = (parProduit?.bornes ?? []).map(Number);

  const bornes = await q<L>(`
    SELECT b.id, b.nom, b.adresse, b.vue_le,
           COUNT(c.id) FILTER (WHERE c.produit_id IS NOT NULL)::int AS canaux,
           COUNT(c.id) FILTER (WHERE c.produit_id IS NOT NULL AND c.quantite = 0)::int AS vides,
           COUNT(c.id) FILTER (WHERE c.produit_id IS NOT NULL
                                 AND c.quantite > 0 AND c.quantite <= c.seuil_bas)::int AS sous_seuil,
           COALESCE(SUM(GREATEST(0, c.capacite - c.quantite))
                    FILTER (WHERE c.produit_id IS NOT NULL), 0)::int AS manquant
      FROM borne b LEFT JOIN canal c ON c.borne_id = b.id
     WHERE b.compte_id = $1
     GROUP BY b.id ORDER BY vides DESC, sous_seuil DESC, b.nom`, [u.compte_id]);

  const servables = bornes.filter((b) => b.canaux > 0);

  return (
    <>
      <Entete page="reassort" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <div className="pousse"><h1 style={{ margin: 0, fontSize: 22 }}>Fiche de réassort</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12 }}>
          Cochez les bornes de la tournée. La fiche dira quoi sortir de la réserve,
          puis borne par borne quel produit va dans quel canal et combien en poser.
        </p>
        {parProduit ? (
          <p className="faible" style={{ fontSize: 13.5, marginTop: -6 }}>
            Pré-coché pour <b>{parProduit.nom}</b> :{" "}
            {visees.length > 0
              ? `${visees.length} borne${visees.length > 1 ? "s" : ""} le portent.`
              : "aucune borne ne le porte pour l’instant."}{" "}
            <Link href="/reassort" style={{ textDecoration: "underline" }}>Tout décocher</Link>
          </p>
        ) : null}

        {servables.length === 0 ? (
          <Repli icone={<IcoBorne />} titre="Aucune borne à servir"
                 texte="Une borne apparaît ici dès qu’un produit est affecté à l’un de ses canaux."
                 action={{ nom: "Voir mes bornes", vers: "/bornes" }} />
        ) : (
          <form method="get" action="/reassort/fiche">
            <div className="carte plate"><div className="lignes">
              {servables.map((b) => {
                // Cible par un produit : ce sont ses bornes qui decident, pas
                // l'urgence generale — on est venu pour lui.
                const urgent = cible
                  ? visees.includes(Number(b.id))
                  : b.vides > 0 || b.sous_seuil > 0;
                return (
                  <label className="ligne choix" key={b.id} htmlFor={`b_${b.id}`}>
                    <input type="checkbox" id={`b_${b.id}`} name="b" value={b.id}
                           defaultChecked={urgent} />
                    <div className="corps">
                      <div className="nom">{b.nom}</div>
                      <div className="meta">
                        {b.adresse ?? "lieu non renseigné"} · {b.canaux} canaux ·
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
                      {!urgent ? <span className="pilule ok"><i />pleine</span> : null}
                    </div>
                    <div className="fin num" style={{ width: 74, fontWeight: 700 }}>
                      {b.manquant > 0 ? `${b.manquant} u.` : "—"}
                    </div>
                  </label>
                );
              })}
            </div></div>
            <div style={{ marginTop: 14 }}>
              <button className="bouton primaire large">Éditer la fiche</button>
            </div>
          </form>
        )}
      </main>
      <NavBasse page="reassort" />
    </>
  );
}
