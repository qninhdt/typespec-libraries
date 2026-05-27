import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace GamePlatform.Content.Characters;

/** Non-player character belonging to a world. */
@table
model Npc {
  ...GamePlatform.Shared.WorldOwned;
  /** Name of the NPC - indexed for lookup. */
  @index
  @maxLength(200)
  name: string;

  /** Narrative description used in AI generation. */
  description: text;

  /** Optional structured traits used during prompt assembly. */
  traits?: jsonb;

  // ─── Composite Indexes ─────────────────
  worldIdName: composite<"worldId", "name">;
}
