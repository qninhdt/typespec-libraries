# File Vault

A multi-service example that demonstrates the playbook for larger
systems: nine services, mixed Go and Python, upstream Protobuf
contracts, frontend Zod, and DBML docs. Source is at
[`examples/file-vault/`](https://github.com/qninhdt/typespec-libraries/tree/main/examples/file-vault).

## What it generates

| Service             | Language   | Emitter           |
| ------------------- | ---------- | ----------------- |
| `identity-svc`      | Go         | typespec-ent      |
| `metadata-svc`      | Go         | typespec-ent      |
| `storage-svc`       | Go         | typespec-ent      |
| `sharing-svc`       | Go         | typespec-ent      |
| `notifications-svc` | Go         | typespec-ent      |
| `audit-svc`         | Go         | typespec-ent      |
| `processing-svc`    | Python     | typespec-sqlmodel |
| `search-svc`        | Python     | typespec-sqlmodel |
| `assistant-svc`     | Python     | typespec-sqlmodel |
| `frontend`          | TypeScript | typespec-zod      |
| `docs`              | DBML       | typespec-dbml     |

Plus upstream `@typespec/protobuf` for cross-service gRPC and Kafka
event contracts.

## Repository layout

```
examples/file-vault/
  contracts/
    shared/                    # SoftDeletableEntity, common scalars
    identity/                  # tables.tsp + dtos.tsp
    metadata/
    storage/
    sharing/
    notifications/
    audit/
    processing/
    search/
    assistant/
    frontend/                  # @scope("frontend") forms
  services/
    identity-svc/
    metadata-svc/
    storage-svc/
    sharing-svc/
    notifications-svc/
    audit-svc/
    processing-svc/
    search-svc/
    assistant-svc/
    frontend/
    docs/
```

Each service has `main.tsp`, `tspconfig.yaml`, and (for backend
services) `grpc.tsp`.

## How services scope themselves

Each service includes only its own bounded context:

```yaml
# services/storage-svc/tspconfig.yaml
emit:
  - "@qninhdt/typespec-ent"
  - "@typespec/protobuf"

options:
  "@qninhdt/typespec-ent":
    output-dir: "../../../outputs/file-vault/storage-svc/ent"
    standalone: true
    library-name: "github.com/acme/file-vault-storage"
    collection-strategy: "jsonb"
    include: ["FileVault.Storage"]
    auto-include-dependencies: true

  "@typespec/protobuf":
    output-dir: "../../../outputs/file-vault/storage-svc/protobuf"
```

`include: ["FileVault.Storage"]` says: only emit models in this
service's namespace. `auto-include-dependencies: true` pulls in
shared mixins (`FileVault.Shared.SoftDeletableEntity`) and any
cross-namespace lookup targets without enumerating them by hand.

## A representative contract

```typespec
// contracts/storage/tables.tsp
import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace FileVault.Storage;

enum StorageObjectState { active, archived, deleted }
enum UploadState { pending, in_progress, complete, failed }

@table("storage_buckets")
model StorageBucket {
  ...FileVault.Shared.SoftDeletableEntity;
  @unique @maxLength(80) name: string;
  @maxLength(2) region: string;
  @check("buckets_region_lowercase", "region = lower(region)")
  regionCheck?: boolean;
}

@table("storage_objects")
model StorageObject {
  ...FileVault.Shared.SoftDeletableEntity;
  bucketId: uuid;
  @foreignKey("bucketId") bucket: StorageBucket;
  @maxLength(1024) key: string;
  size: int64;
  state: StorageObjectState = StorageObjectState.active;
}
```

Notice that this file has zero references to `tspconfig.yaml`,
`@Protobuf.service`, or any service-level concept. **The contracts
folder is read-only schema.** Service-level concerns live under
`services/`.

## Cross-language services

The Python services follow the same pattern with SQLModel:

```yaml
# services/processing-svc/tspconfig.yaml
emit:
  - "@qninhdt/typespec-sqlmodel"
  - "@typespec/protobuf"

options:
  "@qninhdt/typespec-sqlmodel":
    output-dir: "../../../outputs/file-vault/processing-svc/sqlmodel"
    standalone: true
    library-name: "file_vault_processing"
    collection-strategy: "jsonb"
    emit-atlas: true
    include: ["FileVault.Processing"]
    auto-include-dependencies: true
```

The Go and Python services don't share an emitter — but they share the
schema. A `bytes` column means `[]byte` in Go and `bytes` in Python,
because the orm core resolved it once.

## Cross-service contracts

Services that need to consume each other's events declare those
contracts under their own namespace, not by importing another team's
`tables.tsp`. The protobuf emitter writes the IDLs into each service's
output:

```typespec
// contracts/storage/events.tsp
namespace FileVault.Storage.Events;

@data
model UploadCompleted {
  @field(1) bucketName: string;
  @field(2) objectKey: string;
  @field(3) sizeBytes: int64;
  @field(4) etag: string;
  @field(5) uploadedAt: utcDateTime;
}
```

Other services subscribing to `upload-completed` import the event
DTO into their own contracts so it's clear what they consume.

## Frontend's view

```yaml
# services/frontend/tspconfig.yaml
emit:
  - "@qninhdt/typespec-zod"

options:
  "@qninhdt/typespec-zod":
    output-dir: "../../../outputs/file-vault/frontend/zod"
    standalone: true
    library-name: "@acme/file-vault-forms"
    include: ["#frontend"]
    auto-include-dependencies: true
```

The frontend uses `#frontend` — it doesn't include any namespace at
all. Models from `FileVault.Identity`, `FileVault.Storage`, and
`FileVault.Sharing` all show up if (and only if) they're tagged
`@scope("frontend")`.

## Docs sees everything

```yaml
# services/docs/tspconfig.yaml
emit:
  - "@qninhdt/typespec-dbml"

options:
  "@qninhdt/typespec-dbml":
    output-dir: "../../../outputs/file-vault/docs/dbml"
    project-name: "file_vault"
    split-by-namespace: true
```

Docs uses no filter — its DBML output covers the whole system. With
`split-by-namespace: true`, you get one `.dbml` per namespace, which
diffs cleanly when teams update their slice.

## Trying it locally

```sh
pnpm run compile-example:file-vault
pnpm run validate-examples:ent
pnpm run validate-examples:sqlmodel
pnpm run validate-examples:zod
pnpm run validate-examples:protobuf
```

## Takeaways

- **One contract**, eleven service outputs.
- Each backend service is fully self-contained — its `outputs/<svc>/`
  tree drops directly into the service repo.
- Adding a tenth backend service is a `tspconfig.yaml` away — no
  changes to `contracts/` required.
- The protobuf emitter handles cross-service contracts; the orm
  emitters handle persistence. Each does one thing.
