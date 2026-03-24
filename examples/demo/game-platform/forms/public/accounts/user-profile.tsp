import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Forms.Public.Accounts;

/**
 * Lightweight user profile view for public surfaces.
 * Demonstrates a `@data` model in a nested namespace.
 */
@data
model UserProfile
  is PickProperties<
    Demo.GamePlatform.Accounts.User,
    "id" | "email" | "displayName" | "avatarUrl"
  >;
