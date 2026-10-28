using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Http;
using MySqlConnector;
namespace LoomWeaver.Modules.Maps.Features.WorldAtlas;

public static class AtlasAccess
{
    public static RouteGroupBuilder WorldLoreGroup(RouteGroupBuilder api)
    {
        var world=api.MapGroup("/campaigns/{campaignId:int}/world-lore");
        world.AddEndpointFilter(async (context,next) => {
            var http=context.HttpContext;
            var campaignId=Convert.ToInt32(http.Request.RouteValues["campaignId"]);
            var repo=http.RequestServices.GetRequiredService<LoomWeaverMySqlRepository>();
            var denied=await Denied(http,campaignId,repo,http.RequestAborted,!HttpMethods.IsGet(http.Request.Method));
            if(denied is not null)return denied;
            http.Items["world-lore-is-gm"]=await Denied(http,campaignId,repo,http.RequestAborted,true) is null;
            return await next(context);
        });
        return world;
    }
    public static async Task<IResult?> Denied(HttpContext ctx,int campaignId,LoomWeaverMySqlRepository repo,CancellationToken ct,bool edit=true)
    {
        var user=AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
        if(user is null)return Results.Unauthorized();
        await using var db=await repo.OpenConnectionAsync(ct);
        await using var cmd=new MySqlCommand("""
            SELECT COUNT(*) FROM lw_campaigns c WHERE c.id=@c AND (
              EXISTS(SELECT 1 FROM lw_users u WHERE u.id=c.gm_user_id AND u.email=@email)
              OR EXISTS(SELECT 1 FROM lw_campaign_members m WHERE m.campaign_id=c.id AND m.auth_email=@email AND (@edit=0 OR m.member_role='gm')))
            """,db);
        cmd.Parameters.AddWithValue("@c",campaignId);cmd.Parameters.AddWithValue("@email",user.Email);cmd.Parameters.AddWithValue("@edit",edit);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync(ct))>0 ? null : Results.StatusCode(403);
    }
    public static async Task EnsureStorage(LoomWeaverMySqlRepository repo,CancellationToken ct)
    {
        await using var db=await repo.OpenConnectionAsync(ct);
        await using var cmd=new MySqlCommand("""
            CREATE TABLE IF NOT EXISTS lw_atlas_documents (
              campaign_id BIGINT UNSIGNED NOT NULL,atlas_id VARCHAR(64) NOT NULL,name VARCHAR(160) NOT NULL,
              revision INT NOT NULL,document_json JSON NOT NULL,
              updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY(campaign_id,atlas_id),
              CONSTRAINT fk_lw_atlas_campaign FOREIGN KEY(campaign_id) REFERENCES lw_campaigns(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """,db);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
