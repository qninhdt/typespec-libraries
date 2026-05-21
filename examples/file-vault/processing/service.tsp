import "@qninhdt/typespec-protobuf";

using Qninhdt.Proto;

@protoPackage("filevault.processing.v1")
namespace FileVault.Processing;

@protoService
interface ProcessingService {
  submitJob(...SubmitProcessingJobRequest): ProcessingJobView;

  getJob(...GetProcessingJobRequest): ProcessingJobView;

  listJobs(...ListProcessingJobsRequest): ListProcessingJobsResponse;

  @stream(StreamMode.Out)
  watchJob(...GetProcessingJobRequest): ProcessingEvent;
}
