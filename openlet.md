# Openlet — Team 1 MVP Brainstorm Summary

**Date:** 2026-05-22
**Scope:** File management SaaS + personal AI assistant (Leti). Excludes Team 2 Openlet AI core (Indexer/Retriever/Lets) — separate brainstorm later.
**Source drafts:** `drafts/draft-1.md` ... `drafts/draft-5.md`, `drafts/techstack.md`, `drafts/ui-rules.md`

---

## 1. Problem Statement

Build a cloud SaaS where users upload, organize, search, and share documents across multiple workspaces. Each user has a personal AI assistant (**Leti**) acting on their behalf with delegated permissions. System designed so Team 2's research project (Openlet AI core — Indexer/Retriever over "Lets") can plug in later as another service-account client without rewriting Team 1.

**Two teams, separate cadence:**

- **Team 1** (this brainstorm): file mgmt backend + web + Leti assistant. Cloud-first. MVP target.
- **Team 2** (deferred): Openlet AI core. Local-first proof-of-concept. Researched separately.

---

## 2. Locked Decisions

| Area             | Decision                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build target     | Team 1: cloud multi-user file mgmt + Leti assistant                                                                                                                                            |
| Deployment       | Cloud multi-tenant from day 1                                                                                                                                                                  |
| Backend lang     | Go (services), Python (file worker, Leti)                                                                                                                                                      |
| Frontend         | Next.js + Shadcn + Tailwind + Tanstack Query + Zod + next-intl                                                                                                                                 |
| AI runtime       | Python + LangChain                                                                                                                                                                             |
| Database         | PostgreSQL (Ent + Atlas)                                                                                                                                                                       |
| Object storage   | S3-compatible (R2 / GCS / S3)                                                                                                                                                                  |
| Cache            | Redis                                                                                                                                                                                          |
| Event bus        | Redpanda (Kafka API)                                                                                                                                                                           |
| Auth             | Google OAuth2 + JWT RS256, JWKS. Zero-trust: gateway pre-checks; **every service verifies the original JWT** via JWKS. Never trust upstream headers.                                           |
| Workspace owner  | Polymorphic: user OR service-account                                                                                                                                                           |
| Service accounts | Standalone only (Team 2 Openlet + future external integrations). Leti is **NOT** an SA.                                                                                                        |
| Leti auth        | Internal first-class service. Acts via **delegated JWT** — RFC 8693 token-exchange against auth-service mints a short-TTL token with `act={agent:"leti"}` claim while keeping `sub = user_id`. |
| Sharing          | Workspace-level only (permanent, not just MVP) — owner / member / viewer                                                                                                                       |
| Permission roles | owner / member / viewer at workspace                                                                                                                                                           |
| MVP features     | File CRUD + folders, workspace + sharing, full-text search + tagging                                                                                                                           |
| Search           | Postgres FTS (tsvector + GIN), workspace-scoped                                                                                                                                                |
| Leti delegation  | Per-tool default + per-action override (auto / ask)                                                                                                                                            |
| Repo layout      | Monorepo                                                                                                                                                                                       |
| Internal comms   | gRPC                                                                                                                                                                                           |
| External API     | REST + SSE                                                                                                                                                                                     |
| Async pipeline   | Redpanda (events + jobs)                                                                                                                                                                       |
| Service count    | 5 backend + 1 web + 1 worker + 1 ai assistant                                                                                                                                                  |

**Deferred to v2 (explicitly out of scope):**

- Trash / soft-delete + restore
- File versioning
- File-level comments
- File/folder-level sharing (workspace-level is permanent design)
- Notifications across channels (email, push) — in-app only in MVP
- Agent-to-agent chat (Leti ↔ Team 2 Openlet)
- Team 2 Openlet AI core integration

---

## 3. Architecture (Approach C — Pragmatic Split)

### 3.1 Service inventory

