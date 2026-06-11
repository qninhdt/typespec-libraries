import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace FileVault.Search;

enum IndexState {
  pending: "pending",
  indexed: "indexed",
  failed: "failed",
  removed: "removed",
}

/** Search projection stored by the search service. */
@table("search_documents")
model SearchDocument {
  ...FileVault.Shared.Entity;
  @unique
  fileId: uuid;

  @index
  ownerId: uuid;

  @maxLength(240)
  title: string;

  @maxLength(160)
  mediaType: string;

  @maxLength(16)
  language?: string;

  state: IndexState = IndexState.pending;
  indexedAt?: utcDateTime;
  contentVersion: int32 = 1;
  tagsJson?: jsonb;
}

/** Checkpoint for async index workers. */
@table("search_index_checkpoints")
model SearchIndexCheckpoint {
  ...FileVault.Shared.Entity;
  @unique
  @maxLength(120)
  shardKey: string;

  @maxLength(160)
  lastProcessedEventId?: string;
  lastProcessedAt?: utcDateTime;
}
