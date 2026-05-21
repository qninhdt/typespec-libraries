import "@qninhdt/typespec-protobuf";

using Qninhdt.Proto;

@protoPackage("filevault.sharing.v1")
namespace FileVault.Sharing;

@protoService
interface SharingService {
  createGrant(...CreateShareGrantRequest): ShareGrantView;

  revokeGrant(...RevokeShareGrantRequest): FileVault.Shared.Ack;

  createLink(...CreateShareLinkRequest): ShareLinkView;

  listShares(...ListSharesRequest): ListSharesResponse;
}
