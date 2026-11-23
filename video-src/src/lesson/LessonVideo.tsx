import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { LessonData, Scene } from './types';
import { SCENE_COMPONENTS } from './scenes';

export type LessonVideoProps = { lesson: LessonData; scenes: Scene[] };

// El vídeo de una lección: una escena detrás de otra, con la duración calculada para cada una.
export const LessonVideo: React.FC<LessonVideoProps> = ({ scenes }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#1e1b4b' }}>
      <Series>
        {scenes.map((scene, i) => {
          const Comp = SCENE_COMPONENTS[scene.kind];
          return (
            <Series.Sequence key={i} name={`${i + 1}. ${scene.kind}`} durationInFrames={scene.duration}>
              <Comp scene={scene} />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
