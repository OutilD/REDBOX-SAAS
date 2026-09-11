"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Le cote du carre qu'on garde. Un portrait ne s'affiche jamais au-dela de
 * 104 px ; 512 laisse de la marge aux ecrans denses, sans envoyer six
 * megaoctets pour une vignette.
 */
const COTE = 512;

/**
 * LA PHOTO, REDUITE DANS LE NAVIGATEUR AVANT DE PARTIR.
 *
 * Une photo de telephone pese trois a six megaoctets : lente a envoyer en 4G,
 * et coupee par la plupart des hebergeurs au-dela de quatre et demi. On en
 * garde un carre pris au centre — le portrait est rond partout ou il
 * s'affiche —, en JPEG, quelques dizaines de kilooctets.
 *
 * L'orientation d'abord : une photo prise en portrait arriverait couchee.
 * `createImageBitmap` lit l'EXIF ; a defaut, une <img> le respecte aussi.
 */
async function reduire(fichier: File): Promise<Blob> {
  let source: CanvasImageSource, w: number, h: number;
  try {
    const bmp = await createImageBitmap(fichier, { imageOrientation: "from-image" });
    source = bmp; w = bmp.width; h = bmp.height;
  } catch {
    const url = URL.createObjectURL(fichier);
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url;
    });
    source = img; w = img.naturalWidth; h = img.naturalHeight;
  }
  if (!w || !h) throw new Error("illisible");
  const c = Math.min(w, h), cote = Math.min(COTE, c);
  const toile = document.createElement("canvas");
  toile.width = cote; toile.height = cote;
  const ctx = toile.getContext("2d");
  if (!ctx) throw new Error("toile");
  // Un PNG transparent deviendrait noir en JPEG : fond blanc d'abord.
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cote, cote);
  ctx.drawImage(source, (w - c) / 2, (h - c) / 2, c, c, 0, 0, cote, cote);
  return new Promise((ok, ko) => toile.toBlob((b) => (b ? ok(b) : ko(new Error("jpeg"))), "image/jpeg", 0.86));
}

/**
 * LA REDUCTION EST UN BONUS, PAS UNE CONDITION. Un navigateur qui ne sait pas
 * decoder l'image, ou qui s'y attarde, ne doit pas empecher de changer sa
 * photo : au-dela de huit secondes, ou en cas d'echec, on envoie le fichier
 * d'origine — le serveur l'accepte jusqu'a huit megaoctets.
 */
export async function preparer(fichier: File, delaiMs = 8000): Promise<Blob> {
  const attente = new Promise<null>((ok) => setTimeout(() => ok(null), delaiMs));
  const reduite = await Promise.race([reduire(fichier).catch(() => null), attente]);
  return reduite ?? fichier;
}

/**
 * CHANGER SA PHOTO, SANS CHERCHER « ENREGISTRER ».
 *
 * Choisir une image l'enregistre aussitot, et le portrait change sous les
 * yeux. Avant, le choix ne changeait rien a l'ecran : il fallait descendre
 * jusqu'au bouton du formulaire, sous le mot de passe, et l'on croyait que la
 * photo n'etait pas passee.
 *
 * Un formulaire a lui, qui marche sans JavaScript : on choisit, puis on appuie
 * sur « Enregistrer la photo », qui n'apparait qu'alors. Avec JavaScript, le
 * choix suffit.
 */
export default function ChangerPhoto({ imageId, initiales, couleur, retour, taille = 72 }: {
  imageId: number | null; initiales: string; couleur?: string | null;
  /** La page ou revenir quand le formulaire part sans JavaScript. */
  retour: string; taille?: number;
}) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [apercu, poserApercu] = useState<string | null>(null);
  const [retiree, retirer] = useState(false);
  const [etat, poser] = useState<"repos" | "envoi" | "ok" | "erreur">("repos");
  const source = apercu ?? (!retiree && imageId ? `/api/image/${imageId}` : null);

  async function envoyer(corps: FormData): Promise<boolean> {
    const r = await fetch("/api/profil/photo", { method: "POST", body: corps, headers: { accept: "application/json" } });
    return r.ok;
  }

  async function choisir() {
    const f = champ.current?.files?.[0];
    if (!f) return;
    poser("envoi");
    try {
      const blob = await preparer(f);
      poserApercu(URL.createObjectURL(blob)); retirer(false);
      const corps = new FormData();
      corps.append("photo", blob, blob === f ? f.name : "photo.jpg");
      if (!(await envoyer(corps))) throw new Error("refus");
      poser("ok");
      router.refresh();          // l'en-tete et la page reprennent la nouvelle photo
    } catch {
      poserApercu(null); poser("erreur");
    } finally {
      if (champ.current) champ.current.value = "";
    }
  }

  async function oter(e: React.MouseEvent) {
    e.preventDefault();
    poser("envoi");
    const corps = new FormData(); corps.append("oter", "1");
    if (await envoyer(corps).catch(() => false)) {
      poserApercu(null); retirer(true); poser("repos"); router.refresh();
    } else poser("erreur");
  }

  return (
    <form method="post" action="/api/profil/photo" encType="multipart/form-data"
          style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="retour" value={retour} />
      <span className="portrait-rond" aria-hidden
            style={{ width: taille, height: taille, background: couleur ?? undefined, fontSize: Math.round(taille * 0.34) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {source ? <img src={source} alt="" /> : initiales}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="rangee" style={{ gap: 8, flexWrap: "wrap" }}>
          <label className="fichier">
            <input ref={champ} name="photo" type="file" accept="image/*" onChange={choisir}
                   disabled={etat === "envoi"} />
            <span>{etat === "envoi" ? "Envoi…" : source ? "Changer la photo" : "Choisir une photo"}</span>
          </label>
          {source ? (
            <button type="submit" name="oter" value="1" className="bouton petit discret"
                    onClick={oter} disabled={etat === "envoi"}>Retirer</button>
          ) : null}
          <noscript><button className="bouton petit">Enregistrer la photo</button></noscript>
        </div>
        {etat === "ok" ? <p className="faible" role="status" style={{ margin: "6px 0 0", fontSize: 12.5 }}>Photo enregistrée.</p>
          : etat === "erreur" ? <p className="erreur" role="alert" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
              Cette image n’a pas pu être lue ou envoyée. Essayez une photo JPEG ou PNG.</p>
          : null}
      </div>
    </form>
  );
}
