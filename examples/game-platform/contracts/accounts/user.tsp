import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace GamePlatform.Accounts;

// ─── User-Defined Scalars ─────────────────────────────────

@minValue(13)
@maxValue(150)
scalar PlayerAge extends int32;

@minLength(8)
@maxLength(128)
@pattern("^(?=.*[A-Z])(?=.*[0-9]).*$")
scalar StrongPassword extends string;

/** Registered player account. */
@table
model User {
  ...GamePlatform.Shared.Timestamped;
  /**
   * Email address used for login and invitations.
   * Other namespaces reference this via lookup types.
   */
  @unique
  @maxLength(320)
  email: email;

  /** Hashed password - never expose or store plain text credentials. */
  passwordHash: StrongPassword;

  /** Display name shown throughout the UI. */
  @maxLength(100)
  displayName: string;

  /** Public avatar URL rendered in lists and profile cards. */
  @maxLength(512)
  avatarUrl?: url;

  /** External identity provider ID (ULID format). */
  @unique
  externalId?: ulid;

  /** Session token for API authentication. */
  sessionToken?: jwt;

  /** Player age for content filtering. */
  age?: PlayerAge;

  /** Optional locale preference for formatting and localization. */
  @maxLength(16)
  preferredLocale?: string;

  /** Entitlement credits or consumable balance. */
  @check("users_credits_non_negative", "credits >= 0")
  credits: int32 = 0;

  /** Role used by moderation features and internal tooling. */
  @index
  role: UserRole = UserRole.player;

  /** Whether the account is currently active. */
  isActive: boolean = true;

  /** Optimistic-locking version, incremented on every update. */
  @version
  rowVersion: int32 = 0;

  /** Example of a computed UI field excluded from persistence. */
  @ignore
  fullTitle?: string;

  // ─── Same-Namespace Relations ─────────────────

  /** Billing subscriptions tied to the account. */
  @mappedBy("user")
  subscriptions?: Subscription[];

  /** Profile badges granted through a shorthand join table. */
  @manyToMany("user_badges")
  badges?: Badge[];

  // ─── Composite Unique Constraints ─────────────────
  @unique
  emailDeletedAt: composite<"email", "deletedAt">;
}
