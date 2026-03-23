import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Content.Taxonomy;

/**
 * Tag used to classify and filter content pool entries.
 * The (world_id, name) pair is unique per world.
 */
@table
model Tag is Demo.GamePlatform.Shared.WorldOwned {
  /** Tag name - unique within a world. */
  @maxLength(100)
  name: string;

  /** Category used to group related tags. */
  @index
  @maxLength(50)
  category: string;

  // ─── Composite Unique Constraints ─────────────────
  @unique
  worldIdName: composite<"worldId", "name">;

  // ─── Relationships ─────────────────
  @foreignKey("worldId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: Demo.GamePlatform.Worlds.World;
}
