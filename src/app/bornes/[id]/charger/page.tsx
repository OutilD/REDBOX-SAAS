import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import Pas from "../../../pas";
import Remplir from "../../../remplir";
import FiltreCanaux from "../../../filtre-canaux";
import RaisonSortie from "../../../raison-sortie";
import { q1, euros, depuis, codeCanal } from "@/db";
import { peutCharger, utilisateur, peutVoirBorne } from "@/lib/auth";
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
export default async function Charger({ params, searchParams }:
  { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  const { e } = await searchParams;
  // Une borne hors de sa portee n'existe pas pour lui : `notFound` plutot
  // qu'un refus, qui confirmerait au passage qu'elle existe.
  if (!peutVoirBorne(u, id)) notFound();
  if (!peutCharger(u)) redirect(`/bornes/${id}`);

  const borne = await q1<{ id: number; nom: string; adresse: string | null; vue_le: Date | null }>(
    "SELECT id, nom, adresse, vue_le FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  if (!borne) notFound();

  const canaux = await canauxDe(id, u.compte_id);
  const aCharger = canaux.filter((c) => c.produit_id !== null);
  const libres = canaux.length - aCharger.length;
  const groupes = grouperCanaux(aCharger);
  const vides = aCharger.filter((c) => c.quantite === 0).length;

  const bas = aCharger.filter((c) => c.quantite > 0 && c.quantite <= c.seuil_bas).length;
  const manque = vides + bas;
  const place = aCharger.reduce((s, c) => s + Math.max(0, c.capacite - c.quantite - c.en_route), 0);

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="tete-borne">
          <Link href={`/bornes/${id}`} className="bouton petit retour"
                aria-label="Retour à la fiche">‹</Link>
          <div className="qui">
            <h1>Charger {borne.nom}</h1>
            <div className="ou">relevé {depuis(borne.vue_le)}</div>
            <div className="etats">
              {vides > 0
                ? <span className="pilule mal"><i />{vides} canal{vides > 1 ? "aux" : ""} vide{vides > 1 ? "s" : ""}</span>
                : null}
              {bas > 0 ? <span className="pilule attente"><i />{bas} bas</span> : null}
              {manque === 0 && aCharger.length > 0
                ? <span className="pilule ok"><i />machine bien garnie</span> : null}
              <span className="pilule">{place} places libres</span>
            </div>
          </div>
        </div>

        <p className="sous">
          Indiquez ce que vous <b>ajoutez</b> dans chaque canal. Le stock part de votre réserve
          tout de suite ; la borne le confirmera à sa prochaine synchronisation. Un nombre
          <b> négatif</b> retire de la marchandise — on vous demandera pourquoi avant d’enregistrer.
        </p>

        {e === "motif" ? (
          <p className="erreur">Indiquez pourquoi vous retirez cette marchandise.</p>
        ) : null}
        {e === "note" ? (
          <p className="erreur">Le motif « Autre » demande une note.</p>
        ) : null}

        {aCharger.length === 0 ? (
          <Repli icone={<IcoBorne />} titre="Aucun canal n’a de produit affecté"
                 texte="Le planogramme dit quel produit occupe quel canal, et jusqu’à combien il tient. Sans lui, il n’y a rien à charger."
                 action={{ nom: "Définir le planogramme", vers: `/bornes/${id}/planogramme` }} />
        ) : (
          <form method="post" action={`/api/bornes/${id}/charger`}>
            <FiltreCanaux manque={manque}>
              {groupes.map((g) => <Section key={String(g.id)} g={g} />)}
            </FiltreCanaux>

            {libres > 0 ? (
              <p className="faible" style={{ fontSize: 13, textAlign: "center" }}>
                {libres} {libres > 1 ? "canaux" : "canal"} sans produit affecté —{" "}
                <Link href={`/bornes/${id}/planogramme`} style={{ textDecoration: "underline" }}>
                  planogramme</Link>
              </p>
            ) : null}

            <div className="pied-collant">
              {/* Le bouton d'envoi est dans ce composant : c'est lui qui decide
                  s'il faut d'abord demander la raison d'un retrait, et c'est lui
                  qui compte en continu ce qu'on est en train de composer. */}
              <RaisonSortie />
            </div>
          </form>
        )}
      </main>
      <NavBasse page="bornes" />
    </>
  );
}

/**
 * UNE CATEGORIE, ET LE GESTE QUI LA REMPLIT D'UN COUP.
 *
 * On remplit une machine avec un carton dans les mains, pas en marchant le long
 * des rangees : on fait tous les canaux de Puffs, puis on prend le carton
 * suivant. Le groupement suit ce geste-la — et « tout a ras » aussi, qui evite
 * de viser vingt-quatre fois le meme petit bouton.
 */
function Section({ g }: { g: GroupeCanal }) {
  const souci = g.vides > 0 || g.bas > 0;
  // Ce que « tout a ras » ferait bouger, exactement : un canal deja plein, ou
  // dont le produit n'est plus en reserve, ne bougera pas.
  const servables = g.canaux.filter((c) => {
    const place = Math.max(0, c.capacite - c.quantite - c.en_route);
    return Math.min(place, c.reserve) > 0;
  }).length;

  return (
    <details className="groupe" open={souci} data-remplissable="">
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
        <div className="rangee-remplir">
          <Remplir combien={servables} />
          <span className="faible">
            {servables === 0
              ? "Rien à servir ici : les canaux sont pleins, ou la réserve est vide."
              : `${servables} canal${servables > 1 ? "aux" : ""} peut${servables > 1 ? "vent" : ""} encore être servi${servables > 1 ? "s" : ""}.`}
          </span>
        </div>
        {g.canaux.map((c) => <Canal key={c.canal_id} c={c} />)}
      </div>
    </details>
  );
}

/**
 * UN CANAL A SERVIR.
 *
 * Le carton dans une main, le telephone dans l'autre : ce qu'il faut savoir se
 * lit d'un coup — quel produit, ou il est dans la machine, ce qu'il porte, ce
 * qui reste chez soi. La jauge donne l'echelle avant qu'on lise le chiffre, et
 * son etat est ECRIT a cote : une couleur qui porte seule ne dit rien dans un bar
 * mal eclaire, ni a qui ne la voit pas.
 */
function Canal({ c }: { c: LigneCanal }) {
  const place = Math.max(0, c.capacite - c.quantite - c.en_route);
  const max = Math.min(place, c.reserve);
  const etat = c.quantite === 0 ? "vide"
             : c.quantite <= c.seuil_bas ? "bas" : "plein";
  const part = c.capacite ? Math.round((c.quantite / c.capacite) * 100) : 0;

  return (
    <div className="canal-charge" data-etat={etat}
         data-manque={etat !== "plein" ? "" : undefined}>
      <span className="code mono">{codeCanal(c.rangee, c.colonne)}</span>

      <div className="quoi">
        <div className="nom">{c.nom}</div>
        <div className="meta">
          {euros(c.prix_vente_c)}
          {etat !== "plein"
            ? <b className="mot-etat">{etat === "vide" ? "vide" : "bas"}</b> : null}
        </div>
      </div>

      <div className="jauge" data-etat={etat} role="img"
           aria-label={`${c.quantite} sur ${c.capacite} dans la borne`}>
        <span style={{ width: `${part}%` }} />
      </div>

      <div className="dedans-borne">
        <span className="num compteur">
          {c.quantite}<span className="sur">/{c.capacite}</span>
        </span>
        <span className="q">dans la borne</span>
      </div>

      {/* Le plancher est ce que la machine porte : on ne retire pas ce qui n'y est pas. */}
      <div className="commandes">
        <Pas nom={`q_${c.lane}`} max={max} ras={place} min={-c.quantite}
             etiquette={c.nom} canal={codeCanal(c.rangee, c.colonne)} />
      </div>

      <div className="reserve">
        <span className="num" style={c.reserve === 0 ? { color: "var(--rouge-vif)" } : undefined}>
          {c.reserve}
        </span>
        <span className="q">chez moi</span>
      </div>

      {c.en_route > 0 || c.reserve === 0 ? (
        <p className="note-canal">
          {c.reserve === 0 ? "Plus rien en réserve — il n’y a rien à charger ici." : null}
          {c.reserve === 0 && c.en_route > 0 ? " " : null}
          {c.en_route > 0 ? `${c.en_route} déjà en route vers ce canal, pas encore confirmées.` : null}
        </p>
      ) : null}
    </div>
  );
}
