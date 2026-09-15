import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { utilisateur } from "@/lib/auth";
import { RESUME_MAX, TITRE_MAX, lecteur, modules, peutEditer } from "@/lib/academie";
import { PLAN_TYPE } from "@/lib/academie-plan";
import { IcoAcademie } from "../../icones";
import { IconeModule, OngletsAcademie, duree, pluriel } from "../vues";
import { ChoixAcces, ChoixIcone, Deplacer, ERREURS, EtatPublication, EtiquetteAcces, Publier } from "./outils";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  plan: "Plan type posé, tout en brouillon : relisez chaque leçon, complétez les « à compléter », puis publiez.",
  supprime: "Module supprimé.",
};

/**
 * EDITER L'ACADEMIE : LA LISTE DES MODULES.
 *
 * L'ordre ici est l'ordre du parcours. Publier se fait d'un bouton, sur la
 * ligne : c'est le geste qu'on repete le plus une fois le contenu relu.
 */
export default async function EditerAcademie({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!peutEditer(u)) redirect("/academie");
  const [mods, sp] = await Promise.all([modules(await lecteur(u)), searchParams]);

  return (
    <>
      <Entete page="academie_editer" />
      <main className="ecran aca">
        <div className="aca-marque"><IcoAcademie size={18} /> RedBox Academy</div>
        <h1 style={{ marginTop: 8 }}>Éditer l’académie</h1>
        <p className="sous" style={{ maxWidth: 680 }}>
          Des modules, rangés dans l’ordre du parcours ; dans chacun, des leçons faites de blocs.
          Rien n’est visible avant d’être publié — le module et la leçon.
        </p>

        <OngletsAcademie actif="editer" equipe apercu={false} retour="/academie/editer" />

        {sp.ok && OK[sp.ok] ? <p className="aca-ok" role="status">{OK[sp.ok]}</p> : null}
        {sp.e ? <p className="erreur">{ERREURS[sp.e] ?? "Impossible."}</p> : null}

        {mods.length === 0 ? (
          <div className="carte aca-plan-type">
            <div className="titre">Partir du plan type</div>
            <p>
              {PLAN_TYPE.length} modules et {PLAN_TYPE.reduce((s, m) => s + m.lecons.length, 0)} leçons
              prêts à relire : découvrir la RedBox, convaincre un bar, vendre plus, faire tourner la
              machine. Tout arrive en brouillon, avec des « à compléter » là où il faut vos
              chiffres, vos certificats et votre contrat.
            </p>
            <form method="post" action="/api/academie/plan-type">
              <button className="bouton primaire">Poser le plan type</button>
            </form>
          </div>
        ) : (
          <>
            <div className="titre-section"><h2>Modules</h2><span className="faible">{mods.length}</span></div>
            <div className="aca-ed-liste">
              {mods.map((m, i) => (
                <div key={m.id} id={`m${m.id}`} className="aca-ed-ligne">
                  <span className="aca-picto petit" aria-hidden="true"><IconeModule icone={m.icone} size={18} /></span>
                  <div className="dit">
                    <Link href={`/academie/editer/module/${m.id}`} className="nom">{i + 1}. {m.titre}</Link>
                    <div className="meta">
                      <EtatPublication publie={m.publie} />
                      <EtiquetteAcces acces={m.acces} />
                      <span className="num">{pluriel(m.lecons, "leçon", "leçons")}{m.minutes ? ` · ${duree(m.minutes)}` : ""}</span>
                    </div>
                  </div>
                  <div className="aca-ed-actions">
                    <Deplacer route="module" id={m.id} premier={i === 0} dernier={i === mods.length - 1} />
                    <Publier route="module" id={m.id} publie={m.publie} />
                    <Link href={`/academie/editer/module/${m.id}`} className="bouton petit">Modifier</Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="titre-section" id="nouveau"><h2>Nouveau module</h2></div>
        <form method="post" action="/api/academie/module" className="carte">
          <input type="hidden" name="action" value="creer" />
          <div className="champ">
            <label htmlFor="titre">Titre</label>
            <input id="titre" name="titre" required maxLength={TITRE_MAX} placeholder="Convaincre un bar" />
          </div>
          <div className="champ">
            <label htmlFor="resume">Résumé <span className="faible">(facultatif)</span></label>
            <textarea id="resume" name="resume" rows={2} maxLength={RESUME_MAX}
                      placeholder="Ce qu’on saura faire à la fin du module, en une phrase." />
          </div>
          <ChoixIcone valeur="borne" />
          <ChoixAcces valeur="tous" />
          <div className="aca-ed-bas">
            <span className="faible">Il sera créé en brouillon.</span>
            <button className="bouton primaire">Créer le module</button>
          </div>
        </form>
      </main>
      <NavBasse page="academie_editer" />
    </>
  );
}
