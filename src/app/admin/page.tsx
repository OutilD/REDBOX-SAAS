import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { q, depuis } from "@/db";
import { estSuperAdmin, utilisateur } from "@/lib/auth";
import { dansLeCadre, situerLesBornes } from "@/lib/geo";
import { SQL_VRAIE, STATUTS, compteurs, type Statut } from "@/lib/parc";
import {
  Legende, ParVille, SQL_CHIFFRES, etatDe, grouper, lignesChiffres, type Chiffres, type Point,
} from "../carte/carte-france";
import { CarteMaps } from "../carte/carte-maps";
import { TableauParc, type Compte, type Machine } from "./tableau-parc";

export const dynamic = "force-dynamic";

type Ligne = {
  id: number; numero: string | null; nom: string; adresse: string | null; ville: string | null;
  statut: Statut; statut_le: Date; note_editeur: string | null;
  jeton: string | null; vue_le: Date | null; hors_service: boolean;
  latitude: number | null; longitude: number | null; situee_pour: string | null;
  compte_id: number | null; compte: string | null;
} & Chiffres;

const MESSAGES: Record<string, string> = {
  numero: "Ce numéro de série existe déjà.",
  nom: "Donnez un nom ou un numéro à la machine.",
  statut: "Ce statut n’existe pas.",
  introuvable: "Adresse introuvable : mettez le numéro, la rue, le code postal et la ville.",
  vendue: "Cette machine a des ventes : on ne l’efface pas, on la désappaire.",
  appairee: "Cette machine est appairée : son compte ne se change pas d’ici, il faut la désappairer d’abord.",
};

/**
 * LE PARC ENTIER, VU DE L'EDITEUR.
 *
 * Trois questions, dans l'ordre ou elles se posent : combien de machines a
 * chaque stade ; ou sont celles qui sont posees ou promises ; et, machine par
 * machine, laquelle est a qui et ou en est-elle. Le tableau en colonnes se
 * manipule a la main — on glisse une carte d'une colonne a l'autre — parce que
 * c'est ainsi qu'on pense un parc : « celle-la part chez lui la semaine
 * prochaine ».
 *
 * Les bornes de la demo n'en font pas partie : elles sont inventees.
 */
