using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using LoomWeaver.Infrastructure.MySql;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Primitives;

namespace LoomWeaver.Modules.Auth;

/// <summary>
/// Server-side access control for every /api and /hubs request:
///  1. Authentication is required except for an explicit allowlist of public endpoints.
///  2. Any route containing /campaigns/{id} requires a lw_campaign_members row (403 otherwise).
///  3. Client-asserted identity fields (role, viewerRole, accountId, username, witness,
///     boundCharacter) in the query string and top-level JSON body are overwritten with
///     server-derived values, so no endpoint can be tricked into a GM view.
/// </summary>
public static partial class CampaignAccessMiddleware
{
    private const long MaxNormalizedBodyBytes = 32 * 1024 * 1024;
    private static readonly string[] RoleWords = ["gm", "dm", "player", "players", "creator", "admin"];
    private static readonly string[] ViewerRoleKeys = ["viewerRole", "role"];
    private static readonly string[] CharacterKeys = ["witness", "witnessCharacter", "boundCharacter"];

    [GeneratedRegex(@"/campaigns/(\d+)(?:/|$)", RegexOptions.IgnoreCase)]
    private static partial Regex CampaignPathRegex();

    [GeneratedRegex(@"^/(health|effects/health|actions/health|auth/(login|register|google|logout|request-account))$", RegexOptions.IgnoreCase)]
    private static partial Regex PublicAnyMethodRegex();

    [GeneratedRegex(@"^/(actions/symbols|effects/emitters|effects/marketplace(/\d+)?|effects/(?!campaigns/)[^/]+/(standalone|export)|summon-assets/[^/]+|maps/(presets|catalog-assets|assets/thumbnails))$", RegexOptions.IgnoreCase)]
    private static partial Regex PublicReadRegex();

    [GeneratedRegex(@"^/api(/v\d+)?", RegexOptions.IgnoreCase)]
    private static partial Regex ApiPrefixRegex();

    public static IApplicationBuilder UseLoomWeaverAccessControl(this IApplicationBuilder app) =>
        app.Use(async (context, next) => await InvokeAsync(context, next));

    private static async Task InvokeAsync(HttpContext ctx, Func<Task> next)
    {
        var path = ctx.Request.Path.Value ?? string.Empty;

        if (path.StartsWith("/hubs/", StringComparison.OrdinalIgnoreCase))
        {
            if (AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx) is null)
            {
                await Deny(ctx, StatusCodes.Status401Unauthorized, "Authentication required for the live table.");
                return;
            }
            await next();
            return;
        }

