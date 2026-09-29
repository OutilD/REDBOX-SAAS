import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { IcoAcademie, IcoFleche } from "../../icones";
import { Delta } from "../../analyses";
import { Repli } from "../../repli";
import { Portrait } from "../../communaute/vignette-personne";
import { depuis } from "@/db";
import { estSuperAdmin, utilisateur } from "@/lib/auth";
import { JOURS_CHAUD, suivi, temperature, type Apprenant } from "@/lib/academie-suivi";
import { nomAffiche } from "@/lib/personnes";

export const dynamic = "force-dynamic";

const s = (n: number, mot = "s") => (n > 1 ? mot : "");
const pc = (n: number, sur: number) => (sur > 0 ? Math.round((n * 100) / sur) : 0);

/** Combien de prospects chauds et tiedes on liste : au-dela, ce n'est plus une liste d'appels. */
const PROSPECTS_MAX = 24;

/**
 * L'ACADEMIE VUE DE LA PLATEFORME.
 *
 * Qui la suit, jusqu'ou, et ou l'on decroche. Surtout : les prospects qui
 * avancent — ceux qui ont fini le premier module ou trois lecons et sont
 * revenus ces quatorze derniers jours. Ce sont les personnes a appeler : elles
 * se sont formees seules, il leur manque une machine.
 *
 * L'equipe RedBox, les comptes de demo et la vitrine n'y sont pas comptes.
 */
