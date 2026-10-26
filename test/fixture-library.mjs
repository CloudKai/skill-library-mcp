import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../library/', import.meta.url));
const starterIds = new Set(['mattpocock/research','mattpocock/diagnosing-bugs','mattpocock/code-review','pbakaus/impeccable']);
// Tests exercise a stable starter catalog, independently of owner imports/selections.
export async function copyStarterLibrary(destination) {
  const catalog = JSON.parse(await readFile(path.join(source,'catalog.json'),'utf8'));
  const skills = catalog.skills.filter(x=>starterIds.has(x.skill_id));
  if(skills.length!==starterIds.size)throw new Error('Starter packages are missing from the development library.');
  await mkdir(destination,{recursive:true});
  for(const skill of skills)await cp(path.join(source,skill.package),path.join(destination,skill.package),{recursive:true});
  await writeFile(path.join(destination,'catalog.json'),JSON.stringify({version:1,skills}));
  await writeFile(path.join(destination,'projects.json'),JSON.stringify({version:1,projects:[]}));
}
