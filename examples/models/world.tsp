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
@compositeIndex("idx_worlds_owner_created", "owner_id", "created_at")
@compositeIndex("idx_worlds_visibility_active", "visibility", "deleted_at")
model World {
  /** Unique identifier for the world */
  @key id: uuid;

  /**
   * Display name of the world - max 200 characters, indexed for lookup.
   * Referenced via lookup type in derived models (e.g. `worldName: World.name`).
   */
  @index("idx_worlds_name")
  @maxLength(200)
  name: string;

  /**
   * System prompt used to guide AI generation within this world.
   * Custom 'text' scalar - safe to target with \@@inputType(World.prompt::type, ...).
   */
  prompt: text;

  /** Visibility setting - controls who can discover and access this world */
  @index("idx_worlds_visibility")
  visibility: WorldVisibility = WorldVisibility.private;

  /** Optional JSON configuration for world-specific settings */
  settings?: jsonb;

  /** Timestamp when the world was created */
  @autoCreateTime
  @map("created_at")
  createdAt: utcDateTime;

  /** Timestamp of the last world update */
  @autoUpdateTime
  @map("updated_at")
  updatedAt?: utcDateTime;

  /** Soft-delete timestamp - null means the world is active */
  @softDelete
  @map("deleted_at")
  deletedAt?: utcDateTime;

  // ─── Relationships ─────────────────

  /** User who owns and manages this world - cascades deletion */
  @foreignKey("owner_id")
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
