import { q1 } from "@/db";
import { nouveauCode, origineVue } from "@/lib/borne";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

const VALIDITE_MIN = 20;

/**
 * POST /api/borne/demande   { modele?, version? }
 *
 * La borne se presente et demande a etre adoptee. Elle recoit un code court, a
 * afficher tel quel et sous forme de QR, et un secret qu'elle garde pour venir
 * chercher son jeton une fois le proprietaire d'accord.
 *
 * Rien ici n'est authentifie : n'importe quelle machine peut demander. Ce qui la
 * rattache a un compte, c'est un humain connecte qui saisit ou scanne le code —
 * donc quelqu'un qui est physiquement devant elle.
 */
export async function POST(req: Request) {
  let corps: { modele?: string; version?: string; machine?: string } = {};
  try { corps = await req.json(); } catch { /* un corps vide est acceptable */ }

  const secret = randomBytes(24).toString("base64url");
  let code = "";
  for (let essai = 0; essai < 8 && !code; essai++) {
    const c = nouveauCode(6);
    const pris = await q1("SELECT 1 FROM appairage WHERE code = $1 AND borne_id IS NULL AND expire_le > now()", [c]);
    if (!pris) code = c;
  }
  if (!code) return Response.json({ erreur: "reessayez" }, { status: 503 });

  await q1(`INSERT INTO appairage (code, secret, modele, version, machine, expire_le)
            VALUES ($1,$2,$3,$4,$5, now() + interval '${VALIDITE_MIN} minutes')`,
           [code, secret, corps.modele ?? null, corps.version ?? null,
            String(corps.machine ?? "").slice(0, 64) || null]);

  // L'adresse que le QR encode. Scannee avec l'appareil photo du telephone, elle
  // ouvre le SaaS avec le code deja saisi : il ne reste qu'a nommer la borne.
  //
  // C'est le chemin le plus sur. Un lecteur de QR embarque dans la page web
  // exigerait HTTPS et une API que Safari n'a pas ; l'appareil photo du telephone,
  // lui, marche partout et n'a rien a demander.
  const racine = origineVue(req);
  const lien = `${racine}/bornes/ajouter?code=${encodeURIComponent(code)}`;

  return Response.json({
    code, secret, valide_s: VALIDITE_MIN * 60,
    url_appairage: lien,
    qr: `${racine}/api/qr?t=420&d=${encodeURIComponent(lien)}`,
  });
}

/**
 * GET /api/borne/demande?secret=…
 *
 * La borne interroge sa propre demande jusqu'a ce qu'elle soit adoptee. Le jeton
 * n'est remis qu'une fois : une fois reclame, il disparait de la demande.
 */
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret") ?? "";
  if (!secret) return Response.json({ erreur: "secret manquant" }, { status: 400 });

  const d = await q1<{ id: number; borne_id: number | null; jeton: string | null; expire: boolean }>(
    "SELECT id, borne_id, jeton, (expire_le < now()) AS expire FROM appairage WHERE secret = $1", [secret]);
  if (!d) return Response.json({ etat: "inconnue" }, { status: 404 });
  if (!d.borne_id) return Response.json({ etat: d.expire ? "expiree" : "en_attente" });

  if (d.jeton) {
    await q1("UPDATE appairage SET jeton = NULL, reclame_le = now() WHERE id = $1", [d.id]);
    const b = await q1<{ nom: string }>("SELECT nom FROM borne WHERE id = $1", [d.borne_id]);
    return Response.json({ etat: "adoptee", jeton: d.jeton, borne: { id: d.borne_id, nom: b?.nom ?? "" } });
  }
  return Response.json({ etat: "deja_reclamee" });
}
