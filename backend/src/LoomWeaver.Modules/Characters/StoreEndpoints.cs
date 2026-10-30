using System.Globalization;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Characters;

public sealed record StoreRatingRequest(int Rating);

// Store listings are derived at read time from published or canonical rows in each source table; nothing is copied.
// Ratings and acquisitions key on (source_table, source_key) because the sources use mixed key types.
public static class StoreEndpoints
{
    private const int DefaultPageSize = 40;
    private const int MaxPageSize = 100;

    private static readonly HashSet<string> ContentTypes = new(StringComparer.Ordinal)
    {
        "dice", "adventure", "one_shot", "merchant", "magic", "item", "feat", "background", "deck", "monster", "other"
    };

    private static readonly HashSet<string> SourceTables = new(StringComparer.Ordinal)
    {
        "dnd_feats", "dnd_backgrounds", "dnd_spells", "dnd_items", "dnd_decks", "lw_custom_monsters", "lw_item_library"
    };

    private sealed record StoreFilter(string? ContentType, string? TitleLike, string? SourceTable, string? SourceKey);

    public static RouteGroupBuilder MapStoreEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/store/listings", async (string? type, string? q, int? page, int? pageSize, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var contentType = type is null or "all" ? null : type;
            if (contentType is not null && !ContentTypes.Contains(contentType))
            {
                return Results.BadRequest(new { error = "Unknown content type." });
            }

