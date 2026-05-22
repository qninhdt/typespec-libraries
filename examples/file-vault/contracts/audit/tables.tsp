import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace FileVault.Audit;

enum AuditSeverity {
  info: "info",
  warning: "warning",
  critical: "critical",
}

/** Append-only security and compliance event. */
@table("audit_events")
model AuditEvent {
  ...FileVault.Shared.Entity;
  @index
  actorId?: uuid;

  @maxLength(160)
  action: string;

  @maxLength(80)
  resourceType: string;

  resourceId?: uuid;
  severity: AuditSeverity = AuditSeverity.info;
  requestId?: string;
  ipAddressHash?: string;
  userAgentHash?: string;
  metadataJson?: jsonb;
}

/** Outbox checkpoint for exporting audit events to external SIEM/storage. */
@table("audit_export_checkpoints")
model AuditExportCheckpoint {
  ...FileVault.Shared.Entity;
  @unique
  sinkName: string;

  lastEventId?: uuid;
  exportedAt?: utcDateTime;
}
