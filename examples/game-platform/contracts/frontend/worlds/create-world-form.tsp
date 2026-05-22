import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace GamePlatform.Forms.Worlds;

/**
 * Form payload for creating or editing a world.
 * Demonstrates cross-namespace lookup types pulled from multiple bounded contexts.
 */
@scope("frontend")
model CreateWorldForm {
  @title("World Name")
  @placeholder("Chronicles of Emberfall")
  name: GamePlatform.Worlds.World.name;

  @title("World Prompt")
  prompt: GamePlatform.Worlds.World.prompt;

  @title("Owner Email")
  ownerEmail: GamePlatform.Accounts.User.email;

  @title("Starter Tag")
  starterTag: GamePlatform.Content.Taxonomy.Tag.name;

  @title("Featured NPC")
  featuredNpc: GamePlatform.Content.Characters.Npc.name;

  @title("Summary")
  @placeholder("Describe the setting, themes, and tone.")
  summary?: text;
}

@@inputType(CreateWorldForm.summary::type, "textarea");
