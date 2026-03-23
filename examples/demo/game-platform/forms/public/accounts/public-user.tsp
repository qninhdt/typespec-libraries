import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Forms.Public.Accounts;

/**
 * Public user record with sensitive and operational fields removed.
 * Demonstrates `OmitProperties` across namespaces.
 */
@data
model PublicUser
  is OmitProperties<
    Demo.GamePlatform.Accounts.User,

      | "passwordHash"
      | "deletedAt"
      | "updatedAt"
      | "createdAt"
      | "fullTitle"
      | "role"
      | "subscriptions"
      | "emailDeletedAt"
  >;
