import "@typespec/protobuf";

using Protobuf;

@package({
  name: "filevault.audit.v1",
})
namespace FileVault.Audit;

@Protobuf.service
interface AuditService {
  recordEvent(...RecordAuditEventRequest): AuditEventView;

  queryEvents(...QueryAuditEventsRequest): QueryAuditEventsResponse;
}