export default async function SuiviAcademie() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!estSuperAdmin(u)) redirect("/");

  const x = await suivi();
  const actifs = x.apprenants.filter((a) => a.vues > 0);
  const prospects = x.apprenants.filter((a) => !a.redboxer);
  const prospectsActifs = prospects.filter((a) => a.vues > 0);
  const termines = actifs.filter((a) => a.ouvertes > 0 && a.finies >= a.ouvertes);
  const chauds = prospects.filter((a) => temperature(a) === "chaud");
  const aSuivre = prospects
    .filter((a) => temperature(a) !== "froid" && a.vues > 0)
    .sort((a, b) => rang(b) - rang(a) || b.finies - a.finies || temps(b.derniere) - temps(a.derniere))
    .slice(0, PROSPECTS_MAX);
  const vuesTotal = actifs.reduce((t, a) => t + a.vues, 0);
  const finiesTotal = actifs.reduce((t, a) => t + a.finies, 0);
  const premier = x.modules.find((m) => m.ouvert_a_tous);

  const entonnoir = [
    { nom: "Prospects inscrits", n: x.inscritsProspects },
    { nom: "Ont ouvert une leçon", n: prospectsActifs.length },
    { nom: "Ont fini une leçon", n: prospects.filter((a) => a.finies > 0).length },
    { nom: premier ? `Ont fini « ${premier.titre} »` : "Ont fini le premier module", n: prospects.filter((a) => a.premier_module).length },
    { nom: "Ont fini tout ce qui leur est ouvert", n: prospects.filter((a) => a.ouvertes > 0 && a.finies >= a.ouvertes).length },
  ];
  const sommetRythme = Math.max(1, ...x.rythme.map((r) => r.finies));
  const finiesRythme = x.rythme.reduce((t, r) => t + r.finies, 0);
  const sommetLecon = Math.max(1, ...x.lecons.map((l) => l.vues));

  return (
    <>
      <Entete page="admin_academie" />
      <main className="ecran adm">
        <div className="tete-tableau">
          <div className="quoi">
            <h1>Académie</h1>
            <p className="sous">
              {actifs.length} personne{s(actifs.length)} en formation sur {x.inscrits} inscrite{s(x.inscrits)} · {x.modules.length} module{s(x.modules.length)} publié{s(x.modules.length)}, {x.lecons.length} leçon{s(x.lecons.length)}.
            </p>
          </div>
          <div className="rangee-actions">
            <Link href="/academie" className="bouton petit">Ouvrir l’académie</Link>
            <Link href="/academie/editer" className="bouton primaire petit">Éditer</Link>
          </div>
        </div>

        {/* ------------------------------------------------------- les chiffres */}
        <section className="adm-tuiles" aria-label="L’académie en chiffres">
          <Tuile titre="Prospects chauds" valeur={String(chauds.length)} vers="#prospects" accent
                 dessous={`premier module ou 3 leçons finies, actifs ces ${JOURS_CHAUD} jours`} />
          <Tuile titre="Prospects en formation" valeur={String(prospectsActifs.length)}
                 dessous={`sur ${x.inscritsProspects} prospect${s(x.inscritsProspects)} inscrit${s(x.inscritsProspects)} · ${pc(prospectsActifs.length, x.inscritsProspects)} %`} />
          <Tuile titre="Leçons finies" valeur={String(x.finies30)} delta={<Delta ici={x.finies30} avant={x.finies30avant} />}
                 dessous={`30 derniers jours · ${x.finies30avant} les 30 d’avant`} />
          <Tuile titre="En formation" valeur={String(actifs.length)}
                 dessous={`${actifs.length - prospectsActifs.length} redboxer${s(actifs.length - prospectsActifs.length)} · ${prospectsActifs.length} prospect${s(prospectsActifs.length)}`} />
          <Tuile titre="Taux de finition" valeur={`${pc(finiesTotal, vuesTotal)} %`}
                 dessous={`${finiesTotal} leçon${s(finiesTotal)} finie${s(finiesTotal)} sur ${vuesTotal} ouverte${s(vuesTotal)}`} />
          <Tuile titre="Parcours terminé" valeur={String(termines.length)}
                 dessous="tout ce qui leur est ouvert, fini : certificat" />
        </section>

        {/* ------------------------------------------- l'entonnoir, le rythme */}
        <div className="adm-deux large-gauche">
          <section className="adm-bloc">
            <header>
              <h2>Du prospect au parcours fini</h2>
              <span className="faible">personnes sans RedBox</span>
            </header>
            {x.inscritsProspects === 0 ? (
              <p className="adm-vide">Aucun prospect inscrit.</p>
            ) : (
              <ol className="aca-entonnoir">
                {entonnoir.map((e, i) => (
                  <li key={e.nom}>
                    <span className="nom">{e.nom}</span>
                    <span className="piste" aria-hidden="true">
                      <span style={{ width: `${Math.max(e.n > 0 ? 2 : 0, pc(e.n, entonnoir[0].n))}%` }} />
                    </span>
                    <b className="num">{e.n}</b>
                    <span className="part num faible">
                      {i === 0 ? "" : `${pc(e.n, entonnoir[i - 1].n)} %`}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="adm-bloc">
            <header>
              <h2>Leçons finies par semaine</h2>
              <span className="faible num">{finiesRythme} en 12 semaines</span>
            </header>
            {finiesRythme === 0 ? (
              <p className="adm-vide">Aucune leçon finie sur douze semaines.</p>
            ) : (
              <div className="aca-rythme" role="img"
                   aria-label={`Leçons finies par semaine : ${x.rythme.map((r) => `${r.etiquette} ${r.finies}`).join(", ")}`}>
                {x.rythme.map((r, i) => (
                  <div key={r.semaine} className="col" title={`Semaine du ${r.etiquette} : ${r.finies} leçon${s(r.finies)}, ${r.personnes} personne${s(r.personnes)}`}>
                    <span className="n num">{r.finies > 0 ? r.finies : ""}</span>
                    <span className="barre" style={{ height: `${(r.finies / sommetRythme) * 100}%` }} />
                    <span className="quand num">{i % 3 === 0 || i === x.rythme.length - 1 ? r.etiquette : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ------------------------------------------------ les prospects a appeler */}
        <section className="adm-bloc ancre" id="prospects" style={{ marginTop: 22 }}>
          <header>
            <h2>Prospects qui avancent</h2>
            <span className="faible">les plus avancés d’abord · à contacter pour une RedBox</span>
          </header>
          {aSuivre.length === 0 ? (
            <Repli icone={<IcoAcademie />} titre="Aucun prospect en formation pour l’instant" dedans />
          ) : (
            <ul className="aca-prospects">
              {aSuivre.map((a) => {
                const t = temperature(a);
                const nom = nomAffiche(a);
                return (
                  <li key={a.id}>
                    <Portrait image_id={a.image_id} pseudo={nom} couleur={a.couleur} taille={38} />
                    <span className="dit">
                      <span className="haut">
                        <Link href={`/communaute/${a.id}`} className="nom">{nom}</Link>
                        <span className="pilule" data-temp={t}><i />{t === "chaud" ? "chaud" : "tiède"}</span>
                      </span>
                      <span className="piste" aria-hidden="true"><span style={{ width: `${pc(a.finies, a.ouvertes)}%` }} /></span>
                      <span className="bas">
                        {a.finies}/{a.ouvertes} leçon{s(a.ouvertes)} finie{s(a.finies)}
                        {a.premier_module && premier ? ` · « ${premier.titre} » fini` : ""}
                        {" "}· vu {depuis(a.derniere)} · compte {a.compte}
                      </span>
                    </span>
                    <span className="gestes">
                      <Link href={`/admin/comptes#c${a.compte_id}`} className="bouton petit">Compte</Link>
                      <Link href="/admin/parc#col-libre" className="bouton petit primaire"
                            title={`Attribuer une machine en stock au compte ${a.compte}`}>Attribuer une RedBox</Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ----------------------------------------- ou l'on decroche, les modules */}
        <div className="adm-deux">
          <section className="adm-bloc">
            <header>
              <h2>Leçon par leçon</h2>
              <span className="legende-lecons faible">
                <i className="vue" aria-hidden="true" />ouverte <i className="finie" aria-hidden="true" />finie
              </span>
            </header>
            {x.lecons.length === 0 ? (
              <p className="adm-vide">Aucune leçon publiée.</p>
            ) : (
              <ol className="aca-lecons">
                {x.lecons.map((l, i) => (
                  <li key={l.id}>
                    {i === 0 || x.lecons[i - 1].module_id !== l.module_id
                      ? <span className="module">{l.module}{l.ouverte_a_tous ? "" : " · redboxers"}</span> : null}
                    <span className="haut">
                      <Link href={`/academie/lecon/${l.id}`} className="nom">{l.titre}</Link>
                      <span className="num faible">{l.finies}/{l.vues}</span>
                    </span>
                    <span className="piste double" aria-hidden="true">
                      <span className="vue" style={{ width: `${(l.vues / sommetLecon) * 100}%` }} />
                      <span className="finie" style={{ width: `${(l.finies / sommetLecon) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="adm-bloc">
            <header>
              <h2>Modules</h2>
              <span className="faible">commencé · fini</span>
            </header>
            {x.modules.length === 0 ? (
              <p className="adm-vide">Aucun module publié.</p>
            ) : (
              <ol className="adm-rang">
                {x.modules.map((m, i) => (
                  <li key={m.id}>
                    <span className="rang num">{i + 1}</span>
                    <span className="dit">
                      <span className="haut">
                        <Link href={`/academie/module/${m.id}`} className="nom">{m.titre}</Link>
                        <b className="num">{pc(m.fini, m.commence)} %</b>
                      </span>
                      <span className="piste" aria-hidden="true"><span style={{ width: `${pc(m.fini, m.commence)}%` }} /></span>
                      <span className="bas">
                        {m.lecons} leçon{s(m.lecons)} · {m.ouvert_a_tous ? "ouvert à tous" : "redboxers"} · {m.commence} l’ont commencé, {m.fini} l’ont fini
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <p className="faible" style={{ fontSize: 12.5, marginTop: 18 }}>
          L’équipe RedBox, les comptes de démo et la vitrine ne sont pas comptés.
          Un redboxer a une machine attribuée sur l’un de ses comptes ; les autres sont des prospects.{" "}
          <Link href="/admin" className="lien">Tableau de la plateforme <IcoFleche size={12} /></Link>
        </p>
      </main>
      <NavBasse page="admin_academie" />
    </>
  );
}

const temps = (d: Date | null) => (d ? new Date(d).getTime() : 0);
const rang = (a: Apprenant) => (temperature(a) === "chaud" ? 1 : 0);

function Tuile({ titre, valeur, dessous, delta, vers, accent }: {
  titre: string; valeur: string; dessous: string; delta?: React.ReactNode; vers?: string; accent?: boolean;
}) {
  const corps = (
    <>
      <span className="titre-tuile">{titre}</span>
      <span className="ligne"><b className="chiffre num">{valeur}</b>{delta}</span>
      <span className="dessous">{dessous}</span>
    </>
  );
  const classe = `adm-tuile${accent ? " accent" : ""}`;
  return vers
    ? <a href={vers} className={`${classe} menant`}>{corps}</a>
    : <div className={classe}>{corps}</div>;
}
