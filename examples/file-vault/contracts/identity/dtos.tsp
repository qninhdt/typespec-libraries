import "@qninhdt/typespec-orm";
import "@typespec/protobuf";

using Qninhdt.Orm;
using Protobuf;

namespace FileVault.Identity;

enum AccountStatusCode {
  unspecified: 0,
  active: 1,
  disabled: 2,
  pendingVerification: 3,
}
@Qninhdt.Orm.scope("frontend")
model AccountView {
  @field(1)
  id: uuid;

  @field(2)
  email: email;

  @field(3)
  displayName: string;

  @field(4)
  avatarUrl?: string;

  @field(5)
  locale?: string;

  @field(6)
  status: AccountStatusCode;
}
@Qninhdt.Orm.scope("frontend")
model SessionView {
  @field(1)
  id: uuid;

  @field(2)
  accountId: uuid;

  @field(3)
  deviceLabel?: string;

  @field(4)
  expiresAtIso: string;

  @field(5)
  revokedAtIso?: string;
}
@Qninhdt.Orm.scope("frontend")
model SignInRequest {
  @field(1)
  email: email;

  @field(2)
  password: FileVault.Shared.StrongPassword;

  @field(3)
  deviceLabel?: string;
}
@Qninhdt.Orm.scope("frontend")
model SignInResponse {
  @field(1)
  account: AccountView;

  @field(2)
  session: SessionView;

  @field(3)
  accessToken: string;

  @field(4)
  refreshToken: string;
}
model RefreshSessionRequest {
  @field(1)
  refreshToken: string;
}
model TokenPair {
  @field(1)
  accessToken: string;

  @field(2)
  refreshToken: string;
}
model RevokeSessionRequest {
  @field(1)
  sessionId: uuid;

  @field(2)
  accountId: uuid;
}
model GetAccountRequest {
  @field(1)
  accountId: uuid;
}
model ListSessionsRequest {
  @field(1)
  accountId: uuid;

  @field(2)
  page: FileVault.Shared.PageRequest;
}
model ListSessionsResponse {
  @field(1)
  sessions: SessionView[];

  @field(2)
  page: FileVault.Shared.PageInfo;
}
