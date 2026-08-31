import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { q, enLigne, depuis } from "@/db";
import { utilisateur } from "@/lib/auth";
import { Repli } from "../repli";
import { IcoBorne } from "../icones";

export const dynamic = "force-dynamic";

type Ligne = {
  id: number; nom: string; adresse: string | null; vue_le: Date | null;
  jeton: string | null; version: string | null;
  canaux: number; vides: number; bas: number; unites: number; en_route: number;
};

export default async function Bornes() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");

  const bornes = await q<Ligne>(`
    SELECT b.id, b.nom, b.adresse, b.vue_le, b.jeton, b.version,
           COUNT(c.id)::int                                                        AS canaux,
           COALESCE(SUM(CASE WHEN c.quantite = 0 THEN 1 ELSE 0 END),0)::int        AS vides,
           COALESCE(SUM(CASE WHEN c.quantite > 0 AND c.quantite <= c.seuil_bas
                             THEN 1 ELSE 0 END),0)::int                            AS bas,
           COALESCE(SUM(c.quantite),0)::int                                        AS unites,
           COALESCE((SELECT SUM(m.quantite)::int FROM mouvement m
                      WHERE m.vers_lieu_id = b.lieu_id AND m.motif = 'transfert'
                        AND m.confirme_le IS NULL AND m.annule_le IS NULL),0)      AS en_route
      FROM borne b LEFT JOIN canal c ON c.borne_id = b.id
     WHERE b.compte_id = $1
     GROUP BY b.id ORDER BY b.nom`, [u.compte_id]);

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <h1>Bornes</h1>
        <p className="sous">
          {bornes.length === 0 ? "Aucune borne sur ce compte."
            : `${bornes.length} machine${bornes.length > 1 ? "s" : ""}.`}
        </p>

        {bornes.length === 0 ? (
          <Repli icone={<IcoBorne />} titre="Aucune borne sur ce compte"
                 texte="Sur la machine : Maintenance → SaaS → Demander l’appairage. Elle affiche un code de six caractères que vous saisissez ici."
                 action={{ nom: "Appairer une borne", vers: "/bornes/ajouter" }} />
        ) : null}

        {bornes.length > 0
          ? <Link href="/bornes/ajouter" className="bouton primaire large">+ Ajouter une borne</Link>
          : null}

        <div className="grille large" style={{ marginTop: 16 }}>
          {bornes.map((b) => {
            const vivante = enLigne(b.vue_le);
            const souci = b.vides > 0 ? "mal" : b.bas > 0 ? "attente" : "ok";
            return (
              <Link key={b.id} href={`/bornes/${b.id}`} className="carte" style={{ display: "block" }}>
                <div className="rangee">
                  <div className="pousse">
                    <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-.02em" }}>{b.nom}</div>
                    <div className="faible" style={{ fontSize: 13, marginTop: 2 }}>{b.adresse ?? "lieu non renseigné"}</div>
                  </div>
                  <span className="faible" style={{ fontSize: 20 }}>›</span>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                  <span className={`pilule ${!b.jeton ? "attente" : vivante ? "ok" : "mal"}`}>
                    <i />{!b.jeton ? "à appairer" : vivante ? "en ligne" : `vue ${depuis(b.vue_le)}`}
                  </span>
                  <span className={`pilule ${souci}`}>
                    <i />{b.vides > 0 ? `${b.vides} ${b.vides > 1 ? "canaux vides" : "canal vide"}`
                          : b.bas > 0 ? `${b.bas} bas` : "stock plein"}
                  </span>
                  {b.en_route > 0
                    ? <span className="pilule attente"><i />{b.en_route} en route</span> : null}
                </div>

                <div className="faible" style={{ fontSize: 13, marginTop: 12 }}>
                  {b.unites} unités sur {b.canaux} canaux
                  {b.version ? ` · version ${b.version}` : ""}
                </div>
              </Link>
            );
          })}
        </div>
      </main>
      <NavBasse page="bornes" />
    </>
  );
}
