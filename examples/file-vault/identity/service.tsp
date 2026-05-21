import "@qninhdt/typespec-protobuf";

using Qninhdt.Proto;

@protoPackage("filevault.identity.v1")
namespace FileVault.Identity;

@protoService
interface AuthService {
  signIn(...SignInRequest): SignInResponse;

  refreshSession(...RefreshSessionRequest): TokenPair;

  revokeSession(...RevokeSessionRequest): FileVault.Shared.Ack;
}

@protoService
interface AccountService {
  getAccount(...GetAccountRequest): AccountView;

  listSessions(...ListSessionsRequest): ListSessionsResponse;
}
