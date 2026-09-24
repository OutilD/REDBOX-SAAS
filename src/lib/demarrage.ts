import type { Avancement } from "./tableau";

/**
 * LA CHECKLIST DE DEMARRAGE, sur le tableau de bord tant qu'il manque une
 * etape. L'ecran de bienvenue ne couvre que les deux premieres marches
 * (catalogue, appairage) ; une fois franchies, on oubliait la reception, le
 * remplissage, les notifications, le pseudo — et l'on decouvrait deux
 * semaines plus tard un compte qui ne prevenait personne.
 */
export const BISCUIT_DEMARRAGE = "rbx_demarrage_masque";

export type Etape = { cle: string; nom: string; fait: boolean; vers: string; quoi: string };

export function etapesDemarrage(a: Avancement, u: { pseudo?: string | null }): Etape[] {
  return [
    { cle: "categories", nom: "Créer vos catégories", fait: a.categories > 0, vers: "/reglages/categories",
      quoi: "Elles rangent le catalogue et l’écran de la machine." },
    { cle: "catalogue", nom: "Remplir le catalogue", fait: a.produits > 0, vers: "/reglages/catalogue",
      quoi: "Nom, prix, âge minimum — ou piochez dans la centrale d’achat." },
    { cle: "appairer", nom: "Appairer une RedBox", fait: a.appairees > 0, vers: "/bornes/ajouter",
      quoi: "La machine affiche un code, vous le portez ici." },
    { cle: "reception", nom: "Enregistrer une réception", fait: a.recu > 0, vers: "/reception",
      quoi: "La marchandise achetée entre dans votre réserve." },
    { cle: "remplir", nom: "Remplir une RedBox", fait: a.chargees > 0, vers: "/charger",
      quoi: "Ce que vous posez dans chaque spirale." },
    { cle: "notifs", nom: "Activer les notifications", fait: a.notifs > 0, vers: "/reglages/notifications",
      quoi: "Ventes, ruptures, machine muette : sur votre téléphone." },
    { cle: "pseudo", nom: "Choisir votre pseudo", fait: Boolean((u.pseudo ?? "").trim()), vers: "/communaute/moi",
      quoi: "Le nom sous lequel l’équipe et les redboxers vous voient." },
  ];
}
