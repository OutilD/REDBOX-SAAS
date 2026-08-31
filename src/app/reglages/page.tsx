import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { q1 } from "@/db";
import { nomDuRole, peutGererEquipe, utilisateur } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Reglages() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const n = await q1<{ produits: number; membres: number }>(`
    SELECT (SELECT COUNT(*)::int FROM produit WHERE compte_id = $1 AND actif) AS produits,
           (SELECT COUNT(*)::int FROM utilisateur WHERE compte_id = $1)       AS membres`,
    [u.compte_id]);

  const rubriques = [
    { vers: "/reglages/catalogue", nom: "Catalogue",
      sous: `${n?.produits ?? 0} produits · prix de vente, âge minimum` },
    ...(peutGererEquipe(u) ? [{ vers: "/reglages/equipe", nom: "Équipe",
      sous: `${n?.membres ?? 0} personnes ont accès à ce compte` }] : []),
  ];

  return (
    <>
      <Entete page="reglages" />
      <main className="ecran">
        <h1>Réglages</h1>
        <p className="sous">Compte {u.compte} — vous y êtes {nomDuRole(u.role).toLowerCase()}.</p>

        <div className="carte plate"><div className="lignes">
          {rubriques.map((r) => (
            <Link className="ligne" key={r.vers} href={r.vers}>
              <div className="corps">
                <div className="nom">{r.nom}</div>
                <div className="meta">{r.sous}</div>
              </div>
              <span className="faible" style={{ fontSize: 20 }}>›</span>
            </Link>
          ))}
        </div></div>

        <h2>Cette session</h2>
        <div className="carte plate"><div className="lignes">
          <div className="ligne">
            <div className="corps"><div className="nom" style={{ fontWeight: 500 }}>Connecté</div>
              <div className="meta">{u.email}</div></div>
          </div>
        </div></div>
      </main>
      <NavBasse page="reglages" />
    </>
  );
}
