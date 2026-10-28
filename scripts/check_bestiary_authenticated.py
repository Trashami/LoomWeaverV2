"""Authenticated staging checks; short-lived tokens and disposable, explicitly tracked records."""
import base64, hashlib, hmac, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path
import pymysql
base=os.environ.get('BESTIARY_TEST_URL','http://127.0.0.1:5099/api/v2')
conn=pymysql.connect(host='127.0.0.1',user='loomweaver_app',password=os.environ['LW_DB_PASSWORD'],database='loomweaver',cursorclass=pymysql.cursors.DictCursor)
with conn.cursor() as c:
 c.execute('SELECT id,account_id,email,username,display_name,role FROM lw_auth_users WHERE id IN (1,2)');users={u['id']:u for u in c.fetchall()}
assert len(users)==2
enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
def token(uid):
 u=users[uid];p=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':str(uid),'nameid':str(uid),'accountId':u['account_id'],'email':u['email'],'username':u['username'],'name':u['display_name'],'role':u['role'],'exp':int(time.time())+1800})
 return p+'.'+base64.urlsafe_b64encode(hmac.new(os.environ['LW_TEST_JWT_KEY'].encode(),p.encode(),hashlib.sha256).digest()).decode().rstrip('=')
tokens={u:token(u) for u in users}
checks=0
def request(uid,method,path,body=None,expected=200):
 global checks
 headers={'Authorization':'Bearer '+tokens[uid]} if uid else {}
 if body is not None:headers['Content-Type']='application/json'
 req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as response: status=response.status;raw=response.read()
 except urllib.error.HTTPError as error:status=error.code;raw=error.read()
 assert status==expected,(method,path,status,raw[:200])
 checks+=1
 return json.loads(raw) if raw else None
def check(ok,label):
 global checks
 assert ok,label
 checks+=1
statefile=Path('/tmp/bestiary-qa-state.json')
if len(sys.argv)>1 and sys.argv[1]=='persisted':
 state=json.loads(statefile.read_text()); cid=state['campaign'];key=state['monster']
 check(any(c['id']==state['collection'] for c in request(2,'GET',f'/campaigns/{cid}/bestiary/state')['collections']),'Collection survives restart')
 check(len(request(1,'GET','/campaigns/1/bestiary/sightings?monsterKey='+key))==4,'All sightings survive restart')
 check(len(request(2,'GET','/campaigns/1/bestiary/sightings?monsterKey='+key))==2,'Player visibility survives restart')
 check(request(2,'GET','/bestiary/monsters/'+key)['summary']['isPublished'],'Publication survives restart')
 print('Passed persisted round-trip checks:',checks);sys.exit(0)
