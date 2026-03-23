import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.GamePlatform.Worlds;

/** Visibility setting for discovery and sharing rules. */
enum WorldVisibility {
  private: "private",
  unlisted: "unlisted",
  public: "public",
}

/** Content safety level used by moderation and search filtering. */
enum SafetyRating {
  general: "general",
  teen: "teen",
  mature: "mature",
}
