import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace FileVault.Identity;

enum AccountStatus {
  active: "active",
  disabled: "disabled",
  pendingVerification: "pending_verification",
}

enum ExternalAuthProvider {
  google: "google",
  github: "github",
  apple: "apple",
  microsoft: "microsoft",
}

enum MfaFactorKind {
  totp: "totp",
  webauthn: "webauthn",
  recoveryCode: "recovery_code",
}

/** Primary account record owned by the identity service. */
@table("user_accounts")
model UserAccount {
  ...FileVault.Shared.SoftDeletableEntity;
  @unique
  @maxLength(320)
  email: email;

  @maxLength(120)
  displayName: string;

  @maxLength(512)
  avatarUrl?: url;

  @maxLength(16)
  locale?: string;

  @index
  status: AccountStatus = AccountStatus.pendingVerification;

  emailVerifiedAt?: utcDateTime;
  lastLoginAt?: utcDateTime;
  disabledAt?: utcDateTime;
}

/** Password credential for accounts using local authentication. */
@table("password_credentials")
model PasswordCredential {
  ...FileVault.Shared.Entity;
  @unique
  accountId: uuid;

  passwordHash: string;

  @maxLength(64)
  passwordAlgorithm: string;

  passwordUpdatedAt: utcDateTime;
  compromisedAt?: utcDateTime;

  @foreignKey("accountId")
  @onDelete("CASCADE")
  account: UserAccount;
}

/** External login identity linked to an account. */
@table("external_identities")
model ExternalIdentity {
  ...FileVault.Shared.Entity;
  @index
  accountId: uuid;

  provider: ExternalAuthProvider;

  @maxLength(256)
  providerSubject: string;

  @maxLength(320)
  emailAtProvider?: email;

  linkedAt: utcDateTime;

  @unique
  providerSubjectKey: composite<"provider", "providerSubject">;

  @foreignKey("accountId")
  @onDelete("CASCADE")
  account: UserAccount;
}

/** Long-lived refresh-session family. Access tokens stay outside the DB. */
@table("auth_sessions")
model AuthSession {
  ...FileVault.Shared.Entity;
  @index
  accountId: uuid;

  @unique
  refreshTokenHash: string;

  @maxLength(80)
  deviceLabel?: string;

  @maxLength(128)
  ipAddressHash?: string;

  @maxLength(128)
  userAgentHash?: string;

  expiresAt: utcDateTime;
  revokedAt?: utcDateTime;

  @foreignKey("accountId")
  @onDelete("CASCADE")
  account: UserAccount;
}

/** Registered second factor. Secrets are encrypted outside the TypeSpec model. */
@table("mfa_factors")
model MfaFactor {
  ...FileVault.Shared.Entity;
  @index
  accountId: uuid;

  kind: MfaFactorKind;

  @maxLength(120)
  label?: string;

  secretRef: string;
  verifiedAt?: utcDateTime;
  disabledAt?: utcDateTime;

  @foreignKey("accountId")
  @onDelete("CASCADE")
  account: UserAccount;
}
