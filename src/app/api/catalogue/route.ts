import { transaction } from "@/db";
import { peutConfigurer, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

function centimes(brut: string): number | null {
  const t = brut.trim().replace(/[^\d,.-]/g, "").replace(",", ".");
  if (!t) return null;
  const n = Math.round(parseFloat(t) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutConfigurer(u)) return versPage(req, "/reglages/catalogue");
  const f = await req.formData();

  if (f.get("action") === "prix") {
    await transaction(async (c) => {
      for (const [cle, valeur] of f.entries()) {
        if (cle.startsWith("prix_")) {
          const n = centimes(String(valeur));
          if (n === null) continue;
          await c.query("UPDATE produit SET prix_vente_c = $1 WHERE id = $2 AND compte_id = $3",
                        [n, Number(cle.slice(5)), u.compte_id]);
        } else if (cle.startsWith("cat_")) {
          // La categorie doit etre du compte : un identifiant devine ne doit pas
          // ranger notre produit dans le classement du voisin.
          await c.query(`
            UPDATE produit SET categorie_id = (
              SELECT id FROM categorie WHERE id = $1 AND compte_id = $2)
             WHERE id = $3 AND compte_id = $2`,
            [Number(valeur) || null, u.compte_id, Number(cle.slice(4))]);
        }
      }
    });
    return versPage(req, "/reglages/catalogue");
  }

  const sku = String(f.get("sku") ?? "").trim().toUpperCase();
  const nom = String(f.get("nom") ?? "").trim();
  if (!sku || !nom) return versPage(req, "/reglages/catalogue?e=sku");
  const cat = Number(f.get("categorie_id"));
  if (!Number.isInteger(cat) || cat <= 0) return versPage(req, "/reglages/catalogue?e=cat");
  const r = await transaction(async (c) => c.query(`
    INSERT INTO produit (compte_id, sku, nom, categorie_id, prix_vente_c, age_min)
    SELECT $1,$2,$3, cat.id, $5, $6 FROM categorie cat WHERE cat.id = $4 AND cat.compte_id = $1
    ON CONFLICT (compte_id, sku) DO NOTHING`,
    [u.compte_id, sku, nom, cat,
     centimes(String(f.get("prix") ?? "")) ?? 0, Number(f.get("age_min") ?? 0)]));
  return versPage(req, r.rowCount === 0 ? "/reglages/catalogue?e=sku" : "/reglages/catalogue");
}
