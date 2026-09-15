import Link from "next/link";
import { notFound } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { blocsDe, leconDe, leconsDe, marquerVue, modules, ouverte, salonProspects } from "@/lib/academie";
import { IcoCadenas, IcoCoche, IcoHorloge } from "../../../icones";
import { lecteurDePage } from "../../lecteur";
import { Blocs, Piste, PorteFermee, Programme, duree } from "../../vues";

export const dynamic = "force-dynamic";

/**
 * UNE LECON.
 *
 * Une colonne de lecture — pas plus large qu'un livre, parce qu'une ligne de
 * cent quarante caracteres se relit deux fois — et, sur grand ecran, le
 * programme du module a cote, pour savoir ou l'on est sans quitter la page.
 * Au telephone, ce programme se replie au-dessus du contenu.
 *
 * En bas, UN geste : « Terminer et passer a la suite ». La progression n'est
 * jamais devinee a partir du defilement : c'est la personne qui dit qu'elle a
 * compris.
 */
export default async function LeconAcademie({ params }: { params: Promise<{ id: string }> }) {
  const { l, equipe } = await lecteurDePage();
  const id = Number((await params).id);
  const lecon = await leconDe(l, id);
  if (!lecon) notFound();
  const ok = ouverte(l, lecon.module_acces, lecon.acces);
  const [mods, liste, blocs, salon] = await Promise.all([
    modules(l),
    leconsDe(l, { id: lecon.module_id, acces: lecon.module_acces }),
    ok ? blocsDe(id) : Promise.resolve([]),
    ok ? Promise.resolve(null) : salonProspects(),
    ok ? marquerVue(l, id) : Promise.resolve(),
  ]);

  const i = liste.findIndex((x) => x.id === id);
  const ici = i >= 0 ? liste[i] : null;
  const avant = i > 0 ? liste[i - 1] : null;
  const apres = i >= 0 && i < liste.length - 1 ? liste[i + 1] : null;
  // Terminer mene a la prochaine lecon OUVERTE : un prospect ne tombe pas sur
  // un cadenas en recompense de sa lecture.
  const suite = i >= 0 ? liste.slice(i + 1).find((x) => x.ouverte) ?? null : null;
  const rang = mods.findIndex((m) => m.id === lecon.module_id) + 1;
  const ouvertes = liste.filter((x) => x.ouverte);
  const finies = ouvertes.filter((x) => x.fini).length;
  const reservee = lecon.acces === "redboxers" || lecon.module_acces === "redboxers";

  return (
    <>
      <Entete page="academie" />
      <main className="ecran aca">
        <div className="aca-lecon">
          <article className="aca-lecture">
            <Link href={`/academie/module/${lecon.module_id}`} className="aca-retour">
              ‹ {rang > 0 ? `Module ${rang} · ` : ""}{lecon.module_titre}
            </Link>
            <div className="aca-surtitre num">
              {i >= 0 ? <span>Leçon {i + 1} sur {liste.length}</span> : null}
              {lecon.duree ? <span className="avec-icone"><IcoHorloge size={14} /> {duree(lecon.duree)}</span> : null}
              {reservee ? <span className="aca-tag" data-ton="redboxers"><IcoCadenas size={12} /> Redboxers</span> : null}
              {!lecon.publie || !lecon.module_publie ? <span className="aca-tag" data-ton="brouillon">Brouillon</span> : null}
              {ici?.fini ? <span className="aca-tag" data-ton="fini"><IcoCoche size={12} /> Terminée</span> : null}
            </div>
            <h1>{lecon.titre}</h1>
            {lecon.resume ? <p className="aca-chapeau">{lecon.resume}</p> : null}

            {liste.length > 1 ? (
              <details className="aca-programme-mobile">
                <summary>
                  <span className="pousse">Programme du module</span>
                  <Piste n={finies} sur={ouvertes.length} label="Progression du module" />
                  <span className="num faible">{finies}/{ouvertes.length}</span>
                </summary>
                <Programme liste={liste} ici={id} />
              </details>
            ) : null}

            {ok ? (
              blocs.length > 0 ? <Blocs blocs={blocs} /> : <p className="vide">Cette leçon n’a pas encore de contenu.</p>
            ) : (
              <PorteFermee salon={salon} />
            )}

            <footer className="aca-fin">
              {ok && ici?.fini ? (
                <div className="aca-termine" role="status">
                  <IcoCoche size={20} />
                  <span className="pousse">Leçon terminée</span>
                  <form method="post" action="/api/academie/suivi">
                    <input type="hidden" name="lecon_id" value={id} />
                    <input type="hidden" name="fini" value="0" />
                    <button className="bouton petit discret">Marquer non terminée</button>
                  </form>
                </div>
              ) : ok ? (
                <form method="post" action="/api/academie/suivi">
                  <input type="hidden" name="lecon_id" value={id} />
                  <input type="hidden" name="fini" value="1" />
                  {suite ? <input type="hidden" name="suite" value={suite.id} /> : null}
                  <button className="bouton primaire large">
                    <IcoCoche size={18} />
                    {suite ? "Terminer et passer à la suite" : "Terminer la leçon"}
                  </button>
                </form>
              ) : null}

              {avant || apres ? (
                <nav className="aca-voisines" aria-label="Leçons voisines">
                  {avant ? (
                    <Link href={`/academie/lecon/${avant.id}`} className="aca-voisine">
                      <span className="sens">‹ Précédente</span>
                      <span className="nom">{avant.titre}</span>
                    </Link>
                  ) : null}
                  {apres ? (
                    <Link href={`/academie/lecon/${apres.id}`} className="aca-voisine suivante">
                      <span className="sens">Suivante ›</span>
                      <span className="nom">{!apres.ouverte ? <IcoCadenas size={13} /> : null} {apres.titre}</span>
                    </Link>
                  ) : null}
                </nav>
              ) : null}

              {equipe && !l.apercu ? (
                <p className="note-lecture">
                  <Link href={`/academie/editer/lecon/${id}`} className="lien-souligne">Modifier cette leçon</Link>
                </p>
              ) : null}
            </footer>
          </article>

          <aside className="aca-cote" aria-label="Programme du module">
            <div className="aca-cote-carte">
              <div className="tete">
                <div className="aca-surtitre">{rang > 0 ? `Module ${rang}` : "Module"}</div>
                <Link href={`/academie/module/${lecon.module_id}`} className="nom">{lecon.module_titre}</Link>
                {ouvertes.length > 0 ? (
                  <div className="aca-avance">
                    <Piste n={finies} sur={ouvertes.length} label="Progression du module" />
                    <span className="num">{finies}/{ouvertes.length}</span>
                  </div>
                ) : null}
              </div>
              <Programme liste={liste} ici={id} />
            </div>
          </aside>
        </div>
      </main>
      <NavBasse page="academie" />
    </>
  );
}
