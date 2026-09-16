import Link from "next/link";
import { notFound } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { blocsDe, leconDe, marquerVue, modules, ouverte, salonProspects, sommaire } from "@/lib/academie";
import { IcoCadenas, IcoChevron, IcoCoche, IcoHorloge, IcoPrecedent, IcoTrophee } from "../../../icones";
import MesureEntete from "../../../messages/mesure";
import { lecteurDePage } from "../../lecteur";
import { Blocs, PorteFermee, duree } from "../../vues";
import { Sommaire, bilanDe, sommaireFerme } from "../../salle";
import { BarreLecture, BasculeSommaire, Raccourcis } from "../../salle-client";

export const dynamic = "force-dynamic";

/**
 * UNE LECON, EN SALLE DE COURS.
 *
 * Comme sur une plateforme de formation : le rail de la console se replie en
 * icones, le sommaire de TOUTE la formation tient la gauche — on le masque
 * d'un geste —, une barre de cours collee en haut dit ou l'on est, jusqu'ou
 * l'on a lu, et mene a la lecon d'avant ou d'apres (les fleches du clavier
 * aussi). Au telephone, le sommaire est un tiroir.
 *
 * La colonne de lecture reste bornee a la largeur d'un livre.
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
  const [mods, toutes, blocs, salon, ferme] = await Promise.all([
    modules(l),
    sommaire(l),
    ok ? blocsDe(id) : Promise.resolve([]),
    ok ? Promise.resolve(null) : salonProspects(),
    sommaireFerme(),
    ok ? marquerVue(l, id) : Promise.resolve(),
  ]);

  // La lecon qu'on vient d'ouvrir est vue, meme si la lecture a precede l'ecriture.
  const lecons = toutes.map((x) => (x.id === id && ok ? { ...x, vu: true } : x));
  const liste = lecons.filter((x) => x.module_id === lecon.module_id);
  const i = liste.findIndex((x) => x.id === id);
  const ici = i >= 0 ? liste[i] : null;
  // Precedente et suivante dans TOUTE la formation : la derniere lecon d'un
  // module mene a la premiere du suivant.
  const g = lecons.findIndex((x) => x.id === id);
  const avant = g > 0 ? lecons[g - 1] : null;
  const apres = g >= 0 && g < lecons.length - 1 ? lecons[g + 1] : null;
  // Terminer mene a la prochaine lecon OUVERTE : un prospect ne tombe pas sur
  // un cadenas en recompense de sa lecture.
  const suite = g >= 0 ? lecons.slice(g + 1).find((x) => x.ouverte) ?? null : null;
  const rang = mods.findIndex((m) => m.id === lecon.module_id) + 1;
  const bilan = bilanDe(lecons);
  const reservee = lecon.acces === "redboxers" || lecon.module_acces === "redboxers";
  const derniere = ok && !ici?.fini && bilan.ouvertes - bilan.finies === 1;

  return (
    <>
      <Entete page="academie" />
      <MesureEntete />
      <main className="ecran aca aca-focus aca-salle-ecran">
        <input type="checkbox" id="aca-tiroir" className="aca-tiroir" aria-hidden="true" tabIndex={-1} />
        <div className="aca-salle" id="aca-salle" data-sommaire-ferme={ferme ? "" : undefined}>
          <label htmlFor="aca-tiroir" className="aca-voile" aria-hidden="true" />
          <Sommaire mods={mods} lecons={lecons} ici={id} bilan={bilan} />

          <div className="aca-scene">
            <div className="aca-barre-cours">
              <BasculeSommaire depart={ferme} />
              <div className="ou">
                <Link href={`/academie/module/${lecon.module_id}`} className="module">
                  {rang > 0 ? `Module ${rang} · ` : ""}{lecon.module_titre}
                </Link>
                <span className="lecon">{i >= 0 ? `Leçon ${i + 1}/${liste.length} · ` : ""}{lecon.titre}</span>
              </div>
              <div className="gestes">
                <span className="avance num" title="Progression dans la formation">{bilan.pct} %</span>
                {avant ? (
                  <Link href={`/academie/lecon/${avant.id}`} className="bouton icone" title={`Précédente : ${avant.titre}`} aria-label="Leçon précédente">
                    <IcoPrecedent />
                  </Link>
                ) : <span className="bouton icone" aria-disabled="true"><IcoPrecedent /></span>}
                {apres ? (
                  <Link href={`/academie/lecon/${apres.id}`} className="bouton icone" title={`Suivante : ${apres.titre}`} aria-label="Leçon suivante">
                    <IcoChevron />
                  </Link>
                ) : <span className="bouton icone" aria-disabled="true"><IcoChevron /></span>}
              </div>
              <BarreLecture />
            </div>

            <article className="aca-lecture">
              <div className="aca-surtitre num">
                <span>{rang > 0 ? `Module ${rang}` : "Module"}</span>
                {i >= 0 ? <span>Leçon {i + 1} sur {liste.length}</span> : null}
                {lecon.duree ? <span className="avec-icone"><IcoHorloge size={14} /> {duree(lecon.duree)}</span> : null}
                {reservee ? <span className="aca-tag" data-ton="redboxers"><IcoCadenas size={12} /> Redboxers</span> : null}
                {!lecon.publie || !lecon.module_publie ? <span className="aca-tag" data-ton="brouillon">Brouillon</span> : null}
                {ici?.fini ? <span className="aca-tag" data-ton="fini"><IcoCoche size={12} /> Terminée</span> : null}
              </div>
              <h1>{lecon.titre}</h1>
              {lecon.resume ? <p className="aca-chapeau">{lecon.resume}</p> : null}

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
                    {derniere ? <input type="hidden" name="apres" value="certificat" />
                      : suite ? <input type="hidden" name="suite" value={suite.id} /> : null}
                    <button className="bouton primaire large">
                      {derniere ? <IcoTrophee size={18} /> : <IcoCoche size={18} />}
                      {derniere ? "Terminer la formation" : suite ? "Terminer et passer à la suite" : "Terminer la leçon"}
                    </button>
                  </form>
                ) : null}
                {ok && bilan.toutFini ? (
                  <Link href="/academie/certificat" className="aca-certif-lien">
                    <IcoTrophee size={20} />
                    <span className="pousse"><b>Formation terminée.</b> Votre certificat est prêt.</span>
                    <IcoChevron size={16} />
                  </Link>
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
                <p className="aca-astuce-clavier">Astuce : les flèches ← et → du clavier passent d’une leçon à l’autre.</p>

                {equipe && !l.apercu ? (
                  <p className="note-lecture">
                    <Link href={`/academie/editer/lecon/${id}`} className="lien-souligne">Modifier cette leçon</Link>
                  </p>
                ) : null}
              </footer>
            </article>
          </div>
        </div>
        <Raccourcis avant={avant ? `/academie/lecon/${avant.id}` : null}
                    apres={apres ? `/academie/lecon/${apres.id}` : null} />
      </main>
      <NavBasse page="academie" />
    </>
  );
}
