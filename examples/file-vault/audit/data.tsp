import "@qninhdt/typespec-orm";
import "@qninhdt/typespec-protobuf";

using Qninhdt.Orm;
using Qninhdt.Proto;

namespace FileVault.Audit;

enum AuditSeverityCode {
  unspecified: 0,
  debug: 1,
  info: 2,
  warning: 3,
  error: 4,
  critical: 5,
}
model AuditEventView {
  id: uuid;

  actorId?: uuid;

  action: string;

  resourceType: string;

  resourceId?: uuid;

  severity: AuditSeverityCode;

  createdAtIso: string;

  metadata: FileVault.Shared.StringPair[];
}
model RecordAuditEventRequest {
  actorId?: uuid;

  action: string;

  resourceType: string;

  resourceId?: uuid;

  severity: AuditSeverityCode;

  requestId?: string;

  metadata: FileVault.Shared.StringPair[];
}
model QueryAuditEventsRequest {
  actorId?: uuid;

  resourceType?: string;

  resourceId?: uuid;

  actionPrefix?: string;

  page: FileVault.Shared.PageRequest;
}
model QueryAuditEventsResponse {
  events: AuditEventView[];

  page: FileVault.Shared.PageInfo;
}
