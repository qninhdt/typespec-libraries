# Phase 3 — Frontend Story

**Goal:** make the generated TypeScript output (Zod + types + form metadata + query helpers + error maps) rich enough that openlet-web stops hand-writing schemas, query keys, error code strings, and `useState` form handlers. Frontend code is rewritten dialog-by-dialog to consume the generated output.

**Duration:** 2–3 weeks library work + 1–2 weeks openlet-web migration (can overlap).

**Prerequisites:** Phase 1 merged (especially `@version` for `If-Match`). Phase 2 helpful but not required.

**Out of scope (deferred to Phase 4):** SSE / streaming event schemas (no SSE code exists in openlet-web yet to copy from), Leti chat surfaces, agent-tool schemas, BFF route handler generation.

**Stack constraint (locked by user):** library still emits Zod. Frontend code IS modified — react-hook-form + zodResolver consumes the generated Zod schemas and `*Meta` exports. No alternative validator (e.g., Valibot, ArkType).

---

## Why these features, in this order

Every item below is grounded in a concrete openlet-web pattern from the audit. Ranked by occurrence count and migration leverage:

| Feature                                                       | openlet-web usage count                        | Workstream |
| ------------------------------------------------------------- | ---------------------------------------------- | ---------- |
| Closed-set enums with `.options` for `<select>` rendering     | 5 enums, triplicated `<option>` lists          | W1         |
| Form metadata as i18n keys + Shadcn-ready `*Meta` shape       | 8 dialogs hand-coding labels/maxLength         | W2         |
| Tanstack Query key factory per resource                       | 11+ ad-hoc key tuples, 4-key invalidations     | W3         |
| Page&lt;T&gt; pagination envelope + `getNextPageParam` helper | 3 list endpoints, 2 useInfiniteQuery sites     | W4         |
| Backend error codes → typed discriminated union + i18n map    | 7 error codes hand-decoded across 5 components | W5         |
| Optimistic-concurrency `If-Match` / `412 → stale_version`     | 2 PATCH sites in `file-actions.tsx`            | W6         |
| react-hook-form migration consuming generated Zod + Meta      | 8 dialogs to migrate                           | W7         |

W1–W6 are library work. W7 is the openlet-web migration. All seven ship as one coordinated rollout.

---

## Workstream W1 — Enum schemas with `.options`

**Why.** openlet-web has 5 closed-set enums (`WorkspaceRole`, `FileStatus`, `principal_type`, `Locale`, plus the tag regex pseudo-enum). Today each enum:

- Lives once in `lib/api/schemas.ts` as `z.enum(["..."])`.
- Has its `<option>` list hand-duplicated in 3+ components (e.g. `workspace-settings-view.tsx`, `member-row.tsx`, `settings-view.tsx`).
- Has a sort-order map hand-written (`workspace-settings-view.tsx:197`).
- Has switch statements for badge labels (`file-status-badge.tsx:6-31`).

The library should emit not just the schema and TS union but a metadata object with:

- `.options` — array of `{ value, labelKey, sortOrder?, terminal? }`
- `.values` — readonly tuple `[v1, v2, ...]`
- `.parse` — already exists via Zod
- `.label(value)` — returns i18n key for that value

**TypeSpec input.**

```typespec
@frontend
enum WorkspaceRole {
  @title("workspaces.roles.owner")  owner: "owner";
  @title("workspaces.roles.member") member: "member";
  @title("workspaces.roles.viewer") viewer: "viewer";
}

@frontend
enum FileStatus {
  @title("files.status.uploading")  uploading: "uploading";
  @title("files.status.processing") processing: "processing";

  @terminal
  @title("files.status.ready") ready: "ready";

  @terminal
  @title("files.status.failed") failed: "failed";
}
```

`@terminal` is a new decorator (see W3 — query helpers consume it for `refetchUntilTerminal`).

**Zod emission target.**

