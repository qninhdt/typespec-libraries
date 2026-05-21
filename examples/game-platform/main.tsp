/**
 * Namespace-first example schema for @qninhdt/typespec-orm.
 *
 * This example is intentionally split across many files so the source tree
 * mirrors the namespace tree.
 *
 * Namespaces demonstrated:
 * - GamePlatform.Shared
 * - GamePlatform.Accounts
 * - GamePlatform.Worlds
 * - GamePlatform.Content.Stories
 * - GamePlatform.Content.Characters
 * - GamePlatform.Content.Places
 * - GamePlatform.Content.Events
 * - GamePlatform.Content.Taxonomy
 * - GamePlatform.Collaboration.Invites
 * - GamePlatform.Forms.Public.Accounts
 * - GamePlatform.Forms.Collaboration
 * - GamePlatform.Forms.Worlds
 * - GamePlatform.Audit
 *
 * Phase 2 features demonstrated:
 * - `AuditLog.worldContext` references `World.slug` via `@foreignKey("worldSlug", "slug")`
 * - `StoryNode.tags` exercises explicit collection persistence in Ent / SQLModel
 *
 * Phase 3 features demonstrated:
 * - `User.credits` and `Subscription.monthlyPrice` carry named `@check(...)` constraints
 * - `User.badges` and `Badge.users` use `@manyToMany("user_badges")`
 * - `CreateInvitationForm` and `CreateWorldForm` export rich Zod metadata
 * - SQLModel package roots expose `metadata = SQLModel.metadata` for Alembic
 * - DBML can be emitted as namespace-split files
 *
 * Useful selector experiments:
 * - include: ["GamePlatform.Forms"]
 * - include: ["GamePlatform.Content"]
 * - include: ["GamePlatform.Content.Stories", "GamePlatform.Worlds"]
 * - exclude: ["GamePlatform.Audit"]
 */
import "./shared/mixins.tsp";
import "./accounts/enums.tsp";
import "./accounts/badge.tsp";
import "./accounts/user.tsp";
import "./accounts/subscription.tsp";
import "./worlds/enums.tsp";
import "./worlds/world.tsp";
import "./content/stories/story-node.tsp";
import "./content/characters/npc.tsp";
import "./content/places/location.tsp";
import "./content/events/game-event.tsp";
import "./content/taxonomy/tag.tsp";
import "./collaboration/invites/invitation.tsp";
import "./forms/public/accounts/user-profile.tsp";
import "./forms/public/accounts/public-user.tsp";
import "./forms/collaboration/create-invitation-form.tsp";
import "./forms/worlds/create-world-form.tsp";
import "./audit/audit-log.tsp";
