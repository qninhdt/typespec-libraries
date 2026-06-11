// Entity cross-emitter example for @qninhdt/typespec-protobuf.
//
// Demonstrates @entity — a single declaration that produces BOTH an ORM table
// (ent/sqlmodel) AND a proto message with allocator-assigned field numbers.
// Mixin columns auto-propagate into the proto message. ORM-only and proto-only
// fields opt out with the qualified @ignore decorators.
//
// Requires BOTH libraries in scope, so @ignore must be qualified.

import "@qninhdt/typespec-protobuf";
import "@qninhdt/typespec-orm";

using Openlet.Proto;
using Qninhdt.Orm;

@package("openlet.user.v1", #{
  goPackage: "github.com/openlet/user-service/proto/gen/go/openlet/user/v1",
})
namespace Openlet.UserProto;

// Reusable ORM mixin — its columns auto-appear in the proto message.
model Timestamps {
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

@entity
model UserProfile {
  @key userId: uuid; // proto field 1 (allocated)
  displayName?: text; // proto field 2 (optional on the wire)
  avatarUrl?: text; // proto field 3

  ...Timestamps; // created_at / updated_at auto-included

  // ORM-only column: a DB counter that never crosses the wire.
  @Qninhdt.Orm.ignore internalRevision: int64;

  // proto-only suppression: stays in the DB, dropped from proto.
  @Openlet.Proto.ignore passwordHash?: text;
}

// A plain proto-only message can coexist with entities in the same package.
@message
model BatchGetUsersRequest {
  @field(1) userIds: string[];
}
