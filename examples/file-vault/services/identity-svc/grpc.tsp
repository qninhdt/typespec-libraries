import "@typespec/protobuf";

using Protobuf;

@package({
  name: "filevault.identity.v1",
})
namespace FileVault.Identity;

@Protobuf.service
interface AuthService {
  signIn(...SignInRequest): SignInResponse;

  refreshSession(...RefreshSessionRequest): TokenPair;

  revokeSession(...RevokeSessionRequest): FileVault.Shared.Ack;
}

@Protobuf.service
interface AccountService {
  getAccount(...GetAccountRequest): AccountView;

  listSessions(...ListSessionsRequest): ListSessionsResponse;
}
