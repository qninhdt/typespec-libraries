import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace GamePlatform.Content.Events;

/** Event rule that mutates world state when its conditions are met. */
@table
model GameEvent {
  ...GamePlatform.Shared.WorldOwned;
  /** Name of the event - indexed for lookup. */
  @index
  @maxLength(200)
  name: string;

  /** Narrative description used in AI generation. */
  description: text;

  /** Predicate expression evaluated at runtime. */
  conditions?: jsonb;

  /** Mutations applied when the event fires. */
  effects?: jsonb;
}
