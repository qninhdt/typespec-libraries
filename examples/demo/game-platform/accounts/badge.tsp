import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Accounts;

/** Account badge or achievement marker attached to player profiles. */
@table
model Badge is Demo.GamePlatform.Shared.Timestamped {
  /** Stable badge code used by tooling and migration scripts. */
  @unique
  @maxLength(80)
  code: string;

  /** Human-readable badge name rendered in the UI. */
  @maxLength(160)
  label: string;

  /** Users who have earned this badge. */
  @manyToMany("user_badges")
  users?: User[];
}
