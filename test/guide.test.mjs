import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../public/guide.js', import.meta.url), 'utf8');
function guide({ mobile = false, hidden = false, open = true } = {}) {
  const handlers = new Map(), frames = [], copied = [], changes = [];
  const on = target => (event, callback) => handlers.set(`${target}:${event}`, callback);
  const controls = Object.fromEntries(['guide-format','guide-code','guide-connection-help','guide-copy-status','guide-copy','sidebar-toggle'].map(id=>[id,{value:'toml',textContent:'',addEventListener:on(id)}]));
  const sidebar = { hidden, scrollTop: 0, getBoundingClientRect: () => ({top:64,bottom:800}) };
  const disclosure = { open, addEventListener:on('disclosure') };
  const sections = ['choose','connect','use','help'].map((id,i)=>({id,offset:[160,1000,1800,3300][i],getBoundingClientRect(){return {top:this.offset-window.scrollY};}}));
  const links = sections.map((section,i)=>({attributes:{href:`#${section.id}`},getAttribute(name){return this.attributes[name];},setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},getBoundingClientRect(){const top=[220,420,620,820][i]-sidebar.scrollTop;return {top,bottom:top+44};}}));
  const window = { scrollY:0,innerHeight:800,addEventListener:on('window') };
  const document = { documentElement:{scrollHeight:3600},querySelector(selector){return selector.startsWith('#') ? (selector==='#app-sidebar' ? sidebar : controls[selector.slice(1)]) : ({'.shell-bar':{getBoundingClientRect:()=>({bottom:64})},'.sidebar-section':disclosure,'.guide-article':{}})[selector];},querySelectorAll:selector=>selector.includes('section')?sections:links };
  runInNewContext(script,{document,window,URL,location:{href:'http://localhost:3333/guide.html?project=private-project#connect'},history:{replaceState(_state,_title,url){changes.push(url);}},navigator:{clipboard:{async writeText(value){copied.push(value);}}},matchMedia:()=>({matches:mobile}),requestAnimationFrame:fn=>frames.push(fn),fetch(){throw Error('The guide must not load owner data.');}});
  const flush = () => { while(frames.length)frames.shift()(); };
  flush();
  return {window,sidebar,disclosure,links,controls,copied,changes,frames,flush,active:()=>links.find(x=>x.attributes['aria-current']==='location')?.attributes.href,event(target,name){handlers.get(`${target}:${name}`)?.();},scroll(y){window.scrollY=y;this.event('window','scroll');flush();},async copy(){await handlers.get('guide-copy:click')();}};
}
test('generic guide works without owner data, removes legacy project selection and copies placeholder formats',async()=>{
 const ui=guide();assert.equal(ui.changes[0],'/guide.html#connect');assert.match(ui.controls['guide-code'].textContent,/your-project-id/);
 for(const format of ['toml','json','http']){ui.controls['guide-format'].value=format;ui.event('guide-format','change');await ui.copy();assert.match(ui.copied.at(-1),/your-project-id/);assert.ok(!ui.copied.at(-1).includes('private-project'));}
 const config=JSON.parse(ui.copied[1]);assert.equal(config.mcpServers.skills.env.SKILL_LIBRARY_DIR,'/absolute/path/to/library');
});
test('sidebar tracks section headings below the sticky header in both scroll directions',()=>{
 const ui=guide();assert.equal(ui.active(),'#choose');ui.scroll(930);assert.equal(ui.active(),'#connect');ui.scroll(1750);assert.equal(ui.active(),'#use');ui.scroll(0);assert.equal(ui.active(),'#choose');assert.equal(ui.links.filter(x=>x.attributes['aria-current']).length,1);
});
test('page end selects a short final section and reveals its link inside the sidebar only',()=>{
 const ui=guide();ui.scroll(2800);assert.equal(ui.active(),'#help');assert.ok(ui.sidebar.scrollTop>0);assert.equal(ui.window.scrollY,2800);ui.scroll(0);assert.ok(ui.links[0].getBoundingClientRect().top>=72);assert.equal(ui.window.scrollY,0);
});
test('hidden, collapsed and inline mobile navigation keep current state without pulling the page into view',()=>{
 for(const options of [{hidden:true},{open:false},{mobile:true}]){const ui=guide(options);ui.scroll(2800);assert.equal(ui.active(),'#help');assert.equal(ui.sidebar.scrollTop,0);assert.equal(ui.window.scrollY,2800);}
 const ui=guide({hidden:true});ui.scroll(2800);ui.sidebar.hidden=false;ui.event('sidebar-toggle','click');ui.flush();assert.ok(ui.sidebar.scrollTop>0);
});
test('scroll tracking batches rapid events and updates after resizing',()=>{
 const ui=guide();ui.window.scrollY=930;ui.event('window','scroll');ui.event('window','scroll');ui.event('window','resize');assert.equal(ui.frames.length,1);ui.flush();assert.equal(ui.active(),'#connect');
});
