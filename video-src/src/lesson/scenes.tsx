import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import type { Scene } from './types';
import { colorFor } from './build';
import { Chip, Highlighted, SceneFrame, clamp, fitSize, shorten, usePop } from './ui';

type P = { scene: Scene };

const center: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '90px 110px',
  gap: 26,
};

export const IntroScene: React.FC<P> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = scene.data;
  const emoji = usePop(4, 8);
  const title = usePop(14, 16);
  return (
    <SceneFrame color={colorFor(0)} duration={scene.duration}>
      <AbsoluteFill style={center}>
        <div style={{ fontSize: 170, scale: String(emoji), rotate: `${Math.sin(frame / 9) * 7}deg`, lineHeight: 1 }}>{d.emoji}</div>
        <div style={{ fontSize: fitSize(d.title, 96, 80, 68), fontWeight: 900, color: '#fff', lineHeight: 1.05, opacity: title, translate: `0px ${(1 - title) * 40}px`, textShadow: '0 6px 24px rgba(0,0,0,0.25)' }}>
          {d.title}
        </div>
        {d.subject ? <div style={{ opacity: interpolate(frame, [0.8 * fps, 1.2 * fps], [0, 1], clamp) }}><Chip>{d.subject}</Chip></div> : null}
        {d.intro ? (
          <div style={{ fontSize: 44, color: 'rgba(255,255,255,0.95)', maxWidth: 1000, lineHeight: 1.3, opacity: interpolate(frame, [1.3 * fps, 1.9 * fps], [0, 1], clamp) }}>
            <Highlighted text={shorten(d.intro, 200)} start={2 * fps} color="rgba(253,230,138,0.55)" />
          </div>
        ) : null}
      </AbsoluteFill>
    </SceneFrame>
  );
};

