import { hash } from './library.js';
export const sampleProjects = [
  { id: 'example-web', name: 'Example web project', path: '', enabled_skills: ['demo/plan-a-change','demo/review-a-change'], native_bindings: [] },
  { id: 'example-api', name: 'Example API project', path: '', enabled_skills: ['demo/debug-an-issue'], native_bindings: [] },
].map(project => ({ ...project, revision: hash(JSON.stringify(project)) }));
export function sampleInventory() {
  const at = '2026-01-01T00:00:00.000Z';
  const groups = [{ id: 'global', kind: 'global', name: 'Global installations', count: 2 },{ id: 'project:sample-web',kind:'project',name:'Example web project',path:'/example/projects/web',count:2 }];
  const origin = (name: string, project = false) => ({ platform: project ? 'cursor' : 'shared', scope: project ? 'project' : 'global', path: project ? `/example/projects/web/.cursor/skills/${name}` : `/example/global/skills/${name}`, ...(project ? { project:'Example web project',project_path:'/example/projects/web' } : {}),registered:true,group_id:project?'project:sample-web':'global',last_seen:at });
  return { last_scan:{at,complete:false,warnings:['Illustrative sample inventory. No computer or project folders were scanned.'],coverage:'Synthetic demonstration data only; these paths do not refer to a real computer.'},groups,items:[
    {id:'saved:demo/plan-a-change',skill_id:'demo/plan-a-change',name:'plan-a-change',description:'Outline a small change and its verification steps.',folder:'Example workflows',status:'installed',origins:[origin('plan-a-change'),origin('plan-a-change',true)]},
    {id:'saved:demo/review-a-change',skill_id:'demo/review-a-change',name:'review-a-change',description:'Review a change for correctness and maintainability.',folder:'Example workflows',status:'installed',origins:[origin('review-a-change',true)]},
    {id:'saved:demo/debug-an-issue',skill_id:'demo/debug-an-issue',name:'debug-an-issue',description:'Investigate an issue with evidence.',folder:'Example workflows',status:'installed',origins:[origin('debug-an-issue')]},
  ]};
}
