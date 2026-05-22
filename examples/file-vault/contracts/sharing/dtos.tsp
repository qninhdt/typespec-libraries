import "@qninhdt/typespec-orm";
import "@typespec/protobuf";

using Qninhdt.Orm;
using Protobuf;

namespace FileVault.Sharing;

enum ShareRoleCode {
  shareRoleUnspecified: 0,
  viewer: 1,
  commenter: 2,
  editor: 3,
  owner: 4,
}

enum ShareSubjectKindCode {
  shareSubjectKindUnspecified: 0,
  account: 1,
  group: 2,
  publicLink: 3,
}
model ShareGrantView {
  @field(1)
  id: uuid;

  @field(2)
  resourceNodeId: uuid;

  @field(3)
  subjectKind: ShareSubjectKindCode;

  @field(4)
  subject: string;

  @field(5)
  role: ShareRoleCode;

  @field(6)
  expiresAtIso?: string;
}
model CreateShareGrantRequest {
  @field(1)
  resourceNodeId: uuid;

  @field(2)
  grantedBy: uuid;

  @field(3)
  subjectKind: ShareSubjectKindCode;

  @field(4)
  subject: string;

  @field(5)
  role: ShareRoleCode;

  @field(6)
  expiresAtIso?: string;
}
model RevokeShareGrantRequest {
  @field(1)
  grantId: uuid;

  @field(2)
  revokedBy: uuid;
}
model CreateShareLinkRequest {
  @field(1)
  resourceNodeId: uuid;

  @field(2)
  createdBy: uuid;

  @field(3)
  role: ShareRoleCode;

  @field(4)
  expiresAtIso?: string;

  @field(5)
  password?: string;
}
model ShareLinkView {
  @field(1)
  id: uuid;

  @field(2)
  resourceNodeId: uuid;

  @field(3)
  url: string;

  @field(4)
  role: ShareRoleCode;

  @field(5)
  expiresAtIso?: string;
}
model ListSharesRequest {
  @field(1)
  resourceNodeId: uuid;

  @field(2)
  requesterId: uuid;

  @field(3)
  page: FileVault.Shared.PageRequest;
}
model ListSharesResponse {
  @field(1)
  grants: ShareGrantView[];

  @field(2)
  links: ShareLinkView[];

  @field(3)
  page: FileVault.Shared.PageInfo;
}
