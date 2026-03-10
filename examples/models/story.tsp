import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace WorldCard.Models;

// ─── Story Tree Models ───────────────────────────────────────────────────────

/**
 * Node in a lazily-generated story tree.
 * Stores the cumulative content-pool IDs inherited from all ancestor nodes.
 */
@table("story_nodes")
@compositeIndex("idx_story_nodes_world_depth", "world_id", "depth")
model StoryNode {
  /** Unique identifier for the story node */
  @id id: uuid;

  /** Depth of this node in the story tree - root is 0 */
  @index("idx_story_nodes_depth")
  depth: int32 = 0;

  /** Cumulative pool - NPC, tag, event, and location IDs from all ancestors */
  pool: jsonb;

  /** Content introduced at this specific node */
  @map("new_content")
  newContent: jsonb;

  /** IDs of lazily-expanded child nodes */
  @map("child_ids")
  childIds: jsonb;

  /** Timestamp when this node was created */
  @autoCreateTime @map("created_at") createdAt: utcDateTime;

  // ─── Relationships ─────────────────

  /** World this story node belongs to - cascades deletion */
  @foreignKey("worlds", "id")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: World;

  /** Parent node in the story tree - null for root nodes */
  @foreignKey("story_nodes", "id")
  @onDelete("SET NULL")
  parent?: StoryNode;
}

// ─── Content Pool Entities ───────────────────────────────────────────────────

/**
 * Non-player character belonging to a world
 */
@table("npcs")
@compositeIndex("idx_npcs_world_name", "world_id", "name")
model Npc {
  /** Unique identifier for the NPC */
  @id id: uuid;

  /** Name of the NPC - indexed for lookup, max 200 characters */
  @index("idx_npcs_name")
  @maxLength(200)
  name: string;

  /** Narrative description used in AI generation */
  description: text;

  /** Optional JSON object holding personality traits and attributes */
  traits?: jsonb;

  /** Timestamp when the NPC was created */
  @autoCreateTime @map("created_at") createdAt: utcDateTime;

  /** Timestamp of the last NPC update */
  @autoUpdateTime @map("updated_at") updatedAt?: utcDateTime;

  // ─── Relationships ─────────────────

  /** World this NPC belongs to - cascades deletion */
  @foreignKey("worlds", "id")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: World;
}

/**
 * Physical or virtual location within a world
 */
@table("locations")
model Location {
  /** Unique identifier for the location */
  @id id: uuid;

  /** Name of the location - indexed for lookup, max 200 characters */
  @index("idx_locations_name")
  @maxLength(200)
  name: string;

  /** Narrative description used in AI generation */
  description: text;

  /** Bounding box or point stored as GeoJSON */
  coordinates?: jsonb;

  /** Timestamp when the location was created */
  @autoCreateTime @map("created_at") createdAt: utcDateTime;

  // ─── Relationships ─────────────────

  /** World this location belongs to - cascades deletion */
  @foreignKey("worlds", "id")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: World;
}

/**
 * World event that triggers state mutations when its conditions are met
 */
@table("game_events")
model GameEvent {
  /** Unique identifier for the game event */
  @id id: uuid;

  /** Name of the event - indexed for lookup, max 200 characters */
  @index("idx_game_events_name")
  @maxLength(200)
  name: string;

  /** Narrative description used in AI generation */
  description: text;

  /** Predicate expression evaluated at runtime */
  conditions?: jsonb;

  /** Mutations applied when the event fires */
  effects?: jsonb;

  /** Timestamp when the event was created */
  @autoCreateTime @map("created_at") createdAt: utcDateTime;

  // ─── Relationships ─────────────────

  /** World this event belongs to - cascades deletion */
  @foreignKey("worlds", "id")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: World;
}

/**
 * Tag used to classify and filter content pool entries.
 * The (world_id, name) pair is globally unique per world.
 */
@table("tags")
@compositeUnique("uq_tags_world_name", "world_id", "name")
model Tag {
  /** Unique identifier for the tag */
  @id id: uuid;

  /** Tag name - max 100 characters, unique within its world */
  @maxLength(100)
  name: string;

  /** Category used to group related tags - indexed for filtering, max 50 characters */
  @index("idx_tags_category")
  @maxLength(50)
  category: string;

  /** Timestamp when the tag was created */
  @autoCreateTime @map("created_at") createdAt: utcDateTime;

  // ─── Relationships ─────────────────

  /** World this tag belongs to - cascades deletion */
  @foreignKey("worlds", "id")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: World;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

/**
 * Immutable audit-log entry.
 *
 * Uses an auto-incrementing bigserial surrogate key so entries can be
 * ordered and paginated efficiently without UUIDs.
 * Demonstrates: @autoIncrement, bigserial, @compositeIndex, @relation.
 */
@table("audit_logs")
@compositeIndex("idx_audit_entity", "entity_type", "entity_id")
@compositeIndex("idx_audit_actor_time", "actor_id", "created_at")
model AuditLog {
  /**
   * Auto-incrementing surrogate key - uses bigserial (64-bit) for high throughput
   */
  @id
  @autoIncrement
  id: bigserial;

  /**
   * Logical type of the changed entity, e.g. "World" or "StoryNode"
   */
  @index("idx_audit_entity_type")
  @maxLength(100)
  @map("entity_type")
  entityType: string;

  /**
   * Primary key of the changed entity
   */
  @map("entity_id")
  entityId: uuid;

  /**
   * Action performed: "create", "update", or "delete"
   */
  @maxLength(50)
  action: string;

  /** JSON patch or before/after snapshot */
  diff?: jsonb;

  /** Timestamp when the audit event occurred */
  @autoCreateTime @map("created_at") createdAt: utcDateTime;

  // ─── Relationships ─────────────────

  /**
   * User who performed the action - SET NULL when the user is deleted
   * so audit history is preserved even after account removal
   */
  @foreignKey("users", "id")
  @onDelete("SET NULL")
  @onUpdate("CASCADE")
  actor?: User;
}
