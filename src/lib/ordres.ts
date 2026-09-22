import { q, q1 } from "@/db";
import { anterieureA } from "./borne";

/**
 * LES ORDRES DONNES A UNE MACHINE (table `ordre_borne`).
 *
 * Un seul pour l'instant : reinitialiser le terminal de paiement. La borne le
 * prend a sa synchronisation, l'execute sur son propre fil — un terminal met
 * une demi-minute a revenir — et en remonte l'issue au releve suivant.
 */
export type Genre = "reset_paiement";

export type Ordre = {
  id: number; genre: Genre; par: string | null;
  demande_le: Date; execute_le: Date | null; ok: boolean | null; detail: string | null;
};

/** Passe ce delai, un ordre sans reponse n'est plus presente a la machine. */
export const ORDRE_VALIDITE_MIN = 10;

/** La premiere application qui sait recevoir un ordre. */
export const VERSION_ORDRES = "5.15";

export function saitRecevoirDesOrdres(version: string | null | undefined): boolean {
  return !anterieureA(version, 5, 15);
}

const VIF = `execute_le IS NULL AND demande_le > now() - interval '${ORDRE_VALIDITE_MIN} minutes'`;

/** Ce que la borne doit encore faire. */
export function ordresPour(borne_id: number): Promise<{ id: number; genre: Genre }[]> {
  return q(`SELECT id, genre FROM ordre_borne WHERE borne_id = $1 AND ${VIF} ORDER BY id`, [borne_id]);
}

/** Le dernier ordre de ce genre, pour dire ou il en est. */
export function dernierOrdre(borne_id: number, genre: Genre): Promise<Ordre | null> {
  return q1<Ordre>(`
    SELECT id, genre, par, demande_le, execute_le, ok, detail FROM ordre_borne
     WHERE borne_id = $1 AND genre = $2 ORDER BY id DESC LIMIT 1`, [borne_id, genre]);
}

/** Encore attendu par la machine ? Faux s'il a expire sans reponse. */
export function enAttente(o: Ordre | null): boolean {
  return !!o && o.execute_le === null
      && Date.now() - new Date(o.demande_le).getTime() < ORDRE_VALIDITE_MIN * 60_000;
}

/**
 * Donne un ordre. Rend null s'il y en a deja un en attente : deux
 * reinitialisations de suite feraient repartir de zero un terminal qui
 * redemarre, et il ne finirait jamais de revenir.
 */
export async function donnerOrdre(borne_id: number, genre: Genre,
                                  par: { id: number; nom: string }): Promise<number | null> {
  const l = await q1<{ id: number }>(`
    INSERT INTO ordre_borne (borne_id, genre, par_id, par)
    SELECT $1, $2, $3, $4
     WHERE NOT EXISTS (SELECT 1 FROM ordre_borne WHERE borne_id = $1 AND genre = $2 AND ${VIF})
    RETURNING id`, [borne_id, genre, par.id, par.nom]);
  return l?.id ?? null;
}
