import "@qninhdt/typespec-orm";
import "@typespec/protobuf";

using Qninhdt.Orm;
using Protobuf;

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
  @field(1)
  id: uuid;

  @field(2)
  actorId?: uuid;

  @field(3)
  action: string;

  @field(4)
  resourceType: string;

  @field(5)
  resourceId?: uuid;

  @field(6)
  severity: AuditSeverityCode;

  @field(7)
  createdAtIso: string;

  @field(8)
  metadata: FileVault.Shared.StringPair[];
}
model RecordAuditEventRequest {
  @field(1)
  actorId?: uuid;

  @field(2)
  action: string;

  @field(3)
  resourceType: string;

  @field(4)
  resourceId?: uuid;

  @field(5)
  severity: AuditSeverityCode;

  @field(6)
  requestId?: string;

  @field(7)
  metadata: FileVault.Shared.StringPair[];
}
model QueryAuditEventsRequest {
  @field(1)
  actorId?: uuid;

  @field(2)
  resourceType?: string;

  @field(3)
  resourceId?: uuid;

  @field(4)
  actionPrefix?: string;

  @field(5)
  page: FileVault.Shared.PageRequest;
}
model QueryAuditEventsResponse {
  @field(1)
  events: AuditEventView[];

  @field(2)
  page: FileVault.Shared.PageInfo;
}
