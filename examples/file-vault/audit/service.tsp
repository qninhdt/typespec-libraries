import "@qninhdt/typespec-protobuf";

using Qninhdt.Proto;

@protoPackage("filevault.audit.v1")
namespace FileVault.Audit;

@protoService
interface AuditService {
  recordEvent(...RecordAuditEventRequest): AuditEventView;

  queryEvents(...QueryAuditEventsRequest): QueryAuditEventsResponse;
}
