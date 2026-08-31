import { versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SUITE: Record<string, string> = { auto: "dark", dark: "light", light: "auto" };

export async function POST(req: Request) {
  const f = await req.formData();
  const actuel = String(f.get("actuel") ?? "auto");
  const retour = String(f.get("retour") ?? "/");
  const prochain = SUITE[actuel] ?? "dark";
  const biscuit = prochain === "auto"
    ? "rbx_theme=; Path=/; SameSite=Lax; Max-Age=0"
    : `rbx_theme=${prochain}; Path=/; SameSite=Lax; Max-Age=${365 * 24 * 3600}`;
  return versPage(req, retour, biscuit);
}
