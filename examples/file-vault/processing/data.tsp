import "@qninhdt/typespec-orm";
import "@qninhdt/typespec-protobuf";

using Qninhdt.Orm;
using Qninhdt.Proto;

namespace FileVault.Processing;

enum ProcessingKindCode {
  unspecified: 0,
  classifyFile: 1,
  extractText: 2,
  generateSummary: 3,
  generatePreview: 4,
  embedContent: 5,
}

enum ProcessingStatusCode {
  unspecified: 0,
  queued: 1,
  running: 2,
  completed: 3,
  failed: 4,
  canceled: 5,
}

enum ArtifactKindCode {
  unspecified: 0,
  textExtraction: 1,
  summary: 2,
  previewImage: 3,
  embedding: 4,
}
model ProcessingJobView {
  id: uuid;

  fileId: uuid;

  versionId?: uuid;

  kind: ProcessingKindCode;

  status: ProcessingStatusCode;

  startedAtIso?: string;

  finishedAtIso?: string;

  errorMessage?: string;
}
model SubmitProcessingJobRequest {
  fileId: uuid;

  versionId?: uuid;

  kind: ProcessingKindCode;

  requestedBy: uuid;

  parameters: FileVault.Shared.StringPair[];
}
model GetProcessingJobRequest {
  jobId: uuid;
}
model ListProcessingJobsRequest {
  fileId: uuid;

  page: FileVault.Shared.PageRequest;
}
model ListProcessingJobsResponse {
  jobs: ProcessingJobView[];

  page: FileVault.Shared.PageInfo;
}
model ProcessingArtifactView {
  id: uuid;

  jobId: uuid;

  fileId: uuid;

  kind: ArtifactKindCode;

  storageObjectId?: uuid;

  textValue?: string;
}
model ProcessingEvent {
  job: ProcessingJobView;

  artifacts: ProcessingArtifactView[];
}
