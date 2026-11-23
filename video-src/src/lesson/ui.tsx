import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// Rebote al aparecer (0 → 1).
export const usePop = (delay = 0, damping = 12) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness: 150, mass: 0.8 } });
};

// Fondo de color con burbujas que flotan despacio, y fundido de entrada y salida de la escena.
export const SceneFrame: React.FC<{ color: string; duration: number; light?: boolean; children: React.ReactNode }> = ({
  color,
  duration,
  light,
  children,
}) => {
  const frame = useCurrentFrame();
  const bubbles = [
    { x: 8, y: 18, r: 140, s: 0.6 },
    { x: 88, y: 12, r: 90, s: -0.8 },
    { x: 78, y: 82, r: 170, s: 0.5 },
    { x: 14, y: 86, r: 70, s: -0.7 },
    { x: 50, y: 6, r: 50, s: 0.9 },
    { x: 95, y: 52, r: 60, s: -0.5 },
  ];
  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        background: light
          ? `linear-gradient(160deg, #ffffff 0%, color-mix(in srgb, ${color} 16%, #ffffff) 100%)`
          : `linear-gradient(140deg, ${color} 0%, ${color}cc 55%, #1e1b4b 140%)`,
        opacity: interpolate(frame, [0, 8, duration - 6, duration], [0, 1, 1, 0], clamp),
        overflow: 'hidden',
      }}
    >
      {bubbles.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.r,
            height: b.r,
            borderRadius: '50%',
            background: light ? `${color}1f` : 'rgba(255,255,255,0.12)',
            translate: `${Math.sin((frame + i * 40) / 45) * 18 * b.s}px ${Math.cos((frame + i * 30) / 50) * 22 * b.s}px`,
          }}
        />
      ))}
      {children}
    </AbsoluteFill>
  );
};

// Texto con **conceptos** resaltados por un rotulador que se dibuja poco a poco.
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
              fontWeight: 800,
              backgroundImage: `linear-gradient(${color}, ${color})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${grow}% 100%`,
              borderRadius: 10,
              padding: '0 6px',
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

export const Chip: React.FC<{ children: React.ReactNode; bg?: string; color?: string; size?: number }> = ({
  children,
  bg = 'rgba(255,255,255,0.22)',
  color = '#fff',
  size = 34,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignSelf: 'center',
      alignItems: 'center',
      gap: 12,
      padding: `${size * 0.3}px ${size * 0.7}px`,
      borderRadius: 999,
      background: bg,
      color,
      fontSize: size,
      fontWeight: 800,
    }}
  >
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
