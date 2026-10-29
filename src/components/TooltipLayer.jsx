import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Remplace les infobulles natives (attribut title) par des infobulles en CSS.
 * L'attribut title est déplacé vers data-tip au survol pour que le système n'affiche rien.
 */
export default function TooltipLayer() {
  const [tip, setTip] = useState(null);
  const [offset, setOffset] = useState(0);
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

  // Garde l'infobulle dans la fenêtre.
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return;
    const width = tipRef.current.offsetWidth;
    const half = width / 2;
    const min = 8 + half;
    const max = window.innerWidth - 8 - half;
    setOffset(Math.min(max, Math.max(min, tip.x)) - tip.x);
  }, [tip]);

  if (!tip) return null;
  const below = tip.top < 44;
  return (
    <div
      ref={tipRef}
      className={`rt-tooltip ${below ? "rt-tooltip--below" : ""}`}
      role="tooltip"
      style={{ left: tip.x + offset, top: below ? tip.bottom + 8 : tip.top - 8 }}
    >
      {tip.text}
    </div>
  );
}
