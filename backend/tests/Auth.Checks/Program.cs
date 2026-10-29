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
