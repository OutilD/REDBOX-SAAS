import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { peutCharger, utilisateur } from "@/lib/auth";
import { q } from "@/db";
import { CONTACT_MAX, ETAPES, NOM_MAX, NOTE_MAX, VILLE_MAX, type Etape } from "@/lib/crm";
import { IcoAcademie, IcoPlus } from "../icones";
import { Kanban } from "./kanban";

export const dynamic = "force-dynamic";

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

const ERREURS: Record<string, string> = {
  nom: "Donnez le nom de l’établissement.",
  lecture: "Votre accès est en lecture seule : vous voyez le tableau, sans le modifier.",
};

/**
 * LA PROSPECTION : les etablissements qu'on demarche, en tableau. Un formulaire
 * pour en ajouter un, le tableau dessous. Le CRM est celui du compte : toute
 * l'equipe d'un redboxer y voit les memes lieux.
 */
export default async function Prospection({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  // Le dernier lieu touche en haut de sa colonne.
  const [lieux, { e }] = await Promise.all([
    q<{ id: number; nom: string; ville: string | null; contact: string | null; note: string | null; etape: Etape; modifie_le: Date }>(`
      SELECT id, nom, ville, contact, note, etape, modifie_le FROM crm_lieu
       WHERE compte_id = $1 ORDER BY modifie_le DESC, id DESC`, [u.compte_id]),
    searchParams]);
  const ecrire = peutCharger(u);
  const signes = lieux.filter((x) => x.etape === "signe").length;

  return (
    <>
      <Entete page="prospection" />
      <main className="ecran">
        <h1>Prospection</h1>
        <p className="sous" style={{ maxWidth: 680 }}>
          Vos établissements, de « à contacter » à « signé ». Faites glisser une carte d’une colonne à l’autre,
          ou utilisez ses flèches au téléphone.{" "}
          {lieux.length > 0 ? <b className="num">{lieux.length} lieu{lieux.length > 1 ? "x" : ""}, {signes} signé{signes > 1 ? "s" : ""}.</b> : null}
        </p>
        <p style={{ margin: "0 0 14px" }}>
          <Link href="/academie" className="lien-souligne"><IcoAcademie size={15} /> La méthode : parcours « Trouver ses emplacements »</Link>
        </p>

        {e && ERREURS[e] ? <p className="erreur">{ERREURS[e]}</p> : null}

        {ecrire ? (
          <details className="carte crm-ajout" open={lieux.length === 0}>
            <summary><IcoPlus size={16} /> Ajouter un établissement</summary>
            <form method="post" action="/api/crm">
              <input type="hidden" name="action" value="creer" />
              <div className="crm-champs">
                <div className="champ">
                  <label htmlFor="crm-nom">Établissement</label>
                  <input id="crm-nom" name="nom" required maxLength={NOM_MAX} placeholder="Le Sous-Sol" />
                </div>
                <div className="champ">
                  <label htmlFor="crm-ville">Ville</label>
                  <input id="crm-ville" name="ville" maxLength={VILLE_MAX} placeholder="Bordeaux" autoComplete="address-level2" />
                </div>
                <div className="champ">
                  <label htmlFor="crm-contact">Contact</label>
                  <input id="crm-contact" name="contact" maxLength={CONTACT_MAX} placeholder="Marc, gérant · 06 12 34 56 78" />
                </div>
                <div className="champ">
                  <label htmlFor="crm-etape">Étape</label>
                  <select id="crm-etape" name="etape" defaultValue="a_contacter">
                    {ETAPES.map((x) => <option key={x.cle} value={x.cle}>{x.nom}</option>)}
                  </select>
                </div>
              </div>
              <div className="champ">
                <label htmlFor="crm-note">Note <span className="faible">(facultatif)</span></label>
                <textarea id="crm-note" name="note" rows={2} maxLength={NOTE_MAX} placeholder="Passer en début de service, entre 17 h et 19 h." />
              </div>
              <div className="rangee" style={{ marginTop: 12, justifyContent: "flex-end" }}>
                <button className="bouton primaire">Ajouter</button>
              </div>
            </form>
          </details>
        ) : null}

        <Kanban ecrire={ecrire}
                lieux={lieux.map((x) => ({ id: Number(x.id), nom: x.nom, ville: x.ville, contact: x.contact, note: x.note,
                                           etape: x.etape, depuis: JOUR.format(x.modifie_le) }))} />
      </main>
      <NavBasse page="prospection" />
    </>
  );
}
