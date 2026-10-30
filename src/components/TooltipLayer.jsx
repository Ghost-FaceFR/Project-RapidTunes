import { useEffect, useLayoutEffect, useRef, useState } from "react";

const SHORTCUT_SUFFIX = /\s*\(((?:Ctrl|Alt|Maj|Shift|Échap|Espace|Entrée|Suppr|F\d{1,2})[^)]*)\)\s*$/i;

/** Sépare "Mini lecteur (Ctrl+M)" en { label: "Mini lecteur", shortcut: "Ctrl+M" }. */
function splitShortcut(text) {
  const match = text.match(SHORTCUT_SUFFIX);
  if (!match) return { label: text, shortcut: "" };
  return { label: text.slice(0, match.index).trim(), shortcut: match[1].trim() };
}

/** Vrai si le texte de l'élément est coupé (ellipse): c'est le seul cas où répéter ce texte en infobulle est utile. */
function isTruncated(element) {
  return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
}

/**
 * Remplace les infobulles natives (attribut title) par des infobulles en CSS.
 * L'attribut title est déplacé vers data-tip au survol pour que le système n'affiche rien.
 */
export default function TooltipLayer() {
  const [tip, setTip] = useState(null);
  const [offset, setOffset] = useState(0);
  const [below, setBelow] = useState(false);
  const tipRef = useRef(null);

  useEffect(() => {
    let timer = null;
    let current = null;

    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };

    const handleOver = (event) => {
      const target = event.target instanceof Element ? event.target.closest("[title], [data-tip]") : null;
      if (!target || target === current) return;
      hide();

      if (target.hasAttribute("title")) {
        const text = target.getAttribute("title");
        if (text) {
          target.setAttribute("data-tip", text);
          if (!target.hasAttribute("aria-label")) target.setAttribute("aria-label", text);
        }
        target.removeAttribute("title");
      }

      const text = target.getAttribute("data-tip");
      if (!text) return;
      // Pas d'infobulle qui répète le texte déjà lisible, sauf s'il est coupé.
      if (target.textContent.trim() === text.trim() && !isTruncated(target)) return;
      current = target;
      timer = window.setTimeout(() => {
        const rect = target.getBoundingClientRect();
        setTip({ text, x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
      }, 400);
    };

    const handleOut = (event) => {
      if (!current) return;
      if (event.relatedTarget instanceof Node && current.contains(event.relatedTarget)) return;
      hide();
    };

    document.addEventListener("mouseover", handleOver, true);
    document.addEventListener("mouseout", handleOut, true);
    document.addEventListener("mousedown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mouseover", handleOver, true);
      document.removeEventListener("mouseout", handleOut, true);
      document.removeEventListener("mousedown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Garde l'infobulle entièrement dans la fenêtre: décalage horizontal, et bascule au-dessus / en dessous.
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return;
    const { offsetWidth: width, offsetHeight: height } = tipRef.current;
    const half = width / 2;
    const min = 8 + half;
    const max = window.innerWidth - 8 - half;
    setOffset(Math.min(max, Math.max(min, tip.x)) - tip.x);
    const fitsAbove = tip.top - 8 - height >= 8;
    const fitsBelow = tip.bottom + 8 + height <= window.innerHeight - 8;
    setBelow(!fitsAbove && fitsBelow);
  }, [tip]);

  if (!tip) return null;
  const { label, shortcut } = splitShortcut(tip.text);
  return (
    <div
      ref={tipRef}
      className={`rt-tooltip ${below ? "rt-tooltip--below" : ""}`}
      role="tooltip"
      style={{ left: tip.x + offset, top: below ? tip.bottom + 8 : tip.top - 8 }}
    >
      <span>{label}</span>
      {shortcut ? <kbd className="rt-tooltip__kbd">{shortcut}</kbd> : null}
    </div>
  );
}
