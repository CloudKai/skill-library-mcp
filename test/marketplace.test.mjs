import { copyStarterLibrary } from './fixture-library.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,readFile,writeFile,rm,access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createMcpExpressApp} from '@modelcontextprotocol/sdk/server/express.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {z} from 'zod';
import { SkillLibrary } from '../dist/library/skill-library.js';
import { hash } from '../dist/shared/hash.js';
import {startHttp} from '../dist/http.js';
import {MarketplaceClient,saveMarketplacePackage} from '../dist/marketplace/client.js';
const commit='a'.repeat(40);
const contents='---\nname: example\ndescription: A package used to verify installation.\n---\nFollow these example instructions.\n';
const file=(name,text)=>({path:name,encoding:'base64',content:Buffer.from(text).toString('base64'),size_bytes:Buffer.byteLength(text),sha256:hash(Buffer.from(text))});
const manifest=()=>({source:'owner/repo',slug:'example',path:'skills/example',commit,standalone:true,files:[file('SKILL.md',contents),file('references/read.md','Supporting reference'),file('LICENSE','Attribution retained')]});
const close=s=>new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve()));
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'market-integration-')),lib=path.join(root,'library'),projectRoot=path.join(root,'project');await copyStarterLibrary(lib);await mkdir(projectRoot);
 let calls=[];const discovery=createMcpExpressApp({host:'127.0.0.1'});discovery.post('/mcp',async(req,res)=>{const server=new McpServer({name:'fixture-discovery',version:'1'});server.registerTool('get_marketplace_skill',{inputSchema:z.object({source:z.string(),skill:z.string(),path:z.string().optional(),commit:z.string().optional(),include_files:z.boolean().optional()})},async args=>{calls.push(args);const data=manifest();data.commit=args.commit??commit;if(data.commit==='b'.repeat(40))data.files[0]=file('SKILL.md',contents.replace('Follow these example instructions.','Use the reviewed updated workflow.'));return{structuredContent:data,content:[{type:'text',text:JSON.stringify(data)}]};});for(const name of ['list_rankings','search_marketplace'])server.registerTool(name,{inputSchema:z.object({view:z.string().optional(),query:z.string().optional(),page:z.number(),limit:z.number(),group_by:z.literal('repository')})},async args=>{calls.push({tool:name,args});const data={items:[{source:'owner/repo',name:'owner/repo',kind:'repository',sampled_skill_count:2}],next_page:args.page+1};return{structuredContent:data,content:[{type:'text',text:JSON.stringify(data)}]};});const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});res.on('close',()=>{void transport.close();void server.close();});await server.connect(transport);await transport.handleRequest(req,res,req.body);});
 const upstream=await new Promise(resolve=>{const s=discovery.listen(0,'127.0.0.1',()=>resolve(s));});const library=await SkillLibrary.load(lib);const app=await startHttp(library,0,new MarketplaceClient(`http://127.0.0.1:${upstream.address().port}/mcp`));const base=`http://127.0.0.1:${app.address().port}`;const state=await(await fetch(`${base}/api/state`)).json();const headers={'Content-Type':'application/json','X-Skill-Library-Token':state.csrf_token};const project=await(await fetch(`${base}/api/projects`,{method:'POST',headers,body:JSON.stringify({name:'Market fixture',path:projectRoot})})).json();
 return{root,library,base,headers,project,projectRoot,calls,async end(){await close(app);await close(upstream);await rm(root,{recursive:true,force:true});}};
}
test('website → discovery MCP → pinned import → enable → scoped library MCP',async()=>{
 const f=await fixture();const client=new Client({name:'install-flow',version:'1'});try{
 const body={source:'owner/repo',skill:'example',path:'skills/example',commit,project_id:f.project.id};
 assert.equal((await fetch(`${f.base}/api/marketplace/install`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,403);
 let response=await fetch(`${f.base}/api/marketplace/install`,{method:'POST',headers:f.headers,body:JSON.stringify(body)});assert.equal(response.status,201);const saved=await response.json();assert.equal(saved.already_installed,false);assert.deepEqual(f.calls[0],{source:'owner/repo',skill:'example',path:'skills/example',commit,include_files:true});
 let state=await(await fetch(`${f.base}/api/state`)).json();assert.equal(state.skills.length,5);assert.deepEqual(state.projects.find(x=>x.id===f.project.id).enabled_skills,[]);
 const imported=await SkillLibrary.load(f.library.directory);assert.equal(imported.get(saved.skill_id).source.commit,commit);assert.equal(imported.read(saved.skill_id,imported.get(saved.skill_id).revision,'LICENSE').content,'Attribution retained');
 response=await fetch(`${f.base}/api/marketplace/install`,{method:'POST',headers:f.headers,body:JSON.stringify({...body,enabled:true,targets:['codex','claude-code','cursor'],root:f.projectRoot})});assert.equal(response.status,201);assert.equal((await response.json()).already_installed,true);
 for(const folder of ['.agents','.claude','.cursor'])assert.equal(await readFile(path.join(f.projectRoot,folder,'skills/example/SKILL.md'),'utf8'),contents);
 await client.connect(new StreamableHTTPClientTransport(new URL(`${f.base}/mcp?project=${f.project.id}`)));assert.equal((await client.callTool({name:'list_skills',arguments:{}})).structuredContent.skills[0].skill_id,saved.skill_id);
 state=await(await fetch(`${f.base}/api/state`)).json();const p=state.projects.find(x=>x.id===f.project.id);response=await fetch(`${f.base}/api/projects/${p.id}/skills`,{method:'PATCH',headers:f.headers,body:JSON.stringify({skill_id:saved.skill_id,enabled:false,expected_revision:p.revision})});assert.equal(response.status,200);assert.equal((await client.callTool({name:'list_skills',arguments:{}})).structuredContent.skills.length,0);assert.equal(await access(path.join(f.projectRoot,'.agents/skills/example')).then(()=>true,()=>false),false);
 }finally{await client.close();await f.end();}
});
test('native conflicts report a saved library package without partial activation',async()=>{const f=await fixture();try{await mkdir(path.join(f.projectRoot,'.claude/skills/example'),{recursive:true});await writeFile(path.join(f.projectRoot,'.claude/skills/example/SKILL.md'),'existing');const response=await fetch(`${f.base}/api/marketplace/install`,{method:'POST',headers:f.headers,body:JSON.stringify({source:'owner/repo',skill:'example',commit,project_id:f.project.id,enabled:true,targets:['codex','claude-code'],root:f.projectRoot})});assert.equal(response.status,207);const result=await response.json();assert.equal(result.saved,true);assert.equal(result.native_error.code,'NATIVE_CONFLICT');assert.equal(await access(path.join(f.projectRoot,'.agents/skills/example')).then(()=>true,()=>false),false);assert.equal(await readFile(path.join(f.projectRoot,'.claude/skills/example/SKILL.md'),'utf8'),'existing');assert.equal((await(await fetch(`${f.base}/api/state`)).json()).skills.length,5);}finally{await f.end();}});
test('installer rejects changed commits, checksums, traversal, reserved and duplicate paths',async()=>{const f=await fixture();try{const input={source:'owner/repo',skill:'example',commit,path:'skills/example'};for(const [mutate,code] of [[d=>d.commit='b'.repeat(40),'SOURCE_CHANGED'],[d=>d.files[0].sha256='0'.repeat(64),'CONTENT_INTEGRITY_ERROR'],[d=>d.files[0].path='../escape','INVALID_PACKAGE'],[d=>d.files[0].path='.skill-library-owner.json','INVALID_PACKAGE'],[d=>d.files.push(d.files[0]),'INVALID_PACKAGE']]){const data=manifest();mutate(data);await assert.rejects(saveMarketplacePackage(f.library,input,data),{code});}assert.equal((await SkillLibrary.load(f.library.directory)).catalog().length,4);}finally{await f.end();}});

test('website requests collection grouping for every ranking and paginated keyword search',async()=>{const f=await fixture();try{
 for(const view of ['most-installed','trending','hot','github-stars']){const response=await fetch(`${f.base}/api/marketplace/rankings?view=${view}&page=2`);assert.equal(response.status,200);assert.equal((await response.json()).items[0].kind,'repository');assert.deepEqual(f.calls.at(-1),{tool:'list_rankings',args:{view,page:2,limit:20,group_by:'repository'}});}
 const response=await fetch(`${f.base}/api/marketplace/search?q=debug&page=1`);assert.equal(response.status,200);assert.equal((await response.json()).next_page,2);assert.deepEqual(f.calls.at(-1),{tool:'search_marketplace',args:{query:'debug',page:1,limit:20,group_by:'repository'}});
 assert.equal((await fetch(`${f.base}/api/marketplace/search?q=debug&page=-1`)).status,400);
}finally{await f.end();}});

test('a reviewed different commit cannot silently activate or replace the saved revision', async () => {
 const f = await fixture();
 try {
  const body = {source:'owner/repo',skill:'example',path:'skills/example',commit,project_id:f.project.id};
  const saved = await (await fetch(`${f.base}/api/marketplace/install`, {method:'POST',headers:f.headers,body:JSON.stringify(body)})).json();
  const imported = await SkillLibrary.load(f.library.directory);
  assert.equal(imported.get(saved.skill_id).requirements_assessment, 'unknown');
  assert.equal(imported.search({query:'example',capabilities:['shell','web']}).matches.find(x=>x.skill_id===saved.skill_id).compatibility, 'unknown');
  const response = await fetch(`${f.base}/api/marketplace/install`, {method:'POST',headers:f.headers,body:JSON.stringify({...body,commit:'b'.repeat(40),enabled:true})});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'UPDATE_REVIEW_REQUIRED');
  const state = await (await fetch(`${f.base}/api/state`)).json();
  assert.deepEqual(state.projects.find(p=>p.id===f.project.id).enabled_skills, []);
  assert.equal(state.skills.find(x=>x.skill_id===saved.skill_id).source.commit, commit);
  assert.equal((await SkillLibrary.load(f.library.directory)).get(saved.skill_id).source.commit, commit);
 } finally { await f.end(); }
});

test('explicit update previews changed files, publishes the reviewed commit, and can roll back', async () => {
 const f=await fixture();
 const post=(route,body)=>fetch(f.base+route,{method:'POST',headers:f.headers,body:JSON.stringify(body)});
 try {
  const saved=await(await post('/api/marketplace/install',{source:'owner/repo',skill:'example',path:'skills/example',commit})).json();
  const skill=await fetch(`${f.base}/api/skill?id=${encodeURIComponent(saved.skill_id)}`).then(r=>r.json());
  const response=await post('/api/skills/update/preview',{skill_id:saved.skill_id,commit:'b'.repeat(40),expected_revision:skill.revision});
  assert.equal(response.status,200);
  const plan=await response.json();
  assert.equal(plan.files.find(f=>f.path==='SKILL.md').change,'modified');
  assert.match(plan.files.find(f=>f.path==='SKILL.md').preview.before,/Follow these example instructions/);
  assert.match(plan.files.find(f=>f.path==='SKILL.md').preview.after,/reviewed updated workflow/);
  const updated=await post('/api/skills/update',{plan_id:plan.plan_id});
  assert.equal(updated.status,200);
  const current=await fetch(`${f.base}/api/skill?id=${encodeURIComponent(saved.skill_id)}`).then(r=>r.json());
  assert.equal(current.source.commit,'b'.repeat(40));
  assert.match(current.instructions,/reviewed updated workflow/);
  const rollback=await post('/api/skills/rollback',{skill_id:saved.skill_id,expected_revision:current.revision});
  assert.equal(rollback.status,200);
  const original=await fetch(`${f.base}/api/skill?id=${encodeURIComponent(saved.skill_id)}`).then(r=>r.json());
  assert.equal(original.source.commit,commit);
  assert.equal(original.instructions,contents);
 }finally{await f.end();}
});
