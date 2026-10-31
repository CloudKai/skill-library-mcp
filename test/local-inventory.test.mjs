import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, cp, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFixtureLibrary } from './fixture-library.mjs';
import { LocalInventory } from '../dist/local-skills/inventory.js';
import { LocalSkillScanner, scanSchema } from '../dist/local-skills/scanner.js';
import { SkillLibrary } from '../dist/library/skill-library.js';
import { startHttp } from '../dist/http.js';
async function fixture() {
 const root=await mkdtemp(path.join(os.tmpdir(),'inventory-test-'));const home=path.join(root,'home'),directory=path.join(root,'library');await mkdir(home);await createFixtureLibrary(directory);return {root,home,directory,library:await SkillLibrary.load(directory),scanner:new LocalSkillScanner(home,{}),async end(){await rm(root,{recursive:true,force:true});}};
}
async function skill(parent,name) {const directory=path.join(parent,name);await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'SKILL.md'),`---\nname: ${name}\ndescription: Example ${name} workflow.\n---\nInstructions.\n`);return directory;}
const input = args => scanSchema.parse(args||{});
test('persists globals and same-named project roots independently and groups deduplicated packages under every source',async()=>{
 const f=await fixture();try{const first=path.join(f.root,'one/app'),second=path.join(f.root,'two/app');const global=await skill(path.join(f.home,'.agents/skills'),'example');await cp(global,path.join(first,'.cursor/skills/example'),{recursive:true});await cp(global,path.join(second,'.claude/skills/example'),{recursive:true});
 const report=await f.scanner.scan(input({project_directories:[first,second]}),f.library,[]);assert.equal(report.items.length,1);const view=await new LocalInventory(f.directory).view(f.library);assert.equal(view.items.length,1);assert.equal(view.groups.length,3);assert.deepEqual(view.groups.map(g=>g.count),[1,1,1]);assert.equal(new Set(view.groups.map(g=>g.id)).size,3);assert.equal(view.groups.filter(g=>g.kind==='project'&&g.name==='app').length,2);assert.equal(view.items[0].origins.length,3);assert.ok(view.items[0].origins.filter(o=>o.project_path).every(o=>path.isAbsolute(o.project_path)));assert.equal(view.items[0].status,'ready');assert.deepEqual(view,await new LocalInventory(f.directory).view(await SkillLibrary.load(f.directory)));assert.equal(f.library.catalog().length,4);assert.ok(!JSON.stringify(f.library.catalog()).includes('project_path'));
 }finally{await f.end();}
});
test('a narrower complete scan retires removed covered origins while preserving unscanned projects; partial scans retain history',async()=>{
 const f=await fixture();try{const project=path.join(f.root,'project');const global=await skill(path.join(f.home,'.agents/skills'),'global-example');await skill(path.join(project,'.cursor/skills'),'project-example');await f.scanner.scan(input({project_directories:[project]}),f.library,[]);await rm(global,{recursive:true});await f.scanner.scan(input({scope:'global'}),f.library,[]);const store=new LocalInventory(f.directory);let view=await store.view(f.library);assert.equal(view.groups.find(g=>g.id==='global').count,0);assert.deepEqual(view.items.map(x=>x.name),['project-example']);const before=view.items[0].origins[0].last_seen;
 const partial={scan_id:'partial',scanned_at:'2030-01-01T00:00:00.000Z',expires_at:'2030-01-01T00:15:00.000Z',items:[],locations:[{platform:'cursor',scope:'project',path:path.join(project,'.cursor/skills'),status:'partial'}],warnings:['Unreadable nested directory'],complete:false,coverage:'Partial'};await store.record(partial);view=await store.view(f.library);assert.equal(view.items.length,1);assert.equal(view.items[0].origins[0].last_seen,before);assert.equal(view.last_scan.complete,false);
 }finally{await f.end();}
});
test('import updates saved status across origins without creating project profiles or changing activation',async()=>{
 const f=await fixture();try{const project=path.join(f.root,'project');const global=await skill(path.join(f.home,'.agents/skills'),'example');await cp(global,path.join(project,'.agents/skills/example'),{recursive:true});const before=await readFile(path.join(f.directory,'projects.json'),'utf8');const report=await f.scanner.scan(input({project_directories:[project]}),f.library,[]);const saved=await f.scanner.import(report.scan_id,[report.items[0].id],f.library);const view=await new LocalInventory(f.directory).view(await SkillLibrary.load(f.directory));assert.equal(view.items.length,1);assert.equal(view.items[0].status,'installed');assert.equal(view.items[0].skill_id,saved.outcomes[0].skill_id);assert.equal(view.items[0].origins.length,2);assert.equal(await readFile(path.join(f.directory,'projects.json'),'utf8'),before);assert.ok(!f.library.list({}).skills.some(s=>'origins' in s));
 }finally{await f.end();}
});
test('owner inventory API survives server recreation, reports unsupported packages and preserves source paths locally',async()=>{
 const f=await fixture();let server;try{const project=path.join(f.root,'project');await skill(path.join(project,'.cursor/skills'),'valid-example');const bad=await skill(path.join(f.home,'.agents/skills'),'bad-example');await writeFile(path.join(bad,'SKILL.md'),'Unsupported');server=await startHttp(f.library,0,undefined,f.scanner);let base=`http://127.0.0.1:${server.address().port}`;const state=await(await fetch(base+'/api/state')).json();const result=await fetch(base+'/api/local-skills/scan',{method:'POST',headers:{'Content-Type':'application/json','X-Skill-Library-Token':state.csrf_token},body:JSON.stringify({project_directories:[project]})});assert.equal(result.status,200);await new Promise(r=>server.close(r));server=await startHttp(await SkillLibrary.load(f.directory),0);base=`http://127.0.0.1:${server.address().port}`;const view=await(await fetch(base+'/api/local-skills/inventory')).json();const awaitProject=await realpath(project);assert.equal(view.items.length,2);assert.ok(view.items.some(x=>x.status==='unsupported'));assert.ok(view.groups.some(x=>x.path===awaitProject));assert.equal((await fetch(base+'/api/local-skills/inventory',{headers:{Origin:'https://foreign.example'}})).status,403);
 }finally{if(server)await new Promise(r=>server.close(r));await f.end();}
});
test('corrupt inventory is reported and preserved instead of silently replacing user data',async()=>{
 const f=await fixture();try{await mkdir(path.join(f.directory,'.local'));const file=path.join(f.directory,'.local/inventory.json');await writeFile(file,'not-json');await assert.rejects(new LocalInventory(f.directory).view(f.library));await assert.rejects(f.scanner.scan(input(),f.library,[]));assert.equal(await readFile(file,'utf8'),'not-json');}finally{await f.end();}
});
