import "@typespec/protobuf";

using Protobuf;

@package({
  name: "filevault.metadata.v1",
})
namespace FileVault.Metadata;

@Protobuf.service
interface MetadataService {
  createFolder(...CreateFolderRequest): NodeView;

  createFileDraft(...CreateFileDraftRequest): CreateFileDraftResponse;

  commitFileVersion(...CommitFileVersionRequest): FileVersionView;

  getNode(...GetNodeRequest): NodeView;

  listFolder(...ListFolderRequest): ListFolderResponse;

  moveNode(...MoveNodeRequest): NodeView;

  renameNode(...RenameNodeRequest): NodeView;

  trashNode(...TrashNodeRequest): FileVault.Shared.Ack;

  listFileVersions(...ListFileVersionsRequest): ListFileVersionsResponse;
}
