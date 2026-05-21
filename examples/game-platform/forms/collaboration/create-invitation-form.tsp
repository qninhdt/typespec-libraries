import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace GamePlatform.Forms.Collaboration;

/**
 * Form payload for creating an invitation.
 * Omits `@table`, so no DB schema is generated.
 */
model CreateInvitationForm {
  /**
   * Email address of the invited collaborator.
   * Inherits validators from Accounts.User.email.
   */
  @title("Invitee Email")
  @placeholder("friend@example.com")
  inviteeEmail: GamePlatform.Accounts.User.email;

  /**
   * Name of the world to share.
   * Inherits validators from Worlds.World.name.
   */
  @title("World Name")
  @placeholder("Choose a world")
  worldName: GamePlatform.Worlds.World.name;

  /**
   * Prompt preview pulled from Worlds.World.prompt.
   */
  @title("World Prompt")
  worldPrompt: GamePlatform.Worlds.World.prompt;

  /**
   * Optional personal note included with the invitation.
   */
  @title("Personal Message")
  @placeholder("Add a short note for the invitee")
  message?: text;
}

// Direct scalar field: message::type resolves to `text`.
@@inputType(CreateInvitationForm.message::type, "textarea");

// Lookup field: worldPrompt::type resolves to World.prompt, not directly to `text`.
@@inputType(GamePlatform.Worlds.World.prompt::type, "textarea");
