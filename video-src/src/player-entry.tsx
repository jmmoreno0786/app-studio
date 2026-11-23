// Punto de entrada que se empaqueta en ../lesson-video.js para usarlo dentro de App Studio.
// Expone window.AppStudioVideo.mount(elemento, lección, opciones).
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Player, type PlayerRef } from '@remotion/player';
import { LessonVideo } from './lesson/LessonVideo';
import { buildScenes, FPS, HEIGHT, sceneStarts, WIDTH } from './lesson/build';
import type { LessonData } from './lesson/types';

type MountOptions = { onReady?: (player: PlayerRef) => void };

const Wrapper: React.FC<{ lesson: LessonData; scenes: ReturnType<typeof buildScenes>['scenes']; total: number; onReady?: (p: PlayerRef) => void }> = ({
  lesson,
  scenes,
  total,
  onReady,
}) => {
  const ref = useRef<PlayerRef>(null);
  useEffect(() => {
    if (ref.current && onReady) onReady(ref.current);
  }, [onReady]);
  return (
    <Player
      ref={ref}
      component={LessonVideo}
      inputProps={{ lesson, scenes }}
      durationInFrames={total}
      compositionWidth={WIDTH}
      compositionHeight={HEIGHT}
      fps={FPS}
      controls
      clickToPlay
      allowFullscreen
      doubleClickToFullscreen
      spaceKeyToPlayOrPause
      showVolumeControls={false}
      acknowledgeRemotionLicense
      style={{ width: '100%', aspectRatio: `${WIDTH} / ${HEIGHT}`, borderRadius: 16, overflow: 'hidden' }}
    />
  );
};

function mount(el: HTMLElement, lesson: LessonData, opts: MountOptions = {}) {
  const { scenes, total } = buildScenes(lesson);
  const root = createRoot(el);
  root.render(<Wrapper lesson={lesson} scenes={scenes} total={total} onReady={opts.onReady} />);
  return { scenes, starts: sceneStarts(scenes), total, fps: FPS, unmount: () => root.unmount() };
}

declare global {
  interface Window {
    AppStudioVideo: { mount: typeof mount };
  }
}
window.AppStudioVideo = { mount };
