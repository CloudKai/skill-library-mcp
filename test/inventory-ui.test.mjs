import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { inventoryItems, skillOrigins, sourceSummary, platformName } from '../public/inventory.js';
const inventory={last_scan:{at:'2026-10-26T00:00:00Z',complete:true,warnings:[],coverage:'Known folders'},groups:[{id:'global',name:'Global installations',kind:'global',count:1},{id:'project:one',name:'Example project',kind:'project',path:'/example/project',count:1}],items:[{id:'saved:example/one',skill_id:'example/one',name:'example',description:'Example workflow',folder:'Collection',status:'installed',origins:[{platform:'codex',path:'/example/global/example',group_id:'global',scope:'global',registered:true,last_seen:'2026-10-26T00:00:00Z'},{platform:'cursor',path:'/example/project/.cursor/skills/example',project_path:'/example/project',project:'Example project',group_id:'project:one',scope:'project',registered:true,last_seen:'2026-10-26T00:00:00Z'}]}]};
const script=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .*\n/,'');
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
async function ui(saved=new Map(),demo=false){
 const handlers=new Map(),nodes=new Map(),storage=saved;
 const make=(name)=>({name,value:'',dataset:{},hidden:false,textContent:'',innerHTML:'',disabled:false,open:false,addEventListener(event,fn){handlers.set(`${name}:${event}`,fn);},classList:{toggle(){}},setAttribute(){},querySelectorAll(){return[];},focus(){document.activeElement=this;},getClientRects(){return[{}];},closest(){return null;}});
 for(const id of html.matchAll(/id="([^"]+)"/g))nodes.set('#'+id[1],make(id[1]));nodes.set('#scope-note p',make('scope-note-copy'));
 const document={activeElement:null,querySelector(selector){return nodes.get(selector)||null;},querySelectorAll(){return[];},addEventListener(event,fn){handlers.set('document:'+event,fn);}};
 const state={skills:[{skill_id:'example/one',name:'example',folder:'Collection',description:'Example workflow',tags:[],personal_notes:'',standalone:false,source:{url:'local:fixture',path:'example'}}],projects:[],csrf_token:'token'};
 if(demo){state.mode='demo';state.projects=[{id:'sample-project',name:'Sample project',path:'',enabled_skills:[],native_bindings:[]}];}
 const context={document,inventoryItems,skillOrigins,sourceSummary,platformName,URL,CSS:{escape:x=>x},fetch:async (url,options={})=>{if(options.method)throw Error('Demo must not write to the backend');return {ok:true,json:async()=>url==='/api/state'?state:inventory};},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},setTimeout,clearTimeout,matchMedia:()=>({matches:false})};
 runInNewContext(script,context);await new Promise(r=>setImmediate(r));
 return {nodes,storage,async toggle(id){await context.toggleSkill(id);},async event(id,type,value){if(value!==undefined)nodes.get('#'+id).value=value;const fn=handlers.get(`${id}:${type}`);await fn({target:nodes.get('#'+id)});await new Promise(r=>setImmediate(r));}};
}
test('inventory filtering preserves each location and matches names, platform labels and paths',()=>{
 assert.equal(inventoryItems(inventory).length,1);assert.equal(inventoryItems(inventory,'global')[0].origins.length,1);assert.equal(inventoryItems(inventory,'project:one','cursor').length,1);assert.equal(inventoryItems(inventory,'global','cursor').length,0);assert.equal(inventoryItems(inventory,'all','/example/project').length,1);assert.equal(skillOrigins(inventory,'example/one').length,2);assert.equal(sourceSummary(inventory.items[0].origins),'Global · Project · Codex · Cursor');
});
test('library loads scan groups, switches read-only source views, and restores the view after reload',async()=>{
 const view=await ui();assert.match(view.nodes.get('#inventory-nav').innerHTML,/Global installations/);assert.match(view.nodes.get('#inventory-nav').innerHTML,/Example project/);await view.event('project-select','change','source:project:one');assert.equal(view.nodes.get('#inventory-panel').hidden,false);assert.equal(view.nodes.get('#library-browser').hidden,true);assert.equal(view.nodes.get('#page-title').textContent,'Example project');assert.match(view.nodes.get('#inventory-results').innerHTML,/Cursor/);assert.ok(!view.nodes.get('#inventory-results').innerHTML.includes('data-toggle='));assert.match(view.nodes.get('#inventory-results').innerHTML,/Source locations/);assert.match(view.nodes.get('#inventory-results').innerHTML,/example\/project/);
 const reloaded=await ui(view.storage);assert.equal(reloaded.nodes.get('#page-title').textContent,'Example project');await reloaded.event('inventory-search','input','no match');assert.match(reloaded.nodes.get('#inventory-results').innerHTML,/No matching skills/);await reloaded.event('library-nav','click');assert.equal(reloaded.nodes.get('#inventory-panel').hidden,true);assert.equal(reloaded.nodes.get('#library-browser').hidden,false);assert.equal(reloaded.nodes.get('#page-title').textContent,'All skills');
});

test('public demo selections change only browser storage and survive reload without backend writes',async()=>{
 const view=await ui(new Map(),true);await view.toggle('example/one');assert.deepEqual(JSON.parse(view.storage.get('skill-library-demo-selections'))['sample-project'],['example/one']);assert.match(view.nodes.get('#scope-note p').textContent,/sample MCP endpoint keeps its fixed/);const reloaded=await ui(view.storage,true);assert.match(reloaded.nodes.get('#scope-note p').textContent,/1 of 1/);await reloaded.toggle('example/one');assert.deepEqual(JSON.parse(view.storage.get('skill-library-demo-selections'))['sample-project'],[]);
});
