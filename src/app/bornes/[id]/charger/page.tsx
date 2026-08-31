import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import Pas from "../../../pas";
import { q1, euros, depuis } from "@/db";
import { peutCharger, utilisateur } from "@/lib/auth";
import { Repli } from "../../../repli";
import { IcoBorne } from "../../../icones";
import { canauxDe, grouperCanaux, type GroupeCanal, type LigneCanal } from "@/lib/stock";

export const dynamic = "force-dynamic";

/**
 * Charger une borne.
 *
 * L'ecran qu'on tient debout, devant la machine ouverte, rassemble par categorie :
 * on remplit avec un carton dans les mains, pas en marchant le long des rangees.
 * On fait tous les canaux de Puffs, puis on prend le carton suivant. Le numero de
 * canal reste sur chaque bloc — c'est lui qui dit ou poser la main.
 *
 * Les categories qui ont un canal vide s'ouvrent seules : l'ecran s'ouvre sur ce
 * qu'on est venu faire.
 *
 * On ne demande jamais « mets le compteur a 8 », toujours « ajoute 6 » : c'est ce
 * qu'on fait avec les mains, et c'est ce que la machine sait appliquer sans
 * ecraser un compteur qui a pu bouger entre-temps.
 */
export default async function Charger({ params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  if (!peutCharger(u)) redirect(`/bornes/${id}`);

  const borne = await q1<{ id: number; nom: string; adresse: string | null; vue_le: Date | null }>(
    "SELECT id, nom, adresse, vue_le FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  if (!borne) notFound();

  const canaux = await canauxDe(id, u.compte_id);
  const aCharger = canaux.filter((c) => c.produit_id !== null);
  const libres = canaux.length - aCharger.length;
  const groupes = grouperCanaux(aCharger);
  const vides = aCharger.filter((c) => c.quantite === 0).length;

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href={`/bornes/${id}`} className="bouton petit">‹</Link>
          <div className="pousse">
            <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-.03em" }}>{borne.nom}</div>
            <div className="faible" style={{ fontSize: 13 }}>relevé {depuis(borne.vue_le)}</div>
          </div>
          {vides > 0 ? <span className="pilule mal"><i />{vides} vides</span> : null}
        </div>
        <p className="sous" style={{ marginTop: 14 }}>
          Indiquez ce que vous <b>ajoutez</b> dans chaque canal. Le stock part de votre réserve
          tout de suite ; la borne le confirmera à sa prochaine synchronisation.
        </p>

        {aCharger.length === 0 ? (
          <Repli icone={<IcoBorne />} titre="Aucun canal n’a de produit affecté"
                 texte="Le planogramme dit quel produit occupe quel canal, et jusqu’à combien il tient. Sans lui, il n’y a rien à charger."
                 action={{ nom: "Définir le planogramme", vers: `/bornes/${id}/planogramme` }} />
        ) : (
          <form method="post" action={`/api/bornes/${id}/charger`}>
            {groupes.map((g) => <Section key={String(g.id)} g={g} />)}

            {libres > 0 ? (
              <p className="faible" style={{ fontSize: 13, textAlign: "center" }}>
                {libres} {libres > 1 ? "canaux" : "canal"} sans produit affecté —{" "}
                <Link href={`/bornes/${id}/planogramme`} style={{ textDecoration: "underline" }}>
                  planogramme</Link>
              </p>
            ) : null}

            <div style={{ position: "sticky", bottom: "calc(72px + env(safe-area-inset-bottom))",
                          paddingTop: 14, marginTop: 6 }}>
              <button className="bouton primaire large">Valider le chargement</button>
            </div>
          </form>
        )}
      </main>
      <NavBasse page="bornes" />
    </>
  );
}

function Section({ g }: { g: GroupeCanal }) {
  const souci = g.vides > 0 || g.bas > 0;
  return (
    <details className="groupe" open={souci}>
      <summary>
        <span className="chevron">▶</span>
        <div className="pousse" style={{ minWidth: 0 }}>
          <div className="titre">{g.nom}</div>
          <div className="resume">
            {g.canaux.length} {g.canaux.length > 1 ? "canaux" : "canal"} · {g.place} places libres
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
            {g.vides > 0 ? <span className="pilule mal"><i />{g.vides} vide{g.vides > 1 ? "s" : ""}</span> : null}
            {g.bas > 0 ? <span className="pilule attente"><i />{g.bas} bas</span> : null}
            {g.vides === 0 && g.bas === 0 ? <span className="pilule ok"><i />bien garni</span> : null}
          </div>
        </div>
        <div style={{ textAlign: "right", flex: "none" }}>
          <div className="num" style={{ fontWeight: 800, fontSize: 21,
                color: g.reserve === 0 ? "var(--rouge-vif)" : undefined }}>{g.reserve}</div>
          <div className="faible" style={{ fontSize: 11 }}>chez moi</div>
        </div>
      </summary>
      <div className="dedans">
        {g.canaux.map((c) => <Canal key={c.canal_id} c={c} />)}
      </div>
    </details>
  );
}

function Canal({ c }: { c: LigneCanal }) {
  const place = Math.max(0, c.capacite - c.quantite - c.en_route);
  const max = Math.min(place, c.reserve);
  const vide = c.quantite === 0;

  return (
    <div className={`carte ${vide ? "chaude" : ""}`}>
      <div className="rangee" style={{ alignItems: "flex-start" }}>
        <div className="pousse">
          <div style={{ fontWeight: 700, fontSize: 16 }}>{c.nom}</div>
          <div className="faible" style={{ fontSize: 13, marginTop: 2 }}>
            canal <b className="mono">{c.rangee}-{c.colonne}</b> · {euros(c.prix_vente_c)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="num" style={{ fontWeight: 800, fontSize: 20,
                color: vide ? "var(--rouge-vif)" : undefined }}>
            {c.quantite}<span className="faible" style={{ fontWeight: 500 }}> / {c.capacite}</span>
          </div>
          <div className="faible" style={{ fontSize: 12 }}>dans la borne</div>
        </div>
      </div>

      <div className="rangee" style={{ marginTop: 14 }}>
        <Pas nom={`q_${c.lane}`} max={max} ras={place} />
        <div className="pousse" />
        <div style={{ textAlign: "right" }}>
          <div className="num" style={{ fontWeight: 700,
                color: c.reserve === 0 ? "var(--rouge-vif)" : undefined }}>{c.reserve}</div>
          <div className="faible" style={{ fontSize: 12 }}>chez moi</div>
        </div>
      </div>

      {c.en_route > 0 ? (
        <div style={{ marginTop: 12 }}>
          <span className="pilule attente"><i />{c.en_route} déjà en route vers ce canal</span>
        </div>
      ) : null}
      {c.reserve === 0 ? (
        <div style={{ marginTop: 12 }}>
          <span className="pilule mal"><i />plus rien en réserve</span>
        </div>
      ) : null}
    </div>
  );
}
