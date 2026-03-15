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
@compositeKey("uq_users_email_deleted", "email", "deleted_at")
model User {
  /** Unique identifier for the user */
  @key
  id: uuid;

  /**
   * Email address used for login - indexed for fast lookup.
   * Constrained to max 320 characters with \@format("email") validation.
   */
  @unique
  @index("idx_users_email")
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

  /** Timestamp when the account was created */
  @autoCreateTime
  @map("created_at")
  createdAt: utcDateTime;

  /** Timestamp of the last profile update */
  @autoUpdateTime
  @map("updated_at")
  updatedAt?: utcDateTime;

  /** Soft-delete timestamp - null means the account is active */
  @softDelete
  @map("deleted_at")
  deletedAt?: utcDateTime;

  /**
   * Virtual field combining display name and email - not persisted to the database.
   * Decorated with \@ignore so emitters skip it.
   */
  @ignore
  fullTitle?: string;

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
@compositeIndex("idx_subscriptions_user_active", "user_id", "is_active")
model Subscription {
  /** Unique identifier for the subscription */
  @key id: uuid;

  /**
   * Subscription plan tier - determines access level and billing.
   * Indexed for fast filtering by plan type.
   */
  @index("idx_subscriptions_plan")
  plan: SubscriptionPlan;

  /**
   * Monthly price stored as NUMERIC(10,2) to avoid floating-point rounding errors.
   * Use \@precision(10, 2) - do NOT use float or double for monetary values.
   */
  @precision(10, 2)
  @map("monthly_price")
  monthlyPrice: decimal;

  /** Start date of the subscription period */
  @map("start_date")
  startDate: utcDateTime;

  /** Optional end date - null means the subscription is open-ended */
  @map("end_date")
  endDate?: utcDateTime;

  /** Quick flag for access-control checks without date comparisons */
  isActive: boolean = true;

  /** Timestamp when the subscription was created */
  @autoCreateTime
  @map("created_at")
  createdAt: utcDateTime;

  // ─── Relationships ─────────────────

  /** Owning user - cascades deletion to subscriptions when the user is removed */
  @foreignKey("user_id")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  user: User;
}
