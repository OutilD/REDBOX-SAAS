import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q, depuis } from "@/db";
import { estSuperAdmin, utilisateur } from "@/lib/auth";
import { SQL_VRAIE, STATUTS, compteurs, type Statut } from "@/lib/parc";
import { etatDe } from "../../carte/carte-france";
import { TableauParc, type Compte, type Machine } from "../tableau-parc";

export const dynamic = "force-dynamic";

type Ligne = {
  id: number; numero: string | null; nom: string; adresse: string | null;
  statut: Statut; statut_le: Date; note_editeur: string | null;
  jeton: string | null; vue_le: Date | null; hors_service: boolean;
  latitude: number | null; compte_id: number | null; compte: string | null;
};

const MESSAGES: Record<string, string> = {
  numero: "Ce numéro de série existe déjà.",
  nom: "Donnez un nom ou un numéro à la machine.",
  statut: "Ce statut n’existe pas.",
  introuvable: "Adresse introuvable : mettez le numéro, la rue, le code postal et la ville.",
  vendue: "Cette machine a des ventes : on ne l’efface pas, on la désappaire.",
  appairee: "Cette machine est appairée : son compte ne se change pas d’ici, il faut la désappairer d’abord.",
};

/**
 * LE PARC, MACHINE PAR MACHINE.
 *
 * Combien de machines a chaque stade, puis laquelle est a qui et ou en est-elle.
 * Le tableau en colonnes se manipule a la main — on glisse une carte d'une
 * colonne a l'autre — parce que c'est ainsi qu'on pense un parc : « celle-la
 * part chez lui la semaine prochaine ».
 *
 * Attribuer une machine a un compte et changer son stade ne se font qu'ici, par
 * le super-admin ; la placer sur la carte, depuis sa carte ou le tableau de bord.
 *
 * Les bornes de la demo n'en font pas partie : elles sont inventees.
 */
export default async function Parc({ searchParams }:
  { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!estSuperAdmin(u)) redirect("/");
  const { e, ok } = await searchParams;

  const [nombres, lignes, comptes] = await Promise.all([
    compteurs(),
    q<Ligne>(`
      SELECT b.id, b.numero, b.nom, b.adresse, b.statut, b.statut_le, b.note_editeur,
             b.jeton, b.vue_le, b.hors_service, b.latitude, b.compte_id, c.nom AS compte
        FROM borne b LEFT JOIN compte c ON c.id = b.compte_id
       WHERE ${SQL_VRAIE}
       ORDER BY b.statut_le DESC, b.id DESC`),
    q<Compte>(`SELECT id, nom FROM compte WHERE NOT demo ORDER BY nom`),
  ]);

  const machines: Machine[] = lignes.map((b) => ({
    id: b.id, numero: b.numero, nom: b.nom, adresse: b.adresse, statut: b.statut,
    depuis: depuis(b.statut_le), note: b.note_editeur,
    appairee: b.jeton !== null, etat: etatDe(b),
    compte_id: b.compte_id, compte: b.compte, situee: b.latitude !== null,
  }));

  const total = Object.values(nombres).reduce((t, n) => t + n, 0);

  return (
    <>
      <Entete page="admin_parc" />
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
            <Link href="/admin" className="bouton">Tableau</Link>
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
            {STATUTS.map((x) => (
              <a key={x.cle} className="mesure parc-mesure" data-stade={x.cle} href={`#col-${x.cle}`} title={x.quoi}>
                <span className="etiquette"><i className="point" data-stade={x.cle} aria-hidden="true" /> {x.nom}</span>
                <span className="ligne-chiffre"><span className="chiffre num">{nombres[x.cle]}</span></span>
              </a>
            ))}
          </div>
        </section>

        <div className="titre-section">
          <h2>Machine par machine</h2>
          <span className="faible" style={{ fontSize: 12.5 }}>
            glissez une carte ou utilisez ses flèches pour changer de stade · « Attribuer » pour la donner à un compte
          </span>
        </div>
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
                {STATUTS.map((x) => <option key={x.cle} value={x.cle}>{x.nom}</option>)}
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
      <NavBasse page="admin_parc" />
    </>
  );
}
