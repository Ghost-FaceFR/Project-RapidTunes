import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const EQ_FREQUENCIES = [62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

function createMediaElement() {
  const element = document.createElement("video");
  element.preload = "metadata";
  element.playsInline = true;
  element.crossOrigin = "anonymous";
  element.className = "media-engine";
  return element;
}

/**
 * Moteur de lecture réel (audio + vidéo) basé sur un élément <video> unique,
 * avec égaliseur 9 bandes via Web Audio.
 */
export function useMediaEngine({ source, speed, volume, muted, eqEnabled, eqGains, onEnded }) {
  const elementRef = useRef(null);
  if (elementRef.current === null && typeof document !== "undefined") {
    elementRef.current = createMediaElement();
  }
  const element = elementRef.current;

  const graphRef = useRef(null);
  const corsFallbackUsedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState("");

  const ensureAudioGraph = useCallback(() => {
    if (graphRef.current || !element || corsFallbackUsedRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const mediaSource = context.createMediaElementSource(element);
      const filters = EQ_FREQUENCIES.map((frequency) => {
        const filter = context.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = frequency;
        filter.Q.value = 1.1;
        filter.gain.value = 0;
        return filter;
      });

      let previous = mediaSource;
      filters.forEach((filter) => {
        previous.connect(filter);
        previous = filter;
      });
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      previous.connect(analyser);
      analyser.connect(context.destination);
      graphRef.current = { context, filters, analyser };
    } catch (err) {
      console.warn("Égaliseur indisponible:", err);
    }
  }, [element]);

  useEffect(() => {
    if (!element) return undefined;

    const handlers = {
      timeupdate: () => setCurrentTime(element.currentTime || 0),
      durationchange: () => setDuration(Number.isFinite(element.duration) ? element.duration : 0),
      loadedmetadata: () => setDuration(Number.isFinite(element.duration) ? element.duration : 0),
      play: () => {
        setIsPlaying(true);
        ensureAudioGraph();
        graphRef.current?.context.resume().catch(() => {});
      },
      pause: () => setIsPlaying(false),
      ended: () => {
        setIsPlaying(false);
        onEndedRef.current?.();
      },
      error: () => {
        if (!element.getAttribute("src")) return;
        // Repli: certaines sources n'acceptent pas CORS (l'égaliseur est alors désactivé).
        if (element.crossOrigin && !corsFallbackUsedRef.current && !graphRef.current) {
          corsFallbackUsedRef.current = true;
          element.removeAttribute("crossorigin");
          const src = element.getAttribute("src");
          element.src = src;
          element.play().catch(() => {});
          return;
        }
        setError("Impossible de lire ce fichier (format ou codec non pris en charge).");
        setIsPlaying(false);
      }
    };

    Object.entries(handlers).forEach(([name, handler]) => element.addEventListener(name, handler));
    return () => {
      Object.entries(handlers).forEach(([name, handler]) => element.removeEventListener(name, handler));
    };
  }, [element, ensureAudioGraph]);

  useEffect(() => {
    if (!element) return;
    setError("");
    setCurrentTime(0);
    setDuration(0);

    if (!source) {
      element.pause();
      element.removeAttribute("src");
      element.load();
      return;
    }

    element.src = source;
    element.playbackRate = speed;
    element.play().catch((err) => {
      if (err?.name !== "AbortError") {
        setError("Lecture impossible pour ce média.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, source]);

  useEffect(() => {
    if (element) element.playbackRate = speed;
  }, [element, speed]);

  useEffect(() => {
    if (!element) return;
    element.volume = Math.min(1, Math.max(0, volume));
    element.muted = muted;
  }, [element, volume, muted]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.filters.forEach((filter, index) => {
      filter.gain.value = eqEnabled ? eqGains[index] ?? 0 : 0;
    });
  }, [eqEnabled, eqGains, isPlaying]);

  const toggle = useCallback(() => {
    if (!element || !element.getAttribute("src")) return;
    if (element.paused) {
      element.play().catch(() => {});
    } else {
      element.pause();
    }
  }, [element]);

  const pause = useCallback(() => element?.pause(), [element]);

  const getAnalyser = useCallback(() => graphRef.current?.analyser ?? null, []);

  const seek = useCallback(
    (seconds) => {
      if (!element) return;
      const limit = Number.isFinite(element.duration) ? element.duration : seconds;
      element.currentTime = Math.min(limit, Math.max(0, seconds));
      setCurrentTime(element.currentTime);
    },
    [element]
  );

  const restart = useCallback(() => {
    if (!element) return;
    element.currentTime = 0;
    element.play().catch(() => {});
  }, [element]);

  return useMemo(
    () => ({ element, currentTime, duration, isPlaying, error, toggle, pause, seek, restart, getAnalyser }),
    [element, currentTime, duration, isPlaying, error, toggle, pause, seek, restart, getAnalyser]
  );
}