```ts
// generated openlet/contracts/file-status.ts
import { z } from "zod";

export const FileStatusValues = ["uploading", "processing", "ready", "failed"] as const;
export type FileStatus = (typeof FileStatusValues)[number];
export const FileStatusSchema = z.enum(FileStatusValues);

export const FileStatusMeta = {
  values: FileStatusValues,
  options: [
    { value: "uploading", labelKey: "files.status.uploading", terminal: false },
    { value: "processing", labelKey: "files.status.processing", terminal: false },
    { value: "ready", labelKey: "files.status.ready", terminal: true },
    { value: "failed", labelKey: "files.status.failed", terminal: true },
  ] as const,
  terminal: (v: FileStatus) => v === "ready" || v === "failed",
  label: (v: FileStatus): string => FileStatusMeta.options.find((o) => o.value === v)!.labelKey,
} as const;
```

Frontend consumption:

```tsx
// before — workspace-settings-view.tsx
<select>
  <option value="owner">Owner</option>
  <option value="member">Member</option>
  <option value="viewer">Viewer</option>
</select>;

// after
import { WorkspaceRoleMeta } from "@openlet/contracts";
import { useTranslations } from "next-intl";

const t = useTranslations();
<select>
  {WorkspaceRoleMeta.options.map((o) => (
    <option key={o.value} value={o.value}>
      {t(o.labelKey)}
    </option>
  ))}
</select>;
```

**Files to touch.**

- `packages/typespec-orm/lib/main.tsp` — declare `@terminal` (target `EnumMember`).
- `packages/typespec-orm/src/decorators-column.ts` — store `TerminalKey` on enum members.
- `packages/typespec-zod/src/components/ZodEnum.tsx` (or equivalent) — emit `*Values`, `*Schema`, `*Meta` triple.
- `packages/typespec-zod/src/components/ZodEnumMeta.tsx` (new) — meta object renderer.

**Testing.** Unit assertion that all three exports exist; runtime test that `Meta.terminal()` matches the decorator; snapshot for openlet enums.

**Risk.** Existing examples define enums without `@title`; default fallback is the enum-member name unchanged. Document migration: add `@title("...")` to get i18n keys; without it, `labelKey` falls back to `<EnumName>.<member>` literal which is treated as a key by next-intl.

---

## Workstream W2 — Form metadata as i18n keys + Shadcn-ready Meta

**Why.** openlet-web has 8 dialogs/forms that hand-code labels, placeholders, max lengths, and validation messages inline:

- `create-workspace-dialog.tsx` (`maxLength={120}` and `{500}` inline at `:77,87`)
- `create-folder-dialog.tsx` (`maxLength={200}` at `:69`, hardcoded "Maximum nesting reached (10 levels)" at `:119`)
- `rename-file-dialog.tsx`, `rename-folder-dialog.tsx`
- `about-card.tsx` (workspace edit)
- `settings-view.tsx` (display name)
- `workspace-settings-view.tsx` (invite-member)
- `danger-zone-card.tsx` ("type workspace name to confirm")

Every label is a hardcoded English string. `me.locale: "en" | "vi"` is in the user model but `next-intl` is not installed. The library's `*Meta` exports today emit literal strings, not i18n keys.

**Decorator surface.** Existing `@title`, `@placeholder` decorators already exist. Phase 3 changes their semantics under a new emitter option:

```yaml
"@qninhdt/typespec-zod":
  i18n: true # NEW — emit message keys instead of literals
  i18n-prefix: "forms" # NEW — optional prefix; key becomes "forms.<namespace>.<model>.<field>"
```

When `i18n: true`:

- `@title("Display name")` is treated as the FALLBACK English value, not the rendered label.
- The emitter generates `Meta.<field>.labelKey = "forms.users.profile.displayName"`.
- A sibling `messages.en.json` skeleton is written with `"forms.users.profile.displayName": "Display name"` so openlet-web's i18n setup has a starting point.

**TypeSpec input.**

```typespec
@frontend
namespace Openlet.Forms.Users;

model Profile {
  @title("Display name")
  @placeholder("Your full name")
  @maxLength(120)
  displayName: string;

  @title("Locale")
  locale: Openlet.Common.Locale;
}
```

**Zod emission target.**

