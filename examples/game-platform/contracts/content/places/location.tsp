import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace GamePlatform.Content.Places;

/** Physical or virtual location available inside a world. */
@table
model Location {
  ...GamePlatform.Shared.WorldOwned;
  /** Name of the location - indexed for lookup. */
  @index
  @maxLength(200)
  name: string;

  /** Narrative description used in AI generation. */
  description: text;

  /** Bounding box or point stored as GeoJSON. */
  coordinates?: jsonb;
}
