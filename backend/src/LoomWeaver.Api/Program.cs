using LoomWeaver.GameSystems;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Infrastructure.Neo4j;
using LoomWeaver.Modules;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Realtime;

LoomWeaver.Api.LoomWeaverServerHost.Run(args);

namespace LoomWeaver.Api
{
    public static class LoomWeaverServerHost
    {
        public static void Run(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);
            AuthSecrets.EnsureConfigured();

            var mysqlOptions = builder.Configuration.GetSection("LoomWeaverDatabase").Get<LoomWeaverMySqlOptions>()
                ?? new LoomWeaverMySqlOptions();
            var envConnStr = builder.Configuration.GetConnectionString("LoomWeaverMySql");
            if (!string.IsNullOrWhiteSpace(envConnStr))
            {
                mysqlOptions.ConnectionString = envConnStr;
            }

            var graphOptions = builder.Configuration.GetSection("LoomWeaverGraph").Get<LoomWeaverGraphOptions>()
                ?? new LoomWeaverGraphOptions();

            builder.Services.AddSingleton(mysqlOptions);
            builder.Services.AddSingleton<LoomWeaverMySqlRepository>();
            builder.Services.AddSingleton(graphOptions);
            builder.Services.AddSingleton<LoomWeaverNeo4jService>();
            builder.Services.AddSingleton<IGameSystemRules, Dnd5eSystemRules>();
            builder.Services.AddSingleton<IGameSystemRules, Pathfinder2eSystemRules>();
            builder.Services.AddSingleton<IGameSystemRules, VampireV5SystemRules>();
            builder.Services.AddSignalR();

            builder.Services.AddCors(options =>
            {
                options.AddDefaultPolicy(policy =>
                    policy
                        .SetIsOriginAllowed(SecurityHardeningMiddleware.IsTrustedOrigin)
                        .AllowAnyHeader()
                        .AllowAnyMethod()
                        .AllowCredentials());
            });

            var app = builder.Build();
            app.UseCors();

            // Initialize LoomWeaver V2 MySQL schema (lw_*) and Neo4j story projections on startup when reachable
            var repo = app.Services.GetRequiredService<LoomWeaverMySqlRepository>();
            var graph = app.Services.GetRequiredService<LoomWeaverNeo4jService>();
            _ = Task.Run(async () =>
            {
                await MySqlUserAuthStore.EnsureDatabaseReadyAsync(repo);
                await LoomWeaver.Modules.Knowledge.ConnectedStoryEngine.EnsureSchemaAndSeedAsync(repo, graph);
                await LoomWeaver.Modules.Bestiary.BestiaryPersistence.EnsureReadyAsync(repo);
            });

            // Enforce OWASP security headers and auth rate-limiting on every request.
            app.Use(async (context, next) =>
            {
                SecurityHardeningMiddleware.ApplySecurityHeaders(context);

                var path = context.Request.Path.Value ?? string.Empty;
                if (path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase) &&
                    SecurityHardeningMiddleware.IsRateLimitedAuthRequest(context, path))
                {
                    context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsync("{\"message\":\"Too many authentication attempts. Please wait 60 seconds and try again.\"}");
                    return;
                }

                await next();
            });

            // Authentication, campaign membership (lw_campaign_members), and server-derived roles
            // for every /api and /hubs request. See CampaignAccessMiddleware.
            app.UseLoomWeaverAccessControl();

            app.MapHub<TableRealtimeHub>("/hubs/table");
            app.MapLoomWeaverModules();
            app.Run();
        }
    }
}
