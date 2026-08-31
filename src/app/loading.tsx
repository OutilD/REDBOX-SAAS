/**
 * L'ecran d'attente.
 *
 * Les pages interrogent une base hebergee de l'autre cote de l'Atlantique : il y
 * a une vraie demi-seconde a couvrir, et un ecran blanc pendant ce temps se lit
 * comme une panne. Next l'affiche automatiquement pendant que la page se rend.
 *
 * Le logo respire, un trait avance. Rien d'autre : ce qu'on attend, c'est que ca
 * s'en aille.
 */
export default function Attente() {
  return (
    <div className="ecran-chargement" role="status" aria-live="polite">
      <img src="/logo-redbox.png" alt="" width={128} height={83} />
      <div className="fil-chargement"><span /></div>
      <span className="sr">Chargement…</span>
    </div>
  );
}
