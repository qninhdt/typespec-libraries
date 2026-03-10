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

@doc("Registered user account")
@table("users")
@compositeUnique("uq_users_email_active", "email", "is_active")
model User {
  /**
   * Unique identifier for the user
   */
  @id
  id: uuid;

  /**
   * Email address used for login - indexed for fast lookup
   */
  @unique
  @index("idx_users_email")
  @maxLength(320)
  @format("email")
  email: string;

  passwordHash: string;

  @maxLength(100)
  displayName: string;

  @maxLength(512)
  @format("url")
  avatarUrl?: string;

  credits: int32 = 0;
  isActive: boolean = true;

  @autoCreateTime
  @map("created_at")
  createdAt: utcDateTime;

  @autoUpdateTime
  @map("updated_at")
  updatedAt?: utcDateTime;

  @softDelete
  @map("deleted_at")
  deletedAt?: utcDateTime;

  /**
   * Virtual field combining display name and email - not persisted to the database
   */
  @ignore
  fullTitle?: string;

  // Relationships
  subscriptions?: Subscription[];

  worlds?: World[];
}

@doc("User subscription plan")
@table("subscriptions")
@compositeIndex("idx_subscriptions_user_active", "user_id", "is_active")
model Subscription {
  /**
   * Unique identifier for the subscription
   */
  @id id: uuid;

  /**
   * Subscription plan tier - determines access level and billing
   */
  @index("idx_subscriptions_plan")
  plan: SubscriptionPlan;

  /**
   * Monthly price stored as NUMERIC(10,2) to avoid floating-point rounding errors
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

  @autoCreateTime
  @map("created_at")
  createdAt: utcDateTime;

  // Relationships

  /** Owning user - cascades deletion to subscriptions when the user is removed */
  @foreignKey("users", "id")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  user: User;
}
