import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Content.Stories;

/**
 * Node in a lazily-generated story tree.
 * Stores the cumulative content-pool IDs inherited from all ancestor nodes.
 */
@table
model StoryNode is Demo.GamePlatform.Shared.WorldOwned {
  /** Depth of this node in the story tree - root is 0. */
  @index
  depth: int32 = 0;

  /** Content pool inherited from all ancestors. */
  pool: jsonb;

  /** Content introduced by this specific node. */
  @map("new_content")
  newContent: jsonb;

  /** IDs of lazily-expanded child nodes. */
  @map("child_ids")
  childIds: jsonb;

  // ─── Composite Indexes ─────────────────
  worldIdDepth: composite<"worldId", "depth">;

  // ─── Explicit FK Fields ─────────────────
  parentId?: uuid;

  // ─── Relationships ─────────────────
  /** Owning world. */
  @foreignKey("worldId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: Demo.GamePlatform.Worlds.World;

  /** Parent story node. */
  @foreignKey("parentId")
  @onDelete("CASCADE")
  parent?: StoryNode;

  /** Child nodes reachable from this node. */
  @mappedBy("parent")
  children?: StoryNode[];
}
