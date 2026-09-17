import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../../chrome";
import { utilisateur } from "@/lib/auth";
import { ACCES, GENRES, RESUME_MAX, TITRE_MAX, blocsDe, leconDe, lecteur, peutEditer } from "@/lib/academie";
import { IcoOeil } from "../../../../icones";
import { BlocVue, IconeGenre, nomGenre, pluriel } from "../../../vues";
import { CasePublie, ChampsBloc, Deplacer, ERREURS, EtatPublication } from "../../outils";

export const dynamic = "force-dynamic";

/**
 * EDITER UNE LECON.
 *
 * Chaque bloc s'affiche comme le lira un redboxer, avec sous lui son
 * formulaire replie. On ajoute en bas, genre par genre : un formulaire par
 * genre, qui ne demande que ce qu'il utilise.
 */
export default async function EditerLecon({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ e?: string; ok?: string; g?: string; b?: string }>;
}) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!peutEditer(u)) redirect("/academie");
  const l = await lecteur(u);
  const id = Number((await params).id);
  const [lecon, sp] = await Promise.all([leconDe(l, id), searchParams]);
  if (!lecon) notFound();
  const blocs = await blocsDe(id);
  const erreur = sp.e ? ERREURS[sp.e] ?? "Impossible." : null;
  const blocOuvert = Number(sp.b);

  return (
    <>
      <Entete page="academie_editer" />
      <main className="ecran aca">
        <Link href={`/academie/editer/module/${lecon.module_id}`} className="aca-retour">‹ {lecon.module_titre}</Link>
        <div className="aca-ed-titre">
          <div className="pousse">
            <div className="aca-surtitre"><span>Leçon</span><EtatPublication publie={lecon.publie} />
              {!lecon.module_publie ? <span className="faible">module en brouillon</span> : null}
            </div>
            <h1>{lecon.titre}</h1>
          </div>
          <Link href={`/academie/lecon/${id}`} className="bouton petit"><IcoOeil size={16} /> Voir la leçon</Link>
        </div>

        {sp.ok === "1" ? <p className="aca-ok" role="status">Enregistré.</p> : null}
        {sp.ok === "supprime" ? <p className="aca-ok" role="status">Bloc supprimé.</p> : null}
        {erreur && !sp.g && !sp.b ? <p className="erreur">{erreur}</p> : null}

        <form method="post" action="/api/academie/lecon" className="carte">
          <input type="hidden" name="action" value="maj" />
          <input type="hidden" name="id" value={id} />
          <div className="champ">
            <label htmlFor="titre">Titre</label>
            <input id="titre" name="titre" required maxLength={TITRE_MAX} defaultValue={lecon.titre} />
          </div>
          <div className="champ">
            <label htmlFor="resume">Chapeau <span className="faible">(facultatif — la phrase sous le titre)</span></label>
            <textarea id="resume" name="resume" rows={2} maxLength={RESUME_MAX} defaultValue={lecon.resume ?? ""} />
          </div>
          <div className="champs" style={{ marginTop: 14 }}>
            <div className="c-court">
              <label htmlFor="duree">Durée (min)</label>
              <input id="duree" name="duree" type="number" min={1} max={600} inputMode="numeric"
                     defaultValue={lecon.duree ?? ""} />
            </div>
            <div className="c-moyen">
              <label htmlFor="acces">Accès</label>
              <select id="acces" name="acces" defaultValue={lecon.acces}>
                {ACCES.map((a) => <option key={a.cle} value={a.cle}>{a.nom}</option>)}
              </select>
            </div>
          </div>
          {lecon.module_acces === "redboxers" ? (
            <p className="aide">Le module est réservé aux redboxers : cette leçon l’est aussi.</p>
          ) : null}
          <div className="aca-ed-bas">
            <CasePublie publie={lecon.publie} quoi="la leçon apparaît dans son module" />
            <button className="bouton primaire">Enregistrer</button>
          </div>
        </form>

        <div className="titre-section" id="blocs">
          <h2>Contenu</h2>
          <span className="faible">{pluriel(blocs.length, "bloc", "blocs")}</span>
        </div>
        {blocs.length === 0 ? (
          <p className="vide">Aucun bloc : ajoutez un texte, une vidéo ou un document ci-dessous.</p>
        ) : (
          <div className="aca-ed-blocs">
            {blocs.map((b, j) => (
              <section key={b.id} id={`b${b.id}`} className="aca-ed-bloc">
                <div className="tete">
                  <span className="genre"><IconeGenre genre={b.genre} size={15} /> {nomGenre(b.genre)}</span>
                  <span className="pousse" />
                  <Deplacer route="bloc" id={b.id} premier={j === 0} dernier={j === blocs.length - 1} />
                </div>
                <div className="apercu"><BlocVue b={b} editeur /></div>
                <details className="aca-ed-modifier" open={blocOuvert === b.id}>
                  <summary>Modifier ce bloc</summary>
                  <form method="post" action="/api/academie/bloc" encType="multipart/form-data" className="formulaire">
                    <input type="hidden" name="action" value="maj" />
                    <input type="hidden" name="id" value={b.id} />
                    {blocOuvert === b.id && erreur ? <p className="erreur">{erreur}</p> : null}
                    <ChampsBloc genre={b.genre} b={b} />
                    <div className="aca-ed-bas">
                      <span />
                      <button className="bouton primaire">Enregistrer le bloc</button>
                    </div>
                  </form>
                  <form method="post" action="/api/academie/bloc" className="formulaire supprimer">
                    <input type="hidden" name="action" value="supprimer" />
                    <input type="hidden" name="id" value={b.id} />
                    <button className="bouton petit danger">Supprimer ce bloc</button>
                  </form>
                </details>
              </section>
            ))}
          </div>
        )}

        <div className="titre-section" id="ajouter"><h2>Ajouter un bloc</h2></div>
        <div className="aca-ajouts">
          {GENRES.map((g) => (
            <details key={g.cle} className="aca-ajout" open={sp.g === g.cle}>
              <summary>
                <span className="picto-genre" aria-hidden="true"><IconeGenre genre={g.cle} /></span>
                <span className="nom">{g.nom}</span>
                <span className="quoi">{g.quoi}</span>
              </summary>
              <form method="post" action="/api/academie/bloc" encType="multipart/form-data">
                <input type="hidden" name="action" value="creer" />
                <input type="hidden" name="lecon_id" value={id} />
                <input type="hidden" name="genre" value={g.cle} />
                {sp.g === g.cle && erreur ? <p className="erreur">{erreur}</p> : null}
                <ChampsBloc genre={g.cle} />
                <div className="aca-ed-bas">
                  <span />
                  <button className="bouton primaire">Ajouter à la fin</button>
                </div>
              </form>
            </details>
          ))}
        </div>

        <details className="aca-danger">
          <summary>Supprimer cette leçon</summary>
          <div className="dedans">
            <p>Ses blocs et ses fichiers seront effacés, ainsi que la progression de chacun. On ne peut pas revenir en arrière.</p>
            <form method="post" action="/api/academie/lecon">
              <input type="hidden" name="action" value="supprimer" />
              <input type="hidden" name="id" value={id} />
              <button className="bouton danger">Supprimer définitivement</button>
            </form>
          </div>
        </details>
      </main>
      <NavBasse page="academie_editer" />
    </>
  );
}
