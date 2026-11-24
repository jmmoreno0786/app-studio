import React, { useId } from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import type { Scene } from './types';
import { colorFor } from './build';
import { Chip, DrawnDoodle, Highlighted, INK, RoughBox, SceneFrame, Scribble, Wobble, clamp, fitSize, shorten, usePop } from './ui';
import { Owl } from './mascot';

type P = { scene: Scene };

// Fotograma hasta el que el búho "habla" (aprox. lo que tarda la voz).
const talk = (scene: Scene) => Math.max(20, scene.duration - 36);

const center: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '70px 120px',
  gap: 22,
};

// Foto tipo polaroid pegada con celo, con zoom lento.
const Polaroid: React.FC<{ src: string; credit?: string; color: string; duration: number; maxH?: number; seed?: number }> = ({ src, credit, color, duration, maxH = 430, seed = 1 }) => {
  const frame = useCurrentFrame();
  const pop = usePop(6, 13);
  const tilt = seed % 2 ? 2.5 : -2.5;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: pop, scale: String(0.85 + pop * 0.15), rotate: `${tilt}deg` }}>
      <div style={{ position: 'relative', background: '#fff', padding: '14px 14px 40px', boxShadow: '6px 8px 0 rgba(43,43,64,0.18)', border: `3px solid ${INK}` }}>
        <div style={{ position: 'absolute', top: -16, left: '40%', width: 110, height: 30, background: `color-mix(in srgb, ${color} 35%, #fff59d)`, opacity: 0.8, rotate: '-6deg' }} />
        <div style={{ overflow: 'hidden', maxHeight: maxH, maxWidth: 470, display: 'flex' }}>
          <Img src={src} style={{ maxHeight: maxH, maxWidth: 470, objectFit: 'contain', scale: String(interpolate(frame, [0, duration], [1, 1.1], clamp)) }} />
        </div>
      </div>
      {credit ? <div style={{ fontSize: 22, color: '#64748b', rotate: `${-tilt}deg` }}>{credit}</div> : null}
    </div>
  );
};

// Panel visual de una escena: dibujo que se traza solo > foto > emoji en un círculo dibujado.
const Visual: React.FC<{ doodle?: string; src?: string; credit?: string; emoji?: string; color: string; duration: number; seed?: number }> = ({ doodle, src, credit, emoji, color, duration, seed = 1 }) => {
  const frame = useCurrentFrame();
  const pop = usePop(6, 11);
  const id = useId().replace(/:/g, '');
  if (doodle) {
    return (
      <div style={{ width: 500, height: 400, background: '#fff', borderRadius: 24, border: `3px dashed ${color}`, padding: 18, rotate: `${seed % 2 ? 1.5 : -1.5}deg`, boxShadow: '6px 8px 0 rgba(43,43,64,0.12)' }}>
        <DrawnDoodle svg={doodle} start={8} seconds={Math.min(4, Math.max(2, duration / 30 / 2.2))} />
      </div>
    );
  }
  if (src) return <Polaroid src={src} credit={credit} color={color} duration={duration} seed={seed} />;
  return (
    <div style={{ position: 'relative', width: 360, height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', scale: String(pop) }}>
      <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs><Wobble id={`c${id}`} scale={1.5} /></defs>
        <circle cx={50} cy={50} r={46} fill={`color-mix(in srgb, ${color} 15%, #ffffff)`} stroke={color} strokeWidth={2.5} filter={`url(#c${id})`} pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(frame, [4, 22], [1, 0], clamp)} />
      </svg>
      <div style={{ fontSize: emoji && emoji.length > 3 ? 120 : 180, lineHeight: 1, whiteSpace: 'nowrap', translate: `0px ${Math.sin(frame / 7) * 10}px`, rotate: `${Math.sin(frame / 11) * 8}deg` }}>{emoji || '📘'}</div>
    </div>
  );
};

export const IntroScene: React.FC<P> = ({ scene }) => {
  const { fps } = useVideoConfig();
  const d = scene.data;
  const c = colorFor(0);
  const title = usePop(10, 14);
  return (
    <SceneFrame color={c} duration={scene.duration}>
      <AbsoluteFill style={{ ...center, paddingLeft: 330, alignItems: 'flex-start', textAlign: 'left' }}>
        <div style={{ fontSize: 70, lineHeight: 1 }}>{d.emoji}</div>
        <div>
          <div style={{ fontSize: fitSize(d.title, 112, 92, 76), lineHeight: 1, color: c, scale: String(title), transformOrigin: 'left center' }}>{d.title}</div>
          <Scribble color="#f59e0b" delay={18} width={520} />
        </div>
        {d.subject ? <Chip bg={c}>{d.subject}</Chip> : null}
        {d.intro ? (
          <RoughBox color={c} delay={Math.round(1.1 * fps)} seed={3} style={{ padding: '18px 26px', maxWidth: 820 }}>
            <div style={{ fontSize: fitSize(d.intro, 46, 42, 38), lineHeight: 1.25 }}>
              <Highlighted text={d.intro} start={Math.round(1.6 * fps)} />
            </div>
          </RoughBox>
        ) : null}
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 80, bottom: 40 }}>
        <Owl size={230} mood="wave" talkUntil={talk(scene)} />
      </div>
    </SceneFrame>
  );
};

