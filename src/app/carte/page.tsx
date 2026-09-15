import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { q, depuis } from "@/db";
import { peutConfigurer, utilisateur } from "@/lib/auth";
import { dansLeCadre, situerLesBornes } from "@/lib/geo";
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
 * LA CARTE SE REGARDE, ELLE NE SE MODIFIE PAS. Une machine se situe depuis sa
 * page, la ou l'on regle aussi son nom et son adresse ; le parc entier se
 * deplace depuis l'espace super-admin.
 *
 * Les coordonnees et la ville viennent de l'adresse, par la Base Adresse
 * Nationale, au moment ou l'on ouvre la carte pour celles qui n'en ont pas
 * encore. Une machine sans adresse, ou dont l'adresse est introuvable, n'est
 * pas cachee : elle est listee, avec le chemin qui la fera apparaitre.
 */
export default async function Carte() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");

  // Celles qui attendent une place l'obtiennent maintenant, par petit lot ; si
  // le geocodeur ne repond pas, la page s'ouvre quand meme.
  await situerLesBornes(u.compte_id).catch(() => {});

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
                  {peutConfigurer(u)
                    ? "Une machine se situe depuis sa page : ouvrez-la, puis « Situer sur la carte »."
                    : "Le propriétaire ou un gérant du compte la situe depuis la page de la machine."}
                </p>
                <ul className="liste-a-situer">
                  {aSituer.map((b) => {
                    const etat = etatDe(b);
                    const pourquoi = !(b.adresse ?? "").trim() ? "sans adresse"
                      : b.situee_pour === b.adresse ? "adresse introuvable"
                      : "recherche en cours";
                    return (
                      <li key={b.id}>
                        <div className="pousse" style={{ minWidth: 0 }}>
                          <Link href={`/bornes/${b.id}`} className="nom">{b.nom}</Link>
                          <div className="ou">{b.adresse ?? "lieu non renseigné"} · {pourquoi}</div>
                        </div>
                        <span className="pilule" data-etat={etat}>
                          <i />{etat === "mal" ? `vue ${depuis(b.vue_le)}` : NOM_ETAT[etat]}
                        </span>
                        {peutConfigurer(u) ? <Link href={`/bornes/${b.id}`} className="bouton petit">Ouvrir</Link> : null}
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
