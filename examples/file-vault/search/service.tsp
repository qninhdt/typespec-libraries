import "@qninhdt/typespec-protobuf";

using Qninhdt.Proto;

@protoPackage("filevault.search.v1")
namespace FileVault.Search;

@protoService
interface SearchService {
  searchFiles(...SearchFilesRequest): SearchFilesResponse;

  suggestLabels(...SuggestLabelsRequest): SuggestLabelsResponse;

  reindexFile(...ReindexFileRequest): FileVault.Shared.Ack;
}
