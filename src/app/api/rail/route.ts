import { versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Replie ou deplie le rail. L'etat vit dans un biscuit, donc il survit au rechargement. */
export async function POST(req: Request) {
  const f = await req.formData();
  const ferme = String(f.get("actuel") ?? "") !== "ferme";
  const biscuit = ferme
    ? `rbx_rail=ferme; Path=/; SameSite=Lax; Max-Age=${365 * 24 * 3600}`
    : "rbx_rail=; Path=/; SameSite=Lax; Max-Age=0";
  return versPage(req, String(f.get("retour") ?? "/"), biscuit);
}
