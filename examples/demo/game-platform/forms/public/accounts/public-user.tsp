import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Forms.Public.Accounts;

/**
 * Public user record with sensitive and operational fields removed.
 * Kept explicit so generated form schemas stay free of table-only relations.
 */
@data
model PublicUser {
  id: Demo.GamePlatform.Accounts.User.id;
  email: Demo.GamePlatform.Accounts.User.email;
  displayName: Demo.GamePlatform.Accounts.User.displayName;
  avatarUrl?: Demo.GamePlatform.Accounts.User.avatarUrl;
  preferredLocale?: Demo.GamePlatform.Accounts.User.preferredLocale;
  credits: Demo.GamePlatform.Accounts.User.credits;
  isActive: Demo.GamePlatform.Accounts.User.isActive;
}
