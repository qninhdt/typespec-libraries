import "@qninhdt/typespec-protobuf";

using Qninhdt.Proto;

@protoPackage("filevault.assistant.v1")
namespace FileVault.Assistant;

model WatchConversationEvent {
  occurredAt: utcDateTime;

  event: AssistantEvent;
}

@protoService
interface AssistantService {
  startConversation(...StartConversationRequest): AssistantReply;

  sendMessage(...SendMessageRequest): AssistantReply;

  startTask(...StartAssistantTaskRequest): AssistantTaskView;

  submitApprovalDecision(...SubmitApprovalDecisionRequest): AssistantTaskView;

  @stream(StreamMode.Out)
  watchConversation(...WatchConversationRequest): WatchConversationEvent;
}
