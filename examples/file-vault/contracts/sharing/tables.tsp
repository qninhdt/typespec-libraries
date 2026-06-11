import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace FileVault.Sharing;

enum ShareRole {
  viewer: "viewer",
  commenter: "commenter",
  editor: "editor",
}

enum ShareSubjectKind {
  account: "account",
  email: "email",
  organization: "organization",
}

/** Direct grant from an owner to another principal. */
@table("share_grants")
model ShareGrant {
  ...FileVault.Shared.Entity;
  @index
  resourceNodeId: uuid;

  @index
  grantedBy: uuid;

  subjectKind: ShareSubjectKind;

  @maxLength(320)
  subject: string;

  role: ShareRole;
  expiresAt?: utcDateTime;
  revokedAt?: utcDateTime;
}

/** Public or restricted link token. Token secret is stored hashed. */
@table("share_links")
model ShareLink {
  ...FileVault.Shared.Entity;
  @index
  resourceNodeId: uuid;

  @index
  createdBy: uuid;

  @unique
  @maxLength(128)
  tokenHash: string;

  role: ShareRole = ShareRole.viewer;

  @maxLength(255)
  passwordHash?: string;
  maxDownloads?: int32;
  downloadCount: int32 = 0;
  expiresAt?: utcDateTime;
  revokedAt?: utcDateTime;
}
