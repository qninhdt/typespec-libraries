import "@typespec/protobuf";

using Protobuf;

@package({
  name: "filevault.notifications.v1",
})
namespace FileVault.Notifications;

@Protobuf.service
interface NotificationService {
  createNotification(...CreateNotificationRequest): NotificationView;

  listNotifications(...ListNotificationsRequest): ListNotificationsResponse;

  markRead(...MarkNotificationReadRequest): FileVault.Shared.Ack;

  @stream(StreamMode.Out)
  subscribe(...NotificationStreamRequest): NotificationView;
}
