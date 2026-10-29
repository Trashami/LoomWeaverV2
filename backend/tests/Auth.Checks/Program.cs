using LoomWeaver.Domain;
using LoomWeaver.GameSystems;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Realtime;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

const string signingSecret = "auth-checks-secret-long-enough-for-hmac-keys";
Environment.SetEnvironmentVariable("LOOMWEAVER_JWT_SECRET", signingSecret);
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

Check(CharacterCalculationEngine.XpForLevel("dnd5e", 7) == 23000 && CharacterCalculationEngine.XpForLevel("dnd5e", 20) == 355000,
    "5e XP thresholds follow the SRD table");
var engine = new CharacterCalculationEngine();
var hero = engine.RecalculateSheet(new CharacterSheetDto(
    "1:Character:char-t", "char-t", 1, "T", "", "Fighter", "dnd5e", 1, 300, 300, false, 1, 0, 10, 0, 30, 2, "",
    [new AbilityScoreDto("CON", "Constitution", 14, 0), new AbilityScoreDto("DEX", "Dexterity", 14, 0)], [], []));
Check(hero.LevelUpEligible, "character with enough XP is level-up eligible");
var leveled = engine.ApplyLevelUp(hero, "Second Wind", "CON");
Check(leveled.Level == 2 && leveled.NextLevelXp == 900 && !leveled.LevelUpEligible && leveled.Abilities[0].Score == 15,
    "level-up advances to the next SRD XP threshold");
var capped = engine.RecalculateSheet(hero with { Level = 20, CurrentXp = 400000, NextLevelXp = 355000 });
Check(!capped.LevelUpEligible, "level 20 characters cannot level up");

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

var validToken = JwtTokenHelper.IssueHmacJwt(user, DateTimeOffset.UtcNow.AddMinutes(5));
Check(JwtTokenHelper.VerifyHmacJwt(validToken, [user])?.Id == user.Id, "valid issuer, audience, and expiry are accepted");
Check(JwtTokenHelper.VerifyHmacJwt(RewriteToken(validToken, payload => payload.Remove("exp")), [user]) is null,
    "JWT expiry is required");
Check(JwtTokenHelper.VerifyHmacJwt(
        RewriteToken(validToken, payload => payload["exp"] = DateTimeOffset.UtcNow.AddMinutes(-1).ToUnixTimeSeconds()),
        [user]) is null,
    "expired JWTs are rejected");
Check(JwtTokenHelper.VerifyHmacJwt(RewriteToken(validToken, payload => payload["aud"] = "other-client"), [user]) is null,
    "JWT audience must match");
Check(JwtTokenHelper.VerifyHmacJwt(RewriteToken(validToken, payload => payload["iss"] = "other-server"), [user]) is null,
    "JWT issuer must match");
Check(JwtTokenHelper.VerifyHmacJwt(RewriteToken(validToken, payload => payload["sub"] = "22"), [user]) is null,
    "JWT subject must match its account");
Check(TableRealtimeEndpoints.IsGmOnly("gm_note", "{}"), "GM event prefixes are private");
Check(TableRealtimeEndpoints.IsGmOnly("table_event", "{\"meta\":{\"Visibility\":\"GM\"}}"),
    "nested case-insensitive GM visibility is private");
Check(TableRealtimeEndpoints.IsGmOnly("table_event", "{\"visibility\":\"unknown\"}"),
    "unknown event visibility is private");
Check(TableRealtimeEndpoints.IsGmOnly("table_event", "{"), "malformed event payloads are private");
Check(!TableRealtimeEndpoints.IsGmOnly("table_event", "{\"visibility\":\"players\"}"),
    "explicit player visibility can be broadcast");

// Two separate players in one campaign: each controls only their own character.
var userB = user with { Id = 22, Email = "second@example.test", Username = "second" };
var accessA = CampaignAccessResolver.Build(user, new CampaignMembership(42, "player", "pc-ava", null, null), null);
var accessB = CampaignAccessResolver.Build(userB, new CampaignMembership(42, "player", "pc-bo", null, null), null);
var avaSheet = new CharacterSheetDto("42:Character:char-ava", "char-ava", 42, "Ava", "", "Fighter", "dnd5e", 1, 0, 300, false,
    10, 10, 12, 0, 30, 2, "", [], [], []);
var avaRecord = new LoomWeaver.Modules.Characters.StoredCharacter(1, user.Id, 1, avaSheet);
Check(LoomWeaver.Modules.Characters.CharacterStudioEndpoints.IsOwnerOrBound(avaRecord, accessA),
    "a player controls their own character");
Check(!LoomWeaver.Modules.Characters.CharacterStudioEndpoints.IsOwnerOrBound(avaRecord, accessB),
    "a second player cannot control another player's character");
Check(Enumerable.Range(0, 500).All(_ => LoomWeaver.Modules.Encounters.CombatTokenStore.Roll(20) is >= 1 and <= 20),
    "server dice rolls stay within the die size");
Check(LoomWeaver.Modules.Encounters.CombatTokenStore.CharacterKeyOf("42:Character:char-ava") == "char-ava"
    && LoomWeaver.Modules.Encounters.CombatTokenStore.CharacterKeyOf("42:Encounter:x") is null,
    "combat tokens map to character keys only for party members");
{
    var doc = JsonDocument.Parse("""{"name":"Crypt","secretNotes":"gm only","walls":[{"id":"w1","name":"Wall","points":[[0,0],[3,0],[3,3]]}]}""").RootElement;
    var scene = LoomWeaver.Modules.Maps.Features.SaveScene.VttSceneEndpoints.Project("crypt", new LoomWeaver.Modules.Maps.Infrastructure.StoredMapSceneDocument(2, doc));
    Check(scene.Walls.Count == 2 && Math.Abs(scene.Walls[0].X2 - 4) < 0.001 && !System.Text.Json.JsonSerializer.Serialize(scene).Contains("gm only"),
        "map handoff gives players walls in VTT units and no GM notes");
}
{
    var forged = new LoomWeaver.Domain.CombatResolutionRequest("a", "b", "Strike", "action", 5, 99, 0, 30, 100, 999, "x", "gm");
    var limited = LoomWeaver.Modules.Encounters.CombatTokenStore.ApplySheetLimits(forged, avaRecord.Sheet);
    Check(limited.AttackBonus < 20 && limited.DamageDiceCount <= 12 && limited.DamageDiceSides <= 12 && limited.DamageBonus < 20,
        "client-supplied attack stats are replaced by sheet-derived limits");
}

string RewriteToken(string token, Action<JsonObject> mutatePayload)
{
    var parts = token.Split('.');
    var payload = JsonNode.Parse(Decode(parts[1]))!.AsObject();
    mutatePayload(payload);
    var encodedPayload = Encode(Encoding.UTF8.GetBytes(payload.ToJsonString()));
    var unsigned = $"{parts[0]}.{encodedPayload}";
    var signature = HMACSHA256.HashData(Encoding.UTF8.GetBytes(signingSecret), Encoding.UTF8.GetBytes(unsigned));
    return $"{unsigned}.{Encode(signature)}";
}

string Decode(string value)
{
    var padded = value.Replace('-', '+').Replace('_', '/');
    return Encoding.UTF8.GetString(Convert.FromBase64String(padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=')));
}

string Encode(byte[] value) =>
    Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
