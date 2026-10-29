using LoomWeaver.Modules.Auth;

var user = new StoredUserRecord(
    21, "account", "player@example.test", "player", "Player",
    "", "", "players", "adventurer", "none", Array.Empty<string>(), 0);

void Check(bool valid, string name)
{
    if (!valid) throw new InvalidOperationException(name);
    Console.WriteLine($"PASS {name}");
}

var noMembership = CampaignAccessResolver.Build(user, null, "gm");
Check(!noMembership.IsMember && !noMembership.IsAccountGm, "membership required for campaign access");

var playerMembership = new CampaignMembership(42, "player", "pc-player", null, null);
var forgedGm = CampaignAccessResolver.Build(user, playerMembership, "gm");
Check(forgedGm.IsMember && !forgedGm.IsAccountGm && !forgedGm.IsEffectiveGm,
    "player membership cannot be elevated by requested GM role");

var gmMembership = new CampaignMembership(42, "gm", null, null, null);
var gm = CampaignAccessResolver.Build(user, gmMembership, null);
Check(gm.IsAccountGm && gm.IsEffectiveGm && gm.EffectiveViewerRole == "gm",
    "GM rights derive from campaign membership");

var gmPreview = CampaignAccessResolver.Build(user, gmMembership, "players");
Check(gmPreview.IsAccountGm && !gmPreview.IsEffectiveGm && gmPreview.EffectiveViewerRole == "players",
    "GM preview can only reduce privileges");
