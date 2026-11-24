import React, { useEffect, useId, useMemo, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

// Letra a mano (Patrick Hand, licencia OFL). La URL la pone la app o Remotion Studio.
export const FONT = '"Patrick Hand", "Comic Sans MS", "Chalkboard SE", system-ui, sans-serif';
export const INK = '#2b2b40';
export const PAPER = '#fffbf2';

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// Carga la fuente antes de mostrar el vídeo (para que no cambie de letra a mitad).
export const useHandFont = (url?: string) => {
  const [handle] = useState(() => (url ? delayRender('Cargando la letra a mano') : null));
  useEffect(() => {
    if (!url || handle === null) return;
    const done = () => continueRender(handle);
    try {
      const face = new FontFace('Patrick Hand', `url(${url})`);
      face.load().then((f) => { document.fonts.add(f); done(); }).catch(done);
    } catch (e) {
      done();
    }
  }, [url, handle]);
};

// Rebote al aparecer (0 → 1).
export const usePop = (delay = 0, damping = 12) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness: 150, mass: 0.8 } });
};

// Número pseudoaleatorio estable (para que los "garabatos" sean siempre iguales).
export const rnd = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Filtro de "línea temblorosa": cambia cada pocos fotogramas, como en los dibujos animados hechos a mano.
export const Wobble: React.FC<{ id: string; scale?: number }> = ({ id, scale = 2.5 }) => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 5) % 4;
  return (
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed={seed} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale={scale} xChannelSelector="R" yChannelSelector="G" />
    </filter>
  );
};

