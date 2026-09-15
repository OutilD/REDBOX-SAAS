import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { q1 } from "@/db";
import { estSuperAdmin, peutConfigurer, peutVoirBorne, utilisateur } from "@/lib/auth";
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
  }>(`
    SELECT b.id, b.nom, b.adresse, b.ville, b.latitude, b.longitude, b.compte_id, c.nom AS compte
      FROM borne b LEFT JOIN compte c ON c.id = b.compte_id
     WHERE b.id = $1`, [id]);
  if (!b) notFound();
  const sienne = b.compte_id !== null && Number(b.compte_id) === Number(u.compte_id) && peutVoirBorne(u, id);
  if (!estSuperAdmin(u) && !(sienne && peutConfigurer(u))) redirect(sienne ? `/bornes/${id}` : "/carte");

  const annuler = retourDe(r, id, !sienne);
  const situee = b.latitude !== null && b.longitude !== null;

  return (
    <>
      <Entete page="carte" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18, alignItems: "flex-start" }}>
          <a href={annuler} className="bouton petit" aria-label="Retour">‹</a>
          <div className="pousse" style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0 }}>{situee ? "Re-situer" : "Situer"} {b.nom}</h1>
            {!sienne && b.compte ? <p className="sous" style={{ margin: "2px 0 0" }}>{b.compte}</p> : null}
          </div>
        </div>
        <p className="sous" style={{ maxWidth: 680 }}>
          Tapez l’adresse et choisissez-la dans la liste, puis ajustez : touchez la carte
          ou glissez le carré rouge jusqu’à l’emplacement exact de la machine.
        </p>
        {e ? <p className="erreur" style={{ marginTop: 12 }}>{ERREURS[e] ?? "Impossible."}</p> : null}

        <div className="carte" style={{ marginTop: 14 }}>
          <ChoisirPlace action={`/api/bornes/${id}/place`} r={r ?? ""} annuler={annuler}
                        adresse={b.adresse} ville={b.ville} latitude={b.latitude} longitude={b.longitude} />
        </div>
      </main>
      <NavBasse page="carte" />
    </>
  );
}
