import { q } from "@/db";
import { FAIT } from "./messages";

/**
 * LE JOURNAL DES ACTIONS DU COMPTE.
 *
 * Chaque route de la console confirme ce qu'elle a fait par une cle « fait »
 * dans l'adresse de retour (voir `lib/messages`). C'est le moment ou l'on
 * sait qu'une action a reussi, et la cle dit laquelle : on l'ecrit, avec qui
 * l'a faite, depuis quelle route, et vers quelle page on est revenu. Pas une
 * ligne de plus dans chaque route — le journal se remplit tout seul.
 */
export async function noterAction(u: { id: number; compte_id: number }, fait: string, route: string, page: string | null): Promise<void> {
  if (!FAIT[fait]) return;
  await q("INSERT INTO action (compte_id, utilisateur_id, fait, route, page) VALUES ($1, $2, $3, $4, $5)",
          [u.compte_id, u.id, fait, route.slice(0, 120), page?.slice(0, 200) ?? null]);
}

/** D'ou vient l'action, en francais, d'apres la route qui l'a faite. */
export function domaineDe(route: string): string {
  const r = route.replace(/^\/api\//, "");
  if (r.startsWith("catalogue")) return "Catalogue";
  if (r.startsWith("categories")) return "Catégories";
  if (r.startsWith("reception")) return "Réception";
  if (r.startsWith("stock")) return "Stock";
  if (r.startsWith("bornes/") && r.includes("/charger")) return "Réassort";
  if (r.startsWith("bornes/") && r.includes("/prix")) return "Prix";
  if (r.startsWith("bornes/") && r.includes("/planogramme")) return "Emplacements";
  if (r.startsWith("bornes/") && r.includes("/affichage")) return "Affichage";
  if (r.startsWith("bornes")) return "RedBox";
  if (r.startsWith("equipe")) return "Équipe";
  if (r.startsWith("pub")) return "Écran d’accueil";
  if (r.startsWith("sav")) return "Assistance";
  if (r.startsWith("centrale")) return "Centrale d’achat";
  if (r.startsWith("objectif")) return "Objectif";
  if (r.startsWith("academie")) return "Académie";
  if (r.startsWith("notifications")) return "Notifications";
  return r.split("/")[0] || "Console";
}

export type Action = { id: number; quand: Date; fait: string; route: string; page: string | null; qui: string | null };

export async function actionsDe(compte_id: number, limite = 200): Promise<Action[]> {
  return q<Action>(`
    SELECT a.id, a.quand, a.fait, a.route, a.page,
           COALESCE(NULLIF(TRIM(x.pseudo), ''), NULLIF(TRIM(x.nom), ''), split_part(x.email, '@', 1)) AS qui
      FROM action a LEFT JOIN utilisateur x ON x.id = a.utilisateur_id
     WHERE a.compte_id = $1 ORDER BY a.quand DESC LIMIT $2`, [compte_id, limite]);
}
