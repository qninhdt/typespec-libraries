import "@qninhdt/typespec-orm";
import "@qninhdt/typespec-protobuf";

using Qninhdt.Orm;
using Qninhdt.Proto;

namespace FileVault.Metadata;

enum NodeKindCode {
  unspecified: 0,
  folder: 1,
  file: 2,
}

enum NodeStateCode {
  unspecified: 0,
  active: 1,
  trashed: 2,
  deleted: 3,
}

enum FileCategoryCode {
  unspecified: 0,
  document: 1,
  image: 2,
  audio: 3,
  video: 4,
  archive: 5,
}

enum VisibilityCode {
  unspecified: 0,
  private: 1,
  shared: 2,
  publicLink: 3,
}
model VaultView {
  id: uuid;

  owner: FileVault.Shared.ActorRef;

  name: string;

  quotaBytes: int64;

  usedBytes: int64;
}
model NodeView {
  id: uuid;

  vaultId: uuid;

  parentId?: uuid;

  kind: NodeKindCode;

  name: string;

  path: string;

  state: NodeStateCode;

  visibility: VisibilityCode;
}
model FileView {
  node: NodeView;

  category: FileCategoryCode;

  mediaType: string;

  extension?: string;

  sizeBytes: int64;

  sha256: string;

  currentVersionId?: uuid;

  labels: string[];
}
model FileVersionView {
  id: uuid;

  fileId: uuid;

  versionNumber: int32;

  storageObjectId: uuid;

  sizeBytes: int64;

  sha256: string;

  createdAtIso: string;
}
model CreateFolderRequest {
  vaultId: uuid;

  parentId?: uuid;

  name: string;

  actorId: uuid;
}
model CreateFileDraftRequest {
  vaultId: uuid;

  parentId?: uuid;

  name: string;

  mediaType: string;

  expectedSizeBytes: int64;

  actorId: uuid;
}
model CreateFileDraftResponse {
  file: FileView;

  uploadIntentId: uuid;
}
model CommitFileVersionRequest {
  fileId: uuid;

  storageObjectId: uuid;

  sizeBytes: int64;

  sha256: string;

  actorId: uuid;
}
model MoveNodeRequest {
  nodeId: uuid;

  newParentId?: uuid;

  actorId: uuid;
}
model RenameNodeRequest {
  nodeId: uuid;

  name: string;

  actorId: uuid;
}
model TrashNodeRequest {
  nodeId: uuid;

  actorId: uuid;
}
model GetNodeRequest {
  nodeId: uuid;

  requesterId: uuid;
}
model ListFolderRequest {
  folderId: uuid;

  requesterId: uuid;

  page: FileVault.Shared.PageRequest;
}
model ListFolderResponse {
  nodes: NodeView[];

  page: FileVault.Shared.PageInfo;
}
model ListFileVersionsRequest {
  fileId: uuid;

  requesterId: uuid;

  page: FileVault.Shared.PageRequest;
}
model ListFileVersionsResponse {
  versions: FileVersionView[];

  page: FileVault.Shared.PageInfo;
}
