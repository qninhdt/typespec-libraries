import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Accounts;

/** Registered player account. */
@table
model User is Demo.GamePlatform.Shared.Timestamped {
  /**
   * Email address used for login and invitations.
   * Other namespaces reference this via lookup types.
   */
  @unique
  @maxLength(320)
  @format("email")
  email: string;

  /** Hashed password - never expose or store plain text credentials. */
  passwordHash: string;

  /** Display name shown throughout the UI. */
  @maxLength(100)
  displayName: string;

  /** Public avatar URL rendered in lists and profile cards. */
  @maxLength(512)
  @format("url")
  avatarUrl?: string;

  /** Optional locale preference for formatting and localization. */
  @maxLength(16)
  preferredLocale?: string;

  /** Entitlement credits or consumable balance. */
  credits: int32 = 0;

  /** Role used by moderation features and internal tooling. */
  @index
  role: UserRole = UserRole.player;

  /** Whether the account is currently active. */
  isActive: boolean = true;

  /** Example of a computed UI field excluded from persistence. */
  @ignore
  fullTitle?: string;

  // ─── Same-Namespace Relations ─────────────────

  /** Billing subscriptions tied to the account. */
  @mappedBy("user")
  subscriptions?: Subscription[];

  // ─── Composite Unique Constraints ─────────────────
  @unique
  emailDeletedAt: composite<"email", "deletedAt">;
}
