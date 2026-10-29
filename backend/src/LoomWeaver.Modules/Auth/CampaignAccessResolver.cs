using LoomWeaver.Infrastructure.MySql;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace LoomWeaver.Modules.Auth;

public sealed record ResolvedCampaignAccess(
    long UserId,
    string Email,
    string Username,
    string AccountRole,
    string EffectiveViewerRole,
    bool IsAccountGm,
    bool IsEffectiveGm,
    string BoundCharacterKey
)
{
    /// <summary>True when the caller holds a row in lw_campaign_members for this campaign.</summary>
    public bool IsMember { get; init; }
}

/// <summary>Per-request cache of the membership the access middleware already loaded.</summary>
public sealed record CampaignAccessContext(int CampaignId, StoredUserRecord User, CampaignMembership? Membership);

/// <summary>
/// The only place campaign roles are decided. GM rights come exclusively from
/// lw_campaign_members (member_role = 'gm'). Client-supplied role, viewerRole, accountId,
/// and witness values are never trusted; a GM may only down-scope to a player preview.
/// Unauthenticated callers and non-members resolve to a no-access player view.
/// </summary>
public static class CampaignAccessResolver
{
    public const string ItemKey = "lw.campaign-access";
    public const string NoCharacter = "none";

    public static ResolvedCampaignAccess Resolve(HttpContext? context, int campaignId, string? requestedPreviewRole = null)
    {
        if (context is null) return NoAccess(null);

        if (context.Items[ItemKey] is CampaignAccessContext cached && cached.CampaignId == campaignId)
        {
            return Build(cached.User, cached.Membership, requestedPreviewRole);
        }

        var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(context);
        if (user is null) return NoAccess(null);

        // Rare path (middleware did not pre-load this campaign); block on the async lookup.
        var membership = LoadAsync(context, campaignId, user, context.RequestAborted).GetAwaiter().GetResult();
        return Build(user, membership, requestedPreviewRole);
    }

    public static async Task<ResolvedCampaignAccess> ResolveAsync(
        HttpContext context, int campaignId, string? requestedPreviewRole = null, CancellationToken ct = default)
    {
        if (context.Items[ItemKey] is CampaignAccessContext cached && cached.CampaignId == campaignId)
        {
            return Build(cached.User, cached.Membership, requestedPreviewRole);
        }

        var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(context);
        if (user is null) return NoAccess(null);
        var membership = await LoadAsync(context, campaignId, user, ct);
        return Build(user, membership, requestedPreviewRole);
    }

    public static ResolvedCampaignAccess Build(StoredUserRecord? user, CampaignMembership? membership, string? requestedPreviewRole)
    {
        if (user is null || membership is null) return NoAccess(user);

        var wantsPlayerPreview = IsPlayerRole(requestedPreviewRole);
        var isEffectiveGm = membership.IsGm && !wantsPlayerPreview;
        var boundCharacter = isEffectiveGm
            ? "all-party"
            : NormalizeCharacterKey(membership.CharacterKey)
              ?? NormalizeCharacterKey(membership.CharacterName)
              ?? NoCharacter;

        return new ResolvedCampaignAccess(
            user.Id,
            user.Email,
            user.Username,
            membership.IsGm ? "gm" : "players",
            isEffectiveGm ? "gm" : "players",
            membership.IsGm,
            isEffectiveGm,
            boundCharacter)
        { IsMember = true };
    }

    public static bool IsPlayerRole(string? role) =>
        string.Equals(role, "players", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(role, "player", StringComparison.OrdinalIgnoreCase);

    private static ResolvedCampaignAccess NoAccess(StoredUserRecord? user) => new(
        user?.Id ?? 0,
        user?.Email ?? string.Empty,
        user?.Username ?? string.Empty,
        "players",
        "players",
        false,
        false,
        NoCharacter)
    { IsMember = false };

    private static async Task<CampaignMembership?> LoadAsync(
        HttpContext context, int campaignId, StoredUserRecord user, CancellationToken ct)
    {
        var repo = context.RequestServices.GetRequiredService<LoomWeaverMySqlRepository>();
        var membership = await CampaignMembershipStore.FindAsync(repo, campaignId, user, ct);
        context.Items[ItemKey] = new CampaignAccessContext(campaignId, user, membership);
        return membership;
    }

    private static string? NormalizeCharacterKey(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var clean = raw.Trim();
        if (clean.Equals("GM", StringComparison.OrdinalIgnoreCase) ||
            clean.Equals("None", StringComparison.OrdinalIgnoreCase) ||
            clean.Equals("Dungeon Master", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }
        if (clean.StartsWith("pc-", StringComparison.OrdinalIgnoreCase)) return clean.ToLowerInvariant();
        var first = new string(clean.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0]
            .Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
        return first.Length == 0 ? null : $"pc-{first}";
    }
}
