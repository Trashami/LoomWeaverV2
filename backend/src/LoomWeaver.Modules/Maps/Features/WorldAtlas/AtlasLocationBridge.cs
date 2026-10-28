using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Knowledge;
using MySqlConnector;
namespace LoomWeaver.Modules.Maps.Features.WorldAtlas;

/// <summary>Atlas miniatures use the existing world-location key, never a second lore identity.</summary>
public static class AtlasLocationBridge
{
    public static async Task PersistExisting(LoomWeaverMySqlRepository repo,int campaignId,LocationInspectorDetailDto loc,double x,double y,CancellationToken ct)
    {
        await using var db=await repo.OpenConnectionAsync(ct);
        await using var cmd=new MySqlCommand("""
            UPDATE lw_world_locations SET name=@n,location_type=@t,description=@d,historical_background=@h,culture_and_traditions=@cu,
              local_myths=@my,visibility=@v,discovery_status=@s,x_percent=@x,y_percent=@y,child_map_id=@child,linked_scene_key=@scene
            WHERE campaign_id=@c AND location_key=@key
            """,db);
        cmd.Parameters.AddWithValue("@n",loc.Name);cmd.Parameters.AddWithValue("@t",loc.LocationType);cmd.Parameters.AddWithValue("@d",loc.Description);
        cmd.Parameters.AddWithValue("@h",loc.HistoricalBackground);cmd.Parameters.AddWithValue("@cu",loc.CultureAndTraditions);cmd.Parameters.AddWithValue("@my",loc.LocalMyths);
        cmd.Parameters.AddWithValue("@v",loc.Visibility);cmd.Parameters.AddWithValue("@s",loc.DiscoveryStatus);cmd.Parameters.AddWithValue("@x",Math.Clamp(x,0,100));cmd.Parameters.AddWithValue("@y",Math.Clamp(y,0,100));
        cmd.Parameters.AddWithValue("@child",loc.ChildMapId);cmd.Parameters.AddWithValue("@scene",loc.LinkedSceneKey);cmd.Parameters.AddWithValue("@c",campaignId);cmd.Parameters.AddWithValue("@key",loc.LocationKey);
        await cmd.ExecuteNonQueryAsync(ct);
    }
    public static async Task<bool> Save(MySqlConnection db,MySqlTransaction tx,int campaignId,AtlasDocument doc,CancellationToken ct)
    {
        var mapId="atlas-"+doc.Id;
        await using(var check=new MySqlCommand("SELECT campaign_id FROM lw_world_maps WHERE map_id=@map FOR UPDATE",db,tx))
        {
            check.Parameters.AddWithValue("@map",mapId);var owner=await check.ExecuteScalarAsync(ct);
            if(owner is not null&&Convert.ToInt32(owner)!=campaignId)return false;
        }
        await using(var map=new MySqlCommand("""
            INSERT INTO lw_world_maps(map_id,campaign_id,name,scope_level,image_url,scale_label,width_units,height_units,visibility)
            VALUES(@id,@c,@name,'World',@url,@scale,@w,@h,'gm')
            ON DUPLICATE KEY UPDATE name=VALUES(name),scale_label=VALUES(scale_label),width_units=VALUES(width_units),height_units=VALUES(height_units)
            """,db,tx))
        {
            map.Parameters.AddWithValue("@id",mapId);map.Parameters.AddWithValue("@c",campaignId);map.Parameters.AddWithValue("@name",doc.Name);
            map.Parameters.AddWithValue("@url",$"/api/v2/campaigns/{campaignId}/atlases/{doc.Id}/preview");
            map.Parameters.AddWithValue("@scale",$"{doc.WidthKm:0} × {doc.HeightKm:0} km");map.Parameters.AddWithValue("@w",(int)doc.WidthKm);map.Parameters.AddWithValue("@h",(int)doc.HeightKm);
            await map.ExecuteNonQueryAsync(ct);
        }
        var kept=doc.Markers.Select((_,i)=>"@keep"+i).ToArray();
        await using(var unlink=new MySqlCommand("UPDATE lw_world_locations SET map_id=NULL WHERE campaign_id=@c AND map_id=@map"
            +(kept.Length>0?" AND location_key NOT IN ("+string.Join(',',kept)+")":""),db,tx))
        {
            unlink.Parameters.AddWithValue("@c",campaignId);unlink.Parameters.AddWithValue("@map",mapId);
            for(var i=0;i<kept.Length;i++)unlink.Parameters.AddWithValue(kept[i],doc.Markers[i].LocationKey);
            await unlink.ExecuteNonQueryAsync(ct);
        }
        foreach(var m in doc.Markers)
        {
            await using(var check=new MySqlCommand("SELECT campaign_id FROM lw_world_locations WHERE location_key=@key FOR UPDATE",db,tx))
            {
                check.Parameters.AddWithValue("@key",m.LocationKey);var owner=await check.ExecuteScalarAsync(ct);
                if(owner is not null&&Convert.ToInt32(owner)!=campaignId)return false;
            }
            await using var cmd=new MySqlCommand("""
                INSERT INTO lw_world_locations(location_key,campaign_id,composite_key,name,location_type,hierarchy_level,map_id,x_percent,y_percent,
                  discovery_status,visibility,artwork_url,description,historical_background,culture_and_traditions,local_myths)
                VALUES(@key,@c,@composite,@name,@type,'Settlement',@map,@x,@y,'known',@vis,'','Recorded in the campaign World Atlas.','','','')
                ON DUPLICATE KEY UPDATE name=VALUES(name),location_type=VALUES(location_type),map_id=VALUES(map_id),
                  x_percent=VALUES(x_percent),y_percent=VALUES(y_percent),visibility=VALUES(visibility)
                """,db,tx);
            cmd.Parameters.AddWithValue("@key",m.LocationKey);cmd.Parameters.AddWithValue("@c",campaignId);
            cmd.Parameters.AddWithValue("@composite",$"{campaignId}:Location:{m.LocationKey}");cmd.Parameters.AddWithValue("@name",m.Name);
            cmd.Parameters.AddWithValue("@type",m.Kind);cmd.Parameters.AddWithValue("@map",mapId);
            cmd.Parameters.AddWithValue("@x",(m.X/240+.5)*100);cmd.Parameters.AddWithValue("@y",(.5-m.Z/240)*100);cmd.Parameters.AddWithValue("@vis",m.Visibility);
            await cmd.ExecuteNonQueryAsync(ct);
        }
        // Removing a miniature never deletes the campaign's lore record.
        return true;
    }

