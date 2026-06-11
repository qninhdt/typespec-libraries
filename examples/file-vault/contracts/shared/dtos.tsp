import "@qninhdt/typespec-orm";
import "@typespec/protobuf";

using Qninhdt.Orm;
using Protobuf;

@package({
  name: "filevault.shared.v1",
})
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
  @field(1)
  id: uuid;

  @field(2)
  displayName: DisplayName;

  @field(3)
  email?: email;
}
model PageRequest {
  @field(1)
  pageSize: PageSize;

  @field(2)
  pageToken?: string;
}
model PageInfo {
  @field(1)
  nextPageToken?: string;

  @field(2)
  totalCount?: uint64;
}
model StringPair {
  @field(1)
  key: string;

  @field(2)
  value: string;
}
model Ack {
  @field(1)
  ok: boolean;

  @field(2)
  message?: string;
}