state = {}
try:
 request(None,'GET','/bestiary/monsters',expected=401)
 page=request(1,'GET','/bestiary/monsters?limit=3');check(page['total']>=5800 and page['databaseOnline'],'Complete SQL catalog online')
 key=page['items'][0]['key'];detail=request(1,'GET','/bestiary/monsters/'+key);check(detail['summary']['name']==page['items'][0]['name'],'Detail matches catalog')
 request(2,'GET','/campaigns/1/bestiary/state?role=gm',expected=403)
 request(1,'GET','/campaigns/1/bestiary/state?role=players',expected=403)
 request(1,'GET','/campaigns/999999/bestiary/state',expected=403)
 request(2,'GET','/campaigns/999999/bestiary/sightings',expected=403)
 cid=900028
 with conn.cursor() as c:
  c.execute('SELECT id FROM lw_campaigns WHERE id=%s',(cid,));assert not c.fetchone(),'QA campaign ID already used'
  c.execute("INSERT INTO lw_campaigns (id,slug,name,subtitle,system_code,gm_user_id,world_name,current_act,current_location_name) VALUES (%s,'bestiary-release-qa','Bestiary release QA','Temporary authorized release test','dnd5e',2,'QA','QA','QA')",(cid,))
  c.execute("INSERT INTO lw_campaign_members(campaign_id,user_id,auth_email,member_role) VALUES (%s,2,%s,'gm')",(cid,users[2]['email']))
 conn.commit()
 state={'campaign':cid};statefile.write_text(json.dumps(state))
 request(2,'GET',f'/campaigns/{cid}/bestiary/state')
 monster=request(2,'POST','/bestiary/custom-monsters',{'name':'Bestiary Release QA Creature','challengeRating':'1/4','armorClass':12,'hitPoints':8,'shortDescription':'Temporary release verification creature','publishToMarket':False})
 custom=monster['summary']['key'];state['monster']=custom;statefile.write_text(json.dumps(state))
 check(monster['summary']['creatorUsername']==users[2]['username'],'Credit comes from authenticated username')
 request(1,'GET','/bestiary/monsters/'+custom,expected=404)
 request(1,'POST','/bestiary/custom-monsters/'+custom+'/publish',{},expected=403)
 request(2,'POST','/bestiary/custom-monsters/'+custom+'/publish',{})
 check(any(m['key']==custom for m in request(1,'GET','/bestiary/monsters?source=community')['items']),'Published monster visible in free market')
 collection=request(2,'POST',f'/campaigns/{cid}/bestiary/collections',{'name':'Bestiary QA Collection','monsterKeys':[custom],'assignedCampaignIds':[cid]})
 state['collection']=collection['id'];statefile.write_text(json.dumps(state))
 request(2,'POST',f'/campaigns/{cid}/bestiary/collections',{'name':'Forbidden assignment','assignedCampaignIds':[1]},expected=403)
 request(1,'PUT','/campaigns/1/bestiary/assignments/'+custom,{'primaryTokenUrl':'/5etools/bestiary/tokens/MM/Goblin.webp','secondaryTokenUrl':'/5etools/bestiary/tokens/MM/Orc.webp','primaryModelUrl':'/assets/test.glb','secondaryModelUrl':'/assets/test-secondary.glb'})
 request(2,'PUT','/campaigns/1/bestiary/assignments/'+custom,{},expected=403)
 check(not request(2,'GET',f'/campaigns/{cid}/bestiary/state')['assignments'],'Assignments isolated between campaigns')
 request(1,'POST','/campaigns/1/bestiary/placements',{'monsterKey':custom,'monsterName':'QA Creature','scope':'campaign','count':2})
 for scope,witness in [('gm',[]),('party',[]),('witnesses',['pc-dal']),('witnesses',['pc-fivi'])]:
  request(1,'POST','/campaigns/1/bestiary/sightings',{'monsterKey':custom,'monsterName':'QA Creature','outcome':'befriended','locationName':'QA bridge','visibility':scope,'witnessCharacterKeys':witness})
 check(len(request(2,'GET','/campaigns/1/bestiary/sightings?monsterKey='+custom))==2,'Player sees only party and their own witness record')
 request(2,'POST','/campaigns/1/bestiary/sightings',{'monsterKey':custom},expected=403)
 request(2,'POST','/campaigns/1/encounters',{'id':'qa','campaignId':1},expected=403)
 request(2,'POST',f'/campaigns/{cid}/encounters',{'id':'bestiary-release-qa','campaignId':cid,'name':'QA Encounter','monsters':[]})
 check(len(request(2,'GET',f'/campaigns/{cid}/encounters'))==1,'Encounter persisted in the correct campaign')
 with conn.cursor() as c:
  c.execute('SELECT price_cents FROM lw_custom_monsters WHERE monster_key=%s',(custom,));check(c.fetchone()['price_cents']==0,'Published monster is always free')
 import subprocess
 subprocess.run(['systemctl','restart','loom-bestiary-check.service'],check=True)
 for attempt in range(30):
  try:
   request(1,'GET','/bestiary/monsters?limit=1')
   break
  except Exception:
   time.sleep(1)
 subprocess.run([sys.executable,__file__,'persisted'],check=True,env=os.environ)
 print('Passed authenticated bestiary checks:',checks)
finally:
 # Delete only disposable rows created and identified by this test run.
 conn.rollback()
 with conn.cursor() as c:
  if state.get('monster'):
   key = state['monster']
   for table in ['lw_campaign_monster_assets','lw_campaign_monster_placements','lw_monster_sightings']:
    c.execute(f'DELETE FROM {table} WHERE monster_key=%s',(key,))
   c.execute('DELETE FROM lw_monster_collection_entries WHERE monster_key=%s',(key,))
   c.execute("DELETE FROM lw_custom_monsters WHERE monster_key=%s AND creator_user_id=2 AND name='Bestiary Release QA Creature'",(key,))
  if state.get('collection'):
   key=state['collection']
   c.execute('DELETE FROM lw_monster_collection_entries WHERE collection_id=%s',(key,))
   c.execute('DELETE FROM lw_monster_collection_campaigns WHERE collection_id=%s',(key,))
   c.execute("DELETE FROM lw_monster_collections WHERE collection_id=%s AND owner_user_id=2 AND name='Bestiary QA Collection'",(key,))
  if state.get('campaign'):
   cid=state['campaign']
   c.execute("SELECT id FROM lw_campaigns WHERE id=%s AND slug='bestiary-release-qa' AND gm_user_id=2",(cid,))
   if c.fetchone():
    c.execute('DELETE FROM lw_saved_encounters WHERE campaign_id=%s',(cid,))
    c.execute('DELETE FROM lw_campaign_members WHERE campaign_id=%s AND user_id=2',(cid,))
    c.execute("DELETE FROM lw_campaigns WHERE id=%s AND slug='bestiary-release-qa'",(cid,))
 conn.commit()
 import subprocess
 subprocess.run(['systemctl','restart','loom-bestiary-check.service'],check=True)
 statefile.unlink(missing_ok=True)
 print('Temporary test rows cleaned; staged caches restarted.')
