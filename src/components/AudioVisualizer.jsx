import { useEffect, useRef } from "react";

export const VISUALIZER_MODES = [
  { id: "bars", label: "Barres" },
  { id: "wave", label: "Ondes" },
  { id: "circle", label: "Cercles" },
  { id: "mirror", label: "Miroir" },
  { id: "area", label: "Spectre" },
  { id: "dots", label: "Points" },
  { id: "radial", label: "Radial" },
  { id: "pulse", label: "Pulsation" },
  { id: "hypno", label: "Hypnose" },
  { id: "tunnel", label: "Tunnel" },
  { id: "kaleido", label: "Kaléidoscope" },
  { id: "vortex", label: "Vortex" },
  { id: "starfield", label: "Voyage stellaire" },
  { id: "lissajous", label: "Oscilloscope" },
  { id: "psycho", label: "Psychose" },
  { id: "off", label: "Aucune" }
];

export const VISUALIZER_COLORS = [
  { id: "theme", label: "Thème de l'application", colors: null },
  { id: "violet", label: "Violet", colors: ["#6d28d9", "#8b5cf6", "#c4b5fd"] },
  { id: "ocean", label: "Océan", colors: ["#0369a1", "#06b6d4", "#a5f3fc"] },
  { id: "forest", label: "Forêt", colors: ["#15803d", "#22c55e", "#bbf7d0"] },
  { id: "fire", label: "Feu", colors: ["#b91c1c", "#f97316", "#fde047"] },
  { id: "pink", label: "Rose", colors: ["#be185d", "#ec4899", "#fbcfe8"] },
  { id: "rainbow", label: "Arc-en-ciel", colors: ["#ef4444", "#22c55e", "#3b82f6"] },
  { id: "white", label: "Blanc", colors: ["#9ca3af", "#e5e7eb", "#ffffff"] },
  { id: "sunset", label: "Coucher de soleil", colors: ["#7c3aed", "#f43f5e", "#fbbf24"] },
  { id: "neon", label: "Néon", colors: ["#0ea5e9", "#d946ef", "#fde047"] },
  { id: "cyberpunk", label: "Cyberpunk", colors: ["#f0abfc", "#ec4899", "#22d3ee"] },
  { id: "ice", label: "Glace", colors: ["#1e40af", "#60a5fa", "#e0f2fe"] },
  { id: "mint", label: "Menthe", colors: ["#0f766e", "#2dd4bf", "#ccfbf1"] },
  { id: "gold", label: "Or", colors: ["#a16207", "#eab308", "#fef08a"] },
  { id: "lava", label: "Lave", colors: ["#450a0a", "#dc2626", "#fb923c"] },
  { id: "aurora", label: "Aurore boréale", colors: ["#2563eb", "#10b981", "#a78bfa"] },
  { id: "candy", label: "Bonbon", colors: ["#f472b6", "#a78bfa", "#67e8f9"] },
  { id: "matrix", label: "Matrix", colors: ["#052e16", "#16a34a", "#86efac"] },
  { id: "mono", label: "Noir et gris", colors: ["#262626", "#737373", "#d4d4d4"] },
  { id: "custom", label: "Personnalisée", colors: null }
];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function shiftHex(hex, amount) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const shifted = channels.map((value) =>
    Math.round(amount >= 0 ? value + (255 - value) * amount : value * (1 + amount))
  );
  return `#${shifted.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

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
 * Visualisation au rythme de la musique (barres, ondes, cercles, miroir, spectre, points, radial, pulsation) basée sur l'AnalyserNode
 * du moteur de lecture.
 */
export default function AudioVisualizer({ getAnalyser, mode, isPlaying, colorTheme = "theme", customColor = "#8b5cf6" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode === "off") return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;

    const preset = VISUALIZER_COLORS.find((entry) => entry.id === colorTheme);
    let colors;
    if (colorTheme === "custom") {
      const base = HEX_COLOR.test(customColor) ? customColor : "#8b5cf6";
      colors = { a: shiftHex(base, -0.35), b: base, c: shiftHex(base, 0.55) };
    } else if (preset?.colors) {
      colors = { a: preset.colors[0], b: preset.colors[1], c: preset.colors[2] };
    } else {
      colors = {
        a: resolveCssColor(canvas.parentElement ?? canvas, "--neon-1", "#9a9a9a"),
        b: resolveCssColor(canvas.parentElement ?? canvas, "--neon-2", "#b0b0b0"),
        c: resolveCssColor(canvas.parentElement ?? canvas, "--neon-3", "#d0d0d0")
      };
    }

    let width = 0;
    let height = 0;
    const resize = () => {
      const ratio = 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      gradient = context.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, colors.a);
      gradient.addColorStop(0.55, colors.b);
      gradient.addColorStop(1, colors.c);
    };
    let gradient = null;
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frequencyData = null;
    let timeData = null;
    const peaks = [];
    let frame = 0;
    let phase = 0;

    // Niveau (0..1) d'une bande de fréquences, réparties de façon logarithmique (plus de détail dans les graves).
    const bandLevel = (i, count, share = 0.7) => {
      const usable = Math.floor((frequencyData?.length ?? 0) * share);
      if (usable <= 0) return 0;
      const start = Math.floor(Math.pow(i / count, 2) * usable);
      const end = Math.max(start + 1, Math.floor(Math.pow((i + 1) / count, 2) * usable));
      let sum = 0;
      for (let j = start; j < end; j += 1) sum += frequencyData[j];
      return sum / (end - start) / 255;
    };
    let bass = 0;
    let spin = 0;
    let stars = null;
    const palette = () => [colors.a, colors.b, colors.c];
    // Énergie des graves (0..1) lissée, utilisée pour faire "respirer" les effets hypnotiques.
    const updateBass = (active) => {
      let level = 0.05;
      if (active) {
        let sum = 0;
        for (let i = 0; i < 8; i += 1) sum += bandLevel(i, 32);
        level = sum / 8;
      }
      bass = Math.max(level, bass - 0.05);
      spin += 0.012 + bass * 0.08;
      return bass;
    };

    const FRAME_INTERVAL = 1000 / 30;
    let lastDraw = 0;

    const draw = (now = 0) => {
      // Lecture en cours: boucle animée (limitée à ~30 ips, suspendue si la fenêtre est masquée).
      // En pause: un seul rendu statique, sans boucle.
      if (isPlaying) frame = requestAnimationFrame(draw);
      if (isPlaying && (document.hidden || now - lastDraw < FRAME_INTERVAL)) return;
      lastDraw = now;
      context.clearRect(0, 0, width, height);

      const analyser = getAnalyser?.();
      if (analyser && (!frequencyData || frequencyData.length !== analyser.frequencyBinCount)) {
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        timeData = new Uint8Array(analyser.fftSize);
      }
      const active = Boolean(analyser) && isPlaying;
      if (active) {
        analyser.getByteFrequencyData(frequencyData);
        if (mode === "wave" || mode === "lissajous") analyser.getByteTimeDomainData(timeData);
      }
      phase += 0.02;

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
        context.shadowBlur = 6;
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
      } else if (mode === "mirror") {
        const count = Math.max(16, Math.min(56, Math.floor(width / 14)));
        const gap = 3;
        const barWidth = Math.max(2, width / count - gap);
        const mid = height / 2;
        context.fillStyle = gradient;
        for (let i = 0; i < count; i += 1) {
          const value = active ? bandLevel(i, count) : 0.03;
          const half = Math.max(1.5, value * height * 0.46);
          const x = i * (barWidth + gap) + gap / 2;
          context.fillRect(x, mid - half, barWidth, half * 2);
        }
      } else if (mode === "area") {
        const points = 64;
        context.beginPath();
        context.moveTo(0, height);
        for (let i = 0; i <= points; i += 1) {
          const value = active ? bandLevel(Math.min(i, points - 1), points) : 0.03;
          context.lineTo((i / points) * width, height - Math.max(2, value * height * 0.92));
        }
        context.lineTo(width, height);
        context.closePath();
        context.globalAlpha = 0.45;
        context.fillStyle = gradient;
        context.fill();
        context.globalAlpha = 1;
        context.lineWidth = 2;
        context.strokeStyle = colors.c;
        context.stroke();
      } else if (mode === "dots") {
        const columns = Math.max(12, Math.min(40, Math.floor(width / 16)));
        const cell = width / columns;
        const radius = Math.max(1.5, Math.min(cell * 0.32, 5));
        const rows = Math.max(3, Math.floor(height / (radius * 3.2)));
        const rowStep = height / rows;
        context.fillStyle = gradient;
        for (let i = 0; i < columns; i += 1) {
          const value = active ? bandLevel(i, columns) : 0.03;
          const lit = Math.max(1, Math.round(value * rows));
          for (let r = 0; r < lit; r += 1) {
            context.globalAlpha = 0.45 + 0.55 * (r / rows);
            context.beginPath();
            context.arc(cell * (i + 0.5), height - rowStep * (r + 0.5), radius, 0, Math.PI * 2);
            context.fill();
          }
        }
        context.globalAlpha = 1;
      } else if (mode === "radial") {
        const centerX = width / 2;
        const centerY = height / 2;
        const baseRadius = Math.min(width, height) * 0.2;
        const points = 96;
        context.beginPath();
        for (let i = 0; i <= points; i += 1) {
          const index = i % points;
          const mirrored = index < points / 2 ? index : points - 1 - index;
          const value = active ? bandLevel(mirrored, points / 2, 0.6) : 0.03;
          const radius = baseRadius + value * Math.min(width, height) * 0.3;
          const angle = (index / points) * Math.PI * 2 - Math.PI / 2 + phase * 0.1;
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        context.globalAlpha = 0.3;
        context.fillStyle = colors.b;
        context.fill();
        context.globalAlpha = 1;
        context.lineWidth = 2;
        context.strokeStyle = gradient;
        context.stroke();
      } else if (mode === "pulse") {
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.46;
        let level = 0.04;
        if (active) {
          let sum = 0;
          for (let i = 0; i < 8; i += 1) sum += bandLevel(i, 32);
          level = sum / 8;
        }
        bass = Math.max(level, bass - 0.04);
        const rings = 4;
        for (let r = 0; r < rings; r += 1) {
          const t = (r + 1) / rings;
          const radius = maxRadius * t * (0.45 + 0.55 * bass) + Math.sin(phase * 2 + r) * 1.5;
          context.globalAlpha = 0.25 + 0.75 * (1 - t) * (0.4 + bass);
          context.lineWidth = 2 + (rings - r) * 0.8;
          context.strokeStyle = r % 2 === 0 ? colors.b : colors.c;
          context.beginPath();
          context.arc(centerX, centerY, Math.max(1, radius), 0, Math.PI * 2);
          context.stroke();
        }
        context.globalAlpha = 1;
        context.fillStyle = colors.a;
        context.beginPath();
        context.arc(centerX, centerY, Math.max(2, maxRadius * 0.12 * (0.6 + bass)), 0, Math.PI * 2);
        context.fill();
      } else if (mode === "hypno") {
        // Spirale hypnotique: bras tournants dont la vrille s'accentue avec les basses.
        const cx = width / 2;
        const cy = height / 2;
        const maxR = Math.hypot(cx, cy);
        const b = updateBass(active);
        const arms = 6;
        const colorList = palette();
        context.lineCap = "round";
        for (let arm = 0; arm < arms; arm += 1) {
          context.strokeStyle = colorList[arm % 3];
          context.lineWidth = 3 + b * 8;
          context.globalAlpha = 0.55 + b * 0.4;
          context.beginPath();
          for (let step = 0; step <= 70; step += 1) {
            const t = step / 70;
            const r = t * maxR;
            const angle = (arm / arms) * Math.PI * 2 + t * (4 + b * 6) + spin;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            if (step === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.stroke();
        }
        context.globalAlpha = 1;
      } else if (mode === "tunnel") {
        // Tunnel de carrés qui fonce vers le spectateur en tournant.
        const cx = width / 2;
        const cy = height / 2;
        const maxR = Math.hypot(cx, cy);
        const b = updateBass(active);
        const layers = 14;
        const colorList = palette();
        for (let i = layers; i >= 0; i -= 1) {
          const t = (i + ((spin * 2) % 1)) / layers;
          const size = Math.pow(t, 2.2) * maxR;
          if (size < 1) continue;
          const rotation = spin * 0.6 + t * (1.5 + b * 3);
          context.beginPath();
          for (let k = 0; k <= 4; k += 1) {
            const a = rotation + (k / 4) * Math.PI * 2 + Math.PI / 4;
            const x = cx + Math.cos(a) * size * (1 + b * 0.15);
            const y = cy + Math.sin(a) * size * (1 + b * 0.15);
            if (k === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.globalAlpha = Math.min(1, 0.25 + t);
          context.lineWidth = 1 + t * 5;
          context.strokeStyle = colorList[i % 3];
          context.stroke();
        }
        context.globalAlpha = 1;
      } else if (mode === "kaleido") {
        // Kaléidoscope: un motif réactif répété en symétrie rotative.
        const cx = width / 2;
        const cy = height / 2;
        const size = Math.min(width, height) * 0.48;
        const b = updateBass(active);
        const segments = 8;
        const colorList = palette();
        for (let seg = 0; seg < segments; seg += 1) {
          context.save();
          context.translate(cx, cy);
          context.rotate((seg / segments) * Math.PI * 2 + spin * 0.4);
          if (seg % 2) context.scale(1, -1);
          for (let i = 0; i < 10; i += 1) {
            const value = active ? bandLevel(i, 10, 0.6) : 0.05;
            const dist = (i / 10) * size;
            const radius = 2 + value * size * 0.16 + b * 4;
            context.globalAlpha = 0.35 + value * 0.65;
            context.fillStyle = colorList[i % 3];
            context.beginPath();
            context.arc(
              dist + Math.sin(spin + i) * 6,
              Math.sin(spin * 1.5 + i * 0.8) * size * 0.14 * (0.4 + value),
              radius,
              0,
              Math.PI * 2
            );
            context.fill();
          }
          context.restore();
        }
        context.globalAlpha = 1;
      } else if (mode === "vortex") {
        // Vortex: anneaux concentriques déformés par le spectre, en rotation inverse.
        const cx = width / 2;
        const cy = height / 2;
        const maxR = Math.min(width, height) * 0.48;
        const b = updateBass(active);
        const rings = 7;
        const points = 72;
        const colorList = palette();
        for (let r = 0; r < rings; r += 1) {
          const base = ((r + 1) / rings) * maxR;
          const direction = r % 2 ? -1 : 1;
          context.beginPath();
          for (let i = 0; i <= points; i += 1) {
            const index = i % points;
            const mirrored = index < points / 2 ? index : points - 1 - index;
            const value = active ? bandLevel(mirrored, points / 2, 0.6) : 0.04;
            const radius =
              base + value * maxR * 0.22 * ((r + 1) / rings) + Math.sin(index * 0.5 + spin * 3 * direction) * 2;
            const angle = (index / points) * Math.PI * 2 + spin * direction * (0.5 + r * 0.15);
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;
            if (i === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.closePath();
          context.globalAlpha = 0.5 + b * 0.5;
          context.lineWidth = 1.5 + b * 3;
          context.strokeStyle = colorList[r % 3];
          context.stroke();
        }
        context.globalAlpha = 1;
      } else if (mode === "starfield") {
        // Voyage à travers un champ d'étoiles, accéléré par les basses.
        const cx = width / 2;
        const cy = height / 2;
        const b = updateBass(active);
        if (!stars) {
          stars = Array.from({ length: 140 }, () => ({
            x: (Math.random() - 0.5) * 2,
            y: (Math.random() - 0.5) * 2,
            z: Math.random()
          }));
        }
        const colorList = palette();
        const speed = 0.006 + b * 0.05;
        const reach = Math.max(width, height) * 0.25;
        stars.forEach((star, index) => {
          const previous = star.z;
          star.z -= speed;
          if (star.z <= 0.02) {
            star.x = (Math.random() - 0.5) * 2;
            star.y = (Math.random() - 0.5) * 2;
            star.z = 1;
            return;
          }
          context.globalAlpha = Math.min(1, 1.1 - star.z);
          context.strokeStyle = colorList[index % 3];
          context.lineWidth = 1 + (1 - star.z) * 2.5;
          context.beginPath();
          context.moveTo(cx + (star.x / previous) * reach, cy + (star.y / previous) * reach);
          context.lineTo(cx + (star.x / star.z) * reach, cy + (star.y / star.z) * reach);
          context.stroke();
        });
        context.globalAlpha = 1;
      } else if (mode === "lissajous") {
        // Oscilloscope XY: la courbe dessinée par le signal contre lui-même décalé.
        const cx = width / 2;
        const cy = height / 2;
        const size = Math.min(width, height) * 0.45;
        updateBass(active);
        const samples = 256;
        const offset = 24;
        context.lineWidth = 2;
        context.strokeStyle = gradient;
        context.shadowColor = colors.b;
        context.shadowBlur = 8;
        context.beginPath();
        for (let i = 0; i < samples; i += 1) {
          let x;
          let y;
          if (active && timeData) {
            const at = Math.floor((i / samples) * (timeData.length - offset - 1));
            x = cx + (timeData[at] / 128 - 1) * size * 1.4;
            y = cy + (timeData[at + offset] / 128 - 1) * size;
          } else {
            x = cx + Math.sin(i * 0.05 + spin * 4) * size * 0.6;
            y = cy + Math.sin(i * 0.07 + spin * 3) * size * 0.4;
          }
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
        context.shadowBlur = 0;
      } else if (mode === "psycho") {
        // Psychose: spirales ondulantes et anneaux superposés, qui pulsent violemment avec les basses.
        const cx = width / 2;
        const cy = height / 2;
        const maxR = Math.hypot(cx, cy);
        const b = updateBass(active);
        const colorList = palette();
        for (let layer = 0; layer < 3; layer += 1) {
          const arms = 3 + layer * 2;
          const direction = layer % 2 ? -1 : 1;
          context.strokeStyle = colorList[layer];
          context.lineWidth = 2 + b * 10;
          context.globalAlpha = 0.35 + b * 0.5;
          for (let arm = 0; arm < arms; arm += 1) {
            context.beginPath();
            for (let step = 0; step <= 60; step += 1) {
              const t = step / 60;
              const wobble = Math.sin(t * 12 + spin * 4 * direction) * (6 + b * 40) * t;
              const r = t * maxR * (0.7 + b * 0.5) + wobble;
              const angle = (arm / arms) * Math.PI * 2 + direction * (t * (5 + b * 9) + spin * (1 + layer * 0.4));
              const x = cx + Math.cos(angle) * r;
              const y = cy + Math.sin(angle) * r;
              if (step === 0) context.moveTo(x, y);
              else context.lineTo(x, y);
            }
            context.stroke();
          }
        }
        for (let ring = 0; ring < 5; ring += 1) {
          const t = (ring + ((spin * 3) % 1)) / 5;
          context.globalAlpha = (1 - t) * (0.3 + b * 0.7);
          context.strokeStyle = colorList[ring % 3];
          context.lineWidth = 2 + b * 6;
          context.beginPath();
          context.arc(cx, cy, t * maxR * (0.6 + b * 0.6), 0, Math.PI * 2);
          context.stroke();
        }
        context.globalAlpha = 1;
      }
    };

    draw();
    const handleVisibility = () => {
      if (!document.hidden && isPlaying) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [getAnalyser, mode, isPlaying, colorTheme, customColor]);

  if (mode === "off") return null;
  return <canvas ref={canvasRef} className="audio-visualizer" aria-hidden="true" />;
}
