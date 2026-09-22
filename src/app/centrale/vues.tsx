import Link from "next/link";
import { coefficient, estNouveau, euros, lienAchat, marge, resumeGouts, type Gout, type Produit } from "@/lib/centrale";
import { IcoEtincelle, IcoEtoile, IcoFleche, IcoImage } from "../icones";
import GoutPhoto from "./gout-photo";

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
          {p.gouts.length > 0 ? <span className="gouts">{resumeGouts(p.gouts)}</span> : null}
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

/**
 * LES GOUTS D'UNE FICHE. Une liste, une ligne par gout : sa photo — qu'un
 * clic agrandit —, son nom, son etiquette. Les best-sellers d'abord, puis les
 * nouveautes, puis les autres dans l'ordre de l'editeur : celui qui hesite
 * voit d'abord ce qui se vend. L'etoile pour un best-seller, l'etincelle pour
 * un nouveau ; une ligne etiquetee se teinte. En bas, la legende.
 */
export function ListeGouts({ gouts }: { gouts: Gout[] }) {
  if (gouts.length === 0) return null;
  const rang = (g: Gout) => g.etiquette === "best" ? 0 : g.etiquette === "nouveau" ? 1 : 2;
  const tries = gouts.map((g, i) => ({ g, i })).sort((a, b) => rang(a.g) - rang(b.g) || a.i - b.i).map((x) => x.g);
  const avecPhoto = gouts.some((g) => g.image_id);
  const best = gouts.some((g) => g.etiquette === "best"), neuf = gouts.some((g) => g.etiquette === "nouveau");
  return (
    <section className="ctr-gouts" id="gouts" aria-label="Goûts disponibles">
      <header>
        <h2>Goûts disponibles</h2>
        <span className="faible">{resumeGouts(gouts)}</span>
      </header>
      <ol>
        {tries.map((g, i) => (
          <li key={g.nom} data-etq={g.etiquette ?? undefined}>
            <span className="rang num" aria-hidden="true">{i + 1}</span>
            {avecPhoto ? (
              g.image_id
                ? <GoutPhoto image_id={g.image_id} nom={g.nom} />
                : <span className="ctr-gout-vignette sans" aria-hidden="true">{g.nom.slice(0, 1).toUpperCase()}</span>
            ) : null}
            <span className="nom">{g.nom}</span>
            {g.etiquette === "best" ? <span className="etq"><IcoEtoile size={13} /> Best-seller</span>
             : g.etiquette === "nouveau" ? <span className="etq"><IcoEtincelle size={13} /> Nouveau</span> : null}
          </li>
        ))}
      </ol>
      {best || neuf ? (
        <footer className="faible">
          {best ? <span><IcoEtoile size={12} /> best-seller : ce qui se vend le plus</span> : null}
          {neuf ? <span><IcoEtincelle size={12} /> nouveau : vient d’arriver</span> : null}
          {avecPhoto ? <span>touchez une photo pour l’agrandir</span> : null}
        </footer>
      ) : null}
    </section>
  );
}

/** Le bloc des prix d'une fiche : achat, vente conseillee, ce que ca fait. */
export function BlocPrix({ p }: { p: Produit }) {
  const m = marge(p.prix_achat_c, p.prix_conseille_c);
  const k = coefficient(p.prix_achat_c, p.prix_conseille_c);
  return (
    <dl className="ctr-fiche-prix">
      <div className="achat">
        <dt>Prix d’achat HT</dt>
        <dd className="num">{euros(p.prix_achat_c)}</dd>
        <span className="note">chez {p.fournisseur}, hors frais de port</span>
      </div>
      <div className="vente">
        <dt>Prix de vente conseillé TTC</dt>
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
