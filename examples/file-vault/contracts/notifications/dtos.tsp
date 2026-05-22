import "@qninhdt/typespec-orm";
import "@typespec/protobuf";

using Qninhdt.Orm;
using Protobuf;

namespace FileVault.Notifications;

enum NotificationStateCode {
  unspecified: 0,
  unread: 1,
  read: 2,
  archived: 3,
}
model NotificationView {
  @field(1)
  id: uuid;

  @field(2)
  recipientId: uuid;

  @field(3)
  subject: string;

  @field(4)
  body: string;

  @field(5)
  state: NotificationStateCode;

  @field(6)
  resourceType?: string;

  @field(7)
  resourceId?: uuid;

  @field(8)
  readAtIso?: string;
}
model ListNotificationsRequest {
  @field(1)
  recipientId: uuid;

  @field(2)
  unreadOnly: boolean;

  @field(3)
  page: FileVault.Shared.PageRequest;
}
model ListNotificationsResponse {
  @field(1)
  notifications: NotificationView[];

  @field(2)
  page: FileVault.Shared.PageInfo;
}
model CreateNotificationRequest {
  @field(1)
  recipientId: uuid;

  @field(2)
  subject: string;

  @field(3)
  body: string;

  @field(4)
  resourceType?: string;

  @field(5)
  resourceId?: uuid;
}
model MarkNotificationReadRequest {
  @field(1)
  notificationId: uuid;

  @field(2)
  recipientId: uuid;
}
model NotificationStreamRequest {
  @field(1)
  recipientId: uuid;
}
