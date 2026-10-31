import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { stdioEntrypoint } from '../shared/paths.js';
import { LibraryError } from '../shared/library-error.js';
import { version } from '../shared/version.js';
import { z } from 'zod';

/** Probe the same local executable/configuration supplied to an external client. */
export async function checkProject(directory: string, projectId: string, expectedIds: string[], disabledId?: string) {
  const client = new Client({ name: 'skill-library-setup-check', version });
  const transport = new StdioClientTransport({ command: process.execPath, args: [stdioEntrypoint], env: {
    ...getDefaultEnvironment(), SKILL_LIBRARY_DIR: directory, SKILL_LIBRARY_PROJECT: projectId,
  }, stderr: 'pipe' });
  // Drain diagnostics without returning private paths or package text to the browser.
  transport.stderr?.on('data', () => {});
  const invoke = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 10000 });
    if (result.isError || !result.structuredContent) throw new LibraryError('CHECK_FAILED', 'The local MCP server could not retrieve the selected package. Refresh and retry.');
    return result.structuredContent;
  };
  try {
    await client.connect(transport, { timeout: 10000 });
    const tools = await client.listTools();
    const required = ['list_skills', 'search_skills', 'get_skill', 'read_skill_file'];
    if (!required.every(name => tools.tools.some(tool => tool.name === name))) throw new LibraryError('CHECK_FAILED', 'The local MCP server did not advertise all four library tools.');
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const result = z.object({ skills: z.array(z.object({ skill_id: z.string() })), next_cursor: z.string().nullable() }).parse(await invoke('list_skills', { limit: 50, ...(cursor ? { cursor } : {}) }));
      ids.push(...result.skills.map(skill => skill.skill_id));
      cursor = result.next_cursor ?? undefined;
      if (ids.length > 1000) throw new LibraryError('CHECK_FAILED', 'The MCP response exceeded the library limit.');
    } while (cursor);
    if (JSON.stringify([...ids].sort()) !== JSON.stringify([...expectedIds].sort())) throw new LibraryError('REVISION_CONFLICT', 'The available skills changed during this check. Refresh and retry.');
    if (ids.length) {
      const skill = z.object({ skill_id: z.string(), revision: z.string(), manifest: z.array(z.object({ path: z.string() })).min(1) }).parse(await invoke('get_skill', { skill_id: ids[0] }));
      const file = skill.manifest.find(item => item.path !== 'SKILL.md') ?? skill.manifest[0]!;
      await invoke('read_skill_file', { skill_id: skill.skill_id, revision: skill.revision, path: file.path });
    }
    if (disabledId) {
      const hidden = await client.callTool({ name: 'get_skill', arguments: { skill_id: disabledId } }, undefined, { timeout: 10000 });
      const hiddenError = z.object({ error: z.object({ code: z.literal('SKILL_NOT_FOUND') }) }).safeParse(hidden.structuredContent);
      if (!hidden.isError || !hiddenError.success) throw new LibraryError('CHECK_FAILED', 'A disabled skill was unexpectedly available.');
    }
    return { status: 'passed', transport: 'stdio', checked_at: new Date().toISOString(), available_skills: ids.length, retrieval_checked: ids.length > 0, disabled_skill_checked: Boolean(disabledId), external_client_verified: false };
  } catch (error) {
    if (error instanceof LibraryError) throw error;
    throw new LibraryError('CHECK_FAILED', 'The local stdio check could not finish. Check the server terminal, refresh, and retry.');
  } finally { await client.close().catch(() => {}); }
}
