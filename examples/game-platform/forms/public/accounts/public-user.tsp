import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace GamePlatform.Forms.Public.Accounts;

/**
 * Public user record with sensitive and operational fields removed.
 * Kept explicit so generated form schemas stay free of table-only relations.
 */
model PublicUser {
  id: GamePlatform.Accounts.User.id;
  email: GamePlatform.Accounts.User.email;
  displayName: GamePlatform.Accounts.User.displayName;
  avatarUrl?: GamePlatform.Accounts.User.avatarUrl;
  preferredLocale?: GamePlatform.Accounts.User.preferredLocale;
  credits: GamePlatform.Accounts.User.credits;
  isActive: GamePlatform.Accounts.User.isActive;
}