```ts
// generated openlet/contracts/forms/users/profile.ts
import { z } from "zod";
import { LocaleSchema, LocaleMeta } from "../../enums/locale";

export const ProfileSchema = z.object({
  displayName: z.string().max(120),
  locale: LocaleSchema,
});

export type Profile = z.infer<typeof ProfileSchema>;

export const ProfileMeta = {
  fields: {
    displayName: {
      labelKey: "forms.users.profile.displayName.label",
      placeholderKey: "forms.users.profile.displayName.placeholder",
      maxLength: 120,
      required: true,
      type: "string" as const,
    },
    locale: {
      labelKey: "forms.users.profile.locale.label",
      enum: LocaleMeta,
      required: true,
      type: "enum" as const,
    },
  },
} as const;
```

**Sibling messages skeleton.**

```json
// generated openlet/contracts/messages.en.json
{
  "forms.users.profile.displayName.label": "Display name",
  "forms.users.profile.displayName.placeholder": "Your full name",
  "forms.users.profile.locale.label": "Locale"
}
```

A second skeleton `messages.vi.json` is generated with empty values (or English values if `i18n-fallback-to-en: true`).

**Frontend consumption.**

```tsx
// after — settings-view.tsx, RHF + zodResolver flow detailed in W7
const t = useTranslations();
const form = useForm({ resolver: zodResolver(ProfileSchema), ... });

<FormField
  control={form.control}
  name="displayName"
  render={({ field }) => (
    <FormItem>
      <FormLabel>{t(ProfileMeta.fields.displayName.labelKey)}</FormLabel>
      <FormControl>
        <Input
          placeholder={t(ProfileMeta.fields.displayName.placeholderKey)}
          maxLength={ProfileMeta.fields.displayName.maxLength}
          {...field}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

A `<GeneratedField name="displayName" meta={ProfileMeta} />` helper component (shipped in `@openlet/contracts/react`) reduces this to one line; openlet-web ships it as part of the Phase 3 PR.

**Files to touch.**

- `packages/typespec-zod/lib/options.ts` — `i18n: boolean`, `i18n-prefix?: string`, `i18n-fallback-to-en: boolean`, `i18n-locales: string[]` (default `["en"]`).
- `packages/typespec-zod/src/components/Meta.tsx` — emit `labelKey` / `placeholderKey` instead of `label` / `placeholder` when `i18n: true`. Keep current literal-string mode under `i18n: false` for backwards compatibility.
- `packages/typespec-zod/src/components/MessagesJson.tsx` (new) — render the messages skeleton per locale.
- `packages/typespec-zod/src/emitter.tsx` — write `messages.<locale>.json` files alongside schema output.

**Testing.**

- Unit: `i18n: true` produces `labelKey`, `i18n: false` produces `label` literal (regression).
- Unit: messages.json contains every key referenced by Meta.
- Integration: import emitted Meta + parse messages.json; assert all keys resolve.

**Risk.** openlet-web has zero `next-intl` setup today. Migration requires installing next-intl and wiring `[locale]` segment. That's openlet-web work, not library work — covered in W7.

---

## Workstream W3 — Tanstack Query key factory

**Why.** openlet-web has 11+ ad-hoc query key tuples scattered across components, and an invalidation site (`file-actions.tsx:34-42`) that manually invalidates 4 of them. Examples:

- `["workspace", id]` — multiple components
- `["workspaces"]` — `use-workspaces-list.ts`
- `["workspace-contents", workspaceId, folderId]` — `use-workspace-contents.ts`
- `["workspace-files", ...]`, `["workspace-members", ...]`, `["workspace-tags", ...]`
- `["file", fileId]`, `["file-tags", fileId]` — `tag-editor.tsx`, `file-detail-view.tsx`
- `["search", workspaceId, q, tags, mime, from, to]` — `search-view.tsx`

Renaming a key in one place but not the invalidation site silently breaks cache freshness. Library should generate a typed key factory per resource.

**TypeSpec input.** Use TypeSpec operations (already supported via upstream HTTP/REST emitters). Mark which operations are read vs mutation:

```typespec
@frontend
namespace Openlet.Api.Workspaces;

@route("/v1/workspaces/{id}")
@get
op getWorkspace(@path id: uuid): Workspace;

@route("/v1/workspaces/{id}/members")
@get
op listWorkspaceMembers(@path id: uuid): MembersList;

