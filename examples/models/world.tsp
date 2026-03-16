import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace WorldCard.Models;

// ─── World Models ────────────────────────────────────────────────────────────

/**
 * Visibility setting for a world
 */
enum WorldVisibility {
  private: "private",
  unlisted: "unlisted",
  public: "public",
}

/** A game world created by a user - contains story trees and content pools */
@table
model World is Timestamped {
  /**
   * Display name of the world - max 200 characters, indexed for lookup.
   * Referenced via lookup type in derived models (e.g. `worldName: World.name`).
   */
  @index
  @maxLength(200)
  name: string;

  /**
   * System prompt used to guide AI generation within this world.
   * Custom 'text' scalar - safe to target with `@@inputType(World.prompt::type, ...)`.
   */
  prompt: text;

  /** Visibility setting - controls who can discover and access this world */
  @index
  visibility: WorldVisibility = WorldVisibility.private;

  /** Optional JSON configuration for world-specific settings */
  settings?: jsonb;

  // ─── Composite Indexes ─────────────────
  ownerIdCreatedAt: composite<"ownerId", "createdAt">;
  visibilityDeletedAt: composite<"visibility", "deletedAt">;

  // ─── Relationships ─────────────────

  @index
  ownerId: uuid;

  /** User who owns and manages this world - cascades deletion */
  @foreignKey("ownerId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  owner: User;

  /** Story tree nodes belonging to this world */
  @mappedBy("world")
  storyNodes?: StoryNode[];

  /** NPCs defined in this world */
  @mappedBy("world")
  npcs?: Npc[];

  /** Locations defined in this world */
  @mappedBy("world")
  locations?: Location[];

  /** Events defined in this world */
  @mappedBy("world")
  gameEvents?: GameEvent[];

  /** Tags used to classify content in this world */
  @mappedBy("world")
  tags?: Tag[];
}
