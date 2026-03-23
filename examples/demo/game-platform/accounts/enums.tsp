import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Accounts;

/** Roles used by moderation and admin tooling. */
enum UserRole {
  player: "player",
  moderator: "moderator",
  admin: "admin",
}

/** Subscription plan tiers exposed to billing and entitlement checks. */
enum SubscriptionPlan {
  free: "free",
  basic: "basic",
  premium: "premium",
  enterprise: "enterprise",
}
