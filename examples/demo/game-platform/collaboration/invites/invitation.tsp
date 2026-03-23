import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Collaboration.Invites;

/** State of an invitation to a shared world. */
enum InvitationStatus {
  pending: "pending",
  accepted: "accepted",
  revoked: "revoked",
  expired: "expired",
}

/**
 * Invitation record linking a user email to a shared world.
 * Demonstrates cross-namespace lookup types and relations on the same table.
 */
@table("world_invitations")
model Invitation is Demo.GamePlatform.Shared.Timestamped {
  /** Email of the invitee - inherits validators from Accounts.User.email. */
  inviteeEmail: Demo.GamePlatform.Accounts.User.email;

  /** Unique redeem code sent through email or copied in the UI. */
  @unique
  @maxLength(64)
  redeemCode: string;

  /** Current lifecycle state for the invitation. */
  @index
  status: InvitationStatus = InvitationStatus.pending;

  /** Optional personal note from the inviter. */
  @maxLength(1000)
  message?: text;

  /** When the invitation expires, if at all. */
  expiresAt?: utcDateTime;

  /** When the invitation was accepted by the recipient. */
  acceptedAt?: utcDateTime;

  // ─── Explicit FK Fields ─────────────────
  inviterId: uuid;
  worldId: uuid;

  // ─── Composite Indexes ─────────────────
  inviterIdStatus: composite<"inviterId", "status">;

  // ─── Relationships Across Namespaces ─────────────────
  /** User who created the invitation. */
  @foreignKey("inviterId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  inviter: Demo.GamePlatform.Accounts.User;

  /** World the invite grants access to. */
  @foreignKey("worldId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  world: Demo.GamePlatform.Worlds.World;
}
