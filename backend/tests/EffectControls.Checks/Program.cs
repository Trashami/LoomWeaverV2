using System.Text.Json;
using System.Text.Json.Nodes;
using LoomWeaver.Modules.EffectStudio.Engine;
var fixtures = JsonNode.Parse(File.ReadAllText(args[0]))!.AsArray();
void Check(bool ok,string message) { if(!ok) throw new Exception(message); }
foreach(var fixture in fixtures) Check(EffectDefinitionValidator.Valid(JsonSerializer.SerializeToElement(fixture)),"Save rejected: "+fixture!["name"]+" / "+fixture["layers"]![0]!["kind"]);
var aura=fixtures.Last()!.DeepClone();
Check(aura["layers"]![0]!["aura"] is not null,"Aura fixture exists");
var layer=aura["layers"]![0]!;
foreach(var value in new JsonNode?[]{JsonValue.Create(-1),JsonValue.Create(81),JsonValue.Create("bad"),null}) {
 var bad=aura.DeepClone();bad["layers"]![0]!["aura"]!["motes"]=value?.DeepClone();
 Check(!EffectDefinitionValidator.Valid(JsonSerializer.SerializeToElement(bad)),"Invalid aura rejected");
}
var unknown=aura.DeepClone();unknown["layers"]![0]!["aura"]!["script"]="invalid";
Check(!EffectDefinitionValidator.Valid(JsonSerializer.SerializeToElement(unknown)),"Unknown setting rejected");
layer["aura"]!["strands"]=1.5;Check(!EffectDefinitionValidator.Valid(JsonSerializer.SerializeToElement(aura)),"Fractional strands rejected");
Console.WriteLine($"PASS {fixtures.Count} core and spell definitions accepted; malformed, unknown and out-of-range aura values rejected.");
