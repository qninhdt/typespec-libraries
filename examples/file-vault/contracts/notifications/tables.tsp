import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace FileVault.Notifications;

enum NotificationChannel {
  inApp: "in_app",
  email: "email",
  webhook: "webhook",
}

enum NotificationState {
  queued: "queued",
  sent: "sent",
  failed: "failed",
}

/** User preference per notification channel. */
@table("notification_preferences")
model NotificationPreference {
  ...FileVault.Shared.Entity;
  @index
  accountId: uuid;

  channel: NotificationChannel;
  enabled: boolean = true;
  quietHoursJson?: jsonb;

  @unique
  accountChannel: composite<"accountId", "channel">;

  @foreignKey("accountId")
  @onDelete("CASCADE")
  account: FileVault.Identity.UserAccount;
}

/** Notification visible in the product. */
@table("notifications")
model Notification {
  ...FileVault.Shared.Entity;
  @index
  recipientId: uuid;

  @maxLength(160)
  subject: string;

  body: text;
  resourceType?: string;
  resourceId?: uuid;
  readAt?: utcDateTime;

  @foreignKey("recipientId")
  @onDelete("CASCADE")
  recipient: FileVault.Identity.UserAccount;
}

/** Delivery attempt through a concrete channel. */
@table("notification_deliveries")
model NotificationDelivery {
  ...FileVault.Shared.Entity;
  @index
  notificationId: uuid;

  channel: NotificationChannel;
  state: NotificationState = NotificationState.queued;
  providerMessageId?: string;
  errorMessage?: string;
  sentAt?: utcDateTime;

  @foreignKey("notificationId")
  @onDelete("CASCADE")
  notification: Notification;
}
