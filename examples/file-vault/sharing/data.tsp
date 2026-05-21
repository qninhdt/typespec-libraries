import "@qninhdt/typespec-orm";
import "@qninhdt/typespec-protobuf";

using Qninhdt.Orm;
using Qninhdt.Proto;

namespace FileVault.Sharing;

enum ShareRoleCode {
  unspecified: 0,
  viewer: 1,
  commenter: 2,
  editor: 3,
  owner: 4,
}

enum ShareSubjectKindCode {
  unspecified: 0,
  account: 1,
  group: 2,
  publicLink: 3,
}
model ShareGrantView {
  id: uuid;

  resourceNodeId: uuid;

  subjectKind: ShareSubjectKindCode;

  subject: string;

  role: ShareRoleCode;

  expiresAtIso?: string;
}
model CreateShareGrantRequest {
  resourceNodeId: uuid;

  grantedBy: uuid;

  subjectKind: ShareSubjectKindCode;

  subject: string;

  role: ShareRoleCode;

  expiresAtIso?: string;
}
model RevokeShareGrantRequest {
  grantId: uuid;

  revokedBy: uuid;
}
model CreateShareLinkRequest {
  resourceNodeId: uuid;

  createdBy: uuid;

  role: ShareRoleCode;

  expiresAtIso?: string;

  password?: string;
}
model ShareLinkView {
  id: uuid;

  resourceNodeId: uuid;

  url: string;

  role: ShareRoleCode;

  expiresAtIso?: string;
}
model ListSharesRequest {
  resourceNodeId: uuid;

  requesterId: uuid;

  page: FileVault.Shared.PageRequest;
}
model ListSharesResponse {
  grants: ShareGrantView[];

  links: ShareLinkView[];

  page: FileVault.Shared.PageInfo;
}
