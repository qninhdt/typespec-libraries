import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Content.Places;

/** Physical or virtual location available inside a world. */
@table
model Location is Demo.GamePlatform.Shared.WorldOwned {
  /** Name of the location - indexed for lookup. */
  @index
  @maxLength(200)
  name: string;

  /** Narrative description used in AI generation. */
  description: text;

  /** Bounding box or point stored as GeoJSON. */
  coordinates?: jsonb;

  // ─── Relationships ─────────────────
  @foreignKey("worldId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: Demo.GamePlatform.Worlds.World;
}