| Service                  | Lang    | Purpose                                                                                                                                                                                                                                             | Owns DB schema                                        |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **auth-service**         | Go      | Google OAuth2 flow, JWT issue/verify/refresh, JWKS endpoint, service-account credentials, key rotation                                                                                                                                              | `auth_*` tables                                       |
| **user-service**         | Go      | User profile, settings, quota, subscription, credit/billing state                                                                                                                                                                                   | `user_*` tables                                       |
| **file-service**         | Go      | Workspaces, memberships, folders, file metadata, sharing, search index queries                                                                                                                                                                      | `workspace_*`, `file_*`, `share_*` tables             |
| **file-worker**          | Python  | File-pipeline consumer: Magika classification, text extraction (PDF/DOCX/XLSX/PPTX/TXT/MD), FTS indexing, thumbnail generation                                                                                                                      | reads file-service tables                             |
| **leti-service**         | Python  | First-class internal service. LangChain agent: chat sessions, tool execution, per-tool auto/ask policy. Calls other services with the user's **delegated JWT** (RFC 8693 token exchange — adds `act={agent: "leti"}` claim). NOT a service account. | `leti_*` tables (sessions, messages, tool-call audit) |
| **notification-service** | Go      | In-app notifications (file processed, share invite, Leti completed task). Pub-sub via Redpanda. SSE delivery to web.                                                                                                                                | `notif_*` tables                                      |
| **web**                  | Next.js | UI: workspace browser, file ops, share mgmt, Leti chat panel, settings                                                                                                                                                                              | —                                                     |

**Storage handling:** No separate storage-service. file-service uses S3 SDK directly + presigned URLs. Less hops, simpler ops. If multi-cloud or signed-URL minting becomes hot path, extract later.

### 3.2 Communication topology

```
Browser ──HTTPS──> web (Next.js)
                       │
                       │ REST + SSE   (Authorization: Bearer <JWT>)
                       ▼
                  ┌──────────────────────────────────────────────┐
                  │ API Gateway (Nginx/Envoy)                    │
                  │ Pre-check ONLY: signature/exp sanity, rate-  │
                  │ limit by sub, route. Passes JWT through      │
                  │ unchanged. Does NOT confer trust downstream. │
                  └──────────────────────────────────────────────┘
                          │  │  │  │  │
                  gRPC + mTLS, JWT forwarded as metadata
              ┌───────────┘  │  │  │  └─────────────┐
              ▼              ▼  ▼  ▼                ▼
          auth-svc       user  file  leti      notification
                          svc  svc   svc           svc
   (each independently verifies JWT via JWKS — never trusts gateway headers)
                                │ │   │             ▲
                                │ └───┴─────────────┘
                                │      pub-events
                                ▼
                            Redpanda  ───►  file-worker (Py)
                                            (consumes file.uploaded)
```

- **Zero-trust by design.** API gateway is _not_ the security boundary — it's a cheap pre-filter (drops malformed/expired tokens early, rate-limits, routes). Every service independently verifies the **original JWT** via JWKS pulled from auth-service.
- **Never trust upstream-set headers** (`X-User-Id`, `X-Verified`, etc.). Services extract principal locally from the verified JWT.
- **Internal:** gRPC + mTLS (defense in depth: mTLS proves _which service_ is calling; JWT proves _which user/agent_ the call is for).
- **External:** REST (CRUD) + SSE (notifications, Leti streaming chat).
- **Web → backend:** through API gateway only; web never holds service credentials.
- **Events:** Redpanda for async pipeline (file uploaded → worker processes → emits file.processed → notification-svc + file-svc index update).

### 3.3 Why this split (vs alternatives considered)

- **vs modular monolith (A):** keeps Leti's Python runtime + AI cost blast-radius isolated. Auth + user separated because credential mgmt has stricter access controls than profile/quota.
- **vs full microservices per draft-5 (B):** rejected storage-service (premature, adds latency for no benefit at MVP scale). file-service is internally modular (workspace/file/share modules) and can split later when load justifies it.
- **Auth/file-service blind to _external_ agents:** all services see only `principal = {type: user | service_account, id}` plus optional `act` claim. They don't special-case Leti or Team 2. Leti is internal infrastructure (acts via delegated JWT — RFC 8693). Team 2 Openlet (and any future third-party integration) registers as a **standalone service-account**.

---

## 4. Data Model (Key Tables)

### 4.1 Identity & service accounts

```sql
-- auth-service
users(id, email, google_sub, created_at, updated_at)

-- Service accounts: ONLY for external/standalone agents (Team 2 Openlet,
-- future third-party integrations). Leti is NOT an SA — it's an internal
-- service that uses delegated JWT (token exchange) instead.
service_accounts(
  id, name, owner_user_id,
  status, created_at, revoked_at
)
sa_credentials(
  id, sa_id, secret_hash, last_used_at, expires_at
)

refresh_tokens(id, principal_type, principal_id, ...)

-- Optional: track delegated-JWT issuance for audit (not required for auth itself)
delegated_token_grants(
  id, user_id, agent TEXT,           -- 'leti' (extensible)
  issued_at, expires_at, session_id
)
```

