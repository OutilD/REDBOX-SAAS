import { NOM_MAX, TEXTE_MAX, URL_MAX, type Categorie, type Fournisseur, type Produit } from "@/lib/centrale";
import { IcoBas, IcoHaut } from "../icones";

/**
 * LES FORMULAIRES DE LA CENTRALE. Des formulaires ordinaires, envoyes a
 * `/api/centrale` : chaque champ ne montre que ce qu'il lit. `retour` garde
 * l'onglet de categorie ouvert au retour.
 */

export const ERREURS: Record<string, string> = {
  nom: "Donnez un nom.",
  lien: "Lien non reconnu : collez une adresse complète, qui commence par https://.",
  prix: "Prix illisible : écrivez « 4,50 », sans autre chose que des chiffres.",
  image: "Image refusée : JPG, PNG ou WEBP, 8 Mo au plus.",
  fournisseur: "Choisissez un fournisseur.",
  cat: "Cette catégorie n’existe plus.",
  produits: "Ce fournisseur a encore des produits : retirez-les d’abord.",
};

const IMAGES = ".jpg,.jpeg,.png,.webp";

export function Retour({ retour }: { retour: string }) {
  return <input type="hidden" name="retour" value={retour} />;
}

/** Monter, descendre : deux formulaires, deux boutons ; aux bords, inactifs. */
export function Deplacer({ cible, id, premier, dernier, retour }: {
  cible: "categorie" | "fournisseur" | "produit"; id: number; premier: boolean; dernier: boolean; retour: string;
}) {
  return (
    <span className="ctr-deplacer">
      {(["monter", "descendre"] as const).map((sens) => (
        <form key={sens} method="post" action="/api/centrale">
          <input type="hidden" name="action" value={`${cible}_${sens}`} />
          <input type="hidden" name="id" value={id} />
          <Retour retour={retour} />
          <button className="bouton petit carre" disabled={sens === "monter" ? premier : dernier}
                  aria-label={sens === "monter" ? "Monter" : "Descendre"} title={sens === "monter" ? "Monter" : "Descendre"}>
            {sens === "monter" ? <IcoHaut size={16} /> : <IcoBas size={16} />}
          </button>
        </form>
      ))}
    </span>
  );
}

export function ChampsFournisseur({ f, p }: { f?: Fournisseur; p: string }) {
  return (
    <>
      <div className="champ">
        <label htmlFor={`${p}-nom`}>Nom du fournisseur</label>
        <input id={`${p}-nom`} name="nom" required maxLength={NOM_MAX} defaultValue={f?.nom ?? ""}
               placeholder="Grossiste Vape Pro" />
      </div>
      <div className="champ">
        <label htmlFor={`${p}-url`}>Lien <span className="faible">(son site, ou la page de commande)</span></label>
        <input id={`${p}-url`} name="url" type="url" inputMode="url" maxLength={URL_MAX} defaultValue={f?.url ?? ""}
               placeholder="https://…" />
      </div>
      <div className="champ">
        <label htmlFor={`${p}-texte`}>Description <span className="faible">(facultatif — conditions, minimum de commande, délais)</span></label>
        <textarea id={`${p}-texte`} name="texte" rows={3} maxLength={TEXTE_MAX} defaultValue={f?.texte ?? ""} />
      </div>
      <div className="champ">
        <label htmlFor={`${p}-image`}>{f?.image_id ? "Remplacer le logo" : "Logo"} <span className="faible">(facultatif)</span></label>
        <input id={`${p}-image`} name="image" type="file" accept={IMAGES} className="ctr-fichier" />
      </div>
    </>
  );
}

export function ChampsProduit({ pr, p, fournisseurs, categories, fournisseur_id, categorie_id }: {
  pr?: Produit; p: string; fournisseurs: Fournisseur[]; categories: Categorie[];
  /** Ce qu'on preselectionne a la creation : le fournisseur de la section, l'onglet ouvert. */
  fournisseur_id?: number; categorie_id?: number | null;
}) {
  const prix = (c: number | null | undefined) => c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(".", ",");
  return (
    <>
      <div className="champs">
        <div className="c-moyen">
          <label htmlFor={`${p}-fournisseur`}>Fournisseur</label>
          <select id={`${p}-fournisseur`} name="fournisseur_id" required defaultValue={pr?.fournisseur_id ?? fournisseur_id ?? ""}>
            <option value="" disabled>Choisir…</option>
            {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </div>
        <div className="c-moyen">
          <label htmlFor={`${p}-categorie`}>Catégorie</label>
          <select id={`${p}-categorie`} name="categorie_id" defaultValue={pr ? pr.categorie_id ?? "" : categorie_id ?? ""}>
            <option value="">— sans catégorie —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
      </div>
      <div className="champ" style={{ marginTop: 14 }}>
        <label htmlFor={`${p}-nom`}>Nom du produit</label>
        <input id={`${p}-nom`} name="nom" required maxLength={NOM_MAX} defaultValue={pr?.nom ?? ""}
               placeholder="Puff 600 · Menthe" />
      </div>
      <div className="champs" style={{ marginTop: 14 }}>
        <div className="c-court">
          <label htmlFor={`${p}-achat`}>Prix d’achat (€)</label>
          <input id={`${p}-achat`} name="prix_achat" inputMode="decimal" defaultValue={prix(pr?.prix_achat_c)} placeholder="2,10" />
        </div>
        <div className="c-court">
          <label htmlFor={`${p}-conseille`}>Prix de vente conseillé (€)</label>
          <input id={`${p}-conseille`} name="prix_conseille" inputMode="decimal" defaultValue={prix(pr?.prix_conseille_c)} placeholder="4,50" />
        </div>
      </div>
      <div className="champ" style={{ marginTop: 14 }}>
        <label htmlFor={`${p}-texte`}>Description <span className="faible">(facultatif)</span></label>
        <textarea id={`${p}-texte`} name="texte" rows={3} maxLength={TEXTE_MAX} defaultValue={pr?.texte ?? ""} />
      </div>
      <div className="champ">
        <label htmlFor={`${p}-url`}>Lien de commande du produit <span className="faible">(facultatif — sinon, le bouton Commander mène au fournisseur)</span></label>
        <input id={`${p}-url`} name="url" type="url" inputMode="url" maxLength={URL_MAX} defaultValue={pr?.url ?? ""} placeholder="https://…" />
      </div>
      <div className="champ">
        <label htmlFor={`${p}-image`}>{pr?.image_id ? "Remplacer la photo" : "Photo"} <span className="faible">(facultatif)</span></label>
        <input id={`${p}-image`} name="image" type="file" accept={IMAGES} className="ctr-fichier" />
      </div>
      <label className="aca-coche" style={{ marginTop: 14 }}>
        <input type="checkbox" name="disponible" value="1" defaultChecked={pr ? pr.disponible : true} />
        <span>Disponible <span className="faible">— décoché : affiché « en rupture », sans bouton d’achat</span></span>
      </label>
    </>
  );
}
