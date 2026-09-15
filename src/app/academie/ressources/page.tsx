import Link from "next/link";
import { Entete, NavBasse } from "../../chrome";
import { ressources, salonProspects, type Ressource } from "@/lib/academie";
import { IcoAcademie, IcoDocument } from "../../icones";
import { lecteurDePage } from "../lecteur";
import { FichierCarte, OngletsAcademie, PorteFermee, pluriel } from "../vues";

export const dynamic = "force-dynamic";

/**
 * LES RESSOURCES : TOUS LES DOCUMENTS DE L'ACADEMIE, AU MEME ENDROIT.
 *
 * Un certificat, on le cherche devant un gerant, le telephone a la main — pas
 * au milieu d'une lecon. Chaque document garde le lien vers la lecon qui
 * l'explique ; ceux qui sont reserves se montrent avec leur cadenas.
 */
export default async function Ressources() {
  const { l, equipe } = await lecteurDePage();
  const tout = await ressources(l);
  const groupes: { module_id: number; titre: string; items: Ressource[] }[] = [];
  for (const r of tout) {
    let g = groupes[groupes.length - 1];
    if (!g || g.module_id !== r.module_id) {
      g = { module_id: r.module_id, titre: r.module_titre, items: [] };
      groupes.push(g);
    }
    g.items.push(r);
  }
  const fermes = tout.filter((r) => !r.ouverte).length;
  const salon = !l.redboxer && fermes > 0 ? await salonProspects() : null;

  return (
    <>
      <Entete page="academie" />
      <main className="ecran aca">
        <div className="aca-marque"><IcoAcademie size={18} /> RedBox Academy</div>
        <h1 style={{ marginTop: 8 }}>Ressources</h1>
        <p className="sous" style={{ maxWidth: 680 }}>
          Certificats de conformité, contrat type, plaquettes : les documents de l’académie, à
          garder sous la main pendant un rendez-vous.
        </p>

        <OngletsAcademie actif="ressources" equipe={equipe} apercu={l.apercu} retour="/academie/ressources" />

        {fermes > 0 && !l.redboxer ? (
          <PorteFermee compacte salon={salon}
                       quoi={`${pluriel(fermes, "document réservé", "documents réservés")} aux redboxers`} />
        ) : null}

        {groupes.length === 0 ? (
          <div className="vide">
            <span className="grand" aria-hidden="true"><IcoDocument size={40} /></span>
            Aucun document pour l’instant.
          </div>
        ) : groupes.map((g) => (
          <section key={g.module_id}>
            <div className="titre-section">
              <h2>{g.titre}</h2>
              <Link href={`/academie/module/${g.module_id}`} className="lien">Voir le module ›</Link>
            </div>
            <div className="aca-fichiers">
              {g.items.map((r) => (
                <FichierCarte key={r.bloc_id} id={r.fichier_id} nom={r.nom} type={r.type_mime} octets={r.taille}
                              titre={r.titre} texte={r.texte} ferme={!r.ouverte}
                              source={<> · <Link href={`/academie/lecon/${r.lecon_id}`} className="lien-souligne">{r.lecon_titre}</Link></>} />
              ))}
            </div>
          </section>
        ))}
      </main>
      <NavBasse page="academie" />
    </>
  );
}
