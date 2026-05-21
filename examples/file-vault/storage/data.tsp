import "@qninhdt/typespec-orm";
import "@qninhdt/typespec-protobuf";

using Qninhdt.Orm;
using Qninhdt.Proto;

namespace FileVault.Storage;

enum StorageObjectStateCode {
  unspecified: 0,
  pending: 1,
  available: 2,
  quarantined: 3,
  deleted: 4,
}
model StorageObjectView {
  id: uuid;

  bucket: string;

  objectKey: string;

  sizeBytes: int64;

  sha256: string;

  mediaType: string;

  state: StorageObjectStateCode;
}
model BeginUploadRequest {
  accountId: uuid;

  fileName: string;

  mediaType: string;

  expectedSizeBytes: int64;

  expectedSha256?: string;
}
model BeginUploadResponse {
  uploadSessionId: uuid;

  storageObjectId: uuid;

  signedUploadUrl?: string;

  expiresAtIso: string;
}
model UploadChunk {
  uploadSessionId: uuid;

  partNumber: int32;

  offsetBytes: int64;

  data: bytes;

  finalChunk: boolean;
}
model UploadReceipt {
  uploadSessionId: uuid;

  bytesReceived: int64;

  partCount: int32;
}
model CompleteUploadRequest {
  uploadSessionId: uuid;

  sha256: string;

  sizeBytes: int64;
}
model CompleteUploadResponse {
  object: StorageObjectView;
}
model GetDownloadUrlRequest {
  storageObjectId: uuid;

  requesterId: uuid;

  expiresInSeconds: int32;
}
model GetDownloadUrlResponse {
  storageObjectId: uuid;

  signedDownloadUrl: string;

  expiresAtIso: string;
}
