import "@typespec/protobuf";

using Protobuf;

@package({
  name: "filevault.assistant.v1",
})
namespace FileVault.Assistant;

model WatchConversationEvent {
  @field(1)
  occurredAtIso: string;

  @field(2)
  event: AssistantEvent;
}

@Protobuf.service
interface AssistantService {
  startConversation(...StartConversationRequest): AssistantReply;

  sendMessage(...SendMessageRequest): AssistantReply;

  startTask(...StartAssistantTaskRequest): AssistantTaskView;

  submitApprovalDecision(...SubmitApprovalDecisionRequest): AssistantTaskView;

  @stream(StreamMode.Out)
  watchConversation(...WatchConversationRequest): WatchConversationEvent;
}
