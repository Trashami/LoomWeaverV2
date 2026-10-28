using System.Text.Json;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Maps.Features.WorldAtlas;
public static class AtlasEndpoints
{
    public static void MapWorldAtlasEndpoints(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/campaigns/{campaignId:int}/atlases", async (int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var denied = await Denied(ctx, campaignId, repo, ct); if (denied is not null) return denied;
            await using var db = await repo.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand("SELECT atlas_id,name,revision FROM lw_atlas_documents WHERE campaign_id=@c ORDER BY updated_at DESC", db);
            cmd.Parameters.AddWithValue("@c", campaignId); var list = new List<AtlasSummary>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct)) list.Add(new(reader.GetString(0),reader.GetString(1),reader.GetInt32(2)));
            return Results.Ok(list);
        });
        routes.MapGet("/campaigns/{campaignId:int}/atlases/locations", async (int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var denied = await Denied(ctx, campaignId, repo, ct); if (denied is not null) return denied;
            await AtlasLocationBridge.Hydrate(repo,campaignId,ct);
            var list = Knowledge.WorldLoreStateStore.LocationsByCampaign.GetValueOrDefault(campaignId) ?? [];
            return Results.Ok(list.Select(l => new { l.LocationKey,l.Name,l.LocationType,l.Visibility }));
        });
        routes.MapGet("/campaigns/{campaignId:int}/atlases/{atlasId}", async (int campaignId, string atlasId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var denied = await Denied(ctx, campaignId, repo, ct); if (denied is not null) return denied;
            await using var db = await repo.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand("SELECT document_json FROM lw_atlas_documents WHERE campaign_id=@c AND atlas_id=@id",db);
            cmd.Parameters.AddWithValue("@c",campaignId);cmd.Parameters.AddWithValue("@id",atlasId);
            var json = await cmd.ExecuteScalarAsync(ct) as string;
            return json is null ? Results.NotFound() : Results.Content(json,"application/json");
        });
        routes.MapGet("/campaigns/{campaignId:int}/atlases/{atlasId}/preview", async (int campaignId,string atlasId,HttpContext ctx,LoomWeaverMySqlRepository repo,CancellationToken ct) => {
            var denied=await Denied(ctx,campaignId,repo,ct);if(denied is not null)return denied;
            await using var db=await repo.OpenConnectionAsync(ct);
            await using var cmd=new MySqlCommand("SELECT document_json FROM lw_atlas_documents WHERE campaign_id=@c AND atlas_id=@id",db);
            cmd.Parameters.AddWithValue("@c",campaignId);cmd.Parameters.AddWithValue("@id",atlasId);
            var json=await cmd.ExecuteScalarAsync(ct) as string;if(json is null)return Results.NotFound();
            var document=JsonSerializer.Deserialize<AtlasDocument>(json,AtlasValidation.Json);
            if(document?.PreviewDataUrl is not { } preview)return Results.NotFound();
            ctx.Response.Headers.CacheControl="private, no-store";
            try{return Results.File(Convert.FromBase64String(preview[22..]),"image/png");}catch(FormatException){return Results.NotFound();}
        });
        routes.MapPut("/campaigns/{campaignId:int}/atlases/{atlasId}", async (int campaignId, string atlasId, AtlasDocument document, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var denied = await Denied(ctx, campaignId, repo, ct); if (denied is not null) return denied;
            var error = AtlasValidation.Error(document);
            if (error is not null || atlasId != document.Id) return Results.BadRequest(new { message=error ?? "Atlas ID mismatch." });
            await using var db = await repo.OpenConnectionAsync(ct);
            await using var tx = await db.BeginTransactionAsync(ct);
            // Atomic compare-and-swap; an older browser can never overwrite a newer revision.
            var next = document with { Revision=document.Revision+1 };
            var json=JsonSerializer.Serialize(next,AtlasValidation.Json);
            await using var save = new MySqlCommand(document.Revision==0
                ? "INSERT IGNORE INTO lw_atlas_documents(campaign_id,atlas_id,name,revision,document_json) VALUES(@c,@id,@n,1,@json)"
                : "UPDATE lw_atlas_documents SET name=@n,revision=revision+1,document_json=@json WHERE campaign_id=@c AND atlas_id=@id AND revision=@r",db,tx);
            save.Parameters.AddWithValue("@c",campaignId);save.Parameters.AddWithValue("@id",atlasId);
            save.Parameters.AddWithValue("@n",document.Name.Trim());save.Parameters.AddWithValue("@json",json);save.Parameters.AddWithValue("@r",document.Revision);
            if (await save.ExecuteNonQueryAsync(ct)!=1) return Results.Conflict(new { message="A newer atlas revision exists. Export your edits, then reopen the server copy." });
            if (!await AtlasLocationBridge.Save(db,tx,campaignId,next,ct)) return Results.BadRequest(new { message="A location belongs to another campaign." });
            await tx.CommitAsync(ct);
            await AtlasLocationBridge.Hydrate(repo,campaignId,ct);
            return Results.Ok(next);
        }).WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(8_000_000));
    }

    private static async Task<IResult?> Denied(HttpContext ctx,int campaignId,LoomWeaverMySqlRepository repo,CancellationToken ct)
    {
        var denied=await AtlasAccess.Denied(ctx,campaignId,repo,ct);
        if(denied is null)await AtlasAccess.EnsureStorage(repo,ct);
        return denied;
    }
}