### 4.2 Workspace + sharing

```sql
-- file-service
workspaces(
  id, name, description,
  owner_principal_type TEXT CHECK (owner_principal_type IN ('user','service_account')),
  owner_principal_id UUID,
  created_at, updated_at
)
workspace_members(
  workspace_id, principal_type, principal_id,
  role TEXT CHECK (role IN ('owner','member','viewer')),
  invited_by, invited_at, accepted_at
)
```

### 4.3 Files + folders

```sql
folders(
  id, workspace_id, parent_folder_id, name, path,
  created_by_principal_type, created_by_principal_id,
  created_at, updated_at
)
files(
  id, workspace_id, folder_id, name,
  storage_key TEXT,           -- S3 object key
  size_bytes, mime_type, magika_label,
  sha256 TEXT,                -- dedupe within workspace
  status TEXT CHECK (status IN ('uploading','processing','ready','failed')),
  search_vector TSVECTOR,     -- populated by file-worker
  created_by_principal_type, created_by_principal_id,
  created_at, updated_at
)
CREATE INDEX idx_files_search ON files USING GIN(search_vector);
CREATE INDEX idx_files_workspace ON files(workspace_id);

file_tags(file_id, tag, PRIMARY KEY(file_id, tag))
```

### 4.4 Leti

```sql
-- leti-service
leti_sessions(id, user_id, workspace_scope_ids JSONB, created_at, ended_at)
leti_messages(id, session_id, role, content, tokens, created_at)
leti_tool_calls(
  id, session_id, message_id,
  tool_name, args JSONB, result JSONB,
  status TEXT CHECK (status IN ('pending_confirm','approved','denied','executed','failed')),
  policy_used TEXT CHECK (policy_used IN ('auto','ask')),
  user_decision TEXT,
  executed_at
)

leti_policies(
  user_id, tool_name,
  default_mode TEXT CHECK (default_mode IN ('auto','ask')),
  PRIMARY KEY (user_id, tool_name)
)
```

### 4.5 Notifications

```sql
-- notification-service
notifications(
  id, user_id, kind, payload JSONB,
  read_at, created_at
)
```

---

## 5. Auth Model

### 5.1 Principal model

Every authenticated request carries a JWT verified independently by each service via JWKS pulled from auth-service. Claim shape:

```jsonc
{
  "sub": "<principal_id>",                  // user_id or sa_id
  "principal_type": "user" | "service_account",
  "act": {                                  // RFC 8693 — present when an
    "agent": "leti"                         // internal agent acts for the user
  } | null,
  "scopes": ["files.read", "files.write", "settings.write", ...],
  "exp": ...,
  "iat": ...,
  "iss": "openlet-auth",
  "aud": "openlet-api"
}
```

- **User token** — `sub = user_id`, `principal_type = "user"`, `act = null`.
- **Leti delegated token** — `sub = user_id` (still the user!), `principal_type = "user"`, `act = {agent: "leti"}`. **No SA involved.** This is RFC 8693 token exchange semantics.
- **Standalone SA token** — `sub = sa_id`, `principal_type = "service_account"`, `act = null`. Used by Team 2 Openlet and future external integrations.

### 5.2 Leti — internal agent (NOT a service account)

Leti is first-class internal infrastructure, not an external client. Auth flow:

1. User chats with Leti from web UI; web sends user JWT.
2. leti-service receives the call, calls `auth-service /token/exchange` (RFC 8693) with the user's token.
3. auth-service verifies user token, mints a **delegated token**: same `sub` (user), short TTL (5–15 min), adds `act={agent:"leti"}`, narrows scopes to what the user authorized for Leti.
4. leti-service uses this delegated token to call file-service / user-service / etc.
5. Each service verifies the delegated token; permission check uses `sub` (user_id) — Leti has no special privileges, only what the user has.
6. `act` claim is preserved in audit logs so destructive actions can be traced to "user X via Leti".

Why this is better than treating Leti as an SA:

