// Cross-package import example for @qninhdt/typespec-protobuf-openlet.
//
// Demonstrates how a type in one @package referenced from another emits an
// `import` statement + a fully-qualified type name, instead of inlining a copy.
// The emitter writes ONE .proto per package:
//   openlet/events/v1.proto   (events.FileProcessed)
//   openlet/file/v1.proto     (file.FileInfo, imports events)
//
// A consumer that should NOT re-emit a package it only references uses the
// `emit-only` tspconfig option.

import "@qninhdt/typespec-protobuf-openlet";

using Openlet.Proto;

// ── Source package ─────────────────────────────────────────────────────────
@package("openlet.events.v1", #{
  goPackage: "github.com/openlet/events/proto/gen/go/openlet/events/v1",
})
namespace Openlet.EventsProto {
  @message
  model FileProcessed {
    @field(1) fileId: string;
    @field(2) processedAt: utcDateTime;
  }
}

// ── Consumer package ───────────────────────────────────────────────────────
@package("openlet.file.v1", #{
  goPackage: "github.com/openlet/file-service/proto/gen/go/openlet/file/v1",
})
namespace Openlet.FileProto {
  @message
  model FileInfo {
    @field(1) id: string;

    // Cross-package reference → emits
    //   openlet.events.v1.FileProcessed last_event = 2;
    // and adds `import "openlet/events/v1.proto";` to openlet/file/v1.proto.
    @field(2) lastEvent: Openlet.EventsProto.FileProcessed;
  }
}
