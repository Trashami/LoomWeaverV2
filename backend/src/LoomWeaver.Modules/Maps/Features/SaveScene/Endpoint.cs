using LoomWeaver.Modules.Maps.Domain;
using LoomWeaver.Modules.Maps.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Maps.Features.SaveScene;

public static class SaveSceneEndpoint
{
    public static void MapLoomMapsStudioStage1Endpoints(this IEndpointRouteBuilder group)
    {
        group.MapMapSceneDocumentEndpoints();

        group.MapGet("/maps/presets", () =>
            Results.Ok(SceneRepository.GetPresets()));

        group.MapGet("/maps/catalog-assets", (string? category, string? q) =>
            Results.Ok(SceneRepository.GetCatalogAssets(category, q)));

        group.MapGet("/maps/assets/thumbnails", (string? category, string? q) =>
            Results.Ok(PythonThumbnailProcessRunner.GetThumbnails(category, q)));

        group.MapPost("/maps/assets/render-batch", async (BatchRenderThumbnailsRequest? req) =>
        {
            var result = await PythonThumbnailProcessRunner.RunBatchAsync(req?.ForceReRender ?? false);
            return Results.Ok(result);
        });

        group.MapPost("/maps/assets/upload-3d", async (SingleUpload3dAssetRequest req) =>
        {
            if (string.IsNullOrWhiteSpace(req.FileName))
            {
                return Results.BadRequest(new { error = "A valid .glb fileName is required for single-upload PNG processing." });
            }

            var result = await PythonThumbnailProcessRunner.RunSingleUploadAsync(req);
            return Results.Ok(result);
        });

    }
}
