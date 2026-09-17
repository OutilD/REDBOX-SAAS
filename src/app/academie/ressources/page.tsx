import Link from "next/link";
import { Entete, NavBasse } from "../../chrome";
import { ressources, salonProspects } from "@/lib/academie";
import { IcoAcademie, IcoCadenas, IcoDossier } from "../../icones";
import Modale from "../../modale";
import { ChampsRessource, Deplacer, ERREURS } from "../editer/outils";
import { lecteurDePage } from "../lecteur";
import { IconeModule, OngletsAcademie, PorteFermee, pluriel } from "../vues";

export const dynamic = "force-dynamic";

/**
 * LES RESSOURCES : DES BOUTONS VERS GOOGLE DRIVE.
 *
 * « Photos machines », « Modeles de contrats » : chaque bouton mene a un
 * dossier Drive, montre ici sans quitter l'academie. L'equipe met Drive a
 * jour ; la page suit toute seule. Ceux qui sont reserves se montrent avec
 * leur cadenas.
 */
export default async function Ressources({ searchParams }: {
  searchParams: Promise<{ e?: string; ok?: string }>;
}) {
  const [{ l, equipe }, sp] = await Promise.all([lecteurDePage(), searchParams]);
  const tout = await ressources(l);
  const fermes = tout.filter((r) => !r.ouverte).length;
  const salon = !l.redboxer && fermes > 0 ? await salonProspects() : null;
  const erreur = sp.e ? ERREURS[sp.e] ?? "Impossible." : null;

  const ajouter = l.editeur ? (
    <Modale titre="Ajouter une ressource" ouvrir="Ajouter une ressource" classeBouton="bouton primaire">
      <form method="post" action="/api/academie/ressource">
        <input type="hidden" name="action" value="creer" />
        <ChampsRessource />
        <div className="aca-ed-bas">
          <span />
          <button className="bouton primaire">Ajouter</button>
        </div>
      </form>
    </Modale>
  ) : null;

  return (
    <>
      <Entete page="academie" />
      <main className="ecran aca aca-focus">
        <div className="aca-marque"><IcoAcademie size={18} /> RedBox Academy</div>
        <h1 style={{ marginTop: 8 }}>Ressources</h1>
        <p className="sous" style={{ maxWidth: 680 }}>
          Photos des machines, modèles de contrats : tout ce qu’il faut garder sous la main
          pendant un rendez-vous.
        </p>

        <OngletsAcademie actif="ressources" equipe={equipe} apercu={l.apercu} retour="/academie/ressources" />

        {sp.ok === "1" ? <p className="aca-ok" role="status">Ressource enregistrée.</p> : null}
        {sp.ok === "supprime" ? <p className="aca-ok" role="status">Ressource retirée.</p> : null}
        {erreur ? <p className="erreur">{erreur}</p> : null}

        {fermes > 0 && !l.redboxer ? (
          <PorteFermee compacte salon={salon}
                       quoi={`${pluriel(fermes, "ressource réservée", "ressources réservées")} aux redboxers`} />
        ) : null}

        {tout.length === 0 ? (
          <div className="vide">
            <span className="grand" aria-hidden="true"><IcoDossier size={40} /></span>
            Aucune ressource pour l’instant.
            {ajouter ? <div style={{ marginTop: 14 }}>{ajouter}</div> : null}
          </div>
        ) : (
          <>
            <div className="aca-ressources">
              {tout.map((r, j) => (
                <div key={r.id} id={`r${r.id}`} className="aca-ressource-case">
                  <Link href={`/academie/ressources/${r.id}`} className="aca-ressource"
                        data-ferme={r.ouverte ? undefined : ""}>
                    <span className="aca-picto"><IconeModule icone={r.icone} /></span>
                    <span className="dit">
                      <span className="titre">{r.titre}</span>
                      {r.texte ? <span className="quoi">{r.texte}</span> : null}
                    </span>
                    {r.ouverte
                      ? <span className="chevron" aria-hidden="true">›</span>
                      : <span className="aca-tag" data-ton="ferme"><IcoCadenas size={12} /> Redboxers</span>}
                  </Link>
                  {l.editeur ? (
                    <div className="outils">
                      {r.acces === "redboxers" && r.ouverte
                        ? <span className="aca-tag" data-ton="redboxers"><IcoCadenas size={12} /> Redboxers</span>
                        : null}
                      <span className="pousse" />
                      <Deplacer route="ressource" id={r.id} premier={j === 0} dernier={j === tout.length - 1} />
                      <Link href={`/academie/ressources/${r.id}#modifier`} className="bouton petit">Modifier</Link>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {ajouter ? <div className="aca-ressources-ajout">{ajouter}</div> : null}
          </>
        )}
      </main>
      <NavBasse page="academie" />
    </>
  );
}
