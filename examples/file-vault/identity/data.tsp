import "@qninhdt/typespec-orm";
import "@qninhdt/typespec-protobuf";

using Qninhdt.Orm;
using Qninhdt.Proto;

namespace FileVault.Identity;

enum AccountStatusCode {
  unspecified: 0,
  active: 1,
  disabled: 2,
  pendingVerification: 3,
}
model AccountView {
  id: uuid;

  email: email;

  displayName: string;

  avatarUrl?: string;

  locale?: string;

  status: AccountStatusCode;
}
model SessionView {
  id: uuid;

  accountId: uuid;

  deviceLabel?: string;

  expiresAtIso: string;

  revokedAtIso?: string;
}
model SignInRequest {
  email: email;

  password: FileVault.Shared.StrongPassword;

  deviceLabel?: string;
}
model SignInResponse {
  account: AccountView;

  session: SessionView;

  accessToken: string;

  refreshToken: string;
}
model RefreshSessionRequest {
  refreshToken: string;
}
model TokenPair {
  accessToken: string;

  refreshToken: string;
}
model RevokeSessionRequest {
  sessionId: uuid;

  accountId: uuid;
}
model GetAccountRequest {
  accountId: uuid;
}
model ListSessionsRequest {
  accountId: uuid;

  page: FileVault.Shared.PageRequest;
}
model ListSessionsResponse {
  sessions: SessionView[];

  page: FileVault.Shared.PageInfo;
}
