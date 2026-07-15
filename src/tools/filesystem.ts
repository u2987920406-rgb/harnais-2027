/**
 * FilesystemTool — Le cortex peut lire, écrire, lister, chercher des fichiers.
 *
 * Risque: safe pour read/list, moderate pour write, dangerous pour delete.
 * Le cortex peut explorer le projet, lire du code, écrire des modifications.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, relative, extname } from 'path';
import { Tool, ToolResult } from './registry.js';

const t0 = () => Date.now();
const ok = (output: string, data?: any): ToolResult => ({ success: true, output, data, durationMs: 0 });
const fail = (error: string): ToolResult => ({ success: false, output: '', error, durationMs: 0 });

async function read(params: Record<string, any>): Promise<ToolResult> {
  const start = t0();
  try {
    const path = params.path as string;
    if (!existsSync(path)) return { ...fail(`Fichier introuvable: ${path}`), durationMs: t0() - start };
    const content = readFileSync(path, 'utf-8');
    const stat = statSync(path);
    const lines = content.split('\n').length;
    return {
      success: true,
      output: content.slice(0, 8000),
      data: { path, lines, size: stat.size },
      durationMs: t0() - start,
    };
  } catch (err: any) {
    return { ...fail(err.message), durationMs: t0() - start };
  }
}

async function write(params: Record<string, any>): Promise<ToolResult> {
  const start = t0();
  try {
    const path = params.path as string;
    const content = params.content as string;
    const dir = path.substring(0, path.lastIndexOf('/')) || path.substring(0, path.lastIndexOf('\\'));
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, content, 'utf-8');
    return {
      success: true,
      output: `Écrit: ${path} (${content.length} octets)`,
      data: { path, bytes: content.length },
      durationMs: t0() - start,
    };
  } catch (err: any) {
    return { ...fail(err.message), durationMs: t0() - start };
  }
}

async function list(params: Record<string, any>): Promise<ToolResult> {
  const start = t0();
  try {
    const dir = params.path as string;
    if (!existsSync(dir)) return { ...fail(`Répertoire introuvable: ${dir}`), durationMs: t0() - start };
    const entries = readdirSync(dir, { withFileTypes: true });
    const items = entries.map(e => {
      const fullPath = join(dir, e.name);
      const isDir = e.isDirectory();
      const size = isDir ? 0 : statSync(fullPath).size;
      return `${isDir ? '[D]' : '[F]'} ${e.name} (${size}o)`;
    });
    return {
      success: true,
      output: items.join('\n'),
      data: { count: items.length, dir },
      durationMs: t0() - start,
    };
  } catch (err: any) {
    return { ...fail(err.message), durationMs: t0() - start };
  }
}

async function search(params: Record<string, any>): Promise<ToolResult> {
  const start = t0();
  try {
    const dir = params.path as string;
    const pattern = params.pattern as string;
    if (!existsSync(dir)) return { ...fail(`Répertoire introuvable: ${dir}`), durationMs: t0() - start };

    const results: string[] = [];
    const regex = new RegExp(pattern, 'i');
    const maxDepth = (params.maxDepth as number) ?? 2;

    const scan = (d: string, depth: number) => {
      if (depth > maxDepth || results.length > 50) return;
      const entries = readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('node_modules') || entry.name.startsWith('.git')) continue;
        const full = join(d, entry.name);
        if (entry.isDirectory()) {
          scan(full, depth + 1);
        } else {
          if (regex.test(entry.name)) {
            results.push(relative(dir, full));
          }
        }
      }
    }
    scan(dir, 0);

    return {
      success: true,
      output: results.length > 0 ? results.join('\n') : 'Aucun résultat',
      data: { count: results.length, pattern },
      durationMs: t0() - start,
    };
  } catch (err: any) {
    return { ...fail(err.message), durationMs: t0() - start };
  }
}

export function createFilesystemTools(): Tool[] {
  return [
    {
      name: 'file_read',
      description: 'Lire le contenu d\'un fichier',
      risk: 'safe',
      parameters: [
        { name: 'path', type: 'string', description: 'Chemin absolu ou relatif du fichier', required: true },
      ],
      execute: read,
    },
    {
      name: 'file_write',
      description: 'Écrire du contenu dans un fichier (crée ou écrase)',
      risk: 'moderate',
      parameters: [
        { name: 'path', type: 'string', description: 'Chemin du fichier', required: true },
        { name: 'content', type: 'string', description: 'Contenu à écrire', required: true },
      ],
      execute: write,
    },
    {
      name: 'file_list',
      description: 'Lister le contenu d\'un répertoire',
      risk: 'safe',
      parameters: [
        { name: 'path', type: 'string', description: 'Chemin du répertoire', required: true },
      ],
      execute: list,
    },
    {
      name: 'file_search',
      description: 'Chercher des fichiers par pattern (regex) dans un répertoire',
      risk: 'safe',
      parameters: [
        { name: 'path', type: 'string', description: 'Répertoire de recherche', required: true },
        { name: 'pattern', type: 'string', description: 'Pattern regex à matcher', required: true },
        { name: 'maxDepth', type: 'number', description: 'Profondeur max de recherche', required: false, default: 2 },
      ],
      execute: search,
    },
  ];
}