@route("/v1/workspaces/{id}/members/{principalType}/{principalId}")
@delete
op removeWorkspaceMember(
  @path id: uuid,
  @path principalType: PrincipalType,
  @path principalId: uuid,
): void;
```

**Zod emission target.** New file `query-keys.ts` per namespace:

```ts
// generated openlet/contracts/api/workspaces/query-keys.ts

export const workspaceKeys = {
  all: ["workspaces"] as const,

  lists: () => [...workspaceKeys.all, "list"] as const,
  list: (filter?: { ownerId?: string }) => [...workspaceKeys.lists(), filter ?? {}] as const,

  details: () => [...workspaceKeys.all, "detail"] as const,
  detail: (id: string) => [...workspaceKeys.details(), id] as const,

  members: (id: string) => [...workspaceKeys.detail(id), "members"] as const,
  member: (id: string, principalType: PrincipalType, principalId: string) =>
    [...workspaceKeys.members(id), principalType, principalId] as const,
} as const;
```

The factory follows the well-known `entity-list-detail` shape so `queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(id) })` invalidates that workspace and all nested keys (members, etc.) thanks to Tanstack Query's prefix-match semantics.

**Mutation invalidation helpers.**

```ts
export const workspaceInvalidations = {
  // After update/delete on a single workspace
  onWorkspaceMutated: (queryClient: QueryClient, id: string) => {
    queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(id) });
    queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
  },
  // After member changes
  onMemberMutated: (queryClient: QueryClient, id: string) => {
    queryClient.invalidateQueries({ queryKey: workspaceKeys.members(id) });
  },
} as const;
```

Replaces the hand-coded 4-key invalidation in `file-actions.tsx:34-42`.

**Frontend consumption.**

```tsx
// before
useQuery({ queryKey: ["workspace", id], ... });
queryClient.invalidateQueries({ queryKey: ["workspace", id] });

// after
import { workspaceKeys, workspaceInvalidations } from "@openlet/contracts";
useQuery({ queryKey: workspaceKeys.detail(id), ... });
workspaceInvalidations.onWorkspaceMutated(queryClient, id);
```

**Files to touch.**

- `packages/typespec-zod/lib/options.ts` — new option `query-keys: boolean` (default `true`).
- `packages/typespec-zod/src/components/QueryKeys.tsx` (new) — render per-namespace key factory.
- `packages/typespec-zod/src/operation-resolution.ts` (new) — collect TypeSpec operations into list/detail/nested-resource shape; group by namespace.
- `packages/typespec-zod/src/emitter.tsx` — write `query-keys.ts` per namespace.

**Testing.**

- Unit: factory shape matches expected for nested resources (workspace → members → member).
- Unit: invalidation helpers cover all mutation operations.
- Snapshot: regenerate openlet contracts; expected key tuples emitted.

**Risk.** Tanstack Query key conventions vary across teams. Settle on the entity-list-detail pattern and document it. If a team wants a different shape, they fall back to hand-written keys; not blocking.

---

## Workstream W4 — Page&lt;T&gt; pagination envelope

**Why.** openlet-web has 3 list endpoints with identical cursor pagination shape (`fileListSchema`, `searchResultsSchema`, `workspaceContentsSchema`) and 2 useInfiniteQuery sites (`use-workspace-contents.ts:39-57`, `search-view.tsx:86-114`) that hand-write `getNextPageParam`. Library should emit a single `Page<T>` envelope and helpers.

**Decorator surface.** New `@paginated` model decorator marks an envelope:

```typespec
@paginated
@frontend
model FileList {
  items: File[];
  nextPageToken?: string;
}
```

Or more declaratively, generate the envelope from operations marked `@cursorPaginated`:

```typespec
@route("/v1/workspaces/{id}/files")
@get
@cursorPaginated
op listFiles(@path id: uuid, @query pageToken?: string, @query pageSize?: int32): File[];
```

The operation emitter generates the envelope automatically. Recommended path; less boilerplate.

**Zod emission target.**

```ts
// generated openlet/contracts/pagination.ts
import { z } from "zod";

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextPageToken: z.string().optional(),
  });
}

export type Page<T> = { items: T[]; nextPageToken?: string };

