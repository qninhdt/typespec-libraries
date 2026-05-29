// Basic service example for @qninhdt/typespec-protobuf.
//
// Demonstrates: @package, @message, @field, @reserve, @Openlet.Proto.service,
// auto snake_case field names, well-known type mapping (utcDateTime), and the
// empty-request → google.protobuf.Empty rewrite.
//
// Compile with a tspconfig that emits @qninhdt/typespec-protobuf.

import "@qninhdt/typespec-protobuf";

using Openlet.Proto;

@package("openlet.example.v1", #{
  goPackage: "github.com/openlet/example/proto/gen/go/openlet/example/v1",
})
namespace Openlet.ExampleProto;

// camelCase identifiers — the emitter converts them to snake_case on the wire.
@message
@reserve(#[100, 199])
model GetUserRequest {
  @field(1) userId: string;
}

@message
model GetUserResponse {
  @field(1) userId: string;
  @field(2) displayName: string;
  @field(3) createdAt: utcDateTime; // → google.protobuf.Timestamp
}

@message
model PingResponse {
  @field(1) serverTime: utcDateTime;
}

@Openlet.Proto.service
interface ExampleService {
  // GetUserRequest → request message; GetUserResponse → response.
  getUser(...GetUserRequest): GetUserResponse;

  // No parameters → request rewritten to google.protobuf.Empty.
  ping(): PingResponse;
}
