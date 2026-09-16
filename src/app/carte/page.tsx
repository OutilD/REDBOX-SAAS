import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { q, depuis } from "@/db";
import { utilisateur } from "@/lib/auth";
import { dansLeCadre } from "@/lib/geo";
import { statutValide } from "@/lib/statuts";
import { Repli } from "../repli";
import { IcoCarte } from "../icones";
import {
  Legende, NOM_ETAT, ParVille, SQL_CHIFFRES, etatDe, grouper, lignesChiffres,
  type Chiffres, type Point,
} from "./carte-france";
import { CarteMaps } from "./carte-maps";

export const dynamic = "force-dynamic";

type Ligne = {
  id: number; nom: string; adresse: string | null; ville: string | null; vue_le: Date | null;
  jeton: string | null; hors_service: boolean; statut: string;
  latitude: number | null; longitude: number | null; situee_pour: string | null;
} & Chiffres;

/**
 * Le parc sur la carte de France.
 *
 * LA QUESTION EST « OU SONT-ELLES, ET LAQUELLE VA MAL ». La liste des RedBox
 * repond a « laquelle », pas a « ou » : vingt adresses en texte ne font pas une
 * tournee. Ici chaque ville est un carre a sa place, avec le nombre de machines
 * et la couleur de leur stade ; dessous, ville par ville, les machines. Une
 * machine attribuee mais pas encore posee y figure aussi, en bleu : c'est la
 * ou elle sera. Survolee, une machine dit ce qu'elle a rapporte.
 *
 * LA CARTE SE REGARDE, ELLE NE SE MODIFIE PAS. Placer une machine est un geste
 * du super-admin, comme l'attribuer ou changer son stade : l'adresse qu'un
 * client ecrit sur sa fiche sert l'ecran d'assistance, elle ne deplace pas la
 * machine. Une machine pas encore placee n'est pas cachee : elle est listee.
 */
export default async function Carte() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");

  const bornes = await q<Ligne>(`
    SELECT b.id, b.nom, b.adresse, b.ville, b.vue_le, b.jeton, b.hors_service, b.statut,
           b.latitude, b.longitude, b.situee_pour,
           v.ventes_30, v.ca_30, v.ca_total, v.derniere_vente
      FROM borne b
      LEFT JOIN LATERAL (${SQL_CHIFFRES}) v ON true
     WHERE b.compte_id = $1
       AND ($2::bigint[] IS NULL OR b.id = ANY($2))
     ORDER BY b.nom`, [u.compte_id, u.bornes]);

  const points: Point[] = bornes
    .filter((b) => b.latitude !== null && b.longitude !== null && dansLeCadre(b.latitude, b.longitude))
    .map((b) => {
      const details = lignesChiffres(b);
      if (b.jeton) details.push(["Vue", depuis(b.vue_le)]);
      return {
        cle: b.id, href: `/bornes/${b.id}`, nom: b.nom, etat: etatDe(b),
        ville: b.ville, adresse: b.adresse, latitude: b.latitude!, longitude: b.longitude!,
        stade: statutValide(b.statut) ? b.statut : undefined,
        ca30: b.jeton || b.ca_total > 0 ? b.ca_30 : undefined,
        details,
      };
    });
  const groupes = grouper(points);
  const aSituer = bornes.filter((b) => !points.some((p) => p.cle === b.id));

  return (
    <>
      <Entete page="carte" />
      <main className="ecran">
        <div className="tete-tableau">
          <div className="quoi">
            <h1>Carte</h1>
            <p className="sous">
              {bornes.length === 0 ? "Aucune RedBox sur ce compte."
                : aSituer.length === 0
                  ? `${points.length} machine${points.length > 1 ? "s" : ""} dans ${groupes.length} ville${groupes.length > 1 ? "s" : ""}.`
                  : `${points.length} machine${points.length > 1 ? "s" : ""} sur la carte, ${aSituer.length} à situer.`}
            </p>
          </div>
          {bornes.length > 0 ? (
            <div className="rangee-actions">
              <Link href="/bornes" className="bouton">Voir la liste</Link>
            </div>
          ) : null}
        </div>

        {bornes.length === 0 ? (
          <Repli icone={<IcoCarte />} titre="Aucune RedBox sur ce compte"
                 texte="Appairez une machine et donnez-lui une adresse : elle apparaîtra ici."
                 action={{ nom: "Appairer une RedBox", vers: "/bornes/ajouter" }} />
        ) : (
          <>
            <section className="carte-france"><CarteMaps groupes={groupes} /><Legende groupes={groupes} /></section>

            {aSituer.length > 0 ? (
              <section className="carte a-situer" style={{ marginTop: 14 }}>
                <h2 style={{ marginTop: 0 }}>À situer</h2>
                <p className="faible" style={{ fontSize: 13, margin: "0 0 12px" }}>
                  "L’équipe RedBox place chaque machine sur la carte : elle apparaîtra ici dès que c’est fait."
                </p>
                <ul className="liste-a-situer">
                  {aSituer.map((b) => {
                    const etat = etatDe(b);
                    const pourquoi = !(b.adresse ?? "").trim() ? "sans adresse" : "pas encore placée";
                    return (
                      <li key={b.id}>
                        <div className="pousse" style={{ minWidth: 0 }}>
                          <Link href={`/bornes/${b.id}`} className="nom">{b.nom}</Link>
                          <div className="ou">{b.adresse ?? "lieu non renseigné"} · {pourquoi}</div>
                        </div>
                        <span className="pilule" data-etat={etat}>
                          <i />{etat === "mal" ? `vue ${depuis(b.vue_le)}` : NOM_ETAT[etat]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {groupes.length > 0 ? <h2 style={{ marginTop: 22 }}>Par ville</h2> : null}
            <ParVille groupes={groupes} />
          </>
        )}
      </main>
      <NavBasse page="carte" />
    </>
  );
}
