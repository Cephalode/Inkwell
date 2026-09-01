/** Study mastery level for a knowledge-graph topic node.
 *  0 = Not started, 1 = In progress, 2 = Learned, 3 = Known */
export type Mastery = 0 | 1 | 2 | 3;

/**
 * Resolve the mastery level for a topic node id.
 * TODO: join srsStore card mastery via topic→deck linkage (orchestrator wires later).
 */
export function masteryForTopic(topicId: string): Mastery {
  void topicId; // TODO: join srsStore card mastery via topic→deck linkage (orchestrator wires later)
  return 0;
}
