import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace WorldCard.Models;

// ─── Story Tree Models ───────────────────────────────────────────────────────

/**
 * Node in a lazily-generated story tree.
 * Stores the cumulative content-pool IDs inherited from all ancestor nodes.
 */
@table
model StoryNode is Timestamped {
  /** Depth of this node in the story tree - root is 0 */
  @index
  depth: int32 = 0;

  /** Cumulative pool - NPC, tag, event, and location IDs from all ancestors */
  pool: jsonb;

  /** Content introduced at this specific node */
  @map("new_content")
  newContent: jsonb;

  /** IDs of lazily-expanded child nodes */
  @map("child_ids")
  childIds: jsonb;

  // ─── Composite Indexes ─────────────────
  worldIdDepth: composite<"worldId", "depth">;

  // ─── Explicit FK Fields ─────────────────

  /** Foreign key to World - required */
  worldId: uuid;

  /** Foreign key to parent StoryNode - nullable for root nodes */
  parentId?: uuid;

  // ─── Relationships ─────────────────

  /** World this story node belongs to - cascades deletion */
  @foreignKey("worldId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: World;

  /** Parent node in the story tree - null for root nodes */
  @foreignKey("parentId")
  @onDelete("CASCADE")
  parent?: StoryNode;
}

// ─── Content Pool Entities ───────────────────────────────────────────────────

/**
 * Non-player character belonging to a world
 */
@table
model Npc is Timestamped {
  /** Name of the NPC - indexed for lookup, max 200 characters */
  @index
  @maxLength(200)
  name: string;

  /** Narrative description used in AI generation */
  description: text;

  /** Optional JSON object holding personality traits and attributes */
  traits?: jsonb;

  // ─── Composite Indexes ─────────────────
  worldIdName: composite<"worldId", "name">;

  // ─── Explicit FK Fields ─────────────────
  worldId: uuid;

  // ─── Relationships ─────────────────

  /** World this NPC belongs to - cascades deletion */
  @foreignKey("worldId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: World;
}

/**
 * Physical or virtual location within a world
 */
@table
model Location is Timestamped {
  /** Name of the location - indexed for lookup, max 200 characters */
  @index
  @maxLength(200)
  name: string;

  /** Narrative description used in AI generation */
  description: text;

  /** Bounding box or point stored as GeoJSON */
  coordinates?: jsonb;

  // ─── Explicit FK Fields ─────────────────
  worldId: uuid;

  // ─── Relationships ─────────────────

  /** World this location belongs to - cascades deletion */
  @foreignKey("worldId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: World;
}

/**
 * World event that triggers state mutations when its conditions are met
 */
@table
model GameEvent is Timestamped {
  /** Name of the event - indexed for lookup, max 200 characters */
  @index
  @maxLength(200)
  name: string;

  /** Narrative description used in AI generation */
  description: text;

  /** Predicate expression evaluated at runtime */
  conditions?: jsonb;

  /** Mutations applied when the event fires */
  effects?: jsonb;

  // ─── Explicit FK Fields ─────────────────
  worldId: uuid;

  // ─── Relationships ─────────────────

  /** World this event belongs to - cascades deletion */
  @foreignKey("worldId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: World;
}

/**
 * Tag used to classify and filter content pool entries.
 * The (world_id, name) pair is globally unique per world.
 */
@table
model Tag is Timestamped {
  /** Tag name - max 100 characters, unique within its world */
  @maxLength(100)
  name: string;

  /** Category used to group related tags - indexed for filtering, max 50 characters */
  @index
  @maxLength(50)
  category: string;

  // ─── Composite Unique Constraints ─────────────────
  @unique
  worldIdName: composite<"worldId", "name">;

  // ─── Explicit FK Fields ─────────────────
  worldId: uuid;

  // ─── Relationships ─────────────────

  /** World this tag belongs to - cascades deletion */
  @foreignKey("worldId")
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
 * Demonstrates: @autoIncrement, bigserial, composite<>, @relation.
 */
@table
model AuditLog {
  /**
   * Auto-incrementing surrogate key - uses bigserial (64-bit) for high throughput
   * Note: Does NOT use base id - overrides with bigserial for performance
   */
  @key
  @autoIncrement
  id: bigserial;

  /**
   * Logical type of the changed entity, e.g. "World" or "StoryNode"
   */
  @index
  @maxLength(100)
  @map("entity_type")
  entityType: string;

  /**
   * Primary key of the changed entity
   */
  entityId: uuid;

  /**
   * Action performed: "create", "update", or "delete"
   */
  @maxLength(50)
  action: string;

  /** JSON patch or before/after snapshot */
  diff?: jsonb;

  // ─── Composite Indexes ─────────────────
  entityTypeEntityId: composite<"entityType", "entityId">;

  actorIdCreatedAt: composite<"actorId", "createdAt">;

  // ─── Explicit FK Fields ─────────────────
  /** Foreign key to Actor (User) - nullable for deleted users */
  actorId?: uuid;

  // ─── Timestamp fields (only createdAt - no update/delete for audit logs) ───

  @autoCreateTime
  @map("created_at")
  createdAt: utcDateTime;

  // ─── Relationships ─────────────────

  /**
   * User who performed the action - SET NULL when the user is deleted
   * so audit history is preserved even after account removal
   */
  @foreignKey("actorId")
  @onDelete("SET NULL")
  @onUpdate("CASCADE")
  actor?: User;
}
