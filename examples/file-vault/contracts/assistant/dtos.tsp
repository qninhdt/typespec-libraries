import "@qninhdt/typespec-orm";
import "@typespec/protobuf";

using Qninhdt.Orm;
using Protobuf;

namespace FileVault.Assistant;

enum ConversationStateCode {
  conversationStateUnspecified: 0,
  active: 1,
  archived: 2,
}

enum MessageRoleCode {
  messageRoleUnspecified: 0,
  user: 1,
  assistant: 2,
  system: 3,
}

enum AssistantTaskStatusCode {
  assistantTaskStatusUnspecified: 0,
  queued: 1,
  running: 2,
  waitingForApproval: 3,
  completed: 4,
  failed: 5,
  canceled: 6,
}

enum ApprovalDecisionCode {
  approvalDecisionUnspecified: 0,
  pending: 1,
  approved: 2,
  rejected: 3,
}
model ConversationView {
  @field(1)
  id: uuid;

  @field(2)
  ownerId: uuid;

  @field(3)
  title: string;

  @field(4)
  state: ConversationStateCode;

  @field(5)
  lastMessageAtIso?: string;
}
model MessageView {
  @field(1)
  id: uuid;

  @field(2)
  conversationId: uuid;

  @field(3)
  role: MessageRoleCode;

  @field(4)
  content: string;

  @field(5)
  createdAtIso: string;
}
model StartConversationRequest {
  @field(1)
  ownerId: uuid;

  @field(2)
  title?: string;

  @field(3)
  initialMessage?: string;
}
model SendMessageRequest {
  @field(1)
  conversationId: uuid;

  @field(2)
  senderId: uuid;

  @field(3)
  content: string;
}
model AssistantReply {
  @field(1)
  conversation: ConversationView;

  @field(2)
  messages: MessageView[];
}
model StartAssistantTaskRequest {
  @field(1)
  conversationId: uuid;

  @field(2)
  requestedBy: uuid;

  @field(3)
  taskType: string;

  @field(4)
  objective: string;

  @field(5)
  targetNodeId?: uuid;
}
model AssistantTaskView {
  @field(1)
  id: uuid;

  @field(2)
  conversationId: uuid;

  @field(3)
  taskType: string;

  @field(4)
  objective: string;

  @field(5)
  status: AssistantTaskStatusCode;

  @field(6)
  targetNodeId?: uuid;

  @field(7)
  resultSummary?: string;
}
model ApprovalRequestView {
  @field(1)
  id: uuid;

  @field(2)
  taskId: uuid;

  @field(3)
  action: string;

  @field(4)
  resourceType: string;

  @field(5)
  resourceId: uuid;

  @field(6)
  proposalJson: jsonb;

  @field(7)
  decision: ApprovalDecisionCode;
}
model SubmitApprovalDecisionRequest {
  @field(1)
  approvalId: uuid;

  @field(2)
  decidedBy: uuid;

  @field(3)
  decision: ApprovalDecisionCode;
}
model WatchConversationRequest {
  @field(1)
  conversationId: uuid;

  @field(2)
  requesterId: uuid;
}
model AssistantEvent {
  @field(1)
  conversationId: uuid;

  @field(2)
  task?: AssistantTaskView;

  @field(3)
  message?: MessageView;

  @field(4)
  approval?: ApprovalRequestView;
}
