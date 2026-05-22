import "@typespec/protobuf";

using Protobuf;

@package({
  name: "filevault.processing.v1",
})
namespace FileVault.Processing;

@Protobuf.service
interface ProcessingService {
  submitJob(...SubmitProcessingJobRequest): ProcessingJobView;

  getJob(...GetProcessingJobRequest): ProcessingJobView;

  listJobs(...ListProcessingJobsRequest): ListProcessingJobsResponse;

  @stream(StreamMode.Out)
  watchJob(...GetProcessingJobRequest): ProcessingEvent;
}
