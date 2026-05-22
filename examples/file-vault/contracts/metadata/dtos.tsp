import "@qninhdt/typespec-orm";
import "@typespec/protobuf";

using Qninhdt.Orm;
using Protobuf;

namespace FileVault.Metadata;

enum NodeKindCode {
  nodeKindUnspecified: 0,
  folder: 1,
  file: 2,
}

enum NodeStateCode {
  nodeStateUnspecified: 0,
  active: 1,
  trashed: 2,
  deleted: 3,
}

enum FileCategoryCode {
  fileCategoryUnspecified: 0,
  document: 1,
  image: 2,
  audio: 3,
  video: 4,
  archive: 5,
}

enum VisibilityCode {
  visibilityUnspecified: 0,
  private: 1,
  shared: 2,
  publicLink: 3,
}
model VaultView {
  @field(1)
  id: uuid;

  @field(2)
  owner: FileVault.Shared.ActorRef;

  @field(3)
  name: string;

  @field(4)
  quotaBytes: int64;

  @field(5)
  usedBytes: int64;
}
model NodeView {
  @field(1)
  id: uuid;

  @field(2)
  vaultId: uuid;

  @field(3)
  parentId?: uuid;

  @field(4)
  kind: NodeKindCode;

  @field(5)
  name: string;

  @field(6)
  path: string;

  @field(7)
  state: NodeStateCode;

  @field(8)
  visibility: VisibilityCode;
}
model FileView {
  @field(1)
  node: NodeView;

  @field(2)
  category: FileCategoryCode;

  @field(3)
  mediaType: string;

  @field(4)
  extension?: string;

  @field(5)
  sizeBytes: int64;

  @field(6)
  sha256: string;

  @field(7)
  currentVersionId?: uuid;

  @field(8)
  labels: string[];
}
model FileVersionView {
  @field(1)
  id: uuid;

  @field(2)
  fileId: uuid;

  @field(3)
  versionNumber: int32;

  @field(4)
  storageObjectId: uuid;

  @field(5)
  sizeBytes: int64;

  @field(6)
  sha256: string;

  @field(7)
  createdAtIso: string;
}
model CreateFolderRequest {
  @field(1)
  vaultId: uuid;

  @field(2)
  parentId?: uuid;

  @field(3)
  name: string;

  @field(4)
  actorId: uuid;
}
model CreateFileDraftRequest {
  @field(1)
  vaultId: uuid;

  @field(2)
  parentId?: uuid;

  @field(3)
  name: string;

  @field(4)
  mediaType: string;

  @field(5)
  expectedSizeBytes: int64;

  @field(6)
  actorId: uuid;
}
model CreateFileDraftResponse {
  @field(1)
  file: FileView;

  @field(2)
  uploadIntentId: uuid;
}
model CommitFileVersionRequest {
  @field(1)
  fileId: uuid;

  @field(2)
  storageObjectId: uuid;

  @field(3)
  sizeBytes: int64;

  @field(4)
  sha256: string;

  @field(5)
  actorId: uuid;
}
model MoveNodeRequest {
  @field(1)
  nodeId: uuid;

  @field(2)
  newParentId?: uuid;

  @field(3)
  actorId: uuid;
}
model RenameNodeRequest {
  @field(1)
  nodeId: uuid;

  @field(2)
  name: string;

  @field(3)
  actorId: uuid;
}
model TrashNodeRequest {
  @field(1)
  nodeId: uuid;

  @field(2)
  actorId: uuid;
}
model GetNodeRequest {
  @field(1)
  nodeId: uuid;

  @field(2)
  requesterId: uuid;
}
model ListFolderRequest {
  @field(1)
  folderId: uuid;

  @field(2)
  requesterId: uuid;

  @field(3)
  page: FileVault.Shared.PageRequest;
}
model ListFolderResponse {
  @field(1)
  nodes: NodeView[];

  @field(2)
  page: FileVault.Shared.PageInfo;
}
model ListFileVersionsRequest {
  @field(1)
  fileId: uuid;

  @field(2)
  requesterId: uuid;

  @field(3)
  page: FileVault.Shared.PageRequest;
}
model ListFileVersionsResponse {
  @field(1)
  versions: FileVersionView[];

  @field(2)
  page: FileVault.Shared.PageInfo;
}
