import React, { useId } from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { clamp, Wobble } from './ui';

export type Mood = 'talk' | 'happy' | 'think' | 'wave';

// "Búho profe": la mascota del vídeo. Dibujo original hecho con formas SVG.
// talkUntil: fotograma hasta el que mueve el pico (mientras habla la voz).
export const Owl: React.FC<{ size?: number; mood?: Mood; talkUntil?: number; delay?: number; flip?: boolean }> = ({
  size = 220, mood = 'talk', talkUntil = 0, delay = 0, flip = false,
}) => {
  const frame = useCurrentFrame();
  const id = useId().replace(/:/g, '');
  const f = frame - delay;
  const enter = interpolate(f, [0, 14], [0, 1], clamp);
  // Parpadeo cada 3 segundos aprox.
  const blink = f % 95 > 89 ? 0.12 : 1;
  // Mira a los lados de vez en cuando.
  const look = Math.sin(f / 37) * 4;
  // Pico: se abre y se cierra mientras habla.
  const talking = mood !== 'think' && f < talkUntil;
  const beak = talking ? Math.abs(Math.sin(f / 2.6)) * 9 : 0;
  // Saltitos de alegría y alas.
  const hop = mood === 'happy' ? Math.abs(Math.sin(f / 5)) * -22 : Math.sin(f / 18) * -3;
  const wingL = mood === 'happy' ? -35 + Math.sin(f / 3) * 25 : mood === 'wave' ? -10 : 0;
  const wingR = mood === 'happy' ? 35 - Math.sin(f / 3) * 25 : mood === 'wave' ? 30 + Math.sin(f / 4) * 30 : 0;
  const tilt = mood === 'think' ? -8 : Math.sin(f / 25) * 3;
  const stroke = '#3b2f2f';
  return (
    <svg
      width={size}
      height={size * 1.15}
      viewBox="0 0 200 230"
      style={{ overflow: 'visible', opacity: enter, translate: `0px ${(1 - enter) * 60 + hop}px`, scale: flip ? '-1 1' : '1', rotate: `${tilt}deg` }}
    >
      <defs><Wobble id={`o${id}`} scale={2.4} /></defs>
      <g filter={`url(#o${id})`} stroke={stroke} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round">
        {/* alas */}
        <ellipse cx={42} cy={140} rx={22} ry={46} fill="#8b5e3c" transform={`rotate(${15 + wingL} 52 110)`} />
        <ellipse cx={158} cy={140} rx={22} ry={46} fill="#8b5e3c" transform={`rotate(${-15 + wingR} 148 110)`} />
        {/* cuerpo y tripa */}
        <ellipse cx={100} cy={135} rx={66} ry={78} fill="#a0703f" />
        <ellipse cx={100} cy={158} rx={42} ry={48} fill="#f5e6c8" />
        <path d="M82,145 q6,6 12,0 M106,145 q6,6 12,0 M92,165 q6,6 12,0 M80,182 q6,6 12,0 M104,182 q6,6 12,0" fill="none" strokeWidth={3} />
        {/* orejas */}
        <path d="M50,78 L44,40 L74,62 Z" fill="#8b5e3c" />
        <path d="M150,78 L156,40 L126,62 Z" fill="#8b5e3c" />
        {/* ojos */}
        <g transform={`translate(0 ${(1 - blink) * 0})`}>
          <circle cx={74} cy={96} r={26} fill="#fff" />
          <circle cx={126} cy={96} r={26} fill="#fff" />
          <g transform={`translate(${look} 0)`}>
            <ellipse cx={76} cy={98} rx={11} ry={11 * blink} fill={stroke} />
            <ellipse cx={124} cy={98} rx={11} ry={11 * blink} fill={stroke} />
            <circle cx={80} cy={93} r={3.5 * blink} fill="#fff" stroke="none" />
            <circle cx={128} cy={93} r={3.5 * blink} fill="#fff" stroke="none" />
          </g>
        </g>
        {/* gafas */}
        <circle cx={74} cy={96} r={31} fill="none" strokeWidth={5} />
        <circle cx={126} cy={96} r={31} fill="none" strokeWidth={5} />
        <path d="M100,92 q0,-6 0,0" fill="none" strokeWidth={5} />
        {/* pico */}
        <path d={`M90,120 L110,120 L100,${134 - beak / 3} Z`} fill="#f59e0b" />
        {beak > 0.5 ? <path d={`M93,${124 + beak} L107,${124 + beak} L100,${134 + beak} Z`} fill="#f59e0b" /> : null}
        {/* patas */}
        <path d="M80,210 l-8,12 M80,210 l0,14 M80,210 l8,12 M120,210 l-8,12 M120,210 l0,14 M120,210 l8,12" fill="none" stroke="#f59e0b" strokeWidth={5} />
        {/* birrete */}
        <g transform={`rotate(${Math.sin(f / 20) * 3} 100 50)`}>
          <path d="M60,48 L100,30 L140,48 L100,64 Z" fill="#2b2b40" />
          <path d="M78,56 L78,70 Q100,80 122,70 L122,56" fill="#2b2b40" />
          <path d={`M138,48 q10,${14 + Math.sin(f / 6) * 3} 4,26`} fill="none" stroke="#f59e0b" strokeWidth={4} />
        </g>
        {mood === 'think' ? (
          <g fill="#fff">
            <circle cx={172} cy={52} r={6} />
            <circle cx={186} cy={34} r={9} />
          </g>
        ) : null}
      </g>
    </svg>
  );
};
