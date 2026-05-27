import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace GamePlatform.Audit;

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
   * Discriminator of a polymorphic relation paired with `entityId`.
   */
  @index
  @maxLength(100)
  @map("entity_type")
  @polymorphic(#["World", "StoryNode", "User", "Subscription"], "entityId")
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
   * Audit lives in its own service so this is a denormalized snapshot,
   * not a database FK to the worlds service.
   */
  @maxLength(120)
  worldSlug?: string;

  // ─── Timestamp Fields ─────────────────
  @autoCreateTime
  @map("created_at")
  createdAt: utcDateTime;
}
