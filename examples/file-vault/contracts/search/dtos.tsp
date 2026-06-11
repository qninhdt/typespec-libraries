import "@qninhdt/typespec-orm";
import "@typespec/protobuf";

using Qninhdt.Orm;
using Protobuf;

namespace FileVault.Search;
model SearchFilesRequest {
  @field(1)
  ownerId: uuid;

  @field(2)
  query: FileVault.Shared.SearchQuery;

  @field(3)
  mediaTypes: string[];

  @field(4)
  labels: string[];

  @field(5)
  page: FileVault.Shared.PageRequest;
}
model SearchHit {
  @field(1)
  fileId: uuid;

  @field(2)
  snippet?: string;

  @field(3)
  score: float32;
}
model SearchFilesResponse {
  @field(1)
  hits: SearchHit[];

  @field(2)
  page: FileVault.Shared.PageInfo;
}
model SuggestLabelsRequest {
  @field(1)
  ownerId: uuid;

  @field(2)
  prefix: string;

  @field(3)
  limit: int32;
}
model SuggestLabelsResponse {
  @field(1)
  labels: string[];
}
model ReindexFileRequest {
  @field(1)
  fileId: uuid;

  @field(2)
  requestedBy: uuid;
}