export function getNextPageParam<T>(last: Page<T>): string | undefined {
  return last.nextPageToken;
}
```

```ts
// generated openlet/contracts/api/files/list.ts
import { pageSchema, getNextPageParam } from "../../pagination";
import { FileSchema } from "../../models/file";

export const ListFilesPageSchema = pageSchema(FileSchema);
export type ListFilesPage = z.infer<typeof ListFilesPageSchema>;
export const listFilesGetNextPageParam = getNextPageParam<File>;
```

**Frontend consumption.**

```tsx
// before — use-workspace-contents.ts
useInfiniteQuery({
  queryKey: ["workspace-contents", workspaceId, folderId],
  queryFn: ...,
  getNextPageParam: (lastPage) => lastPage.next_page_token ?? undefined,
});

// after
import { workspaceKeys, listFilesGetNextPageParam, ListFilesPageSchema } from "@openlet/contracts";

useInfiniteQuery({
  queryKey: workspaceKeys.files(workspaceId, folderId),
  queryFn: async ({ pageParam }) => ListFilesPageSchema.parse(await fetch(...)),
  getNextPageParam: listFilesGetNextPageParam,
  initialPageParam: undefined,
});
```

**Files to touch.**

- `packages/typespec-orm/lib/main.tsp` — declare `@cursorPaginated` (operation target).
- `packages/typespec-orm/src/decorators-operations.ts` (new) — store on operation state.
- `packages/typespec-zod/src/components/Pagination.tsx` (new) — emit shared `pagination.ts`.
- `packages/typespec-zod/src/components/PageOperation.tsx` (new) — emit per-operation page helper.

**Testing.** Unit + snapshot; integration test that runs `useInfiniteQuery` against a mock returns expected pages.

**Risk.** Cursor pagination naming varies across APIs (`next_page_token` vs `nextCursor` vs `endCursor`). Lock to `nextPageToken` per openlet's existing API; document deviation policy.

---

## Workstream W5 — Error codes → typed discriminated union

**Why.** openlet-web hand-decodes 7 error code strings across 5+ components:

- `folder_too_deep` (`create-folder-dialog.tsx:118`)
- `last_owner` (`member-row.tsx:61,102`)
- `stale_version` (`file-actions.tsx:184`)
- `forbidden`, `not_found`, `refresh_reused` (`session.ts:57`)
- `mapFolderError`, `mapFileError` helpers re-implement the same dispatch shape per component

Library should declare error codes per operation in TypeSpec and emit:

1. A typed discriminated union of possible errors per endpoint.
2. An i18n key map for default user-facing messages.
3. A `formatError(err, t)` helper that resolves the right key.

**Decorator surface.** New `@errors` decorator on operations:

```typespec
@route("/v1/workspaces/{id}/folders")
@post
@errors([
  { code: "folder_too_deep", status: 422, messageKey: "errors.folder.tooDeep" },
  { code: "name_taken",      status: 409, messageKey: "errors.folder.nameTaken" },
  { code: "forbidden",       status: 403, messageKey: "errors.common.forbidden" },
])
op createFolder(@body req: CreateFolderRequest): Folder;
```

Plus a global error registry for cross-cutting codes:

```typespec
@@globalErrors([
  { code: "unauthenticated",  status: 401, messageKey: "errors.common.unauth" },
  { code: "rate_limited",     status: 429, messageKey: "errors.common.rateLimit" },
  { code: "internal",         status: 500, messageKey: "errors.common.internal" },
])
```

**Zod emission target.**

```ts
// generated openlet/contracts/api/folders/errors.ts
import { z } from "zod";

export const CreateFolderErrorSchema = z.discriminatedUnion("code", [
  z.object({
    code: z.literal("folder_too_deep"),
    status: z.literal(422),
    detail: z.unknown().optional(),
  }),
  z.object({
    code: z.literal("name_taken"),
    status: z.literal(409),
    detail: z.unknown().optional(),
  }),
  z.object({
    code: z.literal("forbidden"),
    status: z.literal(403),
    detail: z.unknown().optional(),
  }),
  z.object({
    code: z.literal("unauthenticated"),
    status: z.literal(401),
    detail: z.unknown().optional(),
  }),
  z.object({
    code: z.literal("rate_limited"),
    status: z.literal(429),
    detail: z.unknown().optional(),
  }),
  z.object({ code: z.literal("internal"), status: z.literal(500), detail: z.unknown().optional() }),
]);

