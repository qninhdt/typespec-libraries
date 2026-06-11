import "@typespec/protobuf";

using Protobuf;

@package({
  name: "filevault.storage.v1",
})
namespace FileVault.Storage;

@Protobuf.service
interface StorageService {
  beginUpload(...BeginUploadRequest): BeginUploadResponse;

  @stream(StreamMode.In)
  upload(...UploadChunk): UploadReceipt;

  completeUpload(...CompleteUploadRequest): CompleteUploadResponse;

  getDownloadUrl(...GetDownloadUrlRequest): GetDownloadUrlResponse;
}
