import "@qninhdt/typespec-orm";
import "@qninhdt/typespec-protobuf";

using Qninhdt.Orm;
using Qninhdt.Proto;

@protoPackage("filevault.shared.v1")
namespace FileVault.Shared;

// ─── Custom Scalars ─────────────────────────────────────────────────────────

@minLength(1)
@maxLength(255)
scalar DisplayName extends string;

@minLength(8)
@maxLength(128)
@pattern("^(?=.*[A-Z])(?=.*[0-9]).*$")
scalar StrongPassword extends string;

@minValue(1)
@maxValue(100)
scalar PageSize extends uint32;

@minLength(1)
@maxLength(512)
scalar SearchQuery extends string;

// ─── Data Models ────────────────────────────────────────────────────────────
model ActorRef {
  id: uuid;

  displayName: DisplayName;

  email?: email;
}
model PageRequest {
  pageSize: PageSize;

  pageToken?: string;
}
model PageInfo {
  nextPageToken?: string;

  totalCount?: uint64;
}
model StringPair {
  key: string;

  value: string;
}
model Ack {
  ok: boolean;

  message?: string;
}
