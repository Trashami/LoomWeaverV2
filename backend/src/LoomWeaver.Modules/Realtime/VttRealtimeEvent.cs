namespace LoomWeaver.Modules.Realtime;

/// <summary>
/// A client-originated VTT event relayed over the table hub. ActorKey identifies the acting token or character
/// and is informational only; the sender's identity always comes from the authenticated seat.
/// </summary>
public sealed record VttRealtimeEvent(string Type, string ActorKey, string PayloadJson);
