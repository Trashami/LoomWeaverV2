using System.Security.Cryptography;
using System.Text;

namespace LoomWeaver.Modules.Auth;

/// <summary>
/// Runtime authentication secrets. Signing keys are never stored in source control:
/// LOOMWEAVER_JWT_SECRET must be supplied by the host (systemd EnvironmentFile in production).
/// Development hosts without a secret get a random per-process key (sessions reset on restart).
/// </summary>
public static class AuthSecrets
{
    private const int MinimumSecretLength = 32;

    public static readonly byte[] JwtSigningKey = LoadSigningKey();

    /// <summary>Optional key for tokens minted by the legacy MythWeaver server. Unset means rejected.</summary>
    public static readonly byte[]? LegacyJwtSigningKey = LoadOptional("LOOMWEAVER_LEGACY_JWT_SECRET");

    /// <summary>Forces key loading at startup so a misconfigured production host fails fast.</summary>
    public static void EnsureConfigured() => _ = JwtSigningKey.Length;

    private static byte[] LoadSigningKey()
    {
        var configured = LoadOptional("LOOMWEAVER_JWT_SECRET");
        if (configured is not null) return configured;

        if (IsDevelopment())
        {
            Console.Error.WriteLine(
                "[LoomWeaver] LOOMWEAVER_JWT_SECRET is not set; using a random development signing key. " +
                "Sessions will reset when the API restarts.");
            return RandomNumberGenerator.GetBytes(64);
        }

        throw new InvalidOperationException(
            $"LOOMWEAVER_JWT_SECRET must be set to at least {MinimumSecretLength} characters outside Development.");
    }

    private static byte[]? LoadOptional(string name)
    {
        var value = Environment.GetEnvironmentVariable(name);
        return !string.IsNullOrWhiteSpace(value) && value.Trim().Length >= MinimumSecretLength
            ? Encoding.UTF8.GetBytes(value.Trim())
            : null;
    }

    private static bool IsDevelopment()
    {
        var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
                  ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");
        return string.Equals(env, "Development", StringComparison.OrdinalIgnoreCase);
    }
}
