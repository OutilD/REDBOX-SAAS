import Link from "next/link";
import { notFound } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { leconsDe, modules, ouverte, salonProspects } from "@/lib/academie";
import { IcoCadenas, IcoCoche, IcoDocument, IcoLecture } from "../../../icones";
import { lecteurDePage } from "../../lecteur";
import { IconeModule, Piste, PorteFermee, duree, etatLecon, pluriel } from "../../vues";

export const dynamic = "force-dynamic";

/**
 * UN MODULE : SON PROGRAMME.
 *
 * Ce qu'on y apprend, combien de temps ca prend, ou l'on en est — et un seul
 * bouton, qui mene a la lecon par ou reprendre. Dessous, les lecons dans
 * l'ordre, chacune avec son etat : terminee, commencee, a faire, ou fermee.
 */
export default async function ModuleAcademie({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ fini?: string }>;
}) {
  const { l, equipe } = await lecteurDePage();
  const id = Number((await params).id);
  const sp = await searchParams;
  const mods = await modules(l);
  const i = mods.findIndex((m) => m.id === id);
  if (i < 0) notFound();
  const m = mods[i];
  const ferme = !ouverte(l, m.acces);
  const [lecons, salon] = await Promise.all([
    leconsDe(l, m),
    !l.redboxer && (ferme || m.reservees > 0) ? salonProspects() : Promise.resolve(null),
  ]);
  const ouvertes = lecons.filter((x) => x.ouverte);
  const finies = ouvertes.filter((x) => x.fini).length;
  const toutFini = ouvertes.length > 0 && finies === ouvertes.length;
  const prochaine = ouvertes.find((x) => !x.fini) ?? ouvertes[0] ?? null;
  const entame = finies > 0 || ouvertes.some((x) => x.vu);
  const suivant = mods[i + 1] ?? null;

  return (
    <>
      <Entete page="academie" />
      <main className="ecran aca aca-focus">
        <Link href="/academie" className="aca-retour">‹ Académie</Link>

        <header className="aca-module-tete">
          <span className="aca-picto grand" aria-hidden="true"><IconeModule icone={m.icone} size={30} /></span>
          <div className="dit">
            <div className="aca-surtitre num">
              <span>Module {i + 1}</span>
              <span>{pluriel(lecons.length, "leçon", "leçons")}</span>
              {m.minutes ? <span>{duree(m.minutes)}</span> : null}
              {m.acces === "redboxers" ? <span className="aca-tag" data-ton="redboxers"><IcoCadenas size={12} /> Redboxers</span> : null}
              {!m.publie ? <span className="aca-tag" data-ton="brouillon">Brouillon</span> : null}
            </div>
            <h1>{m.titre}</h1>
            {m.resume ? <p className="aca-chapeau">{m.resume}</p> : null}
            {!ferme && ouvertes.length > 0 ? (
              <div className="aca-avance">
                <Piste n={finies} sur={ouvertes.length} label={`Progression : ${m.titre}`} />
                <span className="num">{finies} / {ouvertes.length} terminée{finies > 1 ? "s" : ""}</span>
              </div>
            ) : null}
            {!ferme && prochaine ? (
              <Link href={`/academie/lecon/${prochaine.id}`} className="bouton primaire">
                <IcoLecture size={18} />
                {toutFini ? "Revoir le module" : entame ? "Continuer" : "Commencer le module"}
              </Link>
            ) : null}
          </div>
        </header>

        {sp.fini && toutFini ? (
          <div className="aca-bravo" role="status">
            <IcoCoche size={20} />
            <div>
              <b>Module terminé.</b>{" "}
              {suivant ? (
                <>Le suivant : <Link href={`/academie/module/${suivant.id}`}>{suivant.titre}</Link></>
              ) : "Vous avez fait le tour de ce qui vous est ouvert."}
            </div>
          </div>
        ) : null}

        {ferme ? <PorteFermee salon={salon} /> : null}

        <div className="titre-section"><h2>Programme</h2></div>
        {lecons.length === 0 ? (
          <p className="vide">Les leçons de ce module arrivent bientôt.</p>
        ) : (
          <ol className="aca-programme">
            {lecons.map((x, j) => {
              const etat = etatLecon(x);
              return (
                <li key={x.id} id={`l${x.id}`}>
                  <Link href={`/academie/lecon/${x.id}`} className="aca-etape" data-etat={etat}>
                    <span className="pastille num" aria-hidden="true">
                      {etat === "fini" ? <IcoCoche size={15} /> : etat === "ferme" ? <IcoCadenas size={14} /> : j + 1}
                    </span>
                    <span className="dit">
                      <span className="nom">
                        {x.titre}
                        {!x.publie ? <span className="aca-tag" data-ton="brouillon">Brouillon</span> : null}
                      </span>
                      {x.resume ? <span className="quoi">{x.resume}</span> : null}
                    </span>
                    <span className="indices">
                      {x.videos > 0 ? <span title="Vidéo"><IcoLecture size={15} /><span className="lecteur-seul">vidéo</span></span> : null}
                      {x.fichiers > 0 ? <span title="Documents"><IcoDocument size={15} /><span className="lecteur-seul">documents</span></span> : null}
                      {x.duree ? <span className="num">{duree(x.duree)}</span> : null}
                      <span className="etat">
                        {etat === "fini" ? "Terminée" : etat === "ferme" ? "Redboxers" : etat === "encours" ? "Commencée" : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}

        {!ferme && !l.redboxer && m.reservees > 0 ? (
          <div style={{ marginTop: 14 }}>
            <PorteFermee compacte salon={salon}
                         quoi={`${pluriel(m.reservees, "leçon réservée", "leçons réservées")} aux redboxers dans ce module`} />
          </div>
        ) : null}

        <div className="aca-voisines" style={{ marginTop: 22 }}>
          {suivant ? (
            <Link href={`/academie/module/${suivant.id}`} className="aca-voisine suivante">
              <span className="sens">Module suivant ›</span>
              <span className="nom">{suivant.titre}</span>
            </Link>
          ) : null}
        </div>

        {equipe && !l.apercu ? (
          <p className="note-lecture">
            <Link href={`/academie/editer/module/${m.id}`} className="lien-souligne">Modifier ce module</Link>
          </p>
        ) : null}
      </main>
      <NavBasse page="academie" />
    </>
  );
}
