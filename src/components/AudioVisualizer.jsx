import { useEffect, useRef } from "react";

export const VISUALIZER_MODES = [
  { id: "bars", label: "Barres" },
  { id: "wave", label: "Ondes" },
  { id: "circle", label: "Cercles" },
  { id: "off", label: "Aucune" }
];

function resolveCssColor(host, variable, fallback) {
  const probe = document.createElement("span");
  probe.style.color = `var(${variable})`;
  probe.style.display = "none";
  host.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || fallback;
}

/**
 * Visualisation au rythme de la musique (barres, ondes, cercles) basée sur l'AnalyserNode
 * du moteur de lecture.
 */
export default function AudioVisualizer({ getAnalyser, mode, isPlaying }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode === "off") return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;

    const colors = {
      a: resolveCssColor(canvas.parentElement ?? canvas, "--neon-1", "#9a9a9a"),
      b: resolveCssColor(canvas.parentElement ?? canvas, "--neon-2", "#b0b0b0"),
      c: resolveCssColor(canvas.parentElement ?? canvas, "--neon-3", "#d0d0d0")
    };

    let width = 0;
    let height = 0;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frequencyData = null;
    let timeData = null;
    const peaks = [];
    let frame = 0;
    let phase = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      context.clearRect(0, 0, width, height);

      const analyser = getAnalyser?.();
      if (analyser && (!frequencyData || frequencyData.length !== analyser.frequencyBinCount)) {
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        timeData = new Uint8Array(analyser.fftSize);
      }
      const active = Boolean(analyser) && isPlaying;
      if (active) {
        analyser.getByteFrequencyData(frequencyData);
        analyser.getByteTimeDomainData(timeData);
      }
      phase += 0.02;

      const gradient = context.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, colors.a);
      gradient.addColorStop(0.55, colors.b);
      gradient.addColorStop(1, colors.c);

      if (mode === "bars") {
        const count = Math.max(16, Math.min(64, Math.floor(width / 12)));
        const usable = Math.floor((frequencyData?.length ?? 0) * 0.7);
        const gap = 3;
        const barWidth = Math.max(2, width / count - gap);
        context.fillStyle = gradient;
        for (let i = 0; i < count; i += 1) {
          let value = 0;
          if (active && usable > 0) {
            // Répartition logarithmique: plus de barres pour les graves.
            const start = Math.floor(Math.pow(i / count, 2) * usable);
            const end = Math.max(start + 1, Math.floor(Math.pow((i + 1) / count, 2) * usable));
            let sum = 0;
            for (let j = start; j < end; j += 1) sum += frequencyData[j];
            value = sum / (end - start) / 255;
          } else {
            value = 0.03;
          }
          const barHeight = Math.max(2, value * height * 0.9);
          const x = i * (barWidth + gap) + gap / 2;
          context.fillRect(x, height - barHeight, barWidth, barHeight);
          peaks[i] = Math.max(value * height * 0.9, (peaks[i] ?? 0) - 1.4);
          context.fillRect(x, height - peaks[i] - 5, barWidth, 2);
        }
      } else if (mode === "wave") {
        context.lineWidth = 2.5;
        context.strokeStyle = gradient;
        context.shadowColor = colors.b;
        context.shadowBlur = 12;
        context.beginPath();
        const points = 160;
        for (let i = 0; i <= points; i += 1) {
          const x = (i / points) * width;
          let y;
          if (active && timeData) {
            const sample = timeData[Math.floor((i / points) * (timeData.length - 1))] / 128 - 1;
            y = height / 2 + sample * height * 0.42;
          } else {
            y = height / 2 + Math.sin(i * 0.12 + phase) * 4;
          }
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
        context.shadowBlur = 0;
      } else if (mode === "circle") {
        const centerX = width / 2;
        const centerY = height / 2;
        const baseRadius = Math.min(width, height) * 0.22;
        const spokes = 72;
        const usable = Math.floor((frequencyData?.length ?? 0) * 0.6);
        context.lineWidth = 3;
        context.lineCap = "round";
        context.strokeStyle = colors.b;
        for (let i = 0; i < spokes; i += 1) {
          const angle = (i / spokes) * Math.PI * 2 + phase * 0.15;
          let value = 0.03;
          if (active && usable > 0) {
            const mirrored = i < spokes / 2 ? i : spokes - 1 - i;
            value = frequencyData[Math.floor((mirrored / (spokes / 2)) * usable)] / 255;
          }
          const length = value * Math.min(width, height) * 0.28 + 2;
          context.beginPath();
          context.moveTo(centerX + Math.cos(angle) * baseRadius, centerY + Math.sin(angle) * baseRadius);
          context.lineTo(
            centerX + Math.cos(angle) * (baseRadius + length),
            centerY + Math.sin(angle) * (baseRadius + length)
          );
          context.stroke();
        }
        context.strokeStyle = colors.a;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(centerX, centerY, baseRadius - 4, 0, Math.PI * 2);
        context.stroke();
      }
    };

    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [getAnalyser, mode, isPlaying]);

  if (mode === "off") return null;
  return <canvas ref={canvasRef} className="audio-visualizer" aria-hidden="true" />;
}
