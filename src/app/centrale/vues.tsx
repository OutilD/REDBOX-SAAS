import Link from "next/link";
import { coefficient, estNouveau, euros, lienAchat, marge, type Produit } from "@/lib/centrale";
import { IcoFleche, IcoImage } from "../icones";

/**
 * LES MORCEAUX DE LA BOUTIQUE, partages entre la vitrine, la fiche produit
 * et la page de gestion.
 */

/** Une carte de la grille : toute la carte mene a la fiche, le bouton au fournisseur. */
export function CarteProduit({ p }: { p: Produit }) {
  const m = marge(p.prix_achat_c, p.prix_conseille_c);
  const achat = p.disponible ? lienAchat(p) : null;
  return (
    <article className={`ctr-produit${p.disponible ? "" : " rupture"}`} id={`p${p.id}`}>
      <Link href={`/centrale/produit/${p.id}`} className="ouvrir" aria-label={`${p.nom} — voir la fiche`}>
        <span className="photo">
          {p.image_id
            ? <img src={`/api/image/${p.image_id}`} alt="" loading="lazy" decoding="async" />  // eslint-disable-line @next/next/no-img-element
            : <span className="sans" aria-hidden="true"><IcoImage size={28} /></span>}
          <span className="etiquettes">
            {p.categorie ? <span className="rayon">{p.categorie}</span> : null}
            {!p.disponible ? <span className="rayon manque">Rupture</span> : estNouveau(p) ? <span className="rayon neuf">Nouveau</span> : null}
          </span>
        </span>
        <span className="corps">
          <span className="chez">{p.fournisseur}</span>
          <span className="nom">{p.nom}</span>
          <span className="prix">
            <span className="achat num">{euros(p.prix_achat_c)}</span>
            {p.prix_conseille_c ? <span className="vente num">vente {euros(p.prix_conseille_c)}</span> : null}
            {m !== null ? <span className="marge num">{m} %</span> : null}
          </span>
        </span>
      </Link>
      {achat ? (
        <a href={achat} target="_blank" rel="noopener noreferrer" className="bouton petit primaire acheter">
          Acheter <IcoFleche size={15} />
        </a>
      ) : (
        <span className="bouton petit acheter" aria-disabled="true">{p.disponible ? "Lien à venir" : "En rupture"}</span>
      )}
    </article>
  );
}

export function GrilleProduits({ produits }: { produits: Produit[] }) {
  return <div className="ctr-grille">{produits.map((p) => <CarteProduit key={p.id} p={p} />)}</div>;
}

/** Le bloc des prix d'une fiche : achat, vente conseillee, ce que ca fait. */
export function BlocPrix({ p }: { p: Produit }) {
  const m = marge(p.prix_achat_c, p.prix_conseille_c);
  const k = coefficient(p.prix_achat_c, p.prix_conseille_c);
  return (
    <dl className="ctr-fiche-prix">
      <div className="achat">
        <dt>Prix d’achat</dt>
        <dd className="num">{euros(p.prix_achat_c)}</dd>
        <span className="note">chez {p.fournisseur}, hors frais de port</span>
      </div>
      <div className="vente">
        <dt>Prix de vente conseillé</dt>
        <dd className="num">{euros(p.prix_conseille_c)}</dd>
        <span className="note">en RedBox</span>
      </div>
      {m !== null ? (
        <div className="marge">
          <dt>Marge brute</dt>
          <dd className="num">{m} %{k ? <small> · {k}</small> : null}</dd>
          <span className="note">
            {p.prix_conseille_c && p.prix_achat_c ? `${euros(p.prix_conseille_c - p.prix_achat_c)} par vente` : ""}
          </span>
        </div>
      ) : null}
    </dl>
  );
}