export default async function Parc({ searchParams }:
  { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!estSuperAdmin(u)) redirect("/");
  const { e, ok } = await searchParams;

  await situerLesBornes(null).catch(() => {});

  const [nombres, lignes, comptes] = await Promise.all([
    compteurs(),
    q<Ligne>(`
      SELECT b.id, b.numero, b.nom, b.adresse, b.ville, b.statut, b.statut_le, b.note_editeur,
             b.jeton, b.vue_le, b.hors_service, b.latitude, b.longitude, b.situee_pour,
             b.compte_id, c.nom AS compte,
             v.ventes_30, v.ca_30, v.ca_total, v.derniere_vente
        FROM borne b LEFT JOIN compte c ON c.id = b.compte_id
        LEFT JOIN LATERAL (${SQL_CHIFFRES}) v ON true
       WHERE ${SQL_VRAIE}
       ORDER BY b.statut_le DESC, b.id DESC`),
    q<Compte>(`SELECT id, nom FROM compte WHERE NOT demo ORDER BY nom`),
  ]);

  // TOUTE MACHINE QUI A UNE PLACE EST SUR LA CARTE, a la couleur de son stade :
  // une commande et son adresse de livraison se voient autant que celles qui
  // tournent. Survolee, elle dit a qui elle est et ce qu'elle rapporte.
  const points: Point[] = lignes
    .filter((b) => b.latitude !== null && b.longitude !== null && dansLeCadre(b.latitude, b.longitude))
    .map((b) => {
      const details: [string, string][] = [["Compte", b.compte ?? "sans compte"]];
      if (b.numero) details.push(["N° de série", b.numero]);
      details.push(["Changé de stade", depuis(b.statut_le)], ...lignesChiffres(b));
      if (b.jeton) details.push(["Vue", depuis(b.vue_le)]);
      if (b.note_editeur) details.push(["Note", b.note_editeur]);
      return {
        cle: b.id, href: `/admin#m${b.id}`, nom: b.nom, etat: etatDe(b),
        ville: b.ville, adresse: b.adresse, sous: b.compte ?? "sans compte",
        latitude: b.latitude!, longitude: b.longitude!,
        situer: `/carte/situer/${b.id}?r=admin`,
        stade: b.statut, ca30: b.jeton || b.ca_total > 0 ? b.ca_30 : undefined,
        details,
      };
    });
  const groupes = grouper(points);
  // Posees, promises ou commandees, mais sans place : la carte ment par omission si on ne le dit pas.
  const sansPlace = lignes.filter((b) => (b.statut === "installee" || b.statut === "bientot" || b.statut === "commandee")
                                         && !points.some((p) => p.cle === b.id));

  const machines: Machine[] = lignes.map((b) => ({
    id: b.id, numero: b.numero, nom: b.nom, adresse: b.adresse, statut: b.statut,
    depuis: depuis(b.statut_le), note: b.note_editeur,
    appairee: b.jeton !== null, etat: etatDe(b),
    compte_id: b.compte_id, compte: b.compte, situee: b.latitude !== null,
  }));

  const total = Object.values(nombres).reduce((s, n) => s + n, 0);

  return (
    <>
      <Entete page="admin" />
      <main className="ecran">
        <div className="tete-tableau">
          <div className="quoi">
            <h1>Parc</h1>
            <p className="sous">
              {total === 0 ? "Aucune machine enregistrée."
                : `${total} machine${total > 1 ? "s" : ""}, de l’usine au bar.`}
            </p>
          </div>
          <div className="rangee-actions">
            <Link href="/admin/comptes" className="bouton">Comptes</Link>
            <a href="#nouvelle" className="bouton primaire">+ Nouvelle machine</a>
          </div>
        </div>

        {e ? <p className="erreur" style={{ marginTop: 14 }}>{MESSAGES[e] ?? "Impossible."}</p> : null}
        {ok ? (
          <div className="avis reussi" style={{ marginTop: 14 }}>
            <div className="dit"><div className="titre">
              {ok === "creee" ? "Machine enregistrée." : ok === "effacee" ? "Machine effacée." : ok === "situee" ? "Machine placée sur la carte." : "Enregistré."}
            </div></div>
          </div>
        ) : null}

        {/* Les cinq chiffres, dans l'ordre de la vie d'une machine. */}
        <section className="chiffres-cle" aria-label="Le parc en chiffres">
          <div className="mesures cinq">
            {STATUTS.map((s) => (
              <a key={s.cle} className="mesure" href={`#col-${s.cle}`} title={s.quoi}>
                <span className="etiquette">{s.nom}</span>
                <span className="ligne-chiffre"><span className="chiffre num">{nombres[s.cle]}</span></span>
              </a>
            ))}
          </div>
        </section>

        <h2 style={{ marginTop: 22 }}>Sur la carte</h2>
        <p className="faible" style={{ fontSize: 13, margin: "0 0 10px" }}>
          Chaque machine qui a une place, à la couleur de son stade. Survolez un carré pour
          son compte et son CA. Une machine sans adresse n’y figure pas : situez-la ci-dessous,
          ou touchez « Re-situer » pour déplacer une machine.
        </p>
        <section className="carte-france"><CarteMaps groupes={groupes} /><Legende groupes={groupes} /></section>
        {sansPlace.length > 0 ? (
          <section className="carte a-situer" style={{ marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>Pas sur la carte : {sansPlace.length} machine{sansPlace.length > 1 ? "s" : ""}</h3>
            <ul className="liste-a-situer">
              {sansPlace.map((b) => (
                <li key={b.id}>
                  <div className="pousse" style={{ minWidth: 0 }}>
                    <a href={`#m${b.id}`} className="nom">{b.nom}</a>
                    <div className="ou">
                      {b.compte ?? "sans compte"} · {!(b.adresse ?? "").trim() ? "sans adresse"
                        : b.situee_pour === b.adresse ? `« ${b.adresse} » introuvable` : "recherche en cours"}
                    </div>
                  </div>
                  <Link href={`/carte/situer/${b.id}?r=admin`} className="bouton petit primaire">Situer</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {groupes.length > 0 ? <h3 style={{ marginTop: 18 }}>Par ville</h3> : null}
        <ParVille groupes={groupes} />

        <h2 style={{ marginTop: 22 }}>Machine par machine</h2>
        <p className="faible" style={{ fontSize: 13, margin: "0 0 10px" }}>
          Glissez une carte d’une colonne à l’autre pour changer son stade. Ouvrez-la
          pour l’attribuer à un compte, lui donner une adresse ou un numéro.
        </p>
        <TableauParc machines={machines} comptes={comptes} />

        <section className="carte" id="nouvelle" style={{ marginTop: 22 }}>
          <h2 style={{ marginTop: 0 }}>Nouvelle machine</h2>
          <form method="post" action="/api/admin/parc/creer" className="grille deux">
            <div className="champ">
              <label htmlFor="n-numero">Numéro de série</label>
              <input id="n-numero" name="numero" className="mono" maxLength={40} placeholder="RBX-2026-041" />
            </div>
            <div className="champ">
              <label htmlFor="n-statut">Stade</label>
              <select id="n-statut" name="statut" defaultValue="libre">
                {STATUTS.map((s) => <option key={s.cle} value={s.cle}>{s.nom}</option>)}
              </select>
            </div>
            <div className="champ">
              <label htmlFor="n-compte">Compte</label>
              <select id="n-compte" name="compte_id" defaultValue="">
                <option value="">— aucun, libre à l’achat</option>
                {comptes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div className="champ">
              <label htmlFor="n-nom">Nom</label>
              <input id="n-nom" name="nom" maxLength={80} placeholder="RedBox — Le Duplex (le client pourra le changer)" />
            </div>
            <div className="champ">
              <label htmlFor="n-adresse">Adresse prévue</label>
              <input id="n-adresse" name="adresse" maxLength={160} placeholder="12 rue des Lilas, 75011 Paris" />
            </div>
            <div className="champ">
              <label htmlFor="n-note">Note</label>
              <input id="n-note" name="note" maxLength={300} placeholder="Livraison promise semaine 40" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="bouton primaire">Enregistrer la machine</button>
            </div>
          </form>
        </section>
      </main>
      <NavBasse page="admin" />
    </>
  );
}
