/**
 * LES TUILES DE LA PLATEFORME : un chiffre, sa pente, sa ligne d'explication.
 * Le tableau de /admin, l'academie, la fiche d'un compte et le rapport du
 * mois les partagent — meme lecture partout.
 */
/** Un chiffre, sa pente, sa ligne d'explication ; un lien quand il y a quelque chose derriere. */
export function Tuile({ titre, valeur, dessous, delta, vers, ton, accent, children }: {
  titre: string; valeur: string; dessous: string; delta?: React.ReactNode; vers?: string;
  ton?: "mal" | "attention"; accent?: boolean; children?: React.ReactNode;
}) {
  const corps = (
    <>
      <span className="titre-tuile">{titre}</span>
      <span className="ligne"><b className="chiffre num" data-ton={ton}>{valeur}</b>{delta}</span>
      <span className="dessous">{dessous}</span>
      {children}
    </>
  );
  const classe = `adm-tuile${accent ? " accent" : ""}`;
  return vers
    ? <a href={vers} className={`${classe} menant`}>{corps}</a>
    : <div className={classe}>{corps}</div>;
}

/** La courbe du chiffre en miniature, sans axe : la forme de la fenetre, rien d'autre. */
export function Etincelle({ valeurs }: { valeurs: number[] }) {
  if (valeurs.length < 2 || valeurs.every((v) => v === 0)) return null;
  const max = Math.max(...valeurs);
  const x = (i: number) => (i / (valeurs.length - 1)) * 100;
  const y = (v: number) => 28 - (v / max) * 26;
  const ligne = valeurs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return (
    <svg className="adm-etincelle" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path className="aire" d={`${ligne} L100,30 L0,30 Z`} />
      <path className="trait" d={ligne} />
    </svg>
  );
}
