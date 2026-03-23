import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Forms.Collaboration;

/**
 * Form payload for creating an invitation.
 * Uses `@data`, so no DB schema is generated.
 */
@data("Create Invitation Form")
model CreateInvitationForm {
  /**
   * Email address of the invited collaborator.
   * Inherits validators from Accounts.User.email.
   */
  @title("Invitee Email")
  @placeholder("friend@example.com")
  inviteeEmail: Demo.GamePlatform.Accounts.User.email;

  /**
   * Name of the world to share.
   * Inherits validators from Worlds.World.name.
   */
  @title("World Name")
  @placeholder("Choose a world")
  worldName: Demo.GamePlatform.Worlds.World.name;

  /**
   * Prompt preview pulled from Worlds.World.prompt.
   */
  @title("World Prompt")
  worldPrompt: Demo.GamePlatform.Worlds.World.prompt;

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
@@inputType(Demo.GamePlatform.Worlds.World.prompt::type, "textarea");
