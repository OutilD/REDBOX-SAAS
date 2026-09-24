import { q1, transaction } from "@/db";
import { peutConfigurer, utilisateurDe, versPage } from "@/lib/auth";
import { reveillerLeCompte } from "@/lib/borne";
import { produitDe } from "@/lib/centrale";
import { centimes } from "@/lib/prix";
import { prefixeSku } from "@/lib/sku";

export const dynamic = "force-dynamic";

/**
 * POST /api/centrale/adopter — un produit de la centrale entre dans MON catalogue.
 *
 * La centrale dit quoi vendre et a quel prix ; d'un clic, le produit arrive
 * dans le catalogue du compte avec son nom, sa photo, sa description et le
 * prix conseille — pret a etre pose sur une spirale. Un produit a gouts fait
 * un produit par gout coche (« Puff 600 · Menthe »), chacun avec sa photo si
 * elle existe, celle du produit sinon.
 *
 * La categorie est celle qu'on choisit, ou une nouvelle au nom du rayon de la
 * centrale. Les photos sont recopiees sous le compte : une image appartient a
 * un compte, et celles de la centrale appartiennent a la plateforme.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutConfigurer(u) || u.bornes !== null) return versPage(req, "/centrale");
  const f = await req.formData();
  const p = await produitDe(Number(f.get("produit_id")));
  if (!p) return versPage(req, "/centrale");
  const ici = `/centrale/produit/${p.id}`;

  const choixCat = String(f.get("categorie_id") ?? "");
  const prix = centimes(String(f.get("prix") ?? "")) ?? p.prix_conseille_c ?? 0;
  const age = Number(f.get("age_min")) === 18 ? 18 : 0;
  const cochés = new Set(f.getAll("gout").map(String));
  const gouts = p.gouts.filter((g) => cochés.has(g.nom));

  const n = await transaction(async (c) => {
    // La categorie : la sienne, ou une nouvelle au nom du rayon.
    let cat: { id: number; nom: string } | undefined;
    if (choixCat === "nouvelle") {
      const nom = (p.categorie ?? "Divers").trim();
      cat = (await c.query<{ id: number; nom: string }>(`
        INSERT INTO categorie (compte_id, nom, ordre)
        VALUES ($1, $2, COALESCE((SELECT MAX(ordre) + 10 FROM categorie WHERE compte_id = $1), 100))
        ON CONFLICT (compte_id, nom) DO UPDATE SET nom = EXCLUDED.nom
        RETURNING id, nom`, [u.compte_id, nom])).rows[0];
    } else {
      cat = (await c.query<{ id: number; nom: string }>(
        "SELECT id, nom FROM categorie WHERE id = $1 AND compte_id = $2", [Number(choixCat), u.compte_id])).rows[0];
    }
    if (!cat) return -1;

    const copierImage = async (image_id: number | null): Promise<number | null> => {
      if (!image_id) return null;
      const r = await c.query<{ id: number }>(`
        INSERT INTO image (compte_id, type_mime, octets, taille, empreinte)
        SELECT $1, type_mime, octets, taille, empreinte FROM image WHERE id = $2
        ON CONFLICT (compte_id, empreinte) DO UPDATE SET type_mime = EXCLUDED.type_mime
        RETURNING id`, [u.compte_id, image_id]);
      return r.rows[0]?.id ?? null;
    };

    const variantes = gouts.length > 0
      ? gouts.map((g) => ({ nom: `${p.nom} · ${g.nom}`, image: g.image_id ?? p.image_id }))
      : [{ nom: p.nom, image: p.image_id }];

    const prefixe = prefixeSku(cat.nom);
    let suite = (await c.query<{ n: number }>(`
      SELECT COALESCE(MAX(substring(sku from '[0-9]+$')::int), 0) + 1 AS n
        FROM produit WHERE compte_id = $1 AND sku ~ ('^' || $2 || '-[0-9]+$')`, [u.compte_id, prefixe])).rows[0].n;
    let ordre = (await c.query<{ o: number }>(
      "SELECT COALESCE(MAX(ordre), 0) + 10 AS o FROM produit WHERE compte_id = $1 AND categorie_id = $2",
      [u.compte_id, cat.id])).rows[0].o;

    let crees = 0;
    for (const v of variantes) {
      // Deja la sous ce nom : on ne le double pas.
      if (await c.query("SELECT 1 FROM produit WHERE compte_id = $1 AND nom = $2", [u.compte_id, v.nom]).then((r) => r.rowCount)) continue;
      const image_id = await copierImage(v.image);
      // La reference est unique par compte : on avance jusqu'a une libre.
      for (let essai = 0; essai < 50; essai++) {
        const sku = `${prefixe}-${String(suite++).padStart(3, "0")}`;
        const r = await c.query(`
          INSERT INTO produit (compte_id, sku, nom, categorie_id, prix_vente_c, age_min, ordre, description, image_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (compte_id, sku) DO NOTHING`,
          [u.compte_id, sku, v.nom, cat.id, prix, age, ordre, p.texte, image_id]);
        if ((r.rowCount ?? 0) > 0) { crees++; ordre += 10; break; }
      }
    }
    return crees;
  });

  if (n < 0) return versPage(req, `${ici}?e=cat`);
  if (n > 0) await reveillerLeCompte(u.compte_id, "catalogue modifié");
  return versPage(req, `/reglages/catalogue?fait=${n > 0 ? "adopte" : "deja"}`);
}
