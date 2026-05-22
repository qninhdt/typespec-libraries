// backend — Go (Ent) + Protobuf
// Single owning service for every persistence namespace.
import "../../contracts/shared/mixins.tsp";
import "../../contracts/accounts/enums.tsp";
import "../../contracts/accounts/badge.tsp";
import "../../contracts/accounts/user.tsp";
import "../../contracts/accounts/subscription.tsp";
import "../../contracts/worlds/enums.tsp";
import "../../contracts/worlds/world.tsp";
import "../../contracts/content/stories/story-node.tsp";
import "../../contracts/content/characters/npc.tsp";
import "../../contracts/content/places/location.tsp";
import "../../contracts/content/events/game-event.tsp";
import "../../contracts/content/taxonomy/tag.tsp";
import "../../contracts/collaboration/invites/invitation.tsp";
import "../../contracts/audit/audit-log.tsp";
import "./grpc.tsp";
