import "@qninhdt/typespec-orm";
import "@qninhdt/typespec-protobuf";

using Qninhdt.Orm;
using Qninhdt.Proto;

namespace FileVault.Notifications;

enum NotificationStateCode {
  unspecified: 0,
  unread: 1,
  read: 2,
  archived: 3,
}
model NotificationView {
  id: uuid;

  recipientId: uuid;

  subject: string;

  body: string;

  state: NotificationStateCode;

  resourceType?: string;

  resourceId?: uuid;

  readAtIso?: string;
}
model ListNotificationsRequest {
  recipientId: uuid;

  unreadOnly: boolean;

  page: FileVault.Shared.PageRequest;
}
model ListNotificationsResponse {
  notifications: NotificationView[];

  page: FileVault.Shared.PageInfo;
}
model CreateNotificationRequest {
  recipientId: uuid;

  subject: string;

  body: string;

  resourceType?: string;

  resourceId?: uuid;
}
model MarkNotificationReadRequest {
  notificationId: uuid;

  recipientId: uuid;
}
model NotificationStreamRequest {
  recipientId: uuid;
}
