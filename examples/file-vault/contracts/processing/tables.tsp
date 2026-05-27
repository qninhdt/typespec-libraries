import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace FileVault.Processing;

enum ProcessingKind {
  classify: "classify",
  extractText: "extract_text",
  summarize: "summarize",
  generatePreview: "generate_preview",
  scanMalware: "scan_malware",
}

enum ProcessingStatus {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  canceled: "canceled",
}

enum ArtifactKind {
  extractedText: "extracted_text",
  summary: "summary",
  previewImage: "preview_image",
  thumbnail: "thumbnail",
  classification: "classification",
}

/** Durable background job for content processing workers. */
@table("processing_jobs")
model ProcessingJob {
  ...FileVault.Shared.Entity;
  @index
  fileId: uuid;

  @index
  versionId?: uuid;

  kind: ProcessingKind;

  @index
  status: ProcessingStatus = ProcessingStatus.queued;

  priority: int32 = 100;
  attempts: int32 = 0;
  scheduledAt: utcDateTime;
  startedAt?: utcDateTime;
  finishedAt?: utcDateTime;

  @maxLength(512)
  errorMessage?: string;

  parametersJson?: jsonb;
}

/** Artifact produced by a processing job. */
@table("processing_artifacts")
model ProcessingArtifact {
  ...FileVault.Shared.Entity;
  @index
  jobId: uuid;

  @index
  fileId: uuid;

  kind: ArtifactKind;
  storageObjectId?: uuid;
  textValue?: text;
  metadataJson?: jsonb;

  @foreignKey("jobId")
  @onDelete("CASCADE")
  job: ProcessingJob;
}

/** Latest summary surfaced in file details and search snippets. */
@table("file_summaries")
model FileSummaryRecord {
  ...FileVault.Shared.Entity;
  @unique
  fileId: uuid;

  summary: text;

  @maxLength(120)
  modelName: string;

  generatedAt: utcDateTime;
}

/** Extracted searchable text. Large blobs may be stored externally. */
@table("extracted_texts")
model ExtractedText {
  ...FileVault.Shared.Entity;
  @unique
  fileId: uuid;

  @maxLength(16)
  language?: string;

  content: text;
  extractionVersion: int32 = 1;
}