- **No long-lived secret to leak** — delegated tokens are minted per session, short-lived.
- **No special-case in file-service** — permission check is unchanged: "can user X do Y?". `act` is metadata.
- **No SA lifecycle for Leti** — no creation flow, no rotation, no revocation logic. Revoking Leti = revoking user session.
- **One-Leti-per-user is implicit** — there's no Leti record at all, just an internal service.

leti-service stores chat sessions, messages, tool-call audit. No SA row exists for Leti.

### 5.3 Standalone service accounts (Team 2 Openlet, future integrations)

- Created via UI: user generates SA + secret. Secret shown once, SHA256 stored.
- Can own workspaces; user added as `viewer` automatically.
- Authenticates via OAuth2 client-credentials grant (`POST /oauth/token` with secret) → JWT with `principal_type=service_account`, `sub=sa_id`, `act=null`.
- Quota attributed to `owner_user_id`.
- **MVP:** schema + endpoints exist; UI flow ships in v1.1. **No SA created in MVP** — only Team 2 needs it.

### 5.4 Permission check (uniform across user / Leti / SA)

```
fn can(principal, workspace, action) -> bool:
  // For Leti calls, principal is still the user (sub=user_id);
  // act={agent:"leti"} is metadata, not principal identity.
  member = workspace_members.find(workspace.id, principal.type, principal.id)
  if member is None: return false
  return role_allows(member.role, action)
```

File-service has zero awareness of Leti. The only "agent-aware" piece is the audit log, which surfaces `act` for traceability.

### 5.5 Audit invariants

- Every mutating call logs: `principal_id`, `principal_type`, `act_agent` (nullable), `action`, `resource_id`, `timestamp`, `request_id`.
- Leti calls: `principal_id = user_id`, `act_agent = "leti"`. Causality chain readable as "user X via Leti deleted file Y at T".
- Standalone SA calls: `principal_id = sa_id`, `act_agent = null`, but quota accounting joins to `service_accounts.owner_user_id`.

### 5.6 JWT verification — every service, every call

- Gateway pre-checks signature/expiry to drop garbage early. Does not confer trust.
- Each service has JWKS-cached public keys (TTL refresh from auth-service). Verifies signature, expiry, issuer, audience locally on every request.
- Services NEVER read principal from upstream-injected headers. Always extract from verified JWT.
- mTLS between services proves caller identity (which service); JWT proves request identity (which user/SA + optional act).

---

## 6. Async Pipeline (Redpanda)

### 6.1 Topics

| Topic                 | Producer     | Consumer                           | Payload                                                |
| --------------------- | ------------ | ---------------------------------- | ------------------------------------------------------ |
| `file.uploaded`       | file-service | file-worker                        | `{file_id, workspace_id, storage_key, sha256}`         |
| `file.processed`      | file-worker  | file-service, notification-service | `{file_id, magika_label, extracted_text_size, status}` |
| `file.failed`         | file-worker  | notification-service               | `{file_id, error}`                                     |
| `share.invited`       | file-service | notification-service               | `{workspace_id, invited_user_id}`                      |
| `leti.task_completed` | leti-service | notification-service               | `{user_id, session_id, summary}`                       |

### 6.2 file-worker pipeline

```
consume(file.uploaded)
  ├─ download from S3
  ├─ Magika classify
  ├─ extract text (per mime: pdfplumber/pymupdf, python-docx, openpyxl, python-pptx, beautifulsoup4, plain pass-through)
  ├─ generate thumbnail (if image/pdf)
  ├─ UPDATE files SET search_vector = to_tsvector(...), status='ready', magika_label=...
  ├─ upload thumbnail to S3
  └─ produce(file.processed)
```

- Idempotent: keyed on `file_id` + content hash. Re-processing same hash is no-op.
- Failure → produce `file.failed` after N retries (exponential backoff). Sets file status = 'failed'.

### 6.3 Why Redpanda over Postgres queue

User picked it explicitly. Trade-off accepted: +1 service to operate, in exchange for: throughput headroom, decoupled consumers (notification + file-svc both consume `file.processed`), event-sourcing optionality. Suitable since techstack.md already commits to Redpanda for pub/sub.

---

## 7. Leti — Personal AI Assistant

### 7.1 Capabilities

Leti can do everything the user can do:

