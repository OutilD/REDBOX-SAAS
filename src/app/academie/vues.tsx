import Link from "next/link";
import { FICHIER_TYPES, GENRES, taille, videoDe,
         type Bloc, type Genre, type Icone, type LeconResume } from "@/lib/academie";
import { IcoAcademie, IcoAlerte, IcoAnalyses, IcoAstuce, IcoBorne, IcoCadenas, IcoCertificat, IcoCoche,
         IcoCommunaute, IcoContrat, IcoDocument, IcoFiche, IcoImage, IcoLecture, IcoOeil, IcoPitch,
         IcoReassort, IcoScript, IcoTelecharger, IcoTexte } from "../icones";
import Video from "./video";

/**
 * LES MORCEAUX DE L'ACADEMIE.
 *
 * Tout ce qui se voit a la fois dans les pages de lecture et dans l'editeur :
 * l'editeur montre chaque bloc tel que le lira un redboxer, avec le meme code.
 * Une lecon qu'on relit dans l'editeur ne ment pas sur ce qu'on publiera.
 */

export function IconeModule({ icone, size = 22 }: { icone: Icone; size?: number }) {
  switch (icone) {
    case "certificat": return <IcoCertificat size={size} />;
    case "contrat":    return <IcoContrat size={size} />;
    case "pitch":      return <IcoPitch size={size} />;
    case "astuce":     return <IcoAstuce size={size} />;
    case "video":      return <IcoLecture size={size} />;
    case "document":   return <IcoDocument size={size} />;
    case "chiffres":   return <IcoAnalyses size={size} />;
    case "communaute": return <IcoCommunaute size={size} />;
    case "reassort":   return <IcoReassort size={size} />;
    default:           return <IcoBorne size={size} />;
  }
}

export const NOMS_ICONES: Record<Icone, string> = {
  borne: "Machine", certificat: "Certificat", contrat: "Contrat", pitch: "Pitch", astuce: "Astuce",
  video: "Vidéo", document: "Document", chiffres: "Chiffres", communaute: "Communauté", reassort: "Réassort",
};

export function IconeGenre({ genre, size = 18 }: { genre: Genre; size?: number }) {
  switch (genre) {
    case "video":     return <IcoLecture size={size} />;
    case "fichier":   return <IcoDocument size={size} />;
    case "image":     return <IcoImage size={size} />;
    case "astuce":    return <IcoAstuce size={size} />;
    case "attention": return <IcoAlerte size={size} />;
    case "script":    return <IcoScript size={size} />;
    case "fiche":     return <IcoFiche size={size} />;
    default:          return <IcoTexte size={size} />;
  }
}

export const nomGenre = (g: Genre) => GENRES.find((x) => x.cle === g)?.nom ?? g;

