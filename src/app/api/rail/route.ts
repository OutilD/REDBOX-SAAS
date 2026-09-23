import { versPage } from "@/lib/auth";
import { biscuitPartage } from "@/lib/produits";

export const dynamic = "force-dynamic";

/** Replie ou deplie le rail. L'etat vit dans un biscuit, donc il survit au rechargement. */
export async function POST(req: Request) {
  const f = await req.formData();
  const ferme = String(f.get("actuel") ?? "") !== "ferme";
  const biscuit = ferme ? biscuitPartage("rbx_rail", "ferme", 365 * 24 * 3600) : biscuitPartage("rbx_rail", "", 0);
  return versPage(req, String(f.get("retour") ?? "/"), biscuit);
}
