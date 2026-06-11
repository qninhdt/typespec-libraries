import "@typespec/protobuf";

using Protobuf;

@package({
  name: "filevault.search.v1",
})
namespace FileVault.Search;

@Protobuf.service
interface SearchService {
  searchFiles(...SearchFilesRequest): SearchFilesResponse;

  suggestLabels(...SuggestLabelsRequest): SuggestLabelsResponse;

  reindexFile(...ReindexFileRequest): FileVault.Shared.Ack;
}
