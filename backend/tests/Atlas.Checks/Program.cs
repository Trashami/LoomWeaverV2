using System.Text.Json;
using LoomWeaver.Modules.Maps.Features.WorldAtlas;
using LoomWeaver.Infrastructure.MySql;
using Microsoft.AspNetCore.Http;

var doc=new AtlasDocument(1,"atlas-test",0,"Test world",3,32,1200,900,0,new double[1089],new int[1089],[]);
void Check(bool condition,string label){if(!condition)throw new Exception(label);Console.WriteLine("PASS "+label);}
Check(AtlasValidation.Error(doc) is null,"valid terrain accepted");
Check(AtlasValidation.Error(doc with { Heights=[double.NaN] }) is not null,"nonfinite or malformed terrain denied");
Check(AtlasValidation.Error(doc with { Resolution=999 }) is not null,"unbounded geometry denied");
var m=new AtlasMarker("a","loc-stable","Test town","town",0,0,"#abcdef","gm");
Check(AtlasValidation.Error(doc with {Markers=[m,m with {Id="b"}]}) is not null,"duplicate canonical location references denied");
Check(AtlasValidation.Error(doc with {Markers=[m with {Visibility="public-executable"}]}) is not null,"unknown visibility denied");
var json=JsonSerializer.Serialize(doc with {Markers=[m]},AtlasValidation.Json);
var reopened=JsonSerializer.Deserialize<AtlasDocument>(json,AtlasValidation.Json)!;
Check(reopened.Markers[0].LocationKey==m.LocationKey&&reopened.Heights.Length==1089,"document round trip preserves location identity and terrain");
var denied=await AtlasAccess.Denied(new DefaultHttpContext(),1,new LoomWeaverMySqlRepository(new()),CancellationToken.None);
Check(denied is IStatusCodeHttpResult { StatusCode:401 },"anonymous caller denied before database access");
var forged=new DefaultHttpContext();forged.Request.QueryString=new QueryString("?role=gm");forged.Request.Headers.Authorization="Bearer fake";
denied=await AtlasAccess.Denied(forged,1,new LoomWeaverMySqlRepository(new()),CancellationToken.None);
Check(denied is IStatusCodeHttpResult {StatusCode:401},"forged role and token cannot grant GM access");