// Garabatos decorativos en las esquinas del papel.
const Doodles: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  const id = useId().replace(/:/g, '');
  const items = [
    { x: 1120, y: 70, kind: 'star', r: 0 },
    { x: 150, y: 640, kind: 'spiral', r: 0 },
    { x: 1190, y: 600, kind: 'star', r: 20 },
    { x: 40, y: 60, kind: 'dots', r: 0 },
  ];
  return (
    <svg width="1280" height="720" viewBox="0 0 1280 720" style={{ position: 'absolute', inset: 0 }}>
      <defs><Wobble id={`w${id}`} scale={2} /></defs>
      <g filter={`url(#w${id})`} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" opacity={0.55}>
        {items.map((it, i) => {
          const rot = Math.sin((frame + i * 30) / 40) * 8 + it.r;
          if (it.kind === 'star') {
            return <path key={i} transform={`translate(${it.x} ${it.y}) rotate(${rot})`} d="M0,-26 L7,-8 L26,-8 L11,4 L17,24 L0,12 L-17,24 L-11,4 L-26,-8 L-7,-8 Z" />;
          }
          if (it.kind === 'spiral') {
            return <path key={i} transform={`translate(${it.x} ${it.y}) rotate(${rot * 2})`} d="M0,0 c6,-6 14,0 10,8 c-4,10 -18,8 -20,-4 c-2,-14 14,-22 26,-14 c12,8 10,28 -4,32" />;
          }
          return (
            <g key={i} transform={`translate(${it.x} ${it.y})`}>
              <circle cx={0} cy={0} r={4} fill={color} />
              <circle cx={18} cy={6} r={3} fill={color} />
              <circle cx={8} cy={20} r={5} fill={color} />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

// Fondo de libreta (papel con rayas y margen) con garabatos, y fundido de entrada y salida.
export const SceneFrame: React.FC<{ color: string; duration: number; light?: boolean; children: React.ReactNode }> = ({ color, duration, children }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        color: INK,
        backgroundColor: PAPER,
        backgroundImage: `linear-gradient(90deg, transparent 88px, #f4a7a7 88px, #f4a7a7 91px, transparent 91px), repeating-linear-gradient(180deg, transparent 0px, transparent 47px, #d7e3f3 47px, #d7e3f3 49px)`,
        opacity: interpolate(frame, [0, 8, duration - 6, duration], [0, 1, 1, 0], clamp),
        overflow: 'hidden',
      }}
    >
      <Doodles color={color} />
      {children}
    </AbsoluteFill>
  );
};

// Recuadro con borde dibujado a mano que se va trazando.
export const RoughBox: React.FC<{ color: string; delay?: number; fill?: string; style?: React.CSSProperties; seed?: number; children: React.ReactNode }> = ({
  color, delay = 0, fill = '#ffffff', style, seed = 1, children,
}) => {
  const frame = useCurrentFrame();
  const id = useId().replace(/:/g, '');
  const j = (k: number) => (rnd(seed * 10 + k) - 0.5) * 2.2;
  const d = `M${1 + j(1)},${2 + j(2)} C30,${0.5 + j(3)} 70,${2.5 + j(4)} ${99 + j(5)},${1.5 + j(6)} C${100 + j(7)},30 ${98.5 + j(8)},70 ${99 + j(9)},${98 + j(10)} C70,${99.5 + j(11)} 30,${97.5 + j(12)} ${1.5 + j(13)},${99 + j(14)} C${0 + j(15)},70 ${2 + j(16)},30 ${1 + j(1)},${2 + j(2)}`;
  const draw = interpolate(frame, [delay, delay + 18], [1, 0], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const appear = interpolate(frame, [delay, delay + 8], [0, 1], clamp);
  return (
    <div style={{ position: 'relative', ...style }}>
      <div style={{ position: 'absolute', inset: 0, background: fill, borderRadius: 18, opacity: appear * 0.95, rotate: `${(rnd(seed) - 0.5) * 1.6}deg` }} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: -6, width: 'calc(100% + 12px)', height: 'calc(100% + 12px)', overflow: 'visible' }}>
        <defs><Wobble id={`b${id}`} scale={1.2} /></defs>
        <path d={d} fill="none" stroke={color} strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={draw} filter={`url(#b${id})`} />
      </svg>
      <div style={{ position: 'relative', opacity: appear }}>{children}</div>
    </div>
  );
};

// Texto con **conceptos** resaltados con rotulador fluorescente, un poco torcido como hecho a mano.
export const Highlighted: React.FC<{ text: string; start: number; color?: string }> = ({ text, start, color = '#fde68a' }) => {
  const frame = useCurrentFrame();
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  let mark = 0;
  return (
    <>
      {parts.map((p, i) => {
        if (!p.startsWith('**')) return <React.Fragment key={i}>{p}</React.Fragment>;
        const k = mark++;
        const grow = interpolate(frame, [start + k * 8, start + k * 8 + 14], [0, 100], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <span
            key={i}
            style={{
              backgroundImage: `linear-gradient(100deg, transparent 2%, ${color} 4%, ${color} 96%, transparent 98%)`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${grow}% 78%`,
              backgroundPosition: '0 70%',
              padding: '0 4px',
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone',
            }}
          >
            {p.slice(2, -2)}
          </span>
        );
      })}
    </>
  );
};

// Subrayado dibujado a mano que se traza bajo un título.
export const Scribble: React.FC<{ color: string; delay: number; width: number }> = ({ color, delay, width }) => {
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [delay, delay + 16], [1, 0], clamp);
  return (
    <svg width={width} height={26} viewBox="0 0 300 26" preserveAspectRatio="none" style={{ display: 'block', margin: '0 auto' }}>
      <path d="M4,16 C60,6 120,22 180,12 C220,6 260,14 296,10" fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={draw} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export const Chip: React.FC<{ children: React.ReactNode; bg?: string; color?: string; size?: number }> = ({ children, bg = '#6366f1', color = '#fff', size = 34 }) => (
  <div style={{ display: 'inline-flex', alignSelf: 'center', alignItems: 'center', gap: 12, padding: `${size * 0.2}px ${size * 0.7}px`, borderRadius: 999, background: bg, color, fontSize: size, rotate: '-1.5deg', boxShadow: '3px 3px 0 rgba(43,43,64,0.25)' }}>
    {children}
  </div>
);

// Tamaño de letra según la longitud del texto, para que quepa en pantalla.
export const fitSize = (text: string, big: number, mid: number, small: number) => {
  const n = String(text).replace(/\*\*/g, '').length;
  return n > 190 ? small : n > 120 ? mid : big;
};

export const shorten = (t: string, n: number) => {
  const s = String(t || '');
  if (s.length <= n) return s;
  const cut = s.lastIndexOf(' ', n);
  return `${s.slice(0, cut > 40 ? cut : n)}…`;
};

// ---------- Dibujos de Claude (SVG) que se trazan solos ----------
const SHAPES = ['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'];
const ALLOWED_TAGS = new Set(['svg', 'g', 'text', 'tspan', ...SHAPES]);
const ALLOWED_ATTRS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'transform', 'viewBox', 'font-size', 'text-anchor', 'opacity', 'fill-opacity']);

// Limpia el SVG: solo formas simples, sin scripts, enlaces ni estilos.
export function sanitizeSvg(src: string): { html: string; count: number } | null {
  if (!src || src.length > 12000 || typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
  let i = 0;
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (!ALLOWED_TAGS.has(child.nodeName)) { child.remove(); continue; }
      for (const a of Array.from(child.attributes)) if (!ALLOWED_ATTRS.has(a.name)) child.removeAttribute(a.name);
      if (SHAPES.includes(child.nodeName)) {
        child.setAttribute('pathLength', '1');
        child.setAttribute('style', `--i:${i++}`);
        if (!child.getAttribute('stroke')) child.setAttribute('stroke', INK);
        if (!child.getAttribute('stroke-width')) child.setAttribute('stroke-width', '3');
      }
      walk(child);
    }
  };
  for (const a of Array.from(root.attributes)) if (!ALLOWED_ATTRS.has(a.name)) root.removeAttribute(a.name);
  if (!root.getAttribute('viewBox')) root.setAttribute('viewBox', '0 0 400 300');
  walk(root);
  if (!i) return null;
  root.setAttribute('width', '100%');
  root.setAttribute('height', '100%');
  root.setAttribute('class', 'doodle');
  return { html: new XMLSerializer().serializeToString(root), count: i };
}

// Muestra el dibujo trazándolo línea a línea; el relleno aparece al final.
export const DrawnDoodle: React.FC<{ svg: string; start?: number; seconds?: number; style?: React.CSSProperties }> = ({ svg, start = 6, seconds = 2.6, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const id = useId().replace(/:/g, '');
  const clean = useMemo(() => sanitizeSvg(svg), [svg]);
  if (!clean) return null;
  const p = interpolate(frame, [start, start + seconds * fps], [0, 1], clamp);
  const n = clean.count;
  const css = `
    .dd${id} svg .doodle, .dd${id} .doodle { overflow: visible; }
    .dd${id} [style*="--i"] {
      stroke-dasharray: 1;
      stroke-dashoffset: clamp(0, calc(1 - (${p} * ${n + 1} - var(--i))), 1);
      fill-opacity: clamp(0, calc((${p} * ${n + 1} - var(--i) - 0.6) * 1.5), 1);
      stroke-linecap: round; stroke-linejoin: round;
    }`;
  return (
    <div className={`dd${id}`} style={{ position: 'relative', width: '100%', height: '100%', filter: `url(#dw${id})`, ...style }}>
      <style>{css}</style>
      <svg width="0" height="0" style={{ position: 'absolute' }}><defs><Wobble id={`dw${id}`} scale={2.2} /></defs></svg>
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: clean.html }} />
    </div>
  );
};
