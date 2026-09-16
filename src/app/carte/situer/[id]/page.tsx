import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { q1 } from "@/db";
import { estSuperAdmin, peutVoirBorne, utilisateur } from "@/lib/auth";
import { nomDuStatut } from "@/lib/statuts";
import { ChoisirPlace } from "../../choisir-place";
import { retourDe } from "../retour";

export const dynamic = "force-dynamic";

const ERREURS: Record<string, string> = {
  adresse: "Donnez une adresse : la machine l’affiche sur son écran d’assistance.",
  place: "Placez la machine sur la carte, en France métropolitaine ou en Corse.",
};

/**
 * SITUER UNE MACHINE, OU LA RE-SITUER.
 *
 * Le geocodage automatique pose une adresse au milieu de sa rue, et ne sait
 * rien d'« Theatro, 1er etage » : il se trompe peu, mais un bar au fond d'une
 * cour, une gare, un centre commercial meritent mieux. Ici on tape l'adresse et
 * on la choisit dans la liste, puis on ajuste : on touche la carte ou on glisse
 * le carre rouge jusqu'a l'endroit exact. Sur place, « Me localiser » suffit.
 */
export default async function Situer({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ r?: string; e?: string }>;
}) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const { r, e } = await searchParams;

  const b = await q1<{
    id: number; nom: string; adresse: string | null; ville: string | null;
    latitude: number | null; longitude: number | null; compte_id: number | null; compte: string | null;
    numero: string | null; statut: string;
  }>(`
    SELECT b.id, b.nom, b.adresse, b.ville, b.latitude, b.longitude, b.compte_id, c.nom AS compte,
           b.numero, b.statut
      FROM borne b LEFT JOIN compte c ON c.id = b.compte_id
     WHERE b.id = $1`, [id]);
  if (!b) notFound();
  const sienne = b.compte_id !== null && Number(b.compte_id) === Number(u.compte_id) && peutVoirBorne(u, id);
  // Placer une machine est un geste du super-admin : le client voit sa carte, il ne la modifie pas.
  if (!estSuperAdmin(u)) redirect(sienne ? `/bornes/${id}` : "/carte");

  const annuler = retourDe(r, id, !sienne);
  const situee = b.latitude !== null && b.longitude !== null;

  return (
    <>
      <Entete page="carte" />
      <main className="ecran situer">
        <div className="situer-tete">
          <a href={annuler} className="bouton icone" aria-label="Retour">‹</a>
          <div className="pousse" style={{ minWidth: 0 }}>
            <h1>{situee ? "Re-situer" : "Placer"} {b.nom}</h1>
            <div className="situer-infos">
              <span className="pilule stade" data-stade={b.statut}><i />{nomDuStatut(b.statut)}</span>
              {b.numero ? <span className="mono">n° {b.numero}</span> : null}
              <span>{b.compte ?? "sans compte"}</span>
              {situee
                ? <span className="pilule ok"><i />déjà sur la carte{b.ville ? ` · ${b.ville}` : ""}</span>
                : <span className="pilule attente"><i />pas encore sur la carte</span>}
            </div>
          </div>
        </div>
        {e ? <p className="erreur" style={{ marginTop: 12 }}>{ERREURS[e] ?? "Impossible."}</p> : null}

        <ChoisirPlace action={`/api/bornes/${id}/place`} r={r ?? ""} annuler={annuler}
                      adresse={b.adresse} ville={b.ville} latitude={b.latitude} longitude={b.longitude} />
      </main>
      <NavBasse page="carte" />
    </>
  );
}
