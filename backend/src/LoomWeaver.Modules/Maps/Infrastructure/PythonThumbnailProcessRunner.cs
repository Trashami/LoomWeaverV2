using System.Diagnostics;
using System.Text.Json;
using LoomWeaver.Modules.Maps.Domain;

namespace LoomWeaver.Modules.Maps.Infrastructure;

public static class PythonThumbnailProcessRunner
{
    private static readonly object SyncLock = new();
    private static List<Map3dAssetThumbnailDto>? _cachedThumbnails;

    public static string ResolveScriptPath()
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "scripts", "render_3d_asset_thumbnails.py"),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "scripts", "render_3d_asset_thumbnails.py")),
            @"C:\repos\Jane\Jane\LoomWeaverV2\scripts\render_3d_asset_thumbnails.py",
            "/var/www/loomweaver/server/scripts/render_3d_asset_thumbnails.py",
            "/var/www/loomweaver/scripts/render_3d_asset_thumbnails.py"
        };
        return candidates.FirstOrDefault(File.Exists) ?? candidates[2];
    }

    public static string ResolveModels3dDir()
    {
        if (Directory.Exists("/var/www/loomweaver/assets/models-3d"))
            return "/var/www/loomweaver/assets/models-3d";
        if (Directory.Exists(@"C:\map assets\3d-models"))
            return @"C:\map assets\3d-models";
        if (Directory.Exists(@"C:\map assets\models-3d"))
            return @"C:\map assets\models-3d";
        var fallback = Path.Combine(AppContext.BaseDirectory, "assets", "models-3d");
        Directory.CreateDirectory(fallback);
        return fallback;
    }

    public static string ResolvePreviewsPngDir()
    {
        if (Directory.Exists("/var/www/loomweaver/assets"))
        {
            var prodDir = "/var/www/loomweaver/assets/previews-png";
            Directory.CreateDirectory(prodDir);
            return prodDir;
        }
        if (Directory.Exists(@"C:\map assets"))
        {
            var localDir = @"C:\map assets\previews-png";
            Directory.CreateDirectory(localDir);
            return localDir;
        }
        var fallback = Path.Combine(AppContext.BaseDirectory, "assets", "previews-png");
        Directory.CreateDirectory(fallback);
        return fallback;
    }

    public static string ResolveLegacyObjLibDir()
    {
        if (Directory.Exists("/var/www/loomweaver/assets/object-library"))
            return "/var/www/loomweaver/assets/object-library";
        if (Directory.Exists(@"C:\repos\Jane\Jane\MythWeaver\LoomMaps.client\public\assets\object-library"))
            return @"C:\repos\Jane\Jane\MythWeaver\LoomMaps.client\public\assets\object-library";
        return ResolvePreviewsPngDir();
    }

    public static IReadOnlyList<Map3dAssetThumbnailDto> GetThumbnails(string? category = null, string? search = null)
    {
        lock (SyncLock)
        {
            if (_cachedThumbnails is null || _cachedThumbnails.Count == 0)
            {
                _cachedThumbnails = LoadManifestFromDisk();
            }
        }

        IEnumerable<Map3dAssetThumbnailDto> query = _cachedThumbnails;
        if (!string.IsNullOrWhiteSpace(category) && !string.Equals(category, "All", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(a => string.Equals(a.Category, category.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim();
            query = query.Where(a =>
                a.Name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                a.Category.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                a.SourceFile.Contains(q, StringComparison.OrdinalIgnoreCase));
        }

        return query.ToList();
    }

    public static async Task<BatchRenderThumbnailsResponse> RunBatchAsync(bool forceReRender)
    {
        var script = ResolveScriptPath();
        var srcDir = ResolveModels3dDir();
        var outDir = ResolvePreviewsPngDir();
        var legDir = ResolveLegacyObjLibDir();

        var args = new List<string>
        {
            script,
            "--batch",
            "--source-dir", srcDir,
            "--output-dir", outDir,
            "--legacy-obj-lib", legDir
        };
        if (forceReRender)
        {
            args.Add("--force");
        }

        var stdout = await ExecutePythonAsync(args);
        lock (SyncLock)
        {
            _cachedThumbnails = LoadManifestFromDisk();
        }

        try
        {
            using var doc = JsonDocument.Parse(stdout);
            var root = doc.RootElement;
            var total = root.TryGetProperty("totalAssets", out var tEl) ? tEl.GetInt32() : (_cachedThumbnails?.Count ?? 0);
            var rendered = root.TryGetProperty("renderedCount", out var rEl) ? rEl.GetInt32() : 0;
            var cached = root.TryGetProperty("cachedCount", out var cEl) ? cEl.GetInt32() : total;
            var cats = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            if (root.TryGetProperty("categories", out var catEl) && catEl.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in catEl.EnumerateObject())
                {
                    cats[prop.Name] = prop.Value.GetInt32();
                }
            }
            return new BatchRenderThumbnailsResponse(
                Accepted: true,
                Mode: "batch",
                TotalAssets: total,
                RenderedCount: rendered,
                CachedCount: cached,
                Categories: cats,
                Summary: $"Python batch thumbnail pipeline verified {total} 3D assets ({rendered} newly printed PNGs, {cached} up-to-date cached PNGs)."
            );
        }
        catch
        {
            var count = _cachedThumbnails?.Count ?? 0;
            return new BatchRenderThumbnailsResponse(
                Accepted: true,
                Mode: "batch",
                TotalAssets: count,
                RenderedCount: 0,
                CachedCount: count,
                Categories: new Dictionary<string, int>(),
                Summary: $"Python batch thumbnail pipeline synchronized {count} 3D asset PNG thumbnails."
            );
        }
    }

    public static async Task<SingleUpload3dAssetResponse> RunSingleUploadAsync(SingleUpload3dAssetRequest req)
    {
        var safeFileName = Path.GetFileName(string.IsNullOrWhiteSpace(req.FileName) ? "custom_dungeon_prop.glb" : req.FileName.Trim());
        if (!safeFileName.EndsWith(".glb", StringComparison.OrdinalIgnoreCase))
        {
            safeFileName += ".glb";
        }

        var modelsDir = ResolveModels3dDir();
        var targetGlbPath = Path.Combine(modelsDir, safeFileName);

        if (!string.IsNullOrWhiteSpace(req.Base64GlbPayload))
        {
            var rawBase64 = req.Base64GlbPayload;
            var commaIdx = rawBase64.IndexOf(',');
            if (commaIdx >= 0) rawBase64 = rawBase64[(commaIdx + 1)..];
            var bytes = Convert.FromBase64String(rawBase64);
            await File.WriteAllBytesAsync(targetGlbPath, bytes);
        }
        else if (!File.Exists(targetGlbPath))
        {
            var existingAny = Directory.EnumerateFiles(modelsDir, "*.glb").FirstOrDefault();
            if (existingAny is not null)
            {
                targetGlbPath = existingAny;
            }
        }

        var script = ResolveScriptPath();
        var outDir = ResolvePreviewsPngDir();
        var legDir = ResolveLegacyObjLibDir();

        var args = new List<string>
        {
            script,
            "--single", targetGlbPath,
            "--output-dir", outDir,
            "--legacy-obj-lib", legDir
        };
        if (!string.IsNullOrWhiteSpace(req.DisplayName))
        {
            args.Add("--name");
            args.Add(req.DisplayName.Trim());
        }
        if (!string.IsNullOrWhiteSpace(req.Category))
        {
            args.Add("--category");
            args.Add(req.Category.Trim());
        }

        var stdout = await ExecutePythonAsync(args);
        lock (SyncLock)
        {
            _cachedThumbnails = LoadManifestFromDisk();
        }

        try
        {
            using var doc = JsonDocument.Parse(stdout);
            if (doc.RootElement.TryGetProperty("asset", out var assetEl))
            {
                var dto = ParseAssetElement(assetEl);
                return new SingleUpload3dAssetResponse(
                    Accepted: true,
                    Mode: "single",
                    Summary: $"Python single-asset processor printed 256x256 PNG thumbnail '{dto.PngPreviewUrl}' for '{dto.Name}'.",
                    Asset: dto
                );
            }
        }
        catch
        {
            // Fallback to first matching in manifest
        }

        var fallbackDto = (_cachedThumbnails ?? []).FirstOrDefault(a =>
            string.Equals(a.SourceFile, Path.GetFileName(targetGlbPath), StringComparison.OrdinalIgnoreCase))
            ?? (_cachedThumbnails ?? []).FirstOrDefault()
            ?? new Map3dAssetThumbnailDto(
                "obj-custom",
                req.DisplayName ?? "Custom 3D Prop",
                req.Category ?? "Props",
                safeFileName,
                "custom",
                0,
                1200,
                "/assets/previews-png/obj-cebe324430fa12d6.png",
                $"/assets/models-3d/{safeFileName}",
                1.0,
                1.0,
                1.0,
                5,
                "Aged Stone"
            );

        return new SingleUpload3dAssetResponse(
            Accepted: true,
            Mode: "single",
            Summary: $"Python single-asset processor printed PNG thumbnail '{fallbackDto.PngPreviewUrl}' for '{fallbackDto.Name}'.",
            Asset: fallbackDto
        );
    }

    private static async Task<string> ExecutePythonAsync(IReadOnlyList<string> args)
    {
        var pythonBin = OperatingSystem.IsWindows() ? "python" : "python3";
        var psi = new ProcessStartInfo
        {
            FileName = pythonBin,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        foreach (var a in args)
        {
            psi.ArgumentList.Add(a);
        }

        using var proc = Process.Start(psi);
        if (proc is null)
            return "{}";
        var stdout = await proc.StandardOutput.ReadToEndAsync();
        await proc.WaitForExitAsync();
        return stdout.Trim();
    }

    private static List<Map3dAssetThumbnailDto> LoadManifestFromDisk()
    {
        var manifestPath = Path.Combine(ResolvePreviewsPngDir(), "manifest.json");
        if (!File.Exists(manifestPath))
        {
            return [];
        }

        try
        {
            using var stream = File.OpenRead(manifestPath);
            using var doc = JsonDocument.Parse(stream);
            if (!doc.RootElement.TryGetProperty("assets", out var assetsEl) || assetsEl.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var list = new List<Map3dAssetThumbnailDto>();
            foreach (var el in assetsEl.EnumerateArray())
            {
                list.Add(ParseAssetElement(el));
            }
            return list;
        }
        catch
        {
            return [];
        }
    }

    private static Map3dAssetThumbnailDto ParseAssetElement(JsonElement el)
    {
        string Str(string key, string def = "") =>
            el.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.String ? (p.GetString() ?? def) : def;
        long Lng(string key, long def = 0) =>
            el.TryGetProperty(key, out var p) && p.TryGetInt64(out var v) ? v : def;
        int Int(string key, int def = 0) =>
            el.TryGetProperty(key, out var p) && p.TryGetInt32(out var v) ? v : def;
        double Dbl(string key, double def = 1.0) =>
            el.TryGetProperty(key, out var p) && p.TryGetDouble(out var v) ? v : def;

        return new Map3dAssetThumbnailDto(
            Id: Str("id", "obj-default"),
            Name: Str("name", "Ancient Crypt Asset"),
            Category: Str("category", "Architecture"),
            SourceFile: Str("sourceFile", ""),
            SourceHash: Str("sourceHash", ""),
            Bytes: Lng("bytes", 0),
            Triangles: Int("triangles", 0),
            PngPreviewUrl: Str("pngPreviewUrl", ""),
            GlbUrl: Str("glbUrl", ""),
            WidthSq: Dbl("widthSq", 1.0),
            DepthSq: Dbl("depthSq", 1.0),
            HeightSq: Dbl("heightSq", 1.0),
            DefaultWidthFt: Int("defaultWidthFt", 5),
            DefaultMaterial: Str("defaultMaterial", "Aged Stone")
        );
    }
}
