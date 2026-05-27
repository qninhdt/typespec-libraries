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

  @maxLength(80)
  resourceType?: string;

  resourceId?: uuid;
  readAt?: utcDateTime;
}

/** Delivery attempt through a concrete channel. */
@table("notification_deliveries")
model NotificationDelivery {
  ...FileVault.Shared.Entity;
  @index
  notificationId: uuid;

  channel: NotificationChannel;
  state: NotificationState = NotificationState.queued;

  @maxLength(160)
  providerMessageId?: string;

  @maxLength(512)
  errorMessage?: string;

  sentAt?: utcDateTime;

  @foreignKey("notificationId")
  @onDelete("CASCADE")
  notification: Notification;
}
