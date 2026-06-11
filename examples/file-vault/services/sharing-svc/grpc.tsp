import "@typespec/protobuf";

using Protobuf;

@package({
  name: "filevault.sharing.v1",
})
namespace FileVault.Sharing;

@Protobuf.service
interface SharingService {
  createGrant(...CreateShareGrantRequest): ShareGrantView;

  revokeGrant(...RevokeShareGrantRequest): FileVault.Shared.Ack;

  createLink(...CreateShareLinkRequest): ShareLinkView;

  listShares(...ListSharesRequest): ListSharesResponse;
}
