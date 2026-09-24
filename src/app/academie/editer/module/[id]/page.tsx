import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../../chrome";
import { utilisateur } from "@/lib/auth";
import { ACCES, RESUME_MAX, TITRE_MAX, lecteur, lecteursParLecon, leconsDe, modules,
         peutEditer } from "@/lib/academie";
import { IcoOeil } from "../../../../icones";
import { IconeModule, duree, pluriel } from "../../../vues";
import { CasePublie, ChoixAcces, ChoixIcone, Deplacer, ERREURS, EtatPublication, EtiquetteAcces,
         Publier } from "../../outils";

export const dynamic = "force-dynamic";

/** EDITER UN MODULE : ce qu'il est, puis ses lecons dans l'ordre. */
export default async function EditerModule({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; ok?: string }>;
}) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!peutEditer(u)) redirect("/academie");
  const l = await lecteur(u);
  const id = Number((await params).id);
  const [mods, sp] = await Promise.all([modules(l), searchParams]);
  const i = mods.findIndex((m) => m.id === id);
  if (i < 0) notFound();
  const m = mods[i];
  const [lecons, lus] = await Promise.all([leconsDe(l, m), lecteursParLecon()]);

  return (
    <>
      <Entete page="academie_editer" />
      <main className="ecran aca">
        <Link href="/academie/editer" className="aca-retour">‹ Éditer l’académie</Link>
        <div className="aca-ed-titre">
          <span className="aca-picto" aria-hidden="true"><IconeModule icone={m.icone} /></span>
          <div className="pousse">
            <div className="aca-surtitre"><span>Module {i + 1}</span><EtatPublication publie={m.publie} /></div>
            <h1>{m.titre}</h1>
          </div>
          <Link href={`/academie/module/${m.id}`} className="bouton petit"><IcoOeil size={16} /> Voir</Link>
        </div>

        {sp.ok === "1" ? <p className="aca-ok" role="status">Module enregistré.</p> : null}
        {sp.ok === "supprime" ? <p className="aca-ok" role="status">Leçon supprimée.</p> : null}
        {sp.e ? <p className="erreur">{ERREURS[sp.e] ?? "Impossible."}</p> : null}

        <form method="post" action="/api/academie/module" className="carte">
          <input type="hidden" name="action" value="maj" />
          <input type="hidden" name="id" value={m.id} />
          <div className="champ">
            <label htmlFor="titre">Titre</label>
            <input id="titre" name="titre" required maxLength={TITRE_MAX} defaultValue={m.titre} />
          </div>
          <div className="champ">
            <label htmlFor="resume">Résumé <span className="faible">(facultatif)</span></label>
            <textarea id="resume" name="resume" rows={2} maxLength={RESUME_MAX} defaultValue={m.resume ?? ""} />
          </div>
          <ChoixIcone valeur={m.icone} />
          <ChoixAcces valeur={m.acces}
                      note="Réservé aux redboxers : toutes ses leçons le sont, quel que soit leur propre réglage." />
          <div className="aca-ed-bas">
            <CasePublie publie={m.publie} quoi="le module apparaît dans le parcours" />
            <button className="bouton primaire">Enregistrer</button>
          </div>
        </form>

        <div className="titre-section" id="lecons">
          <h2>Leçons</h2><span className="faible">{lecons.length}</span>
        </div>
        {lecons.length === 0 ? (
          <p className="vide">Aucune leçon. Créez la première ci-dessous.</p>
        ) : (
          <div className="aca-ed-liste" data-glisser="/api/academie/lecon" data-action="ordonner" data-prefixe="l">
            {lecons.map((x, j) => {
              const n = lus.get(x.id) ?? 0;
              return (
                <div key={x.id} id={`l${x.id}`} className="aca-ed-ligne">
                  <span className="aca-rang num">{j + 1}</span>
                  <div className="dit">
                    <Link href={`/academie/editer/lecon/${x.id}`} className="nom">{x.titre}</Link>
                    <div className="meta">
                      <EtatPublication publie={x.publie} />
                      {x.acces === "redboxers" ? <EtiquetteAcces acces="redboxers" /> : null}
                      {x.duree ? <span className="num">{duree(x.duree)}</span> : null}
                      <span className="num">{n === 0 ? "personne ne l’a terminée" : `${pluriel(n, "personne l’a terminée", "personnes l’ont terminée")}`}</span>
                    </div>
                  </div>
                  <div className="aca-ed-actions">
                    <Deplacer route="lecon" id={x.id} premier={j === 0} dernier={j === lecons.length - 1} />
                    <Publier route="lecon" id={x.id} publie={x.publie} />
                    <Link href={`/academie/editer/lecon/${x.id}`} className="bouton petit">Modifier</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <form method="post" action="/api/academie/lecon" className="carte" style={{ marginTop: 12 }}>
          <input type="hidden" name="action" value="creer" />
          <input type="hidden" name="module_id" value={m.id} />
          <div className="aca-ed-soustitre">Nouvelle leçon</div>
          <div className="champs">
            <div className="c-large c-double">
              <label htmlFor="n-titre">Titre</label>
              <input id="n-titre" name="titre" required maxLength={TITRE_MAX} />
            </div>
            <div className="c-court">
              <label htmlFor="n-duree">Durée (min)</label>
              <input id="n-duree" name="duree" type="number" min={1} max={600} inputMode="numeric" />
            </div>
            <div className="c-moyen">
              <label htmlFor="n-acces">Accès</label>
              <select id="n-acces" name="acces" defaultValue={m.acces}>
                {ACCES.map((a) => <option key={a.cle} value={a.cle}>{a.nom}</option>)}
              </select>
            </div>
            <button className="bouton primaire">Créer la leçon</button>
          </div>
        </form>

        <details className="aca-danger">
          <summary>Supprimer ce module</summary>
          <div className="dedans">
            <p>
              {lecons.length > 0 ? `Ses ${pluriel(lecons.length, "leçon", "leçons")}, leurs blocs et leurs fichiers seront effacés, ainsi que la progression de chacun. ` : ""}
              On ne peut pas revenir en arrière.
            </p>
            <form method="post" action="/api/academie/module">
              <input type="hidden" name="action" value="supprimer" />
              <input type="hidden" name="id" value={m.id} />
              <button className="bouton danger">Supprimer définitivement</button>
            </form>
          </div>
        </details>
      </main>
      <NavBasse page="academie_editer" />
    </>
  );
}
