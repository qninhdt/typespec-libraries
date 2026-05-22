import "@qninhdt/typespec-orm";
import "@typespec/protobuf";

using Qninhdt.Orm;
using Protobuf;

namespace FileVault.Storage;

enum StorageObjectStateCode {
  unspecified: 0,
  pending: 1,
  available: 2,
  quarantined: 3,
  deleted: 4,
}
model StorageObjectView {
  @field(1)
  id: uuid;

  @field(2)
  bucket: string;

  @field(3)
  objectKey: string;

  @field(4)
  sizeBytes: int64;

  @field(5)
  sha256: string;

  @field(6)
  mediaType: string;

  @field(7)
  state: StorageObjectStateCode;
}
model BeginUploadRequest {
  @field(1)
  accountId: uuid;

  @field(2)
  fileName: string;

  @field(3)
  mediaType: string;

  @field(4)
  expectedSizeBytes: int64;

  @field(5)
  expectedSha256?: string;
}
model BeginUploadResponse {
  @field(1)
  uploadSessionId: uuid;

  @field(2)
  storageObjectId: uuid;

  @field(3)
  signedUploadUrl?: string;

  @field(4)
  expiresAtIso: string;
}
model UploadChunk {
  @field(1)
  uploadSessionId: uuid;

  @field(2)
  partNumber: int32;

  @field(3)
  offsetBytes: int64;

  @field(4)
  data: bytes;

  @field(5)
  finalChunk: boolean;
}
model UploadReceipt {
  @field(1)
  uploadSessionId: uuid;

  @field(2)
  bytesReceived: int64;

  @field(3)
  partCount: int32;
}
model CompleteUploadRequest {
  @field(1)
  uploadSessionId: uuid;

  @field(2)
  sha256: string;

  @field(3)
  sizeBytes: int64;
}
model CompleteUploadResponse {
  @field(1)
  object: StorageObjectView;
}
model GetDownloadUrlRequest {
  @field(1)
  storageObjectId: uuid;

  @field(2)
  requesterId: uuid;

  @field(3)
  expiresInSeconds: int32;
}
model GetDownloadUrlResponse {
  @field(1)
  storageObjectId: uuid;

  @field(2)
  signedDownloadUrl: string;

  @field(3)
  expiresAtIso: string;
}