        if (!path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase) && !path.Equals("/api", StringComparison.OrdinalIgnoreCase))
        {
            await next();
            return;
        }

        var apiPath = ApiPrefixRegex().Replace(path, string.Empty);
        if (apiPath.Length == 0) apiPath = "/";

        var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
        if (user is null)
        {
            if (IsPublic(apiPath, ctx.Request.Method))
            {
                await next();
                return;
            }
            await Deny(ctx, StatusCodes.Status401Unauthorized, "Authentication required. Please sign in to LoomWeaver.");
            return;
        }

        // Identity endpoints manage the account itself; never rewrite their payloads.
        if (apiPath.StartsWith("/auth/", StringComparison.OrdinalIgnoreCase))
        {
            await next();
            return;
        }

        if (ctx.Request.ContentLength is > MaxNormalizedBodyBytes &&
            ctx.Request.ContentType?.Contains("json", StringComparison.OrdinalIgnoreCase) == true)
        {
            await Deny(ctx, StatusCodes.Status413PayloadTooLarge, "Request body is too large.");
            return;
        }

        var body = await ReadJsonBodyAsync(ctx);
        var pathCampaignId = MatchCampaignId(apiPath);
        var campaignId = pathCampaignId ?? QueryCampaignId(ctx) ?? BodyCampaignId(body);

        ResolvedCampaignAccess? access = null;
        if (campaignId is int cid && cid > 0)
        {
            var repo = ctx.RequestServices.GetRequiredService<LoomWeaverMySqlRepository>();
            var membership = await CampaignMembershipStore.FindAsync(repo, cid, user, ctx.RequestAborted);
            ctx.Items[CampaignAccessResolver.ItemKey] = new CampaignAccessContext(cid, user, membership);

            if (membership is null && pathCampaignId is not null)
            {
                await Deny(ctx, StatusCodes.Status403Forbidden, "You are not a member of this campaign.");
                return;
            }
            access = CampaignAccessResolver.Build(user, membership, RequestedPreviewRole(ctx, body));
        }

        NormalizeQuery(ctx, user, access);
        if (body is JsonObject obj && NormalizeBody(obj, user, access, pathCampaignId))
        {
            ReplaceBody(ctx, obj);
        }

        await next();
    }

    private static bool IsPublic(string apiPath, string method) =>
        PublicAnyMethodRegex().IsMatch(apiPath) ||
        ((HttpMethods.IsGet(method) || HttpMethods.IsHead(method)) && PublicReadRegex().IsMatch(apiPath));

    private static int? MatchCampaignId(string apiPath)
    {
        var m = CampaignPathRegex().Match(apiPath);
        return m.Success && int.TryParse(m.Groups[1].Value, out var id) ? id : null;
    }

    private static int? QueryCampaignId(HttpContext ctx)
    {
        foreach (var key in new[] { "campaignId", "cid" })
        {
            if (ctx.Request.Query.TryGetValue(key, out var v) && int.TryParse(v.ToString(), out var id) && id > 0) return id;
        }
        return null;
    }

    private static int? BodyCampaignId(JsonNode? body)
    {
        if (body is not JsonObject obj) return null;
        var node = FindProperty(obj, "campaignId");
        if (node is JsonValue value)
        {
            if (value.TryGetValue<int>(out var i) && i > 0) return i;
            if (value.TryGetValue<long>(out var l) && l is > 0 and <= int.MaxValue) return (int)l;
            if (value.TryGetValue<string>(out var s) && int.TryParse(s, out var p) && p > 0) return p;
        }
        return null;
    }

    private static string? RequestedPreviewRole(HttpContext ctx, JsonNode? body)
    {
        foreach (var key in ViewerRoleKeys)
        {
            if (ctx.Request.Query.TryGetValue(key, out var q) && CampaignAccessResolver.IsPlayerRole(q.ToString())) return "players";
            if (body is JsonObject obj && FindProperty(obj, key) is JsonValue v &&
                v.TryGetValue<string>(out var s) && CampaignAccessResolver.IsPlayerRole(s))
            {
                return "players";
            }
        }
        return null;
    }

    private static string EffectiveRole(ResolvedCampaignAccess? access) =>
        access is { IsEffectiveGm: true } ? "gm" : "players";

    private static string? PlayerCharacter(ResolvedCampaignAccess? access) =>
        access is null || access.IsEffectiveGm ? null : access.BoundCharacterKey;

    private static void NormalizeQuery(HttpContext ctx, StoredUserRecord user, ResolvedCampaignAccess? access)
    {
        var query = ctx.Request.Query.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase);
        var role = EffectiveRole(access);
        query["role"] = role;
        query["viewerRole"] = role;
        query.Remove("accountId");
        if (query.ContainsKey("username")) query["username"] = user.Username;

        var playerCharacter = PlayerCharacter(access);
        foreach (var key in CharacterKeys)
        {
            if (!query.ContainsKey(key)) continue;
            if (playerCharacter is not null) query[key] = playerCharacter;
            else if (access is null) query.Remove(key);
        }

        ctx.Request.QueryString = QueryString.Create(query.Select(kv => new KeyValuePair<string, StringValues>(kv.Key, kv.Value)));
    }

    private static bool NormalizeBody(JsonObject obj, StoredUserRecord user, ResolvedCampaignAccess? access, int? pathCampaignId)
    {
        var changed = false;
        var role = EffectiveRole(access);

        foreach (var name in obj.Select(p => p.Key).ToList())
        {
            if (name.Equals("viewerRole", StringComparison.OrdinalIgnoreCase))
            {
                obj[name] = role; changed = true;
            }
            else if (name.Equals("role", StringComparison.OrdinalIgnoreCase) &&
                     obj[name] is JsonValue rv && rv.TryGetValue<string>(out var rs) &&
                     RoleWords.Contains(rs.Trim(), StringComparer.OrdinalIgnoreCase))
            {
                obj[name] = role; changed = true;
            }
            else if (name.Equals("accountId", StringComparison.OrdinalIgnoreCase))
            {
                obj[name] = user.AccountId; changed = true;
            }
            else if (name.Equals("username", StringComparison.OrdinalIgnoreCase))
            {
                obj[name] = user.Username; changed = true;
            }
            else if (CharacterKeys.Contains(name, StringComparer.OrdinalIgnoreCase) && PlayerCharacter(access) is { } pc)
            {
                obj[name] = pc; changed = true;
            }
            else if (pathCampaignId is int cid && name.Equals("campaignId", StringComparison.OrdinalIgnoreCase))
            {
                obj[name] = cid; changed = true;
            }
        }
        return changed;
    }

    private static JsonNode? FindProperty(JsonObject obj, string name)
    {
        foreach (var p in obj)
        {
            if (p.Key.Equals(name, StringComparison.OrdinalIgnoreCase)) return p.Value;
        }
        return null;
    }

    private static async Task<JsonNode?> ReadJsonBodyAsync(HttpContext ctx)
    {
        var req = ctx.Request;
        if (HttpMethods.IsGet(req.Method) || HttpMethods.IsHead(req.Method) || HttpMethods.IsOptions(req.Method)) return null;
        if (req.ContentType is null || !req.ContentType.Contains("json", StringComparison.OrdinalIgnoreCase)) return null;
        if (req.ContentLength is > MaxNormalizedBodyBytes) return null;

        req.EnableBuffering();
        try
        {
            var node = await JsonNode.ParseAsync(req.Body, cancellationToken: ctx.RequestAborted);
            return node;
        }
        catch (JsonException)
        {
            return null;
        }
        finally
        {
            req.Body.Position = 0;
        }
    }

    private static void ReplaceBody(HttpContext ctx, JsonObject obj)
    {
        var bytes = Encoding.UTF8.GetBytes(obj.ToJsonString());
        ctx.Request.Body = new MemoryStream(bytes);
        ctx.Request.ContentLength = bytes.Length;
    }

    private static async Task Deny(HttpContext ctx, int status, string message)
    {
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/json";
        await ctx.Response.WriteAsync(JsonSerializer.Serialize(new { message }));
    }
}
