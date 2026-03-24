import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Audit;

/**
 * Immutable audit-log entry.
 * Lives in its own namespace even though it references other bounded contexts.
 */
@table
model AuditLog {
  /** Auto-incrementing surrogate key for stable ordering. */
  @key
  @autoIncrement
  id: bigserial;

  /**
   * Logical type of the changed entity, e.g. "World" or "StoryNode".
   */
  @index
  @maxLength(100)
  @map("entity_type")
  entityType: string;

  /** Primary key of the changed entity. */
  entityId: uuid;

  /** Action performed: create, update, or delete. */
  @maxLength(50)
  action: string;

  /** Optional JSON snapshot or diff. */
  diff?: jsonb;

  // ─── Composite Indexes ─────────────────
  entityTypeEntityId: composite<"entityType", "entityId">;

  actorIdCreatedAt: composite<"actorId", "createdAt">;

  // ─── Explicit FK Fields ─────────────────
  /** Nullable so audit history survives account deletion. */
  actorId?: uuid;

  /**
   * Optional world slug snapshot for human-friendly correlation in logs.
   * Demonstrates a relation that targets a non-id unique column.
   */
  worldSlug?: Demo.GamePlatform.Worlds.World.slug;

  // ─── Timestamp Fields ─────────────────
  @autoCreateTime
  @map("created_at")
  createdAt: utcDateTime;

  // ─── Relationships Across Namespaces ─────────────────
  /**
   * User who performed the action - SET NULL when the account is deleted.
   */
  @foreignKey("actorId")
  @onDelete("SET NULL")
  @onUpdate("CASCADE")
  actor?: Demo.GamePlatform.Accounts.User;

  /**
   * World context resolved through its stable slug instead of the primary key.
   */
  @foreignKey("worldSlug", "slug")
  @onDelete("SET NULL")
  @onUpdate("CASCADE")
  worldContext?: Demo.GamePlatform.Worlds.World;
}
