import "@qninhdt/typespec-orm";
import "@typespec/protobuf";

using Qninhdt.Orm;
using Protobuf;

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
  @field(1)
  id: uuid;

  @field(2)
  fileId: uuid;

  @field(3)
  versionId?: uuid;

  @field(4)
  kind: ProcessingKindCode;

  @field(5)
  status: ProcessingStatusCode;

  @field(6)
  startedAtIso?: string;

  @field(7)
  finishedAtIso?: string;

  @field(8)
  errorMessage?: string;
}
model SubmitProcessingJobRequest {
  @field(1)
  fileId: uuid;

  @field(2)
  versionId?: uuid;

  @field(3)
  kind: ProcessingKindCode;

  @field(4)
  requestedBy: uuid;

  @field(5)
  parameters: FileVault.Shared.StringPair[];
}
model GetProcessingJobRequest {
  @field(1)
  jobId: uuid;
}
model ListProcessingJobsRequest {
  @field(1)
  fileId: uuid;

  @field(2)
  page: FileVault.Shared.PageRequest;
}
model ListProcessingJobsResponse {
  @field(1)
  jobs: ProcessingJobView[];

  @field(2)
  page: FileVault.Shared.PageInfo;
}
model ProcessingArtifactView {
  @field(1)
  id: uuid;

  @field(2)
  jobId: uuid;

  @field(3)
  fileId: uuid;

  @field(4)
  kind: ArtifactKindCode;

  @field(5)
  storageObjectId?: uuid;

  @field(6)
  textValue?: string;
}
model ProcessingEvent {
  @field(1)
  job: ProcessingJobView;

  @field(2)
  artifacts: ProcessingArtifactView[];
}
