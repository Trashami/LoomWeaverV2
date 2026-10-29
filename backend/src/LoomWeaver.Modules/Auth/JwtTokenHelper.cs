using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace LoomWeaver.Modules.Auth;

public static class JwtTokenHelper
{
    private const string Issuer = "MythWeaver.Server";
    private const string Audience = "MythWeaver.Client";
    private static byte[] JwtSigningKey => AuthSecrets.JwtSigningKey;
    private static byte[]? LegacyJwtSigningKey => AuthSecrets.LegacyJwtSigningKey;

    public static string IssueHmacJwt(StoredUserRecord user, DateTimeOffset expiresAt)
    {
        var isAdmin = string.Equals(user.Role, "admin", StringComparison.OrdinalIgnoreCase);

        var headerJson = JsonSerializer.Serialize(new { alg = "HS256", typ = "JWT" });
        var payloadJson = JsonSerializer.Serialize(new
        {
            iss = Issuer,
            aud = Audience,
            sub = user.Id.ToString(),
            nameid = user.Id.ToString(),
            accountId = user.AccountId,
            email = user.Email,
            username = user.Username,
            usr = user.Username,
            name = user.DisplayName,
            role = user.Role,
            tier = user.TierCode,
            witness = user.BoundCharacter,
            is_admin = isAdmin ? "true" : "false",
            exp = expiresAt.ToUnixTimeSeconds()
        });

        var headerB64 = Base64UrlEncode(Encoding.UTF8.GetBytes(headerJson));
        var payloadB64 = Base64UrlEncode(Encoding.UTF8.GetBytes(payloadJson));
        var unsignedToken = $"{headerB64}.{payloadB64}";
        var sigBytes = HMACSHA256.HashData(JwtSigningKey, Encoding.UTF8.GetBytes(unsignedToken));
        return $"{unsignedToken}.{Base64UrlEncode(sigBytes)}";
    }

    public static StoredUserRecord? VerifyHmacJwt(string? token, IReadOnlyList<StoredUserRecord> memoryUsers)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var clean = token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? token["Bearer ".Length..].Trim()
            : token.Trim();

        var parts = clean.Split('.');
        if (parts.Length != 3) return null;

        try
        {
            using var headerDoc = JsonDocument.Parse(Base64UrlDecode(parts[0]));
            if (!headerDoc.RootElement.TryGetProperty("alg", out var algorithm) ||
                algorithm.ValueKind != JsonValueKind.String ||
                !string.Equals(algorithm.GetString(), "HS256", StringComparison.Ordinal))
            {
                return null;
            }

            var unsignedToken = $"{parts[0]}.{parts[1]}";
            var unsignedBytes = Encoding.UTF8.GetBytes(unsignedToken);
            var sigBytes = Encoding.UTF8.GetBytes(parts[2]);

            var expectedPrimary = Encoding.UTF8.GetBytes(Base64UrlEncode(HMACSHA256.HashData(JwtSigningKey, unsignedBytes)));
            var validSig = CryptographicOperations.FixedTimeEquals(sigBytes, expectedPrimary);
            if (!validSig && LegacyJwtSigningKey is not null)
            {
                var expectedLegacy = Encoding.UTF8.GetBytes(Base64UrlEncode(HMACSHA256.HashData(LegacyJwtSigningKey, unsignedBytes)));
                validSig = CryptographicOperations.FixedTimeEquals(sigBytes, expectedLegacy);
            }
            if (!validSig) return null;

            using var doc = JsonDocument.Parse(Base64UrlDecode(parts[1]));
            var root = doc.RootElement;
            if (!string.Equals(GetClaim(root, "iss"), Issuer, StringComparison.Ordinal) ||
                !string.Equals(GetClaim(root, "aud"), Audience, StringComparison.Ordinal) ||
                !root.TryGetProperty("exp", out var expProp) ||
                !expProp.TryGetInt64(out var expSec) ||
                expSec <= DateTimeOffset.UtcNow.ToUnixTimeSeconds())
            {
                return null;
            }

            if (root.TryGetProperty("nbf", out var nbfProp) &&
                (!nbfProp.TryGetInt64(out var notBefore) ||
                 DateTimeOffset.UtcNow.ToUnixTimeSeconds() < notBefore))
            {
                return null;
            }

            var email = GetClaim(root, "email", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress");
            var username = GetClaim(root, "username", "usr", "unique_name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name");
            var subStr = GetClaim(root, "sub", "nameid", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier");
            if (!long.TryParse(subStr, out var tokenUserId) || tokenUserId <= 0) return null;
            var accountId = GetClaim(root, "accountId") ?? subStr;

            var match = memoryUsers.FirstOrDefault(u =>
                (!string.IsNullOrEmpty(email) && string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase)) ||
                (!string.IsNullOrEmpty(username) && string.Equals(u.Username, username, StringComparison.OrdinalIgnoreCase)) ||
                (!string.IsNullOrEmpty(accountId) && (string.Equals(u.AccountId, accountId, StringComparison.OrdinalIgnoreCase) || u.Id.ToString() == accountId)));

            if (match is not null)
            {
                if (tokenUserId != match.Id) return null;
                return match;
            }

            var fallbackId = tokenUserId;
            var fallbackUser = username ?? email?.Split('@')[0] ?? $"user-{fallbackId}";
            var fallbackName = GetClaim(root, "name", "display_name") ?? fallbackUser;
            // Account role is informational only; campaign GM rights come from lw_campaign_members.
            var rawRole = GetClaim(root, "role", "http://schemas.microsoft.com/ws/2008/06/identity/claims/role") ?? "players";
            var normRole = rawRole is "gm" or "dm" ? "gm" : "players";

            return new StoredUserRecord(
                fallbackId,
                accountId ?? $"acc-{fallbackId}",
                email ?? $"{fallbackUser}@loom-weaver.com",
                fallbackUser,
                fallbackName,
                "", "", normRole,
                GetClaim(root, "tier") ?? "adventurer",
                GetClaim(root, "witness") ?? "None",
                Array.Empty<string>(), 0.0);
        }
        catch
        {
            return null;
        }
    }

    private static string? GetClaim(JsonElement root, params string[] keys)
    {
        foreach (var k in keys)
        {
            if (root.TryGetProperty(k, out var prop) && prop.ValueKind == JsonValueKind.String)
            {
                var val = prop.GetString();
                if (!string.IsNullOrWhiteSpace(val)) return val;
            }
        }
        return null;
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string input)
    {
        var padded = input.Replace('-', '+').Replace('_', '/');
        switch (padded.Length % 4)
        {
            case 2: padded += "=="; break;
            case 3: padded += "="; break;
        }
        return Convert.FromBase64String(padded);
    }
}
