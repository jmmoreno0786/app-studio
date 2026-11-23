import { CalculateMetadataFunction, Composition } from 'remotion';
import { LessonVideo, type LessonVideoProps } from './lesson/LessonVideo';
import { buildScenes, FPS, HEIGHT, WIDTH } from './lesson/build';
import { sampleLesson } from './lesson/sample';

// La duración depende de la lección: se calcula a partir de sus escenas.
const calculateMetadata: CalculateMetadataFunction<LessonVideoProps> = ({ props }) => {
  const { scenes, total } = buildScenes(props.lesson);
  return { durationInFrames: total, props: { ...props, scenes } };
};

export const MyComposition = () => {
  const lesson = sampleLesson();
  return (
    <Composition
      id="LessonVideo"
      component={LessonVideo}
      durationInFrames={buildScenes(lesson).total}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ lesson, scenes: buildScenes(lesson).scenes }}
      calculateMetadata={calculateMetadata}
    />
  );
};