- Read files in any workspace user can see (viewer+)
- Write/move/delete/tag files in workspaces user can edit (member+)
- Manage workspaces (create, share, rename) user owns
- Update user settings (theme, profile, notification prefs)
- Future: chat with Team 2 Openlet agent

### 7.2 Tool surface (MVP)

Read tools:

- `list_workspaces`
- `list_files(workspace_id, folder_id?, filters?)`
- `read_file(file_id)` — returns extracted text + metadata
- `search(workspace_id, query, filters?)` — Postgres FTS

Write tools:

- `upload_file(workspace_id, folder_id, name, content)`
- `move_file(file_id, target_folder_id)`
- `rename_file(file_id, new_name)`
- `delete_file(file_id)` — hard delete in MVP (no trash yet)
- `tag_file(file_id, tags[])`
- `create_folder(workspace_id, parent_id?, name)`
- `delete_folder(folder_id)`

Workspace tools:

- `create_workspace(name, description)`
- `share_workspace(workspace_id, email, role)`
- `revoke_share(workspace_id, principal_id)`

Settings tools:

- `get_settings()`, `update_settings(patch)`

### 7.3 Auto vs Ask policy

Per-user, per-tool default. Schema in `leti_policies`. Default seed:

| Tool                                                                       | Default mode |
| -------------------------------------------------------------------------- | ------------ |
| list*\*, read*\*, search                                                   | auto         |
| upload_file, create_folder, tag_file, rename_file, move_file               | ask          |
| delete_file, delete_folder, share_workspace, revoke_share, update_settings | ask          |
| create_workspace                                                           | ask          |

User overrides per-tool in settings UI. Per-action override available in chat ("just do it" / "always ask for this").

### 7.4 Confirmation flow

```
Leti decides to call tool T with args A
  ├─ policy = leti_policies[user, T] or default
  ├─ if policy == 'auto':
  │     execute → show result in chat
  └─ if policy == 'ask':
        SSE event { kind: 'confirm', tool: T, args: A, preview: ... }
        UI shows confirm dialog (allow / deny / "always allow this tool")
        user responds → leti-service executes or skips
```

All tool calls logged in `leti_tool_calls` regardless of mode.

### 7.5 Calling other services

leti-service receives the user's JWT, exchanges it at auth-service (`/token/exchange`, RFC 8693) for a delegated token with `act={agent:"leti"}`, then calls file-service / user-service / notification-service via gRPC carrying the delegated token. Each downstream service verifies the token and treats `sub` (user_id) as the principal — Leti has no implicit privilege beyond what the user has. The `act` claim is propagated to audit logs but doesn't affect permission decisions. See §5.2 for the full flow.

---

## 8. Repo Layout (Monorepo)

```
openlet/
├── apps/
│   ├── auth-service/        # Go
│   ├── user-service/        # Go
│   ├── file-service/        # Go
│   ├── notification-service/# Go
│   ├── file-worker/         # Python
│   ├── leti-service/        # Python
│   └── web/                 # Next.js
├── packages/
│   ├── proto/               # gRPC + event schemas (shared)
│   ├── ent-schema/          # Ent ORM definitions
│   ├── go-shared/           # JWT verify, principal middleware, tracing
│   └── py-shared/           # parsers, langchain wrappers, kafka client
├── infra/
│   ├── docker/
│   ├── k8s/                 # Helm or kustomize
│   └── terraform/
├── docs/
└── plans/
```

- Single CI pipeline: matrix per app. Per-app changes trigger only that app's tests + build.
- Single `go.work` (Go workspace) for Go apps. Poetry workspace for Python apps.
- Atlas migrations per service in `apps/<svc>/migrations/`.

---

## 9. Implementation Roadmap (suggested phasing)

### Phase 1 — Foundation (~3 weeks)

- Repo scaffolding + monorepo tooling (CI, Docker, k8s base)
- auth-service: Google OAuth2, JWT issue/verify, JWKS, refresh, user-bound SA bootstrap
- user-service: profile, settings (no quota/billing yet)
- API gateway + JWT middleware
- Postgres + Atlas migrations
- web: login, basic shell

### Phase 2 — File mgmt core (~3 weeks)

- file-service: workspace CRUD, member CRUD with roles, folder CRUD, file CRUD (upload via presigned URL + metadata create)
- S3 integration + presigned URL generation
- Redpanda + `file.uploaded` topic
- file-worker: Magika, parsers, FTS indexing, thumbnails
- web: workspace browser, upload (drag-drop), folder nav, file preview

