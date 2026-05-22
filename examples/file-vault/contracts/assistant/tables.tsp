import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace FileVault.Assistant;

enum ConversationState {
  active: "active",
  archived: "archived",
}

enum MessageRole {
  user: "user",
  assistant: "assistant",
  system: "system",
}

enum AssistantTaskStatus {
  queued: "queued",
  running: "running",
  waitingForApproval: "waiting_for_approval",
  completed: "completed",
  failed: "failed",
  canceled: "canceled",
}

enum ApprovalDecision {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
}

/** User-facing conversation. Tool calls are runtime events, not primary tables. */
@table("assistant_conversations")
model AssistantConversation {
  ...FileVault.Shared.OwnedEntity;
  @maxLength(200)
  title: string;

  state: ConversationState = ConversationState.active;
  lastMessageAt?: utcDateTime;

  @foreignKey("ownerId")
  @onDelete("CASCADE")
  owner: FileVault.Identity.UserAccount;
}

/** Persisted conversation message for product history and context rebuild. */
@table("assistant_messages")
model AssistantMessage {
  ...FileVault.Shared.Entity;
  @index
  conversationId: uuid;

  role: MessageRole;
  content: text;

  @maxLength(120)
  modelName?: string;

  tokenCount?: int32;

  @foreignKey("conversationId")
  @onDelete("CASCADE")
  conversation: AssistantConversation;
}

/** Durable user-requested task that may call file services internally. */
@table("assistant_tasks")
model AssistantTask {
  ...FileVault.Shared.Entity;
  @index
  conversationId: uuid;

  @index
  requestedBy: uuid;

  @maxLength(120)
  taskType: string;

  objective: text;
  status: AssistantTaskStatus = AssistantTaskStatus.queued;
  targetNodeId?: uuid;
  resultSummary?: text;
  startedAt?: utcDateTime;
  finishedAt?: utcDateTime;

  @foreignKey("conversationId")
  @onDelete("CASCADE")
  conversation: AssistantConversation;

  @foreignKey("requestedBy")
  requester: FileVault.Identity.UserAccount;
}

/** Approval gate before an assistant mutates or shares vault content. */
@table("assistant_approvals")
model AssistantApproval {
  ...FileVault.Shared.Entity;
  @index
  taskId: uuid;

  @maxLength(160)
  action: string;

  @maxLength(80)
  resourceType: string;

  resourceId: uuid;
  proposalJson: jsonb;
  decision: ApprovalDecision = ApprovalDecision.pending;
  decidedBy?: uuid;
  decidedAt?: utcDateTime;

  @foreignKey("taskId")
  @onDelete("CASCADE")
  task: AssistantTask;
}
