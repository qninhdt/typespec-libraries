import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Worlds;

/** A player-created world that owns story trees and reusable content pools. */
@table
model World is Demo.GamePlatform.Shared.Timestamped {
  /**
   * Display name of the world.
   * Referenced by forms and collaboration models through lookup types.
   */
  @index
  @maxLength(200)
  name: string;

  /** Stable human-readable slug used by cross-namespace references. */
  @unique
  @maxLength(80)
  slug: string;

  /** System prompt used to guide AI generation within the world. */
  prompt: text;

  /** Who can discover and join this world. */
  @index
  visibility: WorldVisibility = WorldVisibility.private;

  /** Content safety classification for moderation and parental controls. */
  @index
  safetyRating: SafetyRating = SafetyRating.teen;

  /** Optional JSON settings payload for custom generation behavior. */
  settings?: jsonb;

  // ─── Composite Indexes ─────────────────
  ownerIdCreatedAt: composite<"ownerId", "createdAt">;

  visibilityDeletedAt: composite<"visibility", "deletedAt">;

  // ─── Explicit FK Fields ─────────────────
  @index
  ownerId: uuid;

  // ─── Cross-Namespace Ownership ─────────────────
  /** User who owns and manages this world. */
  @foreignKey("ownerId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  owner: Demo.GamePlatform.Accounts.User;
}
