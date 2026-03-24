import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Forms.Worlds;

/**
 * Form payload for creating or editing a world.
 * Demonstrates cross-namespace lookup types pulled from multiple bounded contexts.
 */
@data("Create World Form")
model CreateWorldForm {
  @title("World Name")
  @placeholder("Chronicles of Emberfall")
  name: Demo.GamePlatform.Worlds.World.name;

  @title("World Prompt")
  prompt: Demo.GamePlatform.Worlds.World.prompt;

  @title("Owner Email")
  ownerEmail: Demo.GamePlatform.Accounts.User.email;

  @title("Starter Tag")
  starterTag: Demo.GamePlatform.Content.Taxonomy.Tag.name;

  @title("Featured NPC")
  featuredNpc: Demo.GamePlatform.Content.Characters.Npc.name;

  @title("Summary")
  @placeholder("Describe the setting, themes, and tone.")
  summary?: text;
}

@@inputType(CreateWorldForm.summary::type, "textarea");
