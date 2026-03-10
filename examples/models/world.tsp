import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace WorldCard.Models;

// ─── World Models ────────────────────────────────────────────────────────────

/** Visibility setting for a world */
enum WorldVisibility {
  private: "private",
  unlisted: "unlisted",
  public: "public",
}

@doc("A game world created by a user - contains story trees and content pools")
@table("worlds")
@compositeIndex("idx_worlds_owner_created", "owner_id", "created_at")
@compositeIndex("idx_worlds_visibility_active", "visibility", "deleted_at")
model World {
  @id id: uuid;

  @index("idx_worlds_name")
  @maxLength(200)
  name: string;

  prompt: text;

  @index("idx_worlds_visibility")
  visibility: WorldVisibility = WorldVisibility.private;

  settings?: jsonb;
  @autoCreateTime @map("created_at") createdAt: utcDateTime;
  @autoUpdateTime @map("updated_at") updatedAt?: utcDateTime;
  @softDelete @map("deleted_at") deletedAt?: utcDateTime;

  // ─── Relationships ─────────────────

  @foreignKey("users", "id")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  owner: User;

  storyNodes?: StoryNode[];
  npcs?: Npc[];
  locations?: Location[];
  gameEvents?: GameEvent[];
  tags?: Tag[];
}
