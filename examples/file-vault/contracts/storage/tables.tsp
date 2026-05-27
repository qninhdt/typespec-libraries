import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace FileVault.Storage;

enum StorageObjectState {
  pending: "pending",
  available: "available",
  quarantined: "quarantined",
  deleted: "deleted",
}

enum UploadState {
  initiated: "initiated",
  receiving: "receiving",
  completed: "completed",
  aborted: "aborted",
  expired: "expired",
}

/** Physical storage bucket or logical provider namespace. */
@table("storage_buckets")
model StorageBucket {
  ...FileVault.Shared.Entity;
  @unique
  @maxLength(120)
  name: string;

  @maxLength(80)
  provider: string;

  @maxLength(80)
  region: string;

  defaultEncryption: boolean = true;
}

/** Physical object. Metadata service references this by id. */
@table("storage_objects")
model StorageObject {
  ...FileVault.Shared.Entity;
  @index
  bucketId: uuid;

  @unique
  @maxLength(512)
  objectKey: string;

  sizeBytes: int64;

  @maxLength(128)
  sha256: string;

  @maxLength(160)
  mediaType: string;

  state: StorageObjectState = StorageObjectState.pending;

  @maxLength(255)
  encryptionKeyRef?: string;

  @foreignKey("bucketId")
  @onDelete("RESTRICT")
  bucket: StorageBucket;
}

/** Durable upload session for chunked or signed-url uploads. */
@table("upload_sessions")
model UploadSession {
  ...FileVault.Shared.Entity;
  @index
  accountId: uuid;

  @index
  bucketId: uuid;

  @index
  storageObjectId?: uuid;

  @maxLength(240)
  fileName: string;

  expectedSizeBytes: int64;
  state: UploadState = UploadState.initiated;
  expiresAt: utcDateTime;
  completedAt?: utcDateTime;

  @foreignKey("bucketId")
  bucket: StorageBucket;
}

/** Chunk or multipart part recorded for resumable uploads. */
@table("upload_parts")
model UploadPart {
  ...FileVault.Shared.Entity;
  @index
  uploadSessionId: uuid;

  partNumber: int32;
  offsetBytes: int64;
  sizeBytes: int64;

  @maxLength(128)
  sha256: string;

  @unique
  sessionPart: composite<"uploadSessionId", "partNumber">;

  @foreignKey("uploadSessionId")
  @onDelete("CASCADE")
  uploadSession: UploadSession;
}
