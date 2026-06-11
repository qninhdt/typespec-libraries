import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace GamePlatform.Forms.Public.Accounts;

/**
 * Lightweight user profile view for public surfaces.
 * Demonstrates a default form model in a nested namespace.
 */
@scope("frontend")
model UserProfile
  is PickProperties<
    GamePlatform.Accounts.User,
    "id" | "email" | "displayName" | "avatarUrl"
  >;
