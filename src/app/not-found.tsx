import Link from "next/link";
import { headers } from "next/headers";
import { ENTETE_PRODUIT, PRODUITS, adresse, hoteDes } from "@/lib/produits";

/**
 * L'ADRESSE NE MENE NULLE PART : EN CHANTIER.
 *
 * Un lien pose dans un message avant que la page existe, une adresse tapee de
 * memoire, une fonction annoncee et pas encore livree : plutot que l'erreur
 * nue du serveur, on dit que c'est en construction, et on donne les deux
 * portes — la Gestion et Connect —, dans l'habillage du produit d'ou l'on vient.
 */
export default async function EnConstruction() {
  const h = await headers();
  const hote = hoteDes(h);
  const produit = h.get(ENTETE_PRODUIT) === "connect" ? "connect" : "gestion";
  return (
    <main className="chantier">
      <div className="carte">
        <div className="sceau" aria-hidden="true">🚧</div>
        <div className="sur">RedBox {PRODUITS[produit].nom}</div>
        <h1>En cours de construction</h1>
        <p>Cette page n’existe pas encore, ou plus. Elle arrive peut-être avec une prochaine version — en attendant, voici par où reprendre.</p>
        <div className="portes">
          <Link href={adresse("gestion", PRODUITS.gestion.accueil, hote)} className={`bouton large${produit === "gestion" ? " primaire" : ""}`}>
            RedBox Gestion
          </Link>
          <Link href={adresse("connect", PRODUITS.connect.accueil, hote)} className={`bouton large${produit === "connect" ? " primaire" : ""}`}>
            RedBox Connect
          </Link>
        </div>
      </div>
    </main>
  );
}
