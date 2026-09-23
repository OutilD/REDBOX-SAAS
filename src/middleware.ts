import { NextResponse, type NextRequest } from "next/server";
import { BISCUIT_PRODUIT, ENTETE_PRODUIT, MARQUE_PARTAGE, PRODUITS, adresse, domaineBiscuit, hoteDes, produitDeLHote,
         produitDuChemin, type Produit } from "@/lib/produits";

/**
 * A QUEL PRODUIT APPARTIENT CETTE PAGE, ET EST-ON AU BON ENDROIT ?
 * (voir `lib/produits.ts`)
 *
 * UN SEUL HOTE — le cas tant que les deux adresses ne sont pas declarees. Le
 * menu, le compte et les notifications servent les deux produits : ils gardent
 * l'habillage d'ou l'on vient, et une page ne sait pas d'ou l'on vient. On le
 * retient donc dans un biscuit, a chaque page qui appartient clairement a l'un
 * des deux ; les pages partagees le lisent et n'y touchent pas.
 *
 * DEUX HOTES. Chacun ne sert que son produit : une page de l'autre y renvoie,
 * avec son adresse entiere — un lien garde dans un message, une notification
 * recue par l'autre application, tout arrive au bon endroit. La racine de
 * Connect est son accueil. Les pages partagees se servent sur place.
 *
 * Rien d'autre ici, et surtout pas la base : ce fichier tourne en « edge ».
 */
export function middleware(req: NextRequest) {
  const chemin = req.nextUrl.pathname;
  const hote = hoteDes(req.headers);
  const ici = produitDeLHote(hote);
  const produit = produitDuChemin(chemin);

  // LE PRODUIT DE CETTE PAGE, transmis a la mise en page par un en-tete de
  // requete : c'est elle qui pose `data-produit` sur <html>, et tout
  // l'habillage — couleurs, rail, barre du bas — en decoule. Une page partagee
  // prend l'hote, sinon le biscuit.
  const effectif: Produit = produit ?? ici ?? (req.cookies.get(BISCUIT_PRODUIT)?.value === "connect" ? "connect" : "gestion");
  const entetes = new Headers(req.headers);
  entetes.set(ENTETE_PRODUIT, effectif);
  const suivant = () => NextResponse.next({ request: { headers: entetes } });

  // UN BISCUIT DE SESSION D'AVANT LE DOMAINE (sans marque, voir MARQUE_PARTAGE)
  // ne vaut plus rien et pourrait laisser quelqu'un « connecte » d'un seul
  // cote : on l'efface sur cet hote. Le biscuit de domaine, lui, reste.
  const vestige = domaineBiscuit() !== null
    && req.cookies.getAll("rbx").some((c) => !c.value.startsWith(MARQUE_PARTAGE));
  const purger = (r: NextResponse) => {
    if (vestige) r.headers.append("Set-Cookie", "rbx=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return r;
  };

  if (ici !== null) {
    if (ici === "connect" && chemin === "/") {
      // L'adresse se compose depuis l'hote que le client a tape : derriere un
      // proxy, `req.url` porte celui de la machine, qu'il ne connait pas.
      const protocole = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
      return purger(NextResponse.redirect(`${protocole}://${hote}${PRODUITS.connect.accueil}`));
    }
    if (produit !== null && produit !== ici) {
      return purger(NextResponse.redirect(adresse(produit, chemin + req.nextUrl.search, hote)));
    }
    return purger(suivant());
  }

  const suite = purger(suivant());
  if (produit !== null && req.cookies.get(BISCUIT_PRODUIT)?.value !== produit) {
    suite.cookies.set(BISCUIT_PRODUIT, produit, { path: "/", sameSite: "lax", maxAge: 365 * 24 * 3600 });
  }
  return suite;
}

// Les pages seulement : ni l'API, ni les fichiers de Next, ni rien qui porte une extension.
export const config = { matcher: ["/((?!api/|_next/|.*\\.[a-z0-9]+$).*)"] };