export function duree(min: number | null | undefined): string {
  if (!min) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

export function pluriel(n: number, un: string, plusieurs: string): string {
  return `${n} ${n > 1 ? plusieurs : un}`;
}

/* --------------------------------------------------------------- progression */

export function Piste({ n, sur, label }: { n: number; sur: number; label: string }) {
  const pct = sur > 0 ? Math.round((n / sur) * 100) : 0;
  return (
    <span className="aca-piste" role="progressbar" aria-label={label}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Anneau({ pct }: { pct: number }) {
  const r = 32, c = 2 * Math.PI * r;
  return (
    <span className="aca-anneau" role="img" aria-label={`${pct} % terminé`}>
      <svg viewBox="0 0 76 76" aria-hidden="true">
        <circle className="fond" cx="38" cy="38" r={r} fill="none" strokeWidth="6" />
        {pct > 0 ? (
          <circle className="plein" cx="38" cy="38" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
        ) : null}
      </svg>
      <b className="num" aria-hidden="true">{pct}<small>%</small></b>
    </span>
  );
}

/* ------------------------------------------------------------------ onglets */

export function OngletsAcademie({ actif, equipe, apercu, retour }: {
  actif: "parcours" | "ressources" | "editer"; equipe: boolean; apercu: boolean; retour: string;
}) {
  return (
    <>
      <div className="aca-onglets">
        <nav className="periodes" aria-label="Académie">
          <Link href="/academie" aria-current={actif === "parcours" ? "page" : undefined}>Parcours</Link>
          <Link href="/academie/ressources" aria-current={actif === "ressources" ? "page" : undefined}>Ressources</Link>
          {equipe ? (
            <Link href="/academie/editer" aria-current={actif === "editer" ? "page" : undefined}>Éditer</Link>
          ) : null}
        </nav>
        {equipe && actif !== "editer" ? (
          <form method="post" action="/api/academie/apercu" className="aca-apercu">
            <input type="hidden" name="retour" value={retour} />
            <input type="hidden" name="vue" value={apercu ? "equipe" : "prospect"} />
            <button className="bouton petit discret">
              <IcoOeil size={16} />
              {apercu ? "Quitter l’aperçu prospect" : "Voir comme un prospect"}
            </button>
          </form>
        ) : null}
      </div>
      {apercu ? (
        <div className="avis" role="note">
          <IcoOeil />
          <div className="dit">
            <div className="titre">Aperçu prospect</div>
            <div className="texte">
              Vous voyez l’académie comme un compte sans RedBox : brouillons cachés, contenus
              réservés fermés. Votre progression n’est pas enregistrée pendant l’aperçu.
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------- portes */

/**
 * LE CADENAS, ET CE QU'ON PEUT FAIRE DEVANT. Pas un mur : ce qu'il y a
 * derriere, et les deux chemins pour y entrer — appairer sa machine si on
 * l'a, demander aux redboxers si on hesite encore.
 */
export function PorteFermee({ salon, compacte, quoi }: { salon: number | null; compacte?: boolean; quoi?: string }) {
  return (
    <div className={compacte ? "aca-porte compacte" : "aca-porte"}>
      <span className="cadenas" aria-hidden="true"><IcoCadenas size={compacte ? 20 : 24} /></span>
      <div className="dit">
        <div className="titre">{quoi ?? "Réservé aux redboxers"}</div>
        <p>
          {compacte
            ? "Le contrat type, les astuces de vente et de réassort s’ouvrent dès votre première RedBox appairée."
            : "Cette partie de l’académie s’ouvre dès que votre première RedBox est appairée : le contrat type, les astuces de vente et de réassort de ceux qui en font tourner."}
        </p>
      </div>
      <div className="rangee-actions">
        <Link href="/bornes/ajouter" className="bouton primaire petit">J’ai une RedBox : l’appairer</Link>
        {salon ? (
          <Link href={`/messages/${salon}`} className="bouton petit">Poser une question aux redboxers</Link>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- programme */

export function etatLecon(x: LeconResume, ici?: number): "fini" | "ferme" | "ici" | "encours" | "afaire" {
  if (!x.ouverte) return "ferme";
  if (x.fini) return "fini";
  if (x.id === ici) return "ici";
  return x.vu ? "encours" : "afaire";
}

/** Le programme d'un module, en petit : la colonne a cote d'une lecon. */
export function Programme({ liste, ici }: { liste: LeconResume[]; ici?: number }) {
  return (
    <ol className="aca-mini">
      {liste.map((x, j) => {
        const etat = etatLecon(x, ici);
        return (
          <li key={x.id} data-etat={etat}>
            <Link href={`/academie/lecon/${x.id}`} aria-current={x.id === ici ? "page" : undefined}>
              <span className="puce num" aria-hidden="true">
                {etat === "fini" ? <IcoCoche size={12} /> : etat === "ferme" ? <IcoCadenas size={11} /> : j + 1}
              </span>
              <span className="nom">
                {x.titre}
                {etat === "fini" ? <span className="lecteur-seul"> (terminée)</span> : null}
                {etat === "ferme" ? <span className="lecteur-seul"> (réservée aux redboxers)</span> : null}
              </span>
              <span className="duree num">{duree(x.duree)}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------------------------------------------- texte */

/** Le gras et les liens, dans une ligne. Rien d'autre : pas de HTML brut. */
function enLigne(s: string, prefixe: string): React.ReactNode[] {
  const motif = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const out: React.ReactNode[] = [];
  let dernier = 0, k = 0;
  for (let m = motif.exec(s); m; m = motif.exec(s)) {
    if (m.index > dernier) out.push(s.slice(dernier, m.index));
    out.push(m[1] !== undefined
      ? <strong key={`${prefixe}-${k++}`}>{m[1]}</strong>
      : <a key={`${prefixe}-${k++}`} href={m[3]} target="_blank" rel="noopener noreferrer">{m[2]}</a>);
    dernier = m.index + m[0].length;
  }
  if (dernier < s.length) out.push(s.slice(dernier));
  return out;
}

const PUCE = /^[-*•] /;
const NUMERO = /^\d+[.)] /;

/**
 * UN TEXTE, MIS EN PAGE. La syntaxe qu'on tape sans y penser : « ## » pour un
 * intertitre, « - » pour une liste, « 1. » pour des etapes, **gras**, et
 * [lien](https://…). Chaque morceau devient un element React — jamais de HTML
 * injecte : ce que l'editeur tape ne peut pas casser la page.
 */
export function Texte({ texte }: { texte: string }) {
  const lignes = texte.split("\n");
  const blocs: React.ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lignes.length) {
    const t = lignes[i].trim();
    if (t === "") { i++; continue; }
    if (t.startsWith("### ")) { blocs.push(<h4 key={k++}>{enLigne(t.slice(4), `h${k}`)}</h4>); i++; continue; }
    if (t.startsWith("## ")) { blocs.push(<h3 key={k++}>{enLigne(t.slice(3), `h${k}`)}</h3>); i++; continue; }
    if (PUCE.test(t) || NUMERO.test(t)) {
      const ordonnee = NUMERO.test(t);
      const motif = ordonnee ? NUMERO : PUCE;
      const items: string[] = [];
      while (i < lignes.length && motif.test(lignes[i].trim())) {
        items.push(lignes[i].trim().replace(motif, ""));
        i++;
      }
      const lis = items.map((x, j) => <li key={j}>{enLigne(x, `l${k}-${j}`)}</li>);
      blocs.push(ordonnee ? <ol key={k++}>{lis}</ol> : <ul key={k++}>{lis}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lignes.length) {
      const x = lignes[i].trim();
      if (x === "" || x.startsWith("## ") || x.startsWith("### ") || PUCE.test(x) || NUMERO.test(x)) break;
      para.push(x);
      i++;
    }
    const cle = k++;
    blocs.push(
      <p key={cle}>
        {para.flatMap((x, j) => j ? [<br key={`br${j}`} />, ...enLigne(x, `p${cle}-${j}`)] : enLigne(x, `p${cle}-${j}`))}
      </p>);
  }
  return <div className="aca-texte">{blocs}</div>;
}

/* -------------------------------------------------------------------- blocs */

function Fiche({ titre, texte }: { titre: string | null; texte: string }) {
  const lignes = texte.split("\n").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="aca-fiche">
      {titre ? <div className="titre"><IcoFiche size={17} />{titre}</div> : null}
      <dl>
        {lignes.map((x, j) => {
          const p = x.indexOf(":");
          if (p <= 0) return <div key={j} className="seule">{x}</div>;
          const cle = x.slice(0, p).trim(), val = x.slice(p + 1).trim();
          const manque = val === "" || /^[àa] compl[ée]ter$/i.test(val);
          return (
            <div key={j} className="rang">
              <dt>{cle}</dt>
              <dd className="num" data-manque={manque ? "" : undefined}>{val || "à compléter"}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function FichierCarte({ id, nom, type, octets, titre, texte, ferme, source }: {
  id: number; nom: string; type: string; octets: number;
  titre?: string | null; texte?: string | null; ferme?: boolean; source?: React.ReactNode;
}) {
  const ext = FICHIER_TYPES[type] ?? "FICHIER";
  const lisible = type === "application/pdf" || type.startsWith("image/");
  return (
    <div className="aca-fichier" data-ferme={ferme ? "" : undefined}>
      <span className="doc" aria-hidden="true">
        {ferme ? <IcoCadenas size={18} /> : <IcoDocument size={20} />}
        <span className="ext">{ext}</span>
      </span>
      <div className="dit">
        <div className="nom">{titre || nom}</div>
        {texte ? <div className="quoi">{texte}</div> : null}
        <div className="meta"><span className="num">{ext} · {taille(octets)}</span>{source}</div>
      </div>
      <div className="actions">
        {ferme ? (
          <span className="aca-tag" data-ton="ferme"><IcoCadenas size={12} /> Redboxers</span>
        ) : (
          <>
            {lisible ? (
              <a className="bouton petit" href={`/api/academie/fichier/${id}`} target="_blank" rel="noopener">Ouvrir</a>
            ) : null}
            <a className="bouton petit primaire" href={`/api/academie/fichier/${id}?telecharger`} download>
              <IcoTelecharger size={16} /> Télécharger
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export function BlocVue({ b }: { b: Bloc }) {
  switch (b.genre) {
    case "texte":
      return b.texte ? <Texte texte={b.texte} /> : null;
    case "astuce":
    case "attention":
      return (
        <aside className="aca-encadre" data-genre={b.genre}>
          {b.genre === "astuce" ? <IcoAstuce size={20} /> : <IcoAlerte size={20} />}
          <div className="dit">
            <div className="titre">{b.titre || (b.genre === "astuce" ? "Astuce terrain" : "Point d’attention")}</div>
            {b.texte ? <Texte texte={b.texte} /> : null}
          </div>
        </aside>
      );
    case "script":
      return (
        <figure className="aca-script">
          <figcaption>
            <span className="marque"><IcoScript size={14} /> Script à dire</span>
            {b.titre ? <span className="titre">{b.titre}</span> : null}
          </figcaption>
          {b.texte ? <blockquote><Texte texte={b.texte} /></blockquote> : null}
        </figure>
      );
    case "fiche":
      return b.texte ? <Fiche titre={b.titre} texte={b.texte} /> : null;
    case "video": {
      const v = videoDe(b.url);
      if (!v) return null;
      return (
        <figure className="aca-video">
          <Video embed={v.embed} vignette={v.vignette} lien={v.lien} fournisseur={v.fournisseur} titre={b.titre} />
          {b.titre ? <figcaption>{b.titre}</figcaption> : null}
        </figure>
      );
    }
    case "image":
      return b.fichier_id ? (
        <figure className="aca-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/academie/fichier/${b.fichier_id}`} alt={b.texte ?? ""} loading="lazy" decoding="async" />
          {b.texte ? <figcaption>{b.texte}</figcaption> : null}
        </figure>
      ) : null;
    case "fichier":
      return b.fichier_id ? (
        <FichierCarte id={b.fichier_id} nom={b.fichier_nom ?? "fichier"} type={b.fichier_type ?? ""}
                      octets={b.fichier_taille ?? 0} titre={b.titre} texte={b.texte} />
      ) : null;
  }
}

export function Blocs({ blocs }: { blocs: Bloc[] }) {
  return <div className="aca-blocs">{blocs.map((b) => <BlocVue key={b.id} b={b} />)}</div>;
}
