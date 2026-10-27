import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { peutCharger, utilisateur } from "@/lib/auth";
import { q } from "@/db";
import { CONTACT_MAX, NOM_MAX, VILLE_MAX, type Etape } from "@/lib/crm";
import { IcoAcademie, IcoPlus } from "../icones";
import { Kanban } from "./kanban";

export const dynamic = "force-dynamic";

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

const ERREURS: Record<string, string> = {
  nom: "Donnez le nom de l’établissement.",
  lecture: "Votre accès est en lecture seule : vous voyez le tableau, sans le modifier.",
};

/**
 * LA PROSPECTION : les etablissements qu'on demarche, en tableau. Les chiffres,
 * une ligne pour en ajouter un (il entre « a contacter »), le tableau dessous.
 * Le CRM est celui du compte : toute l'equipe d'un redboxer y voit les memes lieux.
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
  const compte = (...etapes: Etape[]) => lieux.filter((x) => etapes.includes(x.etape)).length;
  const signes = compte("signe");
  const tranches = signes + compte("refuse");

  return (
    <>
      <Entete page="prospection" />
      <main className="ecran crm-ecran">
        <div className="crm-tete">
          <div>
            <h1>Prospection</h1>
            <p className="sous">Vos établissements, de la première visite à la signature.</p>
          </div>
          <Link href="/academie#parcours-emplacements" className="bouton petit">
            <IcoAcademie size={16} /> La méthode
          </Link>
        </div>

        <div className="crm-chiffres num">
          <div><b>{lieux.length}</b><span>établissement{lieux.length > 1 ? "s" : ""}</span></div>
          <div><b>{compte("contacte", "rdv", "negociation")}</b><span>en cours</span></div>
          <div data-ton="vert"><b>{signes}</b><span>signé{signes > 1 ? "s" : ""}</span></div>
          <div><b>{tranches > 0 ? `${Math.round((100 * signes) / tranches)} %` : "—"}</b><span>de oui, sur les réponses</span></div>
        </div>

        {e && ERREURS[e] ? <p className="erreur">{ERREURS[e]}</p> : null}

        {ecrire ? (
          <form method="post" action="/api/crm" className="crm-rapide">
            <input type="hidden" name="action" value="creer" />
            <input name="nom" required maxLength={NOM_MAX} placeholder="Nouvel établissement" aria-label="Établissement" />
            <input name="ville" maxLength={VILLE_MAX} placeholder="Ville" aria-label="Ville" autoComplete="address-level2" />
            <input name="contact" maxLength={CONTACT_MAX} placeholder="Contact (nom, téléphone)" aria-label="Contact" />
            <button className="bouton primaire petit"><IcoPlus size={16} /> Ajouter</button>
          </form>
        ) : null}

        <Kanban ecrire={ecrire}
                lieux={lieux.map((x) => ({ id: Number(x.id), nom: x.nom, ville: x.ville, contact: x.contact, note: x.note,
                                           etape: x.etape, depuis: JOUR.format(x.modifie_le) }))} />
      </main>
      <NavBasse page="prospection" />
    </>
  );
}