export type CreateFolderError = z.infer<typeof CreateFolderErrorSchema>;

export const CreateFolderErrorMessages = {
  folder_too_deep: "errors.folder.tooDeep",
  name_taken: "errors.folder.nameTaken",
  forbidden: "errors.common.forbidden",
  unauthenticated: "errors.common.unauth",
  rate_limited: "errors.common.rateLimit",
  internal: "errors.common.internal",
} as const;

export function formatCreateFolderError(
  err: CreateFolderError,
  t: (key: string) => string,
): string {
  return t(CreateFolderErrorMessages[err.code]);
}
```

Plus messages.json gets every `messageKey` populated.

**Frontend consumption.**

```tsx
// before — create-folder-dialog.tsx
function mapFolderError(status: number, code?: string): string {
  if (code === "folder_too_deep") return "Maximum nesting reached (10 levels).";
  if (status === 409) return "A folder with that name already exists.";
  // ... 8 more lines
}

// after
import { CreateFolderErrorSchema, formatCreateFolderError } from "@openlet/contracts";

const t = useTranslations();
try {
  await createFolder(...);
} catch (raw) {
  const err = CreateFolderErrorSchema.parse(raw); // typed
  toast.error(formatCreateFolderError(err, t));
}
```

**Files to touch.**

- `packages/typespec-orm/lib/main.tsp` — declare `@errors`, `@@globalErrors`.
- `packages/typespec-orm/src/decorators-operations.ts` — store error metadata.
- `packages/typespec-zod/src/components/Errors.tsx` (new) — emit per-operation error schema, message map, formatter.
- `packages/typespec-zod/src/components/MessagesJson.tsx` — extend to include error message keys.

**Testing.**

- Unit: every operation with `@errors` emits expected union.
- Unit: global errors merged into every operation's union.
- Snapshot: openlet error codes regenerate matching today's hand-written maps.

**Risk.** Error response shapes vary (some APIs use `{error: {...}}`, others flat). Lock to RFC 7807 problem-detail-ish flat shape `{code, status, detail?}` per openlet's existing convention. Document.

---

## Workstream W6 — Optimistic-concurrency `If-Match` wiring

**Why.** openlet-web sends `If-Match: file.updated_at` on file PATCH (`file-actions.tsx:48,70`); a 412 response is decoded as `stale_version`. Today this is implicit, hand-coded, and the version-vs-timestamp choice (currently `updated_at`) is duplicated per call site. Once Phase 1 ships `@version`, the contract should expose this convention as typed.

**Decorator surface.** Operations targeting versioned resources opt in:

```typespec
@route("/v1/files/{id}/tags")
@patch
@versioned("file") // matches a model with @version property
@errors([
  { code: "stale_version", status: 412, messageKey: "errors.common.staleVersion" },
])
op updateFileTags(
  @path id: uuid,
  @header("If-Match") ifMatch: string,
  @body req: UpdateTagsRequest,
): File;
```

**Zod / TS emission target.**

```ts
// generated openlet/contracts/api/files/update-tags.ts

export async function updateFileTags(
  fetcher: Fetcher,
  args: { id: string; current: { version: number | string }; body: UpdateTagsRequest }
): Promise<File> {
  const res = await fetcher(`/v1/files/${args.id}/tags`, {
    method: "PATCH",
    headers: { "If-Match": String(args.current.version), "Content-Type": "application/json" },
    body: JSON.stringify(args.body),
  });
  if (res.status === 412) {
    const raw = await res.json().catch(() => ({}));
    throw UpdateFileTagsErrorSchema.parse({ code: "stale_version", status: 412, ...raw });
  }
  // ... normal error handling
  return FileSchema.parse(await res.json());
}

