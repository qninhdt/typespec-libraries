import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace WorldCard.Models;

// ─── PickProperties / OmitProperties / Lookup Type Examples ──────────────────
//
// These models demonstrate TypeSpec built-in template types used to derive
// new @table models from existing ones, with decorator / validator inheritance.

// ─── 1. PickProperties ──────────────────────────────────────────────────────

/**
 * Lightweight user profile view.
 * Picks only the identity + display columns from User.
 */
@data
model UserProfile is PickProperties<User, "id" | "email" | "displayName" | "avatarUrl">;

// ─── 2. OmitProperties ─────────────────────────────────────────────────────

/**
 * Public user record with sensitive / internal columns removed.
 * Omits password hash, soft-delete, audit timestamps, and relationships.
 */
@data
model PublicUser
  is OmitProperties<
    User,

      | "passwordHash"
      | "deletedAt"
      | "updatedAt"
      | "createdAt"
      | "fullTitle"
      | "subscriptions"
      | "worlds"
      | "emailDeletedAt"
  >;

// ─── 3. Lookup type (Model.property) ───────────────────────────────────────

/**
 * Invitation record that references a user's email and a world's name
 * using lookup types.  The validators (\@maxLength, \@format, etc.) from the
 * source property should be inherited automatically.
 */
@table("invitations")
model Invitation {
  /** Unique identifier for the invitation */
  @key id: uuid;

  /**
   * Email of the invitee - should inherit \@maxLength(320) and \@format("email")
   * from User.email
   */
  inviteeEmail: User.email;

  /**
   * Name of the world being shared - should inherit \@maxLength(200) from World.name
   */
  worldName: World.name;

  /** Optional personal message */
  @maxLength(1000)
  message?: text;

  /** Timestamp when the invitation was sent */
  @autoCreateTime
  createdAt: utcDateTime;
}

// ─── 4. @data form model + lookup-field decorator patterns ───────────────────

/**
 * Form payload for creating an invitation.
 * Uses `@data` instead of `@table` - no DB schema is generated.
 *
 * `::type` rule for decorators that require a `Scalar` target (e.g. `@inputType`):
 *   - Direct-scalar field  (`message?: text`)  → `@@dec(Form.message::type, ...)`
 *     `::type` resolves to the `text` scalar directly. ✓
 *   - Lookup-typed field (`worldPrompt: World.prompt`) → `Form.worldPrompt::type`
 *     resolves to the source `ModelProperty` (`World.prompt`), NOT the scalar.
 *     Go one level deeper via the source property: `@@dec(World.prompt::type, ...)`. ✓
 */
@data("Create Invitation Form")
model CreateInvitationForm {
  /**
   * Email address of the person being invited.
   * Lookup type: inherits \@maxLength(320) and \@format("email") from User.email.
   * \@title and \@placeholder target ModelProperty - apply inline as normal.
   */
  @title("Invitee Email")
  @placeholder("friend@example.com")
  inviteeEmail: User.email;

  /**
   * Name of the world to invite into.
   * Lookup type: inherits \@maxLength(200) from World.name.
   */
  @title("World Name")
  @placeholder("Select or type a world name")
  worldName: World.name;

  /**
   * Prompt text for the target world.
   * Lookup type whose source scalar is `text` (custom, not a built-in) -
   * used below to demonstrate `@@inputType` via `World.prompt::type`.
   */
  @title("World Prompt")
  worldPrompt: World.prompt;

  /**
   * Optional personal message included in the invitation.
   * Direct custom scalar (`text`) - \@inputType applied via `::type` below.
   */
  @title("Personal Message")
  @placeholder("Write a short note to your invitee…")
  message?: text;
}

// @inputType requires Scalar. Two ::type patterns:
//
//   Direct-scalar field: message::type → `text` scalar directly.
@@inputType(CreateInvitationForm.message::type, "textarea");
//
//   Lookup field: worldPrompt::type → World.prompt (ModelProperty, not Scalar!).
//   Must target the source property's type instead:
@@inputType(World.prompt::type, "textarea");
