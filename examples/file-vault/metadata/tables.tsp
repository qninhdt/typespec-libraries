import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace FileVault.Metadata;

enum VaultNodeKind {
  folder: "folder",
  file: "file",
}

enum VaultNodeState {
  active: "active",
  trashed: "trashed",
  deleted: "deleted",
}

enum FileCategory {
  unspecified: "unknown",
  document: "document",
  image: "image",
  audio: "audio",
  video: "video",
  archive: "archive",
}

enum Visibility {
  private: "private",
  shared: "shared",
  publicLink: "public_link",
}

/** Top-level vault owned by one account. */
@table("vault_spaces")
model VaultSpace {
  ...FileVault.Shared.SoftDeletableEntity;
  @index
  ownerId: uuid;

  @maxLength(120)
  name: string;

  quotaBytes: int64;
  usedBytes: int64 = 0;

  @foreignKey("ownerId")
  @onDelete("CASCADE")
  owner: FileVault.Identity.UserAccount;
}

/** Folder/file node in a vault tree. File-specific metadata lives separately. */
@table("vault_nodes")
model VaultNode {
  ...FileVault.Shared.SoftDeletableEntity;
  @index
  vaultId: uuid;

  @index
  parentId?: uuid;

  kind: VaultNodeKind;

  @maxLength(240)
  name: string;

  @maxLength(240)
  normalizedName: string;

  path: text;
  depth: int32;

  @index
  state: VaultNodeState = VaultNodeState.active;

  visibility: Visibility = Visibility.private;
  trashedAt?: utcDateTime;

  @index
  createdBy: uuid;

  updatedBy?: uuid;

  @unique
  siblingName: composite<"vaultId", "parentId", "normalizedName">;

  @foreignKey("vaultId")
  @onDelete("CASCADE")
  vault: VaultSpace;

  @foreignKey("createdBy")
  creator: FileVault.Identity.UserAccount;
}

/** Metadata attached to file nodes. */
@table("file_metadata")
model FileMetadata {
  ...FileVault.Shared.Entity;
  @unique
  nodeId: uuid;

  @index
  currentVersionId?: uuid;

  category: FileCategory = FileCategory.unspecified;

  @maxLength(160)
  mediaType: string;

  @maxLength(32)
  extension?: string;

  sizeBytes: int64;

  @maxLength(128)
  sha256: string;

  @foreignKey("nodeId")
  @onDelete("CASCADE")
  node: VaultNode;
}

/** Immutable file version. Storage service owns the actual object. */
@table("file_versions")
model FileVersion {
  ...FileVault.Shared.Entity;
  @index
  fileId: uuid;

  versionNumber: int32;

  @index
  storageObjectId: uuid;

  sizeBytes: int64;

  @maxLength(128)
  sha256: string;

  @index
  createdBy: uuid;

  @unique
  fileVersionNumber: composite<"fileId", "versionNumber">;

  @foreignKey("fileId")
  @onDelete("CASCADE")
  file: FileMetadata;

  @foreignKey("createdBy")
  creator: FileVault.Identity.UserAccount;
}

/** User-defined label scoped to a vault. */
@table("file_labels")
model FileLabel {
  ...FileVault.Shared.SoftDeletableEntity;
  @index
  vaultId: uuid;

  @maxLength(80)
  name: string;

  @maxLength(16)
  color?: string;

  @unique
  vaultLabelName: composite<"vaultId", "name">;

  @foreignKey("vaultId")
  @onDelete("CASCADE")
  vault: VaultSpace;
}

/** Label assignment to a file. */
@table("file_label_assignments")
model FileLabelAssignment {
  ...FileVault.Shared.Entity;
  @index
  fileId: uuid;

  @index
  labelId: uuid;

  @unique
  fileLabel: composite<"fileId", "labelId">;

  @foreignKey("fileId")
  @onDelete("CASCADE")
  file: FileMetadata;

  @foreignKey("labelId")
  @onDelete("CASCADE")
  label: FileLabel;
}
