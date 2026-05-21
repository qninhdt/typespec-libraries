import "@qninhdt/typespec-protobuf";

using Qninhdt.Proto;

@protoPackage("filevault.notifications.v1")
namespace FileVault.Notifications;

@protoService
interface NotificationService {
  createNotification(...CreateNotificationRequest): NotificationView;

  listNotifications(...ListNotificationsRequest): ListNotificationsResponse;

  markRead(...MarkNotificationReadRequest): FileVault.Shared.Ack;

  @stream(StreamMode.Out)
  subscribe(...NotificationStreamRequest): NotificationView;
}
