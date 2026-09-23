import { versPage } from "@/lib/auth";
import { biscuitPartage } from "@/lib/produits";

export const dynamic = "force-dynamic";

const SUITE: Record<string, string> = { dark: "light", light: "dark" };

export async function POST(req: Request) {
  const f = await req.formData();
  const actuel = String(f.get("actuel") ?? "dark");
  const retour = String(f.get("retour") ?? "/");
  const prochain = SUITE[actuel] ?? "light";
  const biscuit = biscuitPartage("rbx_theme", prochain, 365 * 24 * 3600);
  return versPage(req, retour, biscuit);
}
