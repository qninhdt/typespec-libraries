import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Shared;

/**
 * Base model with common timestamp fields for audit trails.
 * This is a reusable table mixin and is never emitted by itself.
 */
@tableMixin
model Timestamped {
  /** Unique identifier shared by most persisted records. */
  @key
  id: uuid;

  /** Timestamp when the record was created. */
  @autoCreateTime
  createdAt: utcDateTime;

  /** Timestamp of the last update. */
  updatedAt?: utcDateTime;

  /** Soft delete marker for archival workflows. */
  @softDelete
  deletedAt?: utcDateTime;
}

/**
 * Shared mixin for content that belongs to a specific world.
 * Demonstrates mixin-to-mixin inheritance.
 */
@tableMixin
model WorldOwned is Timestamped {
  /** Foreign key to the owning world. */
  @index
  worldId: uuid;
}
