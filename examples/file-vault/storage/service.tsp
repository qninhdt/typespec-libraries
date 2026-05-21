import "@qninhdt/typespec-protobuf";

using Qninhdt.Proto;

@protoPackage("filevault.storage.v1")
namespace FileVault.Storage;

@protoService
interface StorageService {
  beginUpload(...BeginUploadRequest): BeginUploadResponse;

  @stream(StreamMode.In)
  upload(...UploadChunk): UploadReceipt;

  completeUpload(...CompleteUploadRequest): CompleteUploadResponse;

  getDownloadUrl(...GetDownloadUrlRequest): GetDownloadUrlResponse;
}