    public static async Task Hydrate(LoomWeaverMySqlRepository repo,int campaignId,CancellationToken ct)
    {
        await using var db=await repo.OpenConnectionAsync(ct);
        var locations=new List<LocationInspectorDetailDto>(WorldLoreStateStore.LocationsByCampaign.GetValueOrDefault(campaignId)??[]);
        var markers=new List<WorldMapMarkerDto>(WorldLoreCatalogStore.MarkersByCampaign.GetValueOrDefault(campaignId)??[]);
        var maps=new List<WorldMapSummaryDto>(WorldLoreStateStore.MapsByCampaign.GetValueOrDefault(campaignId)??[]);
        await using(var cmd=new MySqlCommand("SELECT map_id,name,image_url,scale_label,width_units,height_units FROM lw_world_maps WHERE campaign_id=@c AND map_id LIKE 'atlas-%'",db))
        {
            cmd.Parameters.AddWithValue("@c",campaignId);await using var r=await cmd.ExecuteReaderAsync(ct);
            while(await r.ReadAsync(ct)){
                var id=r.GetString(0);maps.RemoveAll(m=>m.MapId==id);
                maps.Add(new(id,campaignId,r.GetString(1),"World",null,null,r.GetString(2),null,r.GetString(3),"North",r.GetInt32(4),r.GetInt32(5),"gm"));
            }
        }
        await using(var cmd=new MySqlCommand("""
            SELECT location_key,composite_key,name,location_type,hierarchy_level,parent_location_key,map_id,child_map_id,linked_scene_key,
              x_percent,y_percent,discovery_status,visibility,artwork_url,description,historical_background,culture_and_traditions,local_myths
            FROM lw_world_locations WHERE campaign_id=@c
            """,db))
        {
            cmd.Parameters.AddWithValue("@c",campaignId);await using var r=await cmd.ExecuteReaderAsync(ct);
            while(await r.ReadAsync(ct)){
                string? Nullable(int i)=>r.IsDBNull(i)?null:r.GetString(i);
                var key=r.GetString(0);var old=locations.FirstOrDefault(l=>l.LocationKey==key);
                var loc=new LocationInspectorDetailDto(key,r.GetString(1),campaignId,r.GetString(2),r.GetString(3),r.GetString(4),Nullable(5),old?.ParentLocationName,
                    r.GetString(13),r.GetString(14),r.GetString(11),$"{r.GetDecimal(10):F1} N, {r.GetDecimal(9):F1} E",Nullable(6),Nullable(7),Nullable(8),r.GetString(12),
                    old?.Attributes??[],r.GetString(15),r.GetString(16),r.GetString(17),old?.Tags??[],old?.LinkedLoreIds??[],old?.RelatedEntities??[],old?.HistoryEvents??[],old?.Secrets??[]);
                if(old is not null)loc=loc with {AttachedSessionId=old.AttachedSessionId,AttachedSessionLabel=old.AttachedSessionLabel,
                    PlayerVisibilityPolicy=old.PlayerVisibilityPolicy,Style=old.Style};
                locations.RemoveAll(l=>l.LocationKey==key);locations.Add(loc);
                markers.RemoveAll(m=>m.LocationKey==key);
                if(loc.MapId is not null)markers.Add(new("m-"+key,loc.MapId,key,loc.CompositeKey,loc.Name,loc.LocationType,"Settlements",loc.HierarchyLevel,
                    (double)r.GetDecimal(9),(double)r.GetDecimal(10),loc.DiscoveryStatus,loc.Visibility,loc.ChildMapId,loc.LinkedSceneKey,0,0,loc.Secrets.Count));
            }
        }
        WorldLoreStateStore.MapsByCampaign[campaignId]=maps;WorldLoreStateStore.LocationsByCampaign[campaignId]=locations;WorldLoreCatalogStore.MarkersByCampaign[campaignId]=markers;
    }
}