### Phase 3 — Sharing + search (~2 weeks)

- workspace invite flow (email-based)
- notification-service + SSE
- search UI + tag mgmt
- web: share dialog, search bar, tag chips

### Phase 4 — Leti MVP (~3 weeks)

- leti-service: LangChain agent loop, tool implementations, policy engine
- per-tool auto/ask, audit logging
- web: chat panel beside file browser, confirmation dialogs

### Phase 5 — Hardening (~1-2 weeks)

- mTLS between services
- Observability (Prometheus/Grafana/Tempo/Loki/Sentry)
- Rate limiting, quota enforcement
- Beta launch

**Total MVP: ~12 weeks for 2 devs + 1 AI engineer (rough estimate; assume +30% buffer).**

---

## 10. Risks + Mitigations

| Risk                                                                           | Likelihood | Impact | Mitigation                                                                                       |
| ------------------------------------------------------------------------------ | ---------- | ------ | ------------------------------------------------------------------------------------------------ |
| Redpanda ops overhead delays Phase 2                                           | medium     | high   | Use managed Redpanda Cloud during MVP; self-host later                                           |
| Leti tool surface bloats; ask-mode UX gets noisy                               | high       | medium | Strict per-tool defaults; track confirm-fatigue metrics; allow "always allow" persistence        |
| Postgres FTS quality insufficient at scale                                     | medium     | medium | Workspace-scoped queries keep result set small; swap to Meilisearch in v2 if needed              |
| Service-account secret leakage                                                 | low        | high   | Show secret once; SHA256 store; rotation endpoint; revoke on suspicious use                      |
| Quota attribution wrong for SA actions                                         | medium     | medium | Always log `originator_user_id`; quota keyed on it                                               |
| Big-file uploads timeout sync path                                             | high       | high   | Direct-to-S3 presigned upload; metadata row created post-upload via callback                     |
| Leti executes destructive action without consent                               | low        | high   | Default ask-mode for all destructive tools; per-action override only with explicit user click    |
| Distributed transaction across services (file create + workspace member check) | medium     | medium | Saga pattern only where needed; favor co-locating data in file-service to avoid distributed txns |
| Magika misclassifies file → wrong parser                                       | low        | low    | Magika label + extension fallback; failed extraction → status='failed' visible to user           |
| Cost runaway from Leti LLM calls                                               | medium     | high   | Per-user token quota in user-service; circuit-break Leti when quota exceeded                     |

---

## 11. Success Metrics

**MVP launch criteria:**

- 100 beta users can sign up via Google
- Each user can create 3+ workspaces, upload 100+ files each
- Search returns results <500ms p95 in workspaces with <10K files
- Leti chat responds <3s p95 (excluding LLM streaming)
- File processing pipeline <30s p95 for files <10MB
- Zero data loss across 30 days of beta
- Audit log captures 100% of mutations

**Validation criteria post-launch:**

- 30% of users invoke Leti at least once in week 1
- Confirm-fatigue <20% (i.e., <20% of ask-mode prompts denied)
- Workspace sharing used by >40% of multi-workspace users

---

## 12. Open Questions

1. **Quota / billing model in MVP?** User said "credit, subscription" exist but didn't lock numbers. Suggest free tier + paid tier post-MVP.
2. **Email provider for share invites?** (Resend / Postmark / SES). Notification-service needs concrete choice before Phase 3.
3. **Where does file-worker run?** K8s deployment (autoscaled by lag) vs serverless (Cloud Run)? Affects infra complexity.
4. **mTLS issuer?** Self-signed via cert-manager + linkerd, or external CA?
5. **Standalone SA UI in MVP or v1.1?** Schema is in MVP; user-facing creation flow can wait. Confirm intent.
6. **Multi-region from day 1?** Or single region until traction?
7. **Soft-delete tombstones for compliance/recovery even though "trash" is v2?** Recommend yes — `deleted_at` column, hard-purge job runs nightly.
8. **Vietnamese / English / both for next-intl?** Drafts mix VI and EN.
9. **Does the personal Leti instance persist across user sessions or per-session?** I assumed cross-session (one Leti per user).
10. **Concurrent edits to file metadata** — last-write-wins, or optimistic locking via `updated_at`? Recommend optimistic.
11. **Folder rename/move atomicity** — does it require updating all descendant files' cached paths? Or compute path on read?
12. **Leti context window strategy** — does it carry conversation across sessions or reset? draft-2 mentions Hermes-style timestamp + compaction marker; worth adopting?

