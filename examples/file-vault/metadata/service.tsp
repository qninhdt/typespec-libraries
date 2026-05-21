import "@qninhdt/typespec-protobuf";

using Qninhdt.Proto;

@protoPackage("filevault.metadata.v1")
namespace FileVault.Metadata;

@protoService
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
