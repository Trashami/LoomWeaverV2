using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using LoomWeaver.Modules.Items;

var count = 0;
void Check(bool condition, string name) { if (!condition) throw new Exception(name); count++; }
Check(!ItemAccessPolicy.CanUseCharacter(null, "char-dal"), "Unassigned user denied");
Check(!ItemAccessPolicy.CanUseCharacter("", ""), "Empty binding denied");
Check(!ItemAccessPolicy.CanUseCharacter("pc-dal", "char-fivi"), "Other character denied");
Check(ItemAccessPolicy.CanUseCharacter("pc-dal", "char-dal"), "Canonical campaign binding accepted");
Check(ItemAccessPolicy.CanUseCharacter("PC-DAL", "char-dal"), "Character identity ignores case");
Check(ItemCatalog.Items.Count > 0, "Canonical items loaded from embedded catalog");
var item = ItemCatalog.Items[0].DeepClone().AsObject();
Check(ItemCatalog.Validate(item) is null, "Valid item accepted");
item["imageUrl"] = "javascript:alert(1)";
Check(ItemCatalog.Validate(item) is not null, "Executable image rejected");
item["imageUrl"] = "//untrusted.example/image";
Check(ItemCatalog.Validate(item) is not null, "Protocol-relative image rejected");
item["imageUrl"] = "/assets/item.png"; item["priceGp"] = -1;
Check(ItemCatalog.Validate(item) is not null, "Negative price rejected");
item["priceGp"] = 12; item["properties"] = new JsonArray(new JsonObject());
Check(ItemCatalog.Validate(item) is not null, "Non-text properties rejected");
item["name"] = new JsonObject();
Check(ItemCatalog.Validate(item) is not null, "Malformed field types return validation error");
Console.WriteLine($"Passed {count} item validation and character authorization checks.");

// Exercise actual endpoint delegates without a database or a network listener.
var builder = Microsoft.AspNetCore.Builder.WebApplication.CreateBuilder();
builder.Services.AddSingleton(new LoomWeaver.Infrastructure.MySql.LoomWeaverMySqlRepository(new()));
await using var app = builder.Build();
LoomWeaver.Modules.Items.ItemsEndpoints.MapItemsEndpoints(app);
var endpoints = ((Microsoft.AspNetCore.Routing.IEndpointRouteBuilder)app).DataSources
    .SelectMany(source => source.Endpoints).OfType<Microsoft.AspNetCore.Routing.RouteEndpoint>().ToList();
foreach (var pattern in new[] { "/items/custom", "/items/{id}/publish-store", "/campaigns/{campaignId:int}/items-context", "/campaigns/{campaignId:int}/item-collections", "/campaigns/{campaignId:int}/characters/{characterKey}/items" })
{
    foreach (var endpoint in endpoints.Where(e => e.RoutePattern.RawText == pattern))
    {
        var context = new Microsoft.AspNetCore.Http.DefaultHttpContext { RequestServices = app.Services };
        context.Request.RouteValues["campaignId"] = "1";
        context.Request.RouteValues["characterKey"] = "char-dal";
        context.Request.RouteValues["id"] = "private-item";
        var method = endpoint.Metadata.GetMetadata<Microsoft.AspNetCore.Routing.HttpMethodMetadata>()!.HttpMethods[0];
        context.Request.Method = method;
        if (method == "POST")
        {
            context.Request.ContentType = "application/json";
            context.Request.ContentLength = 2;
            context.Request.Body = new MemoryStream(System.Text.Encoding.UTF8.GetBytes("{}"));
            context.Features.Set<Microsoft.AspNetCore.Http.Features.IHttpRequestBodyDetectionFeature>(new BodyFeature());
        }
        context.Response.Body = new MemoryStream();
        await endpoint.RequestDelegate!(context);
        Check(context.Response.StatusCode == 401, $"Anonymous {method} {pattern} must be denied before storage access");
    }
}
Console.WriteLine($"Passed {count} checks, including real endpoint authentication denials.");

sealed class BodyFeature : Microsoft.AspNetCore.Http.Features.IHttpRequestBodyDetectionFeature { public bool CanHaveBody => true; }