---

## Next Steps

1. User review of this summary; resolve open questions or accept as-is.
2. Hand off to `/ck:plan` (or `/ck:plan --tdd`) to produce phase-by-phase implementation plan.
3. Separate brainstorm later for Team 2 Openlet AI core (research project).

---

## 13. Tooling & Operational Stack (per techstack.md)

**LLM:**

- Provider: OpenRouter (multi-model: Anthropic, OpenAI, Gemini)
- Prompt templates: Jinja2

**API Gateway:** Nginx or Envoy (final pick deferred to infra phase)

**CI / CD / Quality:**

- Build/test: GitHub Actions
- Code quality: SonarQube
- Go lint: golangci-lint
- Python tooling: Poetry (deps), pytest (tests), Ruff (lint)
- API contract lint: Spectral (OpenAPI/AsyncAPI specs)
- GitOps deploy: ArgoCD

**Observability:**

- Metrics: Prometheus + Grafana
- Tracing: Grafana Tempo
- Logs: Loki
- Errors: Sentry

**Infra:**

- Containers: Docker + Kubernetes
- IaC: Terraform
- Internal mesh: mTLS (cert-manager / linkerd — pick during Phase 5)

---

## 14. Leti Design Details (deferred from earlier sections)

### 14.1 Confirmed

- **Leti is NOT a service account.** It's a first-class internal service. Auth via delegated JWT (RFC 8693 token exchange) with `act={agent:"leti"}` claim while `sub` stays as `user_id`. See §5.2.
- **No own workspace.** Leti operates on the user's workspaces with the user's existing permissions — nothing more, nothing less.
- **One Leti per user**, persistent across sessions. No per-user Leti record exists; Leti is shared infrastructure that simply scopes per-user state via session tables.

### 14.2 UX patterns adopted from drafts

From `draft-1.md`:

- **Recap line** after each prompt / long task — short status line summarizing what Leti just did + what's next.
- **Avatar with grid-dots** expressions, controlled by a tool call (sad/happy/thinking states). Optional, ship in v1.1 if Phase 4 has buffer.

From `draft-2.md`:

- **Hermes-style cache-friendly conversation prefix** — static `Conversation started: <timestamp>` line at prefix; dynamic `Last context compaction: <ts> (#count)` at suffix. Preserves prompt cache across compactions.
- **Compaction strategy**: send "Summarize this conversation" as a message, swap output for current conversation rather than running a separate summarizer LLM. Cache-friendly.

### 14.3 Tool invariants

- **Read-before-write**: Leti must `read_file` before `update_file`/`move_file`/`delete_file`/`tag_file` on any given file_id within the session. Tool layer enforces this — returns error if violated. (Per draft-1 rule, prevents blind destructive actions.)
- **Parallel tool safety**: Tools marked `parallel_safe=true|false`. Leti can run multiple tools concurrently only if all currently-running tools and the new tool are parallel-safe. Read tools default safe; write tools default unsafe.

### 14.4 LangChain vs LangGraph

- User picked **LangChain**. draft-1 mentioned "Todo and plan must be saved to langgraph state" — not adopted. Leti uses LangChain agent loop with persistent session state in Postgres (`leti_sessions`, `leti_messages`).

---

## 15. Team 2 Reference Notes (for future brainstorm)

Captured here so they aren't lost. **Not in scope for Team 1 MVP.**

### 15.1 Openlet AI core architecture (from drafts)

- **Two agents, distinct from Leti:**
  - **Indexer**: ingests user-uploaded files. Read+write on its own workspace. **User cannot chat with Indexer** — only attaches a note (textual instruction) when uploading 1 file / folder / batch. Indexer creates "Lets" from input.
  - **Retriever**: read-only on its own workspace. Cannot write/edit. Powers Q&A via `ask()`.
