import express from 'express';
import { demoLibrary, publicDirectory } from '../shared/paths.js';
import { z } from 'zod';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SkillLibrary } from '../library/skill-library.js';
import { LibraryError } from '../shared/library-error.js';
import { createServer } from '../mcp/server.js';
import { detailSchema, MarketplaceClient } from '../marketplace/client.js';
import { sampleProjects, sampleInventory } from './data.js';
import { version } from '../shared/version.js';

/** Separate cloud entry point. Never loads owner catalogs, profiles, inventory or native destinations. */
export function createDemoApp(market = new MarketplaceClient(process.env.SKILL_MARKETPLACE_URL, { hosted:true,serviceToken:process.env.MARKETPLACE_SERVICE_TOKEN }), providedLibrary?: SkillLibrary) {
  const library = providedLibrary ? Promise.resolve(providedLibrary) : SkillLibrary.load(demoLibrary);
  const app = express(); app.disable('x-powered-by'); app.use(express.json({ limit:'32kb' }));
  app.use((_req,res,next) => { res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");next(); });
  app.get('/health',async (_req,res) => res.json({status:'ok',mode:'demo',...(await library).stats()}));
  app.get('/api/capabilities',(_req,res)=>res.json({mode:'demo',scan:false,native_install:false,shared_writes:false}));
  app.get('/api/state',async (_req,res)=>res.json({version,mode:'demo',skills:(await library).catalog(),projects:sampleProjects,csrf_token:'demo'}));
  app.get('/api/local-skills/inventory',(_req,res)=>res.json(sampleInventory()));
  app.get('/api/skill',async(req,res)=>res.json((await library).get(z.string().min(1).max(128).parse(req.query.id))));
  app.get('/api/file',async(req,res)=>{const a=z.object({id:z.string().max(128),revision:z.string().max(128),path:z.string().max(1024)}).strict().parse(req.query);res.json((await library).read(a.id,a.revision,a.path));});
  app.get('/api/projects/:id/connection',(req,res)=>{
    if(!sampleProjects.some(p=>p.id===req.params.id))throw new LibraryError('PROJECT_NOT_FOUND','Choose an example project.');
    const env={SKILL_LIBRARY_PROJECT:'your-project-id',SKILL_LIBRARY_DIR:'/absolute/path/to/library'};
    const example={json:JSON.stringify({mcpServers:{skills:{command:'node',args:['/absolute/path/to/library-server/dist/stdio.js'],env}}},null,2),toml:'[mcp_servers.skills]\ncommand = "node"\nargs = ["/absolute/path/to/library-server/dist/stdio.js"]\n\n[mcp_servers.skills.env]\nSKILL_LIBRARY_PROJECT = "your-project-id"\nSKILL_LIBRARY_DIR = "/absolute/path/to/library"\n',http_path:'/mcp?project=your-project-id'};
    res.json({project_id:req.params.id,...example,example});
  });
  // Best-effort per-instance abuse bound; provider limits and caches still apply.
  const requests=new Map<string,{since:number;count:number}>();
  app.use('/api/marketplace',(req,res,next)=>{const key=req.ip||'unknown',now=Date.now();let item=requests.get(key);if(!item||now-item.since>=60000){item={since:now,count:0};requests.set(key,item);}if(requests.size>1000)requests.delete(requests.keys().next().value!);if(++item.count>40){res.setHeader('Retry-After','60');res.status(429).json({error:{code:'RATE_LIMITED',message:'Please wait a minute before requesting more marketplace data.'}});return;}next();});
  app.get('/api/marketplace/rankings',async(req,res)=>{const a=z.object({view:z.enum(['most-installed','trending','hot','github-stars']),page:z.coerce.number().int().min(0).max(100).default(0)}).strict().parse(req.query);res.json(await market.call('list_rankings',{...a,limit:20,group_by:'repository'}));});
  app.get('/api/marketplace/search',async(req,res)=>{const a=z.object({q:z.string().trim().min(2).max(200),page:z.coerce.number().int().min(0).max(100).default(0)}).strict().parse(req.query);res.json(await market.call('search_marketplace',{query:a.q,page:a.page,limit:20,group_by:'repository'}));});
  app.get('/api/marketplace/repository',async(req,res)=>res.json(await market.call('list_repository_skills',detailSchema.pick({source:true,commit:true}).parse(req.query))));
  app.get('/api/marketplace/skill',async(req,res)=>res.json(await market.call('get_marketplace_skill',detailSchema.parse(req.query))));
  app.use('/api',(_req,res)=>res.status(403).json({error:{code:'LOCAL_APP_REQUIRED',message:'This public demo cannot scan computers, install files or save shared project changes. Run the local app for those features.'}}));
  app.post('/mcp',async(req,res)=>{
    const id=req.query.project===undefined?undefined:z.string().parse(req.query.project), project=id?sampleProjects.find(p=>p.id===id):undefined;
    if(id&&!project)throw new LibraryError('PROJECT_NOT_FOUND','Use a valid example project ID.');
    const current=await library,server=createServer(project?current.forSkills(project.enabled_skills,project.id):current),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>{void transport.close();void server.close();});
    await server.connect(transport);await transport.handleRequest(req,res,req.body);
  });
  app.all('/mcp',(_req,res)=>{res.setHeader('Allow','POST');res.status(405).json({error:'Use POST for stateless MCP requests.'});});
  app.use(express.static(publicDirectory));
  app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{const code=error instanceof LibraryError?error.code:error instanceof z.ZodError?'INVALID_INPUT':'INTERNAL_ERROR';res.status(code==='RATE_LIMITED'?429:code==='INVALID_INPUT'?400:code==='PROJECT_NOT_FOUND'?404:503).json({error:{code,message:error instanceof LibraryError?error.message:code==='INVALID_INPUT'?'Check the request values.':'The demo could not complete this request. Please retry shortly.'}});});
  return app;
}
