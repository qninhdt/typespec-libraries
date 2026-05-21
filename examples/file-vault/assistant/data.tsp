import "@qninhdt/typespec-orm";
import "@qninhdt/typespec-protobuf";

using Qninhdt.Orm;
using Qninhdt.Proto;

namespace FileVault.Assistant;

enum ConversationStateCode {
  unspecified: 0,
  active: 1,
  archived: 2,
}

enum MessageRoleCode {
  unspecified: 0,
  user: 1,
  assistant: 2,
  system: 3,
}

enum AssistantTaskStatusCode {
  unspecified: 0,
  queued: 1,
  running: 2,
  waitingForApproval: 3,
  completed: 4,
  failed: 5,
  canceled: 6,
}

enum ApprovalDecisionCode {
  unspecified: 0,
  pending: 1,
  approved: 2,
  rejected: 3,
}
model ConversationView {
  id: uuid;

  ownerId: uuid;

  title: string;

  state: ConversationStateCode;

  lastMessageAtIso?: string;
}
model MessageView {
  id: uuid;

  conversationId: uuid;

  role: MessageRoleCode;

  content: string;

  createdAtIso: string;
}
model StartConversationRequest {
  ownerId: uuid;

  title?: string;

  initialMessage?: string;
}
model SendMessageRequest {
  conversationId: uuid;

  senderId: uuid;

  content: string;
}
model AssistantReply {
  conversation: ConversationView;

  messages: MessageView[];
}
model StartAssistantTaskRequest {
  conversationId: uuid;

  requestedBy: uuid;

  taskType: string;

  objective: string;

  targetNodeId?: uuid;
}
model AssistantTaskView {
  id: uuid;

  conversationId: uuid;

  taskType: string;

  objective: string;

  status: AssistantTaskStatusCode;

  targetNodeId?: uuid;

  resultSummary?: string;
}
model ApprovalRequestView {
  id: uuid;

  taskId: uuid;

  action: string;

  resourceType: string;

  resourceId: uuid;

  proposalJson: jsonb;

  decision: ApprovalDecisionCode;
}
model SubmitApprovalDecisionRequest {
  approvalId: uuid;

  decidedBy: uuid;

  decision: ApprovalDecisionCode;
}
model WatchConversationRequest {
  conversationId: uuid;

  requesterId: uuid;
}
model AssistantEvent {
  conversationId: uuid;

  task?: AssistantTaskView;

  message?: MessageView;

  approval?: ApprovalRequestView;
}