- **Let** primitive: atomic unit of knowledge (single .md or folder of derived files), independent of source file count/size.
- **Hardcoded top-level taxonomy:** `learn / work / create / reference / plan / life / enjoy` (+ optional `inbox`).
- **Storage:** local FS + SQLite for MVP; PG + S3 for cloud variant.
- **Integration with Team 1:** Openlet registers as a **standalone service-account** in Team 1's auth-service (the only SA flavor that exists; Leti is not an SA — see §5). It owns its own workspaces in Team 1's file-service. User is viewer in those workspaces. Interaction goes through Leti or direct UI.
- **Language fork**: drafts disagree (Python per draft-4 vs Rust per draft-3/5). To be decided in Team 2 brainstorm.

### 15.2 Why this matters for Team 1 MVP

- **Schema reservation:** `service_accounts` table and `workspaces.owner_principal_type = 'service_account'` exist on day 1, even though no UI flow creates them in MVP. This is the cheap forward-compat that lets Team 2 plug in without Team 1 schema changes. (Leti, being a delegated-JWT internal service, requires no schema reservation at all.)
- **JWT model:** designed to accept `principal_type=service_account` uniformly. Team 2's calls look identical to any future external integration. Leti's calls look like normal user calls plus an `act` claim.
- **Event topics:** Team 2 may subscribe to `file.uploaded` / `file.processed` later as another consumer group. Redpanda topology supports this without code changes.

---

## 16. Coverage Verification

Cross-checked summary against full conversation. All locked decisions captured:

| User decision in conversation                                                                | Section            |
| -------------------------------------------------------------------------------------------- | ------------------ |
| Team 1 first, AI later, AI works independently                                               | §1, §2             |
| Two AI modes for Team 2: indexer / retriever                                                 | §15.1              |
| Note-on-upload UX for Team 2 indexer                                                         | §15.1              |
| Personal AI = one per user, manages user resources, chats with Team 2 agent later            | §7, §15 (deferred) |
| Cloud multi-user MVP for file mgmt                                                           | §2                 |
| Local-first for Team 2 AI core                                                               | §15                |
| Python + LangChain (not LangGraph, not Rust)                                                 | §2, §14.4          |
| File CRUD + folders, workspace + sharing, search + tagging in MVP                            | §2                 |
| Trash/versioning/comments deferred                                                           | §2 (deferred list) |
| Leti can: read all visible WS, edit owned WS, update settings/theme, chat with Team 2 later  | §7.1, §7.2         |
| Service-account system, auth/file blind to Leti                                              | §3.3, §5           |
| Workspace owned by user OR SA                                                                | §4.2, §5           |
| Two SA flavors (user-bound + standalone)                                                     | §5.2, §5.3         |
| Auto + Ask modes for Leti tools                                                              | §7.3, §7.4         |
| Per-tool default + override config                                                           | §7.3               |
| Postgres FTS for search                                                                      | §2, §4.3           |
| Architecture: Approach C with custom names                                                   | §3                 |
| Service names: auth-service, user-service, file-service, file-worker, leti-service           | §3.1               |
| Add notification-service                                                                     | §3.1               |
| Workspace-level sharing only (permanent)                                                     | §2                 |
| Redpanda for async pipeline                                                                  | §6                 |
| Monorepo                                                                                     | §8                 |
| Frontend: Next.js + Shadcn + Tailwind + Tanstack Query + Zod + next-intl                     | §2                 |
| OpenRouter, Jinja2, GitHub Actions, SonarQube, ArgoCD, Poetry, Ruff, golangci-lint, Spectral | §13                |
| Sentry, Prometheus/Grafana/Tempo, Loki                                                       | §13                |
| Docker + K8s, Terraform                                                                      | §13                |
| draft-1 read-before-write, parallel-safe tool rule                                           | §14.3              |
| draft-1 recap line, grid-dots avatar                                                         | §14.2              |
| draft-2 Hermes timestamp + compaction marker                                                 | §14.2              |
| Leti = user-bound = no own workspace (resolution)                                            | §14.1              |
| Risks + mitigations                                                                          | §10                |
| Success metrics                                                                              | §11                |
| Open questions                                                                               | §12                |
| Roadmap with phases                                                                          | §9                 |

**Items intentionally NOT covered (out of scope per user):**

- Team 2 Openlet AI core implementation details (Indexer/Retriever code, Let storage model, Rust vs Python decision)
- Multi-region deployment (open question §12)
- Quota/billing numbers (open question §12)
- Email provider choice (open question §12)