export const SectionTitleScene: React.FC<P> = ({ scene }) => {
  const frame = useCurrentFrame();
  const d = scene.data;
  const c = colorFor(scene.section);
  const id = useId().replace(/:/g, '');
  const title = usePop(12, 14);
  return (
    <SceneFrame color={c} duration={scene.duration}>
      <AbsoluteFill style={center}>
        <div style={{ position: 'relative', width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <defs><Wobble id={`n${id}`} scale={1.5} /></defs>
            <path d="M50,4 C78,3 97,22 96,50 C95,79 76,97 49,96 C21,95 3,77 4,49 C5,24 22,6 54,6" fill={`color-mix(in srgb, ${c} 18%, #fff)`} stroke={c} strokeWidth={4} filter={`url(#n${id})`} pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(frame, [2, 20], [1, 0], clamp)} />
          </svg>
          <div style={{ position: 'relative', fontSize: 120, color: c, lineHeight: 1 }}>{d.n}</div>
        </div>
        <div style={{ fontSize: 40, color: '#64748b' }}>Parte {d.n} de {d.of}</div>
        <div style={{ fontSize: fitSize(d.title, 104, 88, 72), lineHeight: 1.02, opacity: title, translate: `0px ${(1 - title) * 40}px`, maxWidth: 900 }}>{d.title}</div>
        <Scribble color={c} delay={22} width={360} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', right: 90, bottom: 40 }}>
        <Owl size={190} mood="wave" talkUntil={talk(scene)} flip />
      </div>
    </SceneFrame>
  );
};

// Texto en un recuadro dibujado + panel visual + búho pequeño hablando.
const TextWithVisual: React.FC<{ scene: Scene; text: string; chip: string; visual: React.ReactNode; size: [number, number, number] }> = ({ scene, text, chip, visual, size }) => {
  const { fps } = useVideoConfig();
  const c = colorFor(scene.section);
  return (
    <SceneFrame color={c} duration={scene.duration}>
      {chip ? (
        <div style={{ position: 'absolute', top: 36, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <Chip bg={c}>{shorten(chip, 48)}</Chip>
        </div>
      ) : null}
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '100px 60px 40px 120px', gap: 36 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, alignSelf: 'stretch', justifyContent: 'center' }}>
          <RoughBox color={c} delay={2} seed={scene.duration} style={{ padding: '26px 32px' }}>
            <div style={{ fontSize: fitSize(text, size[0], size[1], size[2]), lineHeight: 1.22 }}>
              <Highlighted text={text} start={Math.round(0.6 * fps)} />
            </div>
          </RoughBox>
          <div style={{ marginLeft: -40 }}>
            <Owl size={150} mood="talk" talkUntil={talk(scene)} delay={4} />
          </div>
        </div>
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{visual}</div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

export const BeatScene: React.FC<P> = ({ scene }) => {
  const d = scene.data;
  const c = colorFor(scene.section);
  return (
    <TextWithVisual
      scene={scene}
      text={d.text}
      chip={d.sectionTitle}
      size={[62, 54, 48]}
      visual={<Visual doodle={d.doodle} src={d.image?.src} credit={d.image?.credit} emoji={d.emoji} color={c} duration={scene.duration} seed={scene.duration} />}
    />
  );
};

export const SentenceScene: React.FC<P> = ({ scene }) => {
  const d = scene.data;
  const c = colorFor(scene.section);
  const visual = d.doodle
    ? <Visual doodle={d.doodle} color={c} duration={scene.duration} />
    : d.figure
      ? <Polaroid src={d.figure.src} color={c} duration={scene.duration} maxH={380} seed={d.k} />
      : <Owl size={300} mood="talk" talkUntil={talk(scene)} flip />;
  return <TextWithVisual scene={scene} text={d.text} chip={d.title} size={[54, 48, 42]} visual={visual} />;
};

export const FigureScene: React.FC<P> = ({ scene }) => {
  const d = scene.data;
  const c = colorFor(scene.section);
  const { fps } = useVideoConfig();
  return (
    <SceneFrame color={c} duration={scene.duration}>
      <AbsoluteFill style={{ ...center, padding: '40px 120px 40px 260px', gap: 16 }}>
        <Chip bg={c}>📷 Fíjate en la imagen</Chip>
        <Polaroid src={d.src} color={c} duration={scene.duration} maxH={400} />
        {d.caption ? (
          <div style={{ fontSize: fitSize(d.caption, 44, 40, 36), lineHeight: 1.2, maxWidth: 900 }}>
            <Highlighted text={d.caption} start={Math.round(0.7 * fps)} />
          </div>
        ) : null}
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 70, bottom: 40 }}>
        <Owl size={170} mood="talk" talkUntil={talk(scene)} />
      </div>
    </SceneFrame>
  );
};

// Bocadillo del búho (ejemplos y curiosidades).
const Bubble: React.FC<P & { heading: string; mood: 'think' | 'happy' }> = ({ scene, heading, mood }) => {
  const { fps } = useVideoConfig();
  const c = colorFor(scene.section);
  const text = scene.data.text;
  const box = usePop(10, 15);
  return (
    <SceneFrame color={c} duration={scene.duration}>
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '60px 80px 60px 110px', gap: 30 }}>
        <Owl size={280} mood={mood} talkUntil={talk(scene)} />
        <div style={{ flex: 1, opacity: box, translate: `${(1 - box) * 60}px 0px` }}>
          <RoughBox color={c} delay={8} seed={7} fill="#ffffff" style={{ padding: '30px 38px' }}>
            <div style={{ fontSize: 56, color: c, marginBottom: 8 }}>{heading}</div>
            <div style={{ fontSize: fitSize(text, 50, 46, 40), lineHeight: 1.25 }}>
              <Highlighted text={text} start={Math.round(0.9 * fps)} />
            </div>
          </RoughBox>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
export const ExampleScene: React.FC<P> = ({ scene }) => <Bubble scene={scene} heading="🧩 Para entenderlo" mood="think" />;
export const FunFactScene: React.FC<P> = ({ scene }) => <Bubble scene={scene} heading="💡 ¿Sabías que…?" mood="happy" />;

export const TimelineScene: React.FC<P> = ({ scene }) => {
  const frame = useCurrentFrame();
  const items: { date: string; event: string }[] = scene.data.items;
  const c = colorFor(scene.section);
  const id = useId().replace(/:/g, '');
  const step = (scene.duration - 30) / (items.length + 0.5);
  return (
    <SceneFrame color={c} duration={scene.duration}>
      <AbsoluteFill style={{ padding: '50px 120px 40px 130px' }}>
        <div style={{ fontSize: 76, color: c }}>🕰️ Línea del tiempo</div>
        <div style={{ position: 'relative', paddingLeft: 70, marginTop: 14 }}>
          <svg style={{ position: 'absolute', left: 12, top: 0, overflow: 'visible' }} width={30} height={items.length * 118}>
            <defs><Wobble id={`t${id}`} scale={1.5} /></defs>
            <path d={`M15,10 C10,${items.length * 40} 20,${items.length * 80} 15,${items.length * 112}`} fill="none" stroke={c} strokeWidth={7} strokeLinecap="round" filter={`url(#t${id})`} pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(frame, [10, scene.duration - 20], [1, 0], clamp)} />
          </svg>
          {items.map((it, i) => {
            const t = interpolate(frame, [15 + i * step, 15 + i * step + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
            return (
              <div key={i} style={{ position: 'relative', marginBottom: 16, opacity: t, translate: `${(1 - t) * 60}px 0px` }}>
                <div style={{ position: 'absolute', left: -66, top: 8, width: 34, height: 34, borderRadius: '50%', background: '#fff', border: `6px solid ${c}` }} />
                <div style={{ fontSize: 48, color: c, lineHeight: 1.05 }}>{shorten(it.date, 40)}</div>
                <div style={{ fontSize: 42, lineHeight: 1.1 }}>{shorten(it.event, 75)}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', right: 70, bottom: 30 }}>
        <Owl size={170} mood="talk" talkUntil={talk(scene)} flip />
      </div>
    </SceneFrame>
  );
};

export const CausesScene: React.FC<P> = ({ scene }) => {
  const frame = useCurrentFrame();
  const items: { cause: string; effect: string }[] = scene.data.items;
  const c = colorFor(scene.section);
  const id = useId().replace(/:/g, '');
  const step = (scene.duration - 30) / (items.length + 0.3);
  return (
    <SceneFrame color={c} duration={scene.duration}>
      <AbsoluteFill style={{ padding: '50px 90px 40px 130px', gap: 22, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 76, color: c }}>🔗 Causas y consecuencias</div>
        {items.map((it, i) => {
          const a = 12 + i * step;
          const arrow = interpolate(frame, [a + 14, a + 28], [1, 0], clamp);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <RoughBox color={c} delay={a} seed={i + 2} style={{ flex: 1, padding: '16px 22px' }}>
                <div style={{ fontSize: 40, lineHeight: 1.15 }}>{shorten(it.cause, 90)}</div>
              </RoughBox>
              <svg width={90} height={50} viewBox="0 0 90 50" style={{ overflow: 'visible' }}>
                <defs><Wobble id={`a${id}${i}`} scale={1.5} /></defs>
                <path d="M4,26 C30,20 55,30 80,24 M66,10 L82,24 L64,38" fill="none" stroke={c} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" filter={`url(#a${id}${i})`} pathLength={1} strokeDasharray={1} strokeDashoffset={arrow} />
              </svg>
              <RoughBox color={c} delay={a + 26} seed={i + 9} fill={`color-mix(in srgb, ${c} 12%, #fff)`} style={{ flex: 1, padding: '16px 22px' }}>
                <div style={{ fontSize: 40, lineHeight: 1.15 }}>{shorten(it.effect, 90)}</div>
              </RoughBox>
            </div>
          );
        })}
      </AbsoluteFill>
    </SceneFrame>
  );
};

export const GlossaryScene: React.FC<P> = ({ scene }) => {
  const frame = useCurrentFrame();
  const d = scene.data;
  const c = colorFor(scene.section);
  const card = usePop(4, 12);
  return (
    <SceneFrame color={c} duration={scene.duration}>
      <AbsoluteFill style={{ ...center, paddingLeft: 300 }}>
        <div style={{ fontSize: 40, color: '#64748b' }}>📒 Palabra clave</div>
        <div style={{ position: 'relative', background: '#fffef7', border: `3px solid ${INK}`, padding: '34px 50px 40px', maxWidth: 860, rotate: `${(1 - card) * 10 - 1.5}deg`, scale: String(0.8 + card * 0.2), opacity: card, boxShadow: '8px 10px 0 rgba(43,43,64,0.15)', backgroundImage: 'linear-gradient(180deg, transparent 64px, #f4a7a7 64px, #f4a7a7 67px, transparent 67px)' }}>
          <div style={{ position: 'absolute', top: -18, left: '45%', width: 120, height: 32, background: '#fde68a', opacity: 0.85, rotate: '4deg' }} />
          <div style={{ fontSize: fitSize(d.term, 96, 82, 70), color: c, lineHeight: 1 }}>{d.term}</div>
          <div style={{ fontSize: fitSize(d.def, 50, 46, 40), marginTop: 22, lineHeight: 1.2, opacity: interpolate(frame, [20, 32], [0, 1], clamp) }}>{shorten(d.def, 200)}</div>
        </div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 80, bottom: 40 }}>
        <Owl size={200} mood="talk" talkUntil={talk(scene)} />
      </div>
    </SceneFrame>
  );
};

const QuizBase: React.FC<P & { reveal: boolean }> = ({ scene, reveal }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = scene.data;
  const c = colorFor(scene.section);
  const id = useId().replace(/:/g, '');
  const left = Math.ceil((scene.duration - frame) / fps);
  const counting = !reveal && left <= 3 && left >= 1;
  return (
    <SceneFrame color={c} duration={scene.duration}>
      <AbsoluteFill style={{ padding: '40px 90px 40px 130px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex' }}><Chip bg={c}>🎯 Pregunta {d.n}</Chip></div>
        <div style={{ fontSize: fitSize(d.q, 62, 54, 46), lineHeight: 1.1 }}>{shorten(d.q, 160)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: d.options.length > 2 ? '1fr 1fr' : '1fr', gap: 18, marginRight: 220 }}>
          {d.options.map((o: string, k: number) => {
            const ok = reveal && k === d.correct;
            return (
              <div key={k} style={{ opacity: reveal && !ok ? 0.35 : 1, scale: ok ? String(interpolate(frame, [4, 12, 18], [1, 1.07, 1.03], clamp)) : '1' }}>
                <RoughBox color={ok ? '#16a34a' : c} delay={reveal ? 0 : 10 + k * 7} seed={k + 3} fill={ok ? '#dcfce7' : '#ffffff'} style={{ padding: '12px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: fitSize(o, 44, 40, 34) }}>
                    <span style={{ flex: '0 0 auto', width: 56, height: 56, borderRadius: '50%', border: `4px solid ${ok ? '#16a34a' : c}`, color: ok ? '#16a34a' : c, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{String.fromCharCode(65 + k)}</span>
                    {shorten(o, 70)}
                    {ok ? (
                      <svg width={60} height={50} viewBox="0 0 60 50" style={{ marginLeft: 'auto' }}>
                        <defs><Wobble id={`k${id}`} scale={1.5} /></defs>
                        <path d="M6,26 L22,42 L54,8" fill="none" stroke="#16a34a" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" filter={`url(#k${id})`} pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(frame, [6, 18], [1, 0], clamp)} />
                      </svg>
                    ) : null}
                  </div>
                </RoughBox>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', right: 50, bottom: 30, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {counting ? (
          <div style={{ width: 120, height: 120, borderRadius: '50%', border: `6px solid ${c}`, background: '#fff', color: c, fontSize: 84, display: 'flex', alignItems: 'center', justifyContent: 'center', scale: String(interpolate((frame % fps) / fps, [0, 0.25, 1], [1.25, 1, 0.92], clamp)), marginBottom: 6 }}>
            {left}
          </div>
        ) : null}
        <Owl size={reveal ? 210 : 180} mood={reveal ? 'happy' : 'think'} talkUntil={reveal ? talk(scene) : 0} flip />
      </div>
    </SceneFrame>
  );
};
export const QuizAskScene: React.FC<P> = ({ scene }) => <QuizBase scene={scene} reveal={false} />;
export const QuizRevealScene: React.FC<P> = ({ scene }) => <QuizBase scene={scene} reveal />;

export const OutroScene: React.FC<P> = ({ scene }) => {
  const frame = useCurrentFrame();
  const t = usePop(6, 10);
  const c = colorFor(5);
  const stars = Array.from({ length: 14 }).map((_, i) => {
    const ang = (i / 14) * Math.PI * 2;
    const dist = interpolate(frame, [0, 40], [0, 300 + (i % 3) * 60], { ...clamp, easing: Easing.out(Easing.cubic) });
    return { x: Math.cos(ang) * dist * 1.6, y: Math.sin(ang) * dist, r: (frame * (i % 2 ? 4 : -4)) % 360 };
  });
  return (
    <SceneFrame color={c} duration={scene.duration}>
      {stars.map((s, i) => (
        <div key={i} style={{ position: 'absolute', left: '50%', top: '45%', fontSize: 50, translate: `${s.x - 25}px ${s.y - 25}px`, rotate: `${s.r}deg`, opacity: interpolate(frame, [0, 10, scene.duration - 20, scene.duration], [0, 1, 1, 0], clamp) }}>⭐</div>
      ))}
      <AbsoluteFill style={{ ...center, gap: 10 }}>
        <Owl size={250} mood="happy" talkUntil={talk(scene)} />
        <div style={{ fontSize: 104, color: c, scale: String(t) }}>¡Tema completado!</div>
        <div style={{ opacity: interpolate(frame, [30, 45], [0, 1], clamp) }}>
          <Chip bg={c} size={42}>Siguiente: 🗺️ Esquema en blanco</Chip>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

export const SCENE_COMPONENTS: Record<Scene['kind'], React.FC<P>> = {
  intro: IntroScene,
  sectionTitle: SectionTitleScene,
  sentence: SentenceScene,
  beat: BeatScene,
  figure: FigureScene,
  example: ExampleScene,
  funFact: FunFactScene,
  timeline: TimelineScene,
  causes: CausesScene,
  glossary: GlossaryScene,
  quizAsk: QuizAskScene,
  quizReveal: QuizRevealScene,
  outro: OutroScene,
};
