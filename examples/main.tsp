/**
 * Namespace-first example schema for @qninhdt/typespec-orm.
 *
 * This example is intentionally split across many files so the source tree
 * mirrors the namespace tree.
 *
 * Namespaces demonstrated:
 * - Demo.GamePlatform.Shared
 * - Demo.GamePlatform.Accounts
 * - Demo.GamePlatform.Worlds
 * - Demo.GamePlatform.Content.Stories
 * - Demo.GamePlatform.Content.Characters
 * - Demo.GamePlatform.Content.Places
 * - Demo.GamePlatform.Content.Events
 * - Demo.GamePlatform.Content.Taxonomy
 * - Demo.GamePlatform.Collaboration.Invites
 * - Demo.GamePlatform.Forms.Public.Accounts
 * - Demo.GamePlatform.Forms.Collaboration
 * - Demo.GamePlatform.Forms.Worlds
 * - Demo.GamePlatform.Audit
 *
 * Useful selector experiments:
 * - include: ["Demo.GamePlatform.Forms"]
 * - include: ["Demo.GamePlatform.Content"]
 * - include: ["Demo.GamePlatform.Content.Stories", "Demo.GamePlatform.Worlds"]
 * - exclude: ["Demo.GamePlatform.Audit"]
 */
import "./demo/game-platform/shared/mixins.tsp";
import "./demo/game-platform/accounts/enums.tsp";
import "./demo/game-platform/accounts/user.tsp";
import "./demo/game-platform/accounts/subscription.tsp";
import "./demo/game-platform/worlds/enums.tsp";
import "./demo/game-platform/worlds/world.tsp";
import "./demo/game-platform/content/stories/story-node.tsp";
import "./demo/game-platform/content/characters/npc.tsp";
import "./demo/game-platform/content/places/location.tsp";
import "./demo/game-platform/content/events/game-event.tsp";
import "./demo/game-platform/content/taxonomy/tag.tsp";
import "./demo/game-platform/collaboration/invites/invitation.tsp";
import "./demo/game-platform/forms/public/accounts/user-profile.tsp";
import "./demo/game-platform/forms/public/accounts/public-user.tsp";
import "./demo/game-platform/forms/collaboration/create-invitation-form.tsp";
import "./demo/game-platform/forms/worlds/create-world-form.tsp";
import "./demo/game-platform/audit/audit-log.tsp";
