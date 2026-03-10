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
  @id id: uuid;

  @doc("Depth of this node in the story tree - root is 0")
  @index("idx_story_nodes_depth")
  depth: int32 = 0;

  @doc("Cumulative pool - NPC, tag, event, and location IDs from all ancestors")
  pool: jsonb;

  @doc("Content introduced at this specific node")
  @map("new_content")
  newContent: jsonb;

  @doc("IDs of lazily-expanded child nodes")
  @map("child_ids")
  childIds: jsonb;

  @autoCreateTime @map("created_at") createdAt: utcDateTime;

  // ─── Relationships ─────────────────

  @foreignKey("worlds", "id")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: World;

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
  @id id: uuid;

  @index("idx_npcs_name")
  @maxLength(200)
  name: string;

  description: text;
  traits?: jsonb;
  @autoCreateTime @map("created_at") createdAt: utcDateTime;
  @autoUpdateTime @map("updated_at") updatedAt?: utcDateTime;

  // ─── Relationships ─────────────────

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
  @id id: uuid;

  @index("idx_locations_name")
  @maxLength(200)
  name: string;

  description: text;

  /** Bounding box or point stored as GeoJSON */
  coordinates?: jsonb;

  @autoCreateTime @map("created_at") createdAt: utcDateTime;

  // ─── Relationships ─────────────────

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
  @id id: uuid;

  @index("idx_game_events_name")
  @maxLength(200)
  name: string;

  description: text;

  /** Predicate expression evaluated at runtime */
  conditions?: jsonb;

  /** Mutations applied when the event fires */
  effects?: jsonb;

  @autoCreateTime @map("created_at") createdAt: utcDateTime;

  // ─── Relationships ─────────────────

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
  @id id: uuid;

  @maxLength(100)
  name: string;

  @index("idx_tags_category")
  @maxLength(50)
  category: string;

  @autoCreateTime @map("created_at") createdAt: utcDateTime;

  // ─── Relationships ─────────────────

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
