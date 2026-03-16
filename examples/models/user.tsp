import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace WorldCard.Models;

// ─── User Service Models ─────────────────────────────────────────────────────

/** Subscription plan tiers */
enum SubscriptionPlan {
  free: "free",
  basic: "basic",
  premium: "premium",
  enterprise: "enterprise",
}

/** Registered user account */
@table
model User is Timestamped {
  /**
   * Email address used for login - indexed for fast lookup.
   * Constrained to max 320 characters with \@format("email") validation.
   */
  @unique
  @maxLength(320)
  @format("email")
  email: string;

  /** Hashed password - never store or return plain text */
  passwordHash: string;

  /** Display name shown in the UI - max 100 characters */
  @maxLength(100)
  displayName: string;

  /** Optional avatar image URL - must be a valid URL, max 512 characters */
  @maxLength(512)
  @format("url")
  avatarUrl?: string;

  /** Credits balance - defaults to 0 on registration */
  credits: int32 = 0;

  /** Whether the account is active - false for suspended or deactivated accounts */
  isActive: boolean = true;

  /**
   * Virtual field combining display name and email - not persisted to the database.
   * Decorated with \@ignore so emitters skip it.
   */
  @ignore
  fullTitle?: string;

  // ─── Composite Unique Constraints ─────────────────
  @unique
  emailDeletedAt: composite<"email", "deletedAt">;

  // ─── Relationships ─────────────────

  /** Subscription plans associated with this user */
  @mappedBy("user")
  subscriptions?: Subscription[];

  /** Worlds owned by this user */
  @mappedBy("owner")
  worlds?: World[];
}

/** User subscription plan */
@table("subscriptions")
model Subscription is Timestamped {
  /**
   * Subscription plan tier - determines access level and billing.
   * Indexed for fast filtering by plan type.
   */
  @index
  plan: SubscriptionPlan;

  /**
   * Monthly price stored as NUMERIC(10,2) to avoid floating-point rounding errors.
   * Use \@precision(10, 2) - do NOT use float or double for monetary values.
   */
  @precision(10, 2)
  monthlyPrice: decimal;

  /** Start date of the subscription period */
  startDate: utcDateTime;

  /** Optional end date - null means the subscription is open-ended */
  endDate?: utcDateTime;

  /** Quick flag for access-control checks without date comparisons */
  isActive: boolean = true;

  // ─── Composite Indexes ─────────────────
  userIdIsActive: composite<"userId", "isActive">;

  // ─── Relationships ─────────────────

  /** FK field for the owning user */
  userId: uuid;

  /** Owning user - cascades deletion to subscriptions when the user is removed */
  @foreignKey("userId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  user: User;
}