            var size = Math.Clamp(pageSize ?? DefaultPageSize, 1, MaxPageSize);
            var pageNumber = Math.Max(1, page ?? 1);
            var viewer = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx)?.Id ?? 0;
            var like = LikePattern(q);

            await using var db = await mysql.OpenConnectionAsync(ct);
            var rows = await QueryAsync(db, viewer, new StoreFilter(contentType, like, null, null), size + 1, (pageNumber - 1) * size, ct);
            return Results.Ok(new
            {
                items = rows.Take(size),
                page = pageNumber,
                pageSize = size,
                hasMore = rows.Count > size
            });
        });

        api.MapGet("/store/listings/{sourceTable}/{sourceKey}", async (string sourceTable, string sourceKey, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            if (!SourceTables.Contains(sourceTable)) return Results.NotFound();
            var viewer = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx)?.Id ?? 0;
            await using var db = await mysql.OpenConnectionAsync(ct);
            var rows = await QueryAsync(db, viewer, new StoreFilter(null, null, sourceTable, sourceKey), 1, 0, ct);
            return rows.Count == 0 ? Results.NotFound() : Results.Ok(rows[0]);
        });

        api.MapPost("/store/listings/{sourceTable}/{sourceKey}/acquire", async (string sourceTable, string sourceKey, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            if (!SourceTables.Contains(sourceTable)) return Results.NotFound();

            await using var db = await mysql.OpenConnectionAsync(ct);
            var found = await QueryAsync(db, user.Id, new StoreFilter(null, null, sourceTable, sourceKey), 1, 0, ct);
            if (found.Count == 0) return Results.NotFound();

            await using var cmd = new MySqlCommand("""
                INSERT IGNORE INTO lw_store_acquisitions (source_table, source_key, user_id, acquired_via)
                VALUES (@table, @key, @user, 'import');
                """, db);
            cmd.WithParameter("@table", sourceTable).WithParameter("@key", sourceKey).WithParameter("@user", user.Id);
            await cmd.ExecuteNonQueryAsync(ct);

            var refreshed = await QueryAsync(db, user.Id, new StoreFilter(null, null, sourceTable, sourceKey), 1, 0, ct);
            return Results.Ok(refreshed[0]);
        });

        api.MapPut("/store/listings/{sourceTable}/{sourceKey}/rating", async (string sourceTable, string sourceKey, StoreRatingRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            if (!SourceTables.Contains(sourceTable)) return Results.NotFound();
            if (req.Rating < 1 || req.Rating > 5) return Results.BadRequest(new { error = "Rating must be between 1 and 5." });

            await using var db = await mysql.OpenConnectionAsync(ct);
            var found = await QueryAsync(db, user.Id, new StoreFilter(null, null, sourceTable, sourceKey), 1, 0, ct);
            if (found.Count == 0) return Results.NotFound();

            await using var acquiredCmd = new MySqlCommand("""
                SELECT COUNT(*) FROM lw_store_acquisitions
                WHERE source_table = @table AND source_key = @key AND user_id = @user;
                """, db);
            acquiredCmd.WithParameter("@table", sourceTable).WithParameter("@key", sourceKey).WithParameter("@user", user.Id);
            if (Convert.ToInt64(await acquiredCmd.ExecuteScalarAsync(ct)) == 0)
            {
                return Results.Json(new { error = "Import this item before rating it." }, statusCode: StatusCodes.Status403Forbidden);
            }

            await using var cmd = new MySqlCommand("""
                INSERT INTO lw_store_ratings (source_table, source_key, user_id, rating)
                VALUES (@table, @key, @user, @rating)
                ON DUPLICATE KEY UPDATE rating = @rating;
                """, db);
            cmd.WithParameter("@table", sourceTable).WithParameter("@key", sourceKey).WithParameter("@user", user.Id).WithParameter("@rating", req.Rating);
            await cmd.ExecuteNonQueryAsync(ct);

            var refreshed = await QueryAsync(db, user.Id, new StoreFilter(null, null, sourceTable, sourceKey), 1, 0, ct);
            return Results.Ok(refreshed[0]);
        });

        return api;
    }

    private static string? LikePattern(string? q)
    {
        var trimmed = q?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;
        var escaped = trimmed.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
        return $"%{escaped}%";
    }

    // Each branch lists one source's publishable rows. Official rows (is_canonical = 1) and user rows with is_public = 1 both qualify.
    private static string CatalogSql() => """
        SELECT 'dnd_feats' AS source_table, CAST(t.id AS CHAR) AS source_key, 'feat' AS content_type, t.name AS title,
               t.description AS summary, COALESCE(u.username, '') AS creator_username, t.is_canonical AS is_official
        FROM dnd_feats t LEFT JOIN lw_users u ON u.id = t.owner_id
        WHERE t.is_canonical = 1 OR t.is_public = 1
        UNION ALL
        SELECT 'dnd_backgrounds', CAST(t.id AS CHAR), 'background', t.name, t.description, COALESCE(u.username, ''), t.is_canonical
        FROM dnd_backgrounds t LEFT JOIN lw_users u ON u.id = t.owner_id
        WHERE t.is_canonical = 1 OR t.is_public = 1
        UNION ALL
        SELECT 'dnd_spells', CAST(t.id AS CHAR), 'magic', t.name, t.description, COALESCE(u.username, ''), t.is_canonical
        FROM dnd_spells t LEFT JOIN lw_users u ON u.id = t.owner_id
        WHERE t.is_canonical = 1 OR t.is_public = 1
        UNION ALL
        SELECT 'dnd_items', CAST(t.id AS CHAR), 'item', t.name, t.description, COALESCE(u.username, ''), t.is_canonical
        FROM dnd_items t LEFT JOIN lw_users u ON u.id = t.owner_id
        WHERE t.is_canonical = 1 OR t.is_public = 1
        UNION ALL
        SELECT 'dnd_decks', CAST(t.id AS CHAR), 'deck', t.name, t.description, COALESCE(u.username, ''), t.is_canonical
        FROM dnd_decks t LEFT JOIN lw_users u ON u.id = t.owner_id
        WHERE t.is_canonical = 1 OR t.is_public = 1
        UNION ALL
        SELECT 'lw_custom_monsters', t.monster_key, 'monster', t.name,
               CONCAT('CR ', t.challenge_rating, ' ', COALESCE(t.creature_type, '')), COALESCE(t.creator_username, ''), 0
        FROM lw_custom_monsters t
        WHERE t.is_published = 1
        UNION ALL
        SELECT 'lw_item_library', CAST(t.id AS CHAR), 'item',
               COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.payload, '$.name')), CAST(t.id AS CHAR)), NULL,
               COALESCE(u.username, ''), 0
        FROM lw_item_library t LEFT JOIN lw_users u ON u.id = t.owner_id
        WHERE t.published = 1
        """;

    private static async Task<List<object>> QueryAsync(MySqlConnection db, long viewer, StoreFilter filter, int limit, int offset, CancellationToken ct)
    {
        var sql = $"""
            SELECT c.source_table, c.source_key, c.content_type, c.title, c.summary, c.creator_username, c.is_official,
                   r.avg_rating, COALESCE(r.rating_count, 0), COALESCE(a.acq_count, 0),
                   CASE WHEN me.user_id IS NULL THEN 0 ELSE 1 END, mr.rating
            FROM ({CatalogSql()}) c
            LEFT JOIN (
                SELECT source_table, source_key, AVG(rating) AS avg_rating, COUNT(*) AS rating_count
                FROM lw_store_ratings GROUP BY source_table, source_key
            ) r ON r.source_table = c.source_table AND r.source_key = c.source_key
            LEFT JOIN (
                SELECT source_table, source_key, COUNT(*) AS acq_count
                FROM lw_store_acquisitions GROUP BY source_table, source_key
            ) a ON a.source_table = c.source_table AND a.source_key = c.source_key
            LEFT JOIN lw_store_acquisitions me
                ON me.source_table = c.source_table AND me.source_key = c.source_key AND me.user_id = @viewer
            LEFT JOIN lw_store_ratings mr
                ON mr.source_table = c.source_table AND mr.source_key = c.source_key AND mr.user_id = @viewer
            WHERE (@type IS NULL OR c.content_type = @type)
              AND (@like IS NULL OR c.title LIKE @like ESCAPE '\\')
              AND (@table IS NULL OR (c.source_table = @table AND c.source_key = @key))
            ORDER BY c.title, c.source_table, c.source_key
            LIMIT @limit OFFSET @offset;
            """;

        await using var cmd = new MySqlCommand(sql, db);
        cmd.WithParameter("@viewer", viewer)
            .WithParameter("@type", filter.ContentType)
            .WithParameter("@like", filter.TitleLike)
            .WithParameter("@table", filter.SourceTable)
            .WithParameter("@key", filter.SourceKey)
            .WithParameter("@limit", limit)
            .WithParameter("@offset", offset);

        var rows = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            rows.Add(new
            {
                sourceTable = r.GetString(0),
                sourceKey = r.GetString(1),
                contentType = r.GetString(2),
                title = r.IsDBNull(3) ? "" : r.GetString(3),
                summary = r.IsDBNull(4) ? "" : r.GetString(4),
                creatorUsername = r.GetString(5),
                isOfficial = Convert.ToInt32(r.GetValue(6), CultureInfo.InvariantCulture) == 1,
                averageRating = r.IsDBNull(7) ? (double?)null : Math.Round(Convert.ToDouble(r.GetValue(7), CultureInfo.InvariantCulture), 1),
                ratingCount = Convert.ToInt64(r.GetValue(8), CultureInfo.InvariantCulture),
                acquisitionCount = Convert.ToInt64(r.GetValue(9), CultureInfo.InvariantCulture),
                acquired = Convert.ToInt32(r.GetValue(10), CultureInfo.InvariantCulture) == 1,
                myRating = r.IsDBNull(11) ? (int?)null : Convert.ToInt32(r.GetValue(11), CultureInfo.InvariantCulture)
            });
        }
        return rows;
    }
}
