import type { CSSProperties } from 'react';
import type { TopicMap, TopicNode } from '../../types/topicMap';
import { courseHue } from '../../utils/buildTopicMap';

/** Solid round chip for a topic: a shared topic shows its courses as pie slices. */
export function courseIdsDot(map: TopicMap, topic: TopicNode): string {
  if (topic.courseIds.length <= 1) return courseHue(map, topic.courseId);
  const step = 100 / topic.courseIds.length;
  return `conic-gradient(${topic.courseIds
    .map((cid, i) => `${courseHue(map, cid)} ${i * step}% ${(i + 1) * step}%`)
    .join(', ')})`;
}

/** Standard round swatch used across the topic map UI. */
export const dot =
  (hue: string, size: number): CSSProperties => ({
    width: size,
    height: size,
    borderRadius: '50%',
    background: hue,
    display: 'inline-block',
    flex: 'none',
  });
