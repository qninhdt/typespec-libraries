import "@typespec/protobuf";

using Protobuf;

@package({
  name: "gameplatform.accounts.v1",
})
namespace GamePlatform.Accounts {
  model GetUserRequest {
    @field(1) id: string;
  }

  model UserView {
    @field(1) id: string;
    @field(2) username: string;
    @field(3) email: string;
    @field(4) displayName: string;
  }

  @Protobuf.service
  interface AccountService {
    getUser(...GetUserRequest): UserView;
  }
}

@package({
  name: "gameplatform.worlds.v1",
})
namespace GamePlatform.Worlds {
  model GetWorldRequest {
    @field(1) slug: string;
  }

  model WorldView {
    @field(1) slug: string;
    @field(2) name: string;
    @field(3) ownerId: string;
  }

  @Protobuf.service
  interface WorldService {
    getWorld(...GetWorldRequest): WorldView;
  }
}

@package({
  name: "gameplatform.collaboration.v1",
})
namespace GamePlatform.Collaboration.Invites {
  model ListInvitationsRequest {
    @field(1) worldSlug: string;
    @field(2) limit: int32;
  }

  model InvitationView {
    @field(1) id: string;
    @field(2) worldSlug: string;
    @field(3) inviterId: string;
    @field(4) status: string;
  }

  model ListInvitationsResponse {
    @field(1) invitations: InvitationView[];
  }

  @Protobuf.service
  interface CollaborationService {
    listInvitations(...ListInvitationsRequest): ListInvitationsResponse;
  }
}