// React-side helper
export function useUpdateFileTags(opts?: UseMutationOptions<...>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateFileTags,
    onSuccess: (file) => fileInvalidations.onFileMutated(qc, file.id),
    ...opts,
  });
}
```

The key win: callers pass `current: file` (or `current: { version: file.version }`); they don't manually construct the `If-Match` header.

**Files to touch.**

- `packages/typespec-orm/lib/main.tsp` — declare `@versioned(targetModel)` (operation target).
- `packages/typespec-orm/src/decorators-operations.ts` — store `VersionedKey`.
- `packages/typespec-zod/src/components/OperationClient.tsx` (new) — emit typed fetcher per operation; only emitted when an operation has `@versioned` or other explicit opt-in. Phase 3 ships this lightweight, NOT a full OpenAPI client.
- `packages/typespec-zod/src/components/UseMutation.tsx` (new) — emit per-mutation `useXyz` hook with built-in invalidation wired via W3.

**Testing.**

- Unit: `If-Match` header constructed from `current.version`.
- Unit: 412 response parses as `stale_version` error.
- Integration: round-trip mock fetch; assert header present.

**Scope guard.** This workstream emits typed fetchers only for `@versioned` operations and operations explicitly tagged `@emit("client")`. We are NOT generating a full openapi-typescript-style client in Phase 3 — that's a separate, larger workstream. The reason: openlet-web already has a working `apiFetch` + manual fetchers in `lib/api/endpoints.ts`. Replacing it wholesale is invasive and not gated by Phase 3 goals.

**Risk.** Versioning may use `updated_at` rather than a numeric `version` column initially (openlet does today). Make `@version` accept either; emit `String(current.version)` so timestamp or int both serialize. Document the recommendation: move to numeric `version` once Phase 1 lands.

---

## Workstream W7 — openlet-web migration

**Scope.** This is openlet-web work, not library work. Library produces the building blocks in W1–W6; W7 wires them into the existing UI. Done dialog-by-dialog so each PR is reviewable.

**Pre-migration setup (one PR, ~1 day).**

1. Add `next-intl` to openlet-web; configure `[locale]` segment, `middleware.ts` for locale routing, default locale `en`.
2. Wire `messages.en.json` and `messages.vi.json` from generated contracts as the i18n source.
3. Add `@openlet/contracts` workspace package consuming the library output (`outputs/openlet/contracts` checked into the monorepo or published locally via `pnpm` workspace).
4. Add a `<GeneratedField>` Shadcn-RHF helper component in `openlet-web/src/components/forms/generated-field.tsx`:

```tsx
export function GeneratedField<TMeta extends FormMeta, TName extends keyof TMeta["fields"]>({
  name,
  meta,
  control,
}: {
  name: TName;
  meta: TMeta;
  control: Control<any>;
}) {
  const t = useTranslations();
  const f = meta.fields[name as string];
  return (
    <FormField
      control={control}
      name={name as string}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t(f.labelKey)}</FormLabel>
          <FormControl>
            {/* dispatch on f.type: "string" -> Input, "enum" -> Select, "boolean" -> Switch */}
            <Input
              placeholder={f.placeholderKey ? t(f.placeholderKey) : undefined}
              maxLength={f.maxLength}
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
```

**Per-dialog migration pattern (one PR each, ~30–60 min).**

For each of the 8 dialogs:

1. Replace `useState` with `useForm({ resolver: zodResolver(<GeneratedSchema>) })`.
2. Replace hardcoded `<input maxLength={...} />` blocks with `<GeneratedField name="..." meta={<GeneratedMeta>} control={form.control} />`.
3. Replace inline error mapping with `formatXxxError(err, t)`.
4. Replace ad-hoc query keys with `xxxKeys.detail(id)`.
5. Replace ad-hoc invalidations with `xxxInvalidations.onXxxMutated(qc, id)`.
6. For PATCH-on-versioned-resource sites, replace manual `If-Match` with `useUpdateXxx({ current: resource })`.

**Migration order (dependency-driven).**

| #   | PR                                           | Touches                             |
| --- | -------------------------------------------- | ----------------------------------- |
| 1   | enums + i18n setup                           | `next-intl`, all `<select>` lists   |
| 2   | `<GeneratedField>` helper                    | new file only                       |
| 3   | `create-workspace-dialog`                    | RHF migration                       |
| 4   | `create-folder-dialog`                       | RHF + error map                     |
| 5   | `rename-file-dialog`, `rename-folder-dialog` | RHF                                 |
| 6   | `about-card`, `settings-view`                | RHF                                 |
| 7   | `workspace-settings-view` (invite-member)    | RHF + roles enum from W1            |
| 8   | `danger-zone-card` (confirm-by-name)         | RHF + custom validator              |
| 9   | query-key migration sweep                    | every component using ad-hoc tuples |
| 10  | `If-Match` migration                         | `file-actions.tsx` PATCH sites      |

**Acceptance per PR.**

- All hardcoded English strings in the touched files gone (they live in `messages.en.json` / `messages.vi.json`).
- All inline `maxLength` / `required` props gone (driven by Meta).
- Every `useQuery` / `useMutation` uses generated keys.
- Visual regression check: take screenshots before/after each dialog migration.

---

## Migration & rollout

**Versioning.** Phase 3 is a `0.x` minor bump for `typespec-zod` plus a small minor bump for `typespec-orm` (new decorators only). Existing `@title` / `@placeholder` literals continue to work when `i18n: false`.

**Order of merges.**

1. W1 enums (foundation; W2 references enum metadata)
2. W2 form metadata + i18n keys
3. W4 pagination envelope (independent of W1/W2)
4. W3 query key factory
5. W5 error codes (depends on W2 messages.json plumbing)
6. W6 `If-Match` wiring (depends on Phase 1 `@version` and W5 errors)
7. W7 openlet-web migration (consumes all of the above)

W3, W4, W5, W6 can ship as one library release; W7 starts after.

**Acceptance gate to leave Phase 3.** All of:

- ✅ All six library workstream PRs merged
- ✅ openlet-web migration complete: zero `useState`-based forms, zero hardcoded English strings in JSX, zero ad-hoc query key tuples
- ✅ `next-intl` wired with `en` + `vi` (vi may have placeholder values)
- ✅ Type-check + ESLint + visual smoke pass on openlet-web
- ✅ All forms use `react-hook-form` + `zodResolver` against generated schemas

---

## Risks & mitigations

| Risk                                                 | Likelihood | Impact | Mitigation                                                                                                                                                                  |
| ---------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next-intl` setup breaks SSR or routing              | medium     | medium | follow next-intl recipe; smoke test before per-dialog migrations                                                                                                            |
| Generated `Meta` shape too rigid for one-off layouts | medium     | low    | `<GeneratedField>` is a helper not a mandate; raw RHF + Meta reads still allowed                                                                                            |
| Translation keys explode in count                    | medium     | low    | namespaced by `<context>.<model>.<field>.<purpose>`; lint for unused keys                                                                                                   |
| Vietnamese translations lag                          | high       | low    | accept; messages.vi.json populates with English fallback; product owner fills in over time                                                                                  |
| RHF + zodResolver perf on large forms                | low        | low    | openlet's largest form is ~6 fields; not a concern at this size                                                                                                             |
| Error code drift between backend and contracts       | medium     | high   | error codes declared once in TypeSpec, consumed by both Go (via Phase 1+2 emitter extensions, future work) and Zod; until then, treat TypeSpec as the source and Go follows |

---

## Open questions for user

1. **Default locale strategy.** `en` as default with `vi` opt-in via `[locale]` segment, or both as siblings? Plan assumes `[locale]` segment.
2. **Translation ownership.** Who fills `messages.vi.json`? Product? Engineering? Library generates English values from `@title` decorators; `vi` starts empty. Confirm process.
3. **`<GeneratedField>` location.** Ship in `openlet-web` repo, or as a small sibling package `@qninhdt/typespec-zod-react`? Plan assumes openlet-web.
4. **Typed fetcher scope.** Phase 3 emits fetchers only for `@versioned` ops. Should we expand to every operation in a future phase? Recommend yes once openlet-web has migrated and we see pain points.
5. **i18n key naming convention.** `forms.<namespace>.<model>.<field>.<purpose>` per the W2 example, or shorter `<model>.<field>.label`? Plan assumes the longer namespaced form for collision safety.

Resolve before W2 / W7 start.
