using LoomWeaver.Domain;
using LoomWeaver.Modules.Bestiary;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

var count = 0;
void Check(bool ok, string label) { if (!ok) throw new Exception(label); count++; }
Check(!BestiaryAccessPolicy.IsEffectiveGm(null, "gm"), "Missing membership cannot become DM");
Check(!BestiaryAccessPolicy.IsEffectiveGm("players", "gm"), "Player cannot request DM role");
Check(BestiaryAccessPolicy.IsEffectiveGm("gm", null), "Campaign DM can manage prep");
Check(!BestiaryAccessPolicy.IsEffectiveGm("gm", "PLAYERS"), "DM player preview stays restricted");
var sighting = new MonsterSightingDto("s", 1, "m", "Goblin", "befriended", null, null, "Bridge", null, null,
    new[] { "1:PlayerCharacter:pc-dal" }, "witnesses", "Private meeting", DateTimeOffset.UtcNow, "DM");
Check(BestiaryAccessPolicy.CanReadSighting(sighting, false, "char-dal"), "Bound witness can read");
Check(!BestiaryAccessPolicy.CanReadSighting(sighting, false, "pc-fivi"), "Other player denied");
Check(!BestiaryAccessPolicy.CanReadSighting(sighting, false, ""), "Missing binding denied");
Check(!BestiaryAccessPolicy.CanReadSighting(sighting with { Visibility = "gm" }, false, "char-dal"), "Witness cannot read DM secret");
Check(BestiaryAccessPolicy.CanReadSighting(sighting with { Visibility = "party" }, false, ""), "Party knowledge is shared");
Check(BestiaryAccessPolicy.CanReadSighting(sighting with { Visibility = "gm" }, true, ""), "DM can read canon");
foreach (var url in new[] { "javascript:alert(1)", "//evil.example/a", "/../secret", "https://user:pass@example.com/a", "/\\evil.example/a" })
    Check(!BestiaryAccessPolicy.IsSafeAssetUrl(url), "Reject unsafe asset " + url);
Check(BestiaryAccessPolicy.IsSafeAssetUrl("/assets/goblin.png"), "Local token accepted");
Check(BestiaryAccessPolicy.IsSafeAssetUrl("https://example.com/goblin.glb"), "HTTPS model accepted");
Check(BestiaryStatblockMapper.CrToNumber("1/8") == .125, "Fractional CR preserved");
Check(BestiaryStatblockMapper.ExperienceForCr("1/4") == 50, "Fractional CR XP preserved");

var builder = WebApplication.CreateBuilder();
builder.Services.AddSingleton(new LoomWeaver.Infrastructure.MySql.LoomWeaverMySqlRepository(new()));
await using var app = builder.Build();
app.MapGroup("/api").MapBestiaryEndpoints();
var endpoints = ((IEndpointRouteBuilder)app).DataSources.SelectMany(s => s.Endpoints).OfType<RouteEndpoint>();
foreach (var endpoint in endpoints)
{
    var context = new DefaultHttpContext { RequestServices = app.Services };
    foreach (var parameter in endpoint.RoutePattern.Parameters)
        context.Request.RouteValues[parameter.Name] = parameter.Name == "campaignId" ? "1" : "test";
    var method = endpoint.Metadata.GetMetadata<HttpMethodMetadata>()!.HttpMethods[0];
    context.Request.Method = method;
    if (method is "POST" or "PUT")
    {
        context.Request.ContentType = "application/json";
        context.Request.ContentLength = 2;
        context.Request.Body = new MemoryStream(System.Text.Encoding.UTF8.GetBytes("{}"));
        context.Features.Set<Microsoft.AspNetCore.Http.Features.IHttpRequestBodyDetectionFeature>(new BodyFeature());
    }
    context.Response.Body = new MemoryStream();
    await endpoint.RequestDelegate!(context);
    Check(context.Response.StatusCode == 401, $"Anonymous {method} {endpoint.RoutePattern.RawText} denied before database access");
}
Console.WriteLine($"Passed {count} bestiary permission, visibility, asset and endpoint checks.");
sealed class BodyFeature : Microsoft.AspNetCore.Http.Features.IHttpRequestBodyDetectionFeature
{ public bool CanHaveBody => true; }
