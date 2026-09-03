import { versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SUITE: Record<string, string> = { dark: "light", light: "dark" };

export async function POST(req: Request) {
  const f = await req.formData();
  const actuel = String(f.get("actuel") ?? "dark");
  const retour = String(f.get("retour") ?? "/");
  const prochain = SUITE[actuel] ?? "light";
  const biscuit = `rbx_theme=${prochain}; Path=/; SameSite=Lax; Max-Age=${365 * 24 * 3600}`;
  return versPage(req, retour, biscuit);
}
