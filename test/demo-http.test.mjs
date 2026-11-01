import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createDemoApp} from '../dist/demo/http-app.js';
import {MarketplaceClient} from '../dist/marketplace/client.js';
async function listen(app){return await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.on('error',reject);});}
test('cloud demo exposes only synthetic library and inventory and rejects all local writes',async()=>{
 const calls=[];const app=createDemoApp({async call(name,args){calls.push({name,args});return {items:[],provider:'fixture'};}});const server=await listen(app);const base=`http://127.0.0.1:${server.address().port}`;
 try{const state=await(await fetch(base+'/api/state')).json();assert.equal(state.mode,'demo');assert.equal(state.skills.length,3);assert.ok(state.skills.every(s=>s.skill_id.startsWith('demo/')));assert.equal(state.projects.length,1);assert.equal(state.projects[0].name,'Example');assert.ok(state.projects.every(p=>p.path===''));const inventory=await(await fetch(base+'/api/local-skills/inventory')).json();assert.deepEqual(inventory.groups,[]);assert.ok(inventory.items.every(i=>i.origins.every(o=>o.path.startsWith('/example/'))));for(const url of ['/api/local-skills/scan','/api/local-skills/import','/api/marketplace/install','/api/projects','/api/projects/example-web/skills','/api/projects/example-web/native']){const response=await fetch(base+url,{method:url.endsWith('skills')||url.endsWith('native')?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);assert.equal((await response.json()).error.code,'LOCAL_APP_REQUIRED');}const connection=await(await fetch(base+'/api/projects/example-web/connection')).json();assert.match(connection.toml,/absolute\/path\/to/);assert.ok(!connection.toml.includes(process.cwd()));await fetch(base+'/api/marketplace/rankings?view=hot');assert.equal(calls[0].name,'list_rankings');assert.equal(calls[0].args.group_by,'repository');assert.equal((await(await fetch(base+'/api/state')).json()).projects[0].enabled_skills.length,2);
 }finally{await new Promise(r=>server.close(r));}
});
test('public library MCP returns sample skills and fails closed for unknown project scopes',async()=>{
 const server=await listen(createDemoApp({async call(){return {};}}));const base=`http://127.0.0.1:${server.address().port}`;const client=new Client({name:'demo-test',version:'1'});
 try{await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp?project=example-web')));const list=await client.callTool({name:'list_skills',arguments:{}});assert.equal(list.structuredContent.skills.length,2);assert.ok(list.structuredContent.skills.every(s=>s.skill_id.startsWith('demo/')));const disabled=await client.callTool({name:'get_skill',arguments:{skill_id:'demo/debug-an-issue'}});assert.equal(disabled.isError,true);assert.equal((await fetch(base+'/mcp?project=private-project',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
 }finally{await client.close();await new Promise(r=>server.close(r));}
});
test('normal local discovery configuration still rejects remote and credential-bearing URLs',async()=>{
 for(const endpoint of ['https://example.vercel.app/mcp','http://remote.example/mcp','http://user:password@127.0.0.1:3334/mcp'])await assert.rejects(new MarketplaceClient(endpoint).call('list_rankings',{view:'trending'}),{code:'MARKETPLACE_UNAVAILABLE'});
});
