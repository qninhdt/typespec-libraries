import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Accounts;

/** Subscription record for feature access and billing. */
@table("subscriptions")
model Subscription is Demo.GamePlatform.Shared.Timestamped {
  /** Selected plan tier. */
  @index
  plan: SubscriptionPlan;

  /** Monthly price stored as NUMERIC(10,2) to avoid floating-point drift. */
  @precision(10, 2)
  @check("subscriptions_monthly_price_non_negative", "monthlyPrice >= 0")
  monthlyPrice: decimal;

  /** Start date of the billing period. */
  startDate: utcDateTime;

  /** Optional end date - null means the subscription is open-ended. */
  endDate?: utcDateTime;

  /** Fast boolean used by feature gates and entitlement checks. */
  isActive: boolean = true;

  // ─── Composite Indexes ─────────────────
  userIdIsActive: composite<"userId", "isActive">;

  // ─── Explicit FK Fields ─────────────────
  userId: uuid;

  // ─── Relationships ─────────────────
  /** Owning user - cascade on delete to clean up subscriptions. */
  @foreignKey("userId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  user: User;
}
