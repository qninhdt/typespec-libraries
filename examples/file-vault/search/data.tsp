import "@qninhdt/typespec-orm";
import "@qninhdt/typespec-protobuf";

using Qninhdt.Orm;
using Qninhdt.Proto;

namespace FileVault.Search;
model SearchFilesRequest {
  ownerId: uuid;

  query: FileVault.Shared.SearchQuery;

  mediaTypes: string[];

  labels: string[];

  page: FileVault.Shared.PageRequest;
}
model SearchHit {
  file: FileVault.Metadata.FileView;

  snippet?: string;

  score: float32;
}
model SearchFilesResponse {
  hits: SearchHit[];

  page: FileVault.Shared.PageInfo;
}
model SuggestLabelsRequest {
  ownerId: uuid;

  prefix: string;

  limit: int32;
}
model SuggestLabelsResponse {
  labels: string[];
}
model ReindexFileRequest {
  fileId: uuid;

  requestedBy: uuid;
}
