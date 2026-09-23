import { BISCUIT, detruireSession, enTeteBiscuit, versPage } from "@/lib/auth";
import { MARQUE_PARTAGE } from "@/lib/produits";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const brut = req.headers.get("cookie") ?? "";
  for (const morceau of brut.split(";")) {
    const [nom, ...reste] = morceau.trim().split("=");
    // Tous les biscuits de session que ce navigateur presente, marques ou
    // vestiges : chacun meurt en base. Se deconnecter ici, c'est partout.
    if (nom === BISCUIT) {
      const v = decodeURIComponent(reste.join("="));
      await detruireSession(v.startsWith(MARQUE_PARTAGE) ? v.slice(MARQUE_PARTAGE.length) : v);
    }
  }
  return versPage(req, "/connexion", enTeteBiscuit(null));
}