export const SectionTitleScene: React.FC<P> = ({ scene }) => {
  const d = scene.data;
  const num = usePop(2, 9);
  const title = usePop(10, 15);
  return (
    <SceneFrame color={colorFor(scene.section)} duration={scene.duration}>
      <AbsoluteFill style={center}>
        <div style={{ width: 200, height: 200, borderRadius: '50%', background: '#fff', color: colorFor(scene.section), fontSize: 120, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', scale: String(num), boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
          {d.n}
        </div>
        <Chip>Parte {d.n} de {d.of}</Chip>
        <div style={{ fontSize: fitSize(d.title, 96, 80, 68), fontWeight: 900, color: '#fff', lineHeight: 1.05, opacity: title, translate: `0px ${(1 - title) * 50}px` }}>{d.title}</div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

export const SentenceScene: React.FC<P> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = scene.data;
  const c = colorFor(scene.section);
  const card = usePop(3, 16);
  return (
    <SceneFrame color={c} duration={scene.duration} light>
      <div style={{ position: 'absolute', top: 56, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <Chip bg={c}>{shorten(d.title, 48)}</Chip>
      </div>
      <AbsoluteFill style={center}>
        <div style={{ background: '#fff', borderRadius: 36, padding: '44px 56px', boxShadow: `0 18px 50px ${c}40`, border: `4px solid ${c}`, fontSize: fitSize(d.text, 60, 52, 46), lineHeight: 1.35, color: '#1f2333', maxWidth: 1060, scale: String(0.9 + card * 0.1), opacity: card }}>
          <Highlighted text={d.text} start={0.5 * fps} />
        </div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', bottom: 56, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14 }}>
        {Array.from({ length: d.of }).map((_, i) => (
          <div key={i} style={{ width: 22, height: 22, borderRadius: '50%', background: i <= d.k ? c : `${c}40`, scale: i === d.k ? String(interpolate(frame, [0, 10], [0.4, 1.2], clamp)) : '1' }} />
        ))}
      </div>
    </SceneFrame>
  );
};

export const FigureScene: React.FC<P> = ({ scene }) => {
  const frame = useCurrentFrame();
  const durationInFrames = scene.duration;
  const d = scene.data;
  const c = colorFor(scene.section);
  const pop = usePop(2, 16);
  return (
    <SceneFrame color={c} duration={scene.duration} light>
      <AbsoluteFill style={{ ...center, padding: '50px 80px', gap: 20 }}>
        <Chip bg={c}>📷 Fíjate en la imagen</Chip>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: pop }}>
          <Img
            src={d.src}
            style={{ maxHeight: 420, maxWidth: 1000, objectFit: 'contain', borderRadius: 24, border: `5px solid ${c}`, background: '#fff', boxShadow: '0 16px 40px rgba(0,0,0,0.18)', scale: String(interpolate(frame, [0, durationInFrames], [1, 1.07], clamp)) }}
          />
        </div>
        {d.caption ? (
          <div style={{ fontSize: fitSize(d.caption, 44, 40, 36), color: '#1f2333', background: '#fff', borderRadius: 22, padding: '14px 28px', maxWidth: 1080, lineHeight: 1.3 }}>
            <Highlighted text={shorten(d.caption, 170)} start={20} />
          </div>
        ) : null}
      </AbsoluteFill>
    </SceneFrame>
  );
};

const Bubble: React.FC<P & { icon: string; heading: string; glow?: boolean }> = ({ scene, icon, heading, glow }) => {
  const frame = useCurrentFrame();
  const c = colorFor(scene.section);
  const iconPop = usePop(2, 7);
  const box = usePop(10, 15);
  const text = shorten(scene.data.text, 230);
  return (
    <SceneFrame color={c} duration={scene.duration}>
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '80px 90px', gap: 50 }}>
        <div style={{ fontSize: 190, lineHeight: 1, scale: String(iconPop), rotate: `${Math.sin(frame / 10) * 8}deg`, filter: glow ? `drop-shadow(0 0 ${30 + Math.sin(frame / 6) * 18}px #fde047)` : undefined }}>{icon}</div>
        <div style={{ flex: 1, background: '#fff', borderRadius: 40, padding: '40px 50px', opacity: box, translate: `${(1 - box) * 80}px 0px`, boxShadow: '0 18px 50px rgba(0,0,0,0.22)' }}>
          <div style={{ fontSize: 52, fontWeight: 900, color: c, marginBottom: 14 }}>{heading}</div>
          <div style={{ fontSize: fitSize(text, 50, 46, 40), lineHeight: 1.35, color: '#1f2333' }}>
            <Highlighted text={text} start={22} />
          </div>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
export const ExampleScene: React.FC<P> = ({ scene }) => <Bubble scene={scene} icon="🧩" heading="Para entenderlo" />;
export const FunFactScene: React.FC<P> = ({ scene }) => <Bubble scene={scene} icon="💡" heading="¿Sabías que…?" glow />;

export const TimelineScene: React.FC<P> = ({ scene }) => {
  const frame = useCurrentFrame();
  const items: { date: string; event: string }[] = scene.data.items;
  const c = colorFor(scene.section);
  const step = (scene.duration - 30) / (items.length + 0.5);
  return (
    <SceneFrame color={c} duration={scene.duration} light>
      <AbsoluteFill style={{ padding: '60px 110px' }}>
        <div style={{ fontSize: 72, fontWeight: 900, color: '#1f2333', marginBottom: 26 }}>🕰️ Línea del tiempo</div>
        <div style={{ position: 'relative', paddingLeft: 60 }}>
          <div style={{ position: 'absolute', left: 18, top: 10, width: 8, borderRadius: 4, background: c, height: `${interpolate(frame, [10, scene.duration - 20], [0, 100], clamp)}%` }} />
          {items.map((it, i) => {
            const t = interpolate(frame, [15 + i * step, 15 + i * step + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
            return (
              <div key={i} style={{ position: 'relative', marginBottom: 22, opacity: t, translate: `${(1 - t) * 60}px 0px` }}>
                <div style={{ position: 'absolute', left: -54, top: 10, width: 32, height: 32, borderRadius: '50%', background: c, border: '6px solid #fff', boxShadow: `0 0 0 3px ${c}` }} />
                <div style={{ fontSize: 44, fontWeight: 900, color: c }}>{shorten(it.date, 40)}</div>
                <div style={{ fontSize: 40, color: '#1f2333', lineHeight: 1.2 }}>{shorten(it.event, 70)}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

export const CausesScene: React.FC<P> = ({ scene }) => {
  const frame = useCurrentFrame();
  const items: { cause: string; effect: string }[] = scene.data.items;
  const c = colorFor(scene.section);
  const step = (scene.duration - 30) / (items.length + 0.3);
  return (
    <SceneFrame color={c} duration={scene.duration} light>
      <AbsoluteFill style={{ padding: '60px 90px', gap: 26, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 72, fontWeight: 900, color: '#1f2333' }}>🔗 Causas y consecuencias</div>
        {items.map((it, i) => {
          const a = interpolate(frame, [12 + i * step, 24 + i * step], [0, 1], clamp);
          const arrow = interpolate(frame, [24 + i * step, 36 + i * step], [0, 1], clamp);
          const b = interpolate(frame, [34 + i * step, 46 + i * step], [0, 1], clamp);
          const box: React.CSSProperties = { flex: 1, background: '#fff', borderRadius: 26, padding: '20px 26px', fontSize: 38, lineHeight: 1.25, color: '#1f2333', border: `4px solid ${c}` };
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ ...box, opacity: a }}>{shorten(it.cause, 90)}</div>
              <div style={{ fontSize: 70, color: c, fontWeight: 900, scale: `${arrow} 1` }}>➜</div>
              <div style={{ ...box, opacity: b, background: `${c}18` }}>{shorten(it.effect, 90)}</div>
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
  const flip = interpolate(frame, [4, 18], [90, 0], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  return (
    <SceneFrame color={c} duration={scene.duration}>
      <AbsoluteFill style={center}>
        <Chip>📒 Palabra clave</Chip>
        <div style={{ background: '#fff', borderRadius: 40, padding: '46px 60px', maxWidth: 1040, rotate: `0 1 0 ${flip}deg`, boxShadow: '0 18px 50px rgba(0,0,0,0.25)' }}>
          <div style={{ fontSize: fitSize(d.term, 100, 84, 70), fontWeight: 900, color: c, lineHeight: 1.05 }}>{d.term}</div>
          <div style={{ fontSize: fitSize(d.def, 50, 46, 40), color: '#1f2333', marginTop: 20, lineHeight: 1.3, opacity: interpolate(frame, [22, 34], [0, 1], clamp) }}>{shorten(d.def, 200)}</div>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

const QuizBase: React.FC<P & { reveal: boolean }> = ({ scene, reveal }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = scene.data;
  const c = colorFor(scene.section);
  const left = Math.ceil((scene.duration - frame) / fps);
  const counting = !reveal && left <= 3 && left >= 1;
  return (
    <SceneFrame color={c} duration={scene.duration}>
      <AbsoluteFill style={{ padding: '56px 90px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ display: 'flex' }}><Chip>🎯 Pregunta {d.n}</Chip></div>
        <div style={{ fontSize: fitSize(d.q, 56, 50, 44), fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>{shorten(d.q, 160)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: d.options.length > 2 ? '1fr 1fr' : '1fr', gap: 20 }}>
          {d.options.map((o: string, k: number) => {
            const appear = interpolate(frame, [reveal ? 0 : 12 + k * 8, reveal ? 1 : 24 + k * 8], [0, 1], clamp);
            const ok = reveal && k === d.correct;
            const okPop = reveal ? interpolate(frame, [4, 12, 18], [1, 1.08, 1.03], clamp) : 1;
            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 18, background: ok ? '#dcfce7' : '#fff', border: `5px solid ${ok ? '#16a34a' : 'transparent'}`, borderRadius: 26, padding: '18px 24px', fontSize: fitSize(o, 42, 38, 34), color: '#1f2333', opacity: reveal && !ok ? 0.35 : appear, scale: ok ? String(okPop) : '1' }}>
                <span style={{ flex: '0 0 auto', width: 62, height: 62, borderRadius: 18, background: ok ? '#16a34a' : c, color: '#fff', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ok ? '✓' : String.fromCharCode(65 + k)}</span>
                {shorten(o, 70)}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      {counting ? (
        <div style={{ position: 'absolute', right: 60, bottom: 50, width: 150, height: 150, borderRadius: '50%', background: '#fff', color: c, fontSize: 96, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', scale: String(interpolate((frame % fps) / fps, [0, 0.25, 1], [1.25, 1, 0.92], clamp)) }}>
          {left}
        </div>
      ) : null}
      {reveal ? (
        <div style={{ position: 'absolute', right: 70, bottom: 50, fontSize: 120, scale: String(interpolate(frame, [0, 10], [0, 1], { ...clamp, easing: Easing.out(Easing.back(3)) })) }}>🎉</div>
      ) : null}
    </SceneFrame>
  );
};
export const QuizAskScene: React.FC<P> = ({ scene }) => <QuizBase scene={scene} reveal={false} />;
export const QuizRevealScene: React.FC<P> = ({ scene }) => <QuizBase scene={scene} reveal />;

export const OutroScene: React.FC<P> = ({ scene }) => {
  const frame = useCurrentFrame();
  const t = usePop(6, 10);
  const stars = Array.from({ length: 16 }).map((_, i) => {
    const ang = (i / 16) * Math.PI * 2;
    const dist = interpolate(frame, [0, 40], [0, 330 + (i % 3) * 60], { ...clamp, easing: Easing.out(Easing.cubic) });
    return { x: Math.cos(ang) * dist * 1.5, y: Math.sin(ang) * dist, r: (frame * (i % 2 ? 4 : -4)) % 360 };
  });
  return (
    <SceneFrame color={colorFor(5)} duration={scene.duration}>
      {stars.map((s, i) => (
        <div key={i} style={{ position: 'absolute', left: '50%', top: '50%', fontSize: 54, translate: `${s.x - 27}px ${s.y - 27}px`, rotate: `${s.r}deg`, opacity: interpolate(frame, [0, 10, scene.duration - 20, scene.duration], [0, 1, 1, 0], clamp) }}>
          ⭐
        </div>
      ))}
      <AbsoluteFill style={center}>
        <div style={{ fontSize: 150, scale: String(t) }}>🏆</div>
        <div style={{ fontSize: 100, fontWeight: 900, color: '#fff', scale: String(t) }}>¡Tema completado!</div>
        <div style={{ opacity: interpolate(frame, [30, 45], [0, 1], clamp) }}>
          <Chip size={44}>Siguiente: 🗺️ Esquema en blanco</Chip>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

export const SCENE_COMPONENTS: Record<Scene['kind'], React.FC<P>> = {
  intro: IntroScene,
  sectionTitle: SectionTitleScene,
  sentence: SentenceScene,
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
