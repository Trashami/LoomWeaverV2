import fs from 'node:fs';
const repo = '/var/www/jane-assets/5etools-repo';
await import(`${repo}/js/parser.js`);
await import(`${repo}/js/utils.js`);
await import(`${repo}/js/render.js`);
await import(`${repo}/js/render-dice.js`);
const {patchLoadJson} = await import(`${repo}/node/util.js`);
process.chdir(repo);
patchLoadJson();
const originalLoad = DataUtil.loadJSON.bind(DataUtil);
const templates = JSON.parse(fs.readFileSync('/var/www/jane-assets/5etools/data/bestiary/template.json', 'utf8'));
for (const template of templates.monsterTemplate) {
 if (template._copy) await DataUtil.monsterTemplate.pMergeCopy(templates.monsterTemplate, template, {isErrorOnMissing: true});
}
DataUtil.loadJSON = async url => {
 if (url.endsWith('data/bestiary/template.json')) {
  return templates;
 }
 return originalLoad(url);
};
const records = new Map();
for (const root of [`${repo}/data`, '/var/www/jane-assets/5etools/data']) {
 for (const file of fs.readdirSync(`${root}/bestiary`).filter(f => /^bestiary-.*\.json$/.test(f)).sort()) {
  for (const monster of JSON.parse(fs.readFileSync(`${root}/bestiary/${file}`, 'utf8')).monster ?? []) {
   records.set(`${monster.name.toLowerCase()}|${monster.source.toLowerCase()}`, monster);
  }
 }
}
const monsters = [...records.values()];
let copies = 0;
const errors = [];
for (const monster of monsters) {
 if (!monster._copy) continue;
 try { await DataUtil.monster.pMergeCopy(monsters, monster, {isErrorOnMissing: true}); } catch (error) { errors.push({name:monster.name,source:monster.source,error:error.message}); continue; }
 copies++;
 if (monster._copy) errors.push({name:monster.name, source:monster.source, error:'Unresolved copy'});
}
fs.writeFileSync('/tmp/bestiary-resolved.json', JSON.stringify(monsters.filter(m => !m._copy)));
fs.writeFileSync('/tmp/bestiary-source-errors.json', JSON.stringify(errors));
console.log(JSON.stringify({monsters: monsters.length, inheritedStatblocksResolved: copies, sourceErrors:errors}));
