import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace FileVault.Shared;

/** Surrogate primary-key base for all persisted rows. */
@tableMixin
model Entity {
  @key
  id: uuid;

  @autoCreateTime
  createdAt: utcDateTime;

  @autoUpdateTime
  updatedAt?: utcDateTime;
}

/** Base for rows that should support soft deletion. */
@tableMixin
model SoftDeletableEntity {
  ...Entity;
  @index
  deletedAt?: utcDateTime;
}

/** Base for rows owned by an account. */
@tableMixin
model OwnedEntity {
  ...SoftDeletableEntity;
  @index
  ownerId: uuid;
}
