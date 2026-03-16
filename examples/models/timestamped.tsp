import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace WorldCard.Models;

// ─── Base Models ────────────────────────────────────────────────────────────────

/**
 * Base model with common timestamp fields for audit trails.
 * Models should use `...Timestamped` spread to include these fields.
 *
 * Note: TypeSpec's model inheritance (`extends`) is not yet fully supported by
 * the emitters. Use the spread operator (`...Timestamped`) to include fields.
 */
model Timestamped {
  /** Unique identifier - use @key in the extending model */
  @key
  id: uuid;

  /** Timestamp when the record was created */
  @autoCreateTime
  createdAt: utcDateTime;

  /** Timestamp of the last update - omit in extending model to skip */
  updatedAt?: utcDateTime;

  /**
   * Soft delete timestamp - null if active, set to deletion time when "deleted".
   */
  @softDelete
  deletedAt?: utcDateTime;
}
