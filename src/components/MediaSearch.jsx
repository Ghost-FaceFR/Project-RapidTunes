import { useEffect, useRef, useState } from "react";
import { searchMedia } from "../services/tauriClient";

const PAGE_SIZE = 12;
const MAX_RESULTS = 48;
const MIN_QUERY_LENGTH = 3;

function formatViews(count) {
  if (!Number.isFinite(count)) return "";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(".0", "")} M de vues`;
  if (count >= 1_000) return `${Math.round(count / 1_000)} k vues`;
  return `${count} vues`;
}

function Thumb({ url, duration, isLive }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="media-search__thumb">
      {url && !failed ? <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} /> : null}
      {isLive ? (
        <span className="media-search__badge media-search__badge--live">EN DIRECT</span>
      ) : duration ? (
        <span className="media-search__badge">{duration}</span>
      ) : null}
    </span>
  );
}

const URL_PATTERN = /^https?:\/\//i;

/**
 * Champ unique "lien ou recherche": un lien collé renseigne l'URL du formulaire, tout autre texte lance
 * une recherche YouTube (via yt-dlp, sans clé d'API). Choisir un résultat renseigne l'URL.
 */
export default function MediaSearch({ url, onUrlChange }) {
  const [query, setQuery] = useState(url ?? "");
  const inputRef = useRef(null);
  const emittedUrlRef = useRef(url ?? "");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [state, setState] = useState({ status: "idle", results: [], message: "" });
  const requestIdRef = useRef(0);
  const lastSearchRef = useRef({ query: "", limit: 0 });

  const runSearch = async (text, count) => {
    const trimmed = text.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return;
    if (lastSearchRef.current.query === trimmed && lastSearchRef.current.limit === count) return;
    lastSearchRef.current = { query: trimmed, limit: count };
    const requestId = ++requestIdRef.current;
    setState((prev) => ({ ...prev, status: "loading", message: "" }));
    try {
      const results = await searchMedia(trimmed, count);
      // Une recherche plus récente a été lancée entre-temps: on ignore cette réponse.
      if (requestId !== requestIdRef.current) return;
      setState({ status: "ready", results, message: "" });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      lastSearchRef.current = { query: "", limit: 0 };
      setState({
        status: "error",
        results: [],
        message: typeof error === "string" && error.trim() ? error : "Recherche impossible."
      });
    }
  };

  // Recherche au fil de la frappe, après une courte pause.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH || /^https?:\/\//i.test(trimmed)) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setLimit(PAGE_SIZE);
      runSearch(trimmed, PAGE_SIZE);
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const emitUrl = (value) => {
    emittedUrlRef.current = value;
    onUrlChange(value);
  };

  // L'URL peut être modifiée ailleurs (ex. restauration d'un élément de la file): on la reflète dans le champ.
  useEffect(() => {
    const external = url ?? "";
    if (external !== emittedUrlRef.current) {
      emittedUrlRef.current = external;
      setQuery(external);
    }
  }, [url]);

  const isUrl = URL_PATTERN.test(query.trim());

  useEffect(() => {
    inputRef.current?.setCustomValidity(isUrl ? "" : "Colle un lien ou choisis un résultat de recherche.");
  }, [isUrl]);

  const resetResults = () => {
    requestIdRef.current += 1;
    lastSearchRef.current = { query: "", limit: 0 };
    setLimit(PAGE_SIZE);
    setState({ status: "idle", results: [], message: "" });
  };

  const clear = () => {
    resetResults();
    setQuery("");
    emitUrl("");
  };

  const handleChange = (event) => {
    const value = event.target.value;
    setQuery(value);
    emitUrl(URL_PATTERN.test(value.trim()) ? value.trim() : "");
  };

  const loadMore = () => {
    const next = Math.min(limit + PAGE_SIZE, MAX_RESULTS);
    setLimit(next);
    runSearch(query, next);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      // Entrée lance la recherche sans soumettre le formulaire de téléchargement.
      event.preventDefault();
      setLimit(PAGE_SIZE);
      runSearch(query, PAGE_SIZE);
    } else if (event.key === "Escape") {
      clear();
    }
  };

  const { status, results, message } = state;

  return (
    <div className="media-search">
      <div className="media-search__bar">
        <input
          ref={inputRef}
          type="text"
          name="url"
          className="media-search__input"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="https://example.com/video ou recherche YouTube (titre, artiste...)"
          aria-label="Lien du média ou recherche YouTube"
          autoComplete="off"
          required
        />
        {query || results.length > 0 ? (
          <button type="button" className="media-search__clear" onClick={clear} title="Effacer la recherche" aria-label="Effacer la recherche">
            ✕
          </button>
        ) : null}
      </div>

      <div aria-live="polite">
        {status === "loading" && results.length === 0 ? <p className="media-search__hint">Recherche en cours...</p> : null}
        {status === "error" ? <p className="media-search__hint media-search__hint--error">{message}</p> : null}
        {status === "ready" && results.length === 0 ? <p className="media-search__hint">Aucun résultat.</p> : null}
      </div>

      {results.length > 0 ? (
        <>
          <ul className={`media-search__list ${status === "loading" ? "is-loading" : ""}`}>
            {results.map((result) => (
              <li key={result.videoId}>
                <button
                  type="button"
                  className="media-search__item"
                  onClick={() => {
                    resetResults();
                    setQuery(result.url);
                    emitUrl(result.url);
                  }}
                  title="Utiliser ce média"
                >
                  <Thumb url={result.thumbnailUrl} duration={result.durationText} isLive={result.isLive} />
                  <span className="media-search__text">
                    <strong title={result.title}>{result.title}</strong>
                    <span>{[result.channel, formatViews(result.viewCount)].filter(Boolean).join(" • ")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {limit < MAX_RESULTS && results.length >= limit ? (
            <button type="button" className="media-search__more" onClick={loadMore} disabled={status === "loading"}>
              {status === "loading" ? "Chargement..." : "Voir plus de résultats"}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
