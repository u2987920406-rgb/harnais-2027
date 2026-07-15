/**
 * WebTool — Le cortex peut chercher sur le web et extraire du contenu.
 *
 * Utilise DuckDuckGo Lite (pas de clé API, pas de dépendance) pour la recherche.
 * Utilise fetch direct pour l'extraction de pages.
 *
 * Risque: safe (lecture seule).
 */

import { Tool, ToolResult } from './registry.js';

async function search(params: Record<string, any>): Promise<ToolResult> {
  const start = Date.now();
  try {
    const query = params.query as string;
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) {
      return {
        success: false, output: '', error: `HTTP ${res.status}`,
        durationMs: Date.now() - start,
      };
    }

    const html = await res.text();

    // DuckDuckGo Lite: les résultats sont dans des <a class="result-link">
    const links: { title: string; url: string; snippet: string }[] = [];
    const linkRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
    const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>(.*?)<\/td>/gi;

    let match: RegExpExecArray | null;
    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(match[1].replace(/<[^>]*>/g, '').trim());
    }

    let i = 0;
    while ((match = linkRegex.exec(html)) !== null) {
      const linkUrl = match[1];
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      if (linkUrl && title) {
        links.push({ title, url: linkUrl, snippet: snippets[i] ?? '' });
        i++;
      }
      if (links.length >= 5) break;
    }

    const output = links.length > 0
      ? links.map((l, idx) => `[${idx + 1}] ${l.title}\n    ${l.url}\n    ${l.snippet}`).join('\n\n')
      : 'Aucun résultat';

    return {
      success: true,
      output,
      data: { count: links.length, query },
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false, output: '', error: err.message,
      durationMs: Date.now() - start,
    };
  }
}

async function extract(params: Record<string, any>): Promise<ToolResult> {
  const start = Date.now();
  try {
    const url = params.url as string;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return {
        success: false, output: '', error: `HTTP ${res.status}`,
        durationMs: Date.now() - start,
      };
    }

    const html = await res.text();

    // Strip tags basique
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

    const truncated = text.length > 6000;
    return {
      success: true,
      output: truncated ? text.slice(0, 6000) + '\n...[tronqué]' : text,
      data: { url, length: text.length, truncated },
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false, output: '', error: err.message,
      durationMs: Date.now() - start,
    };
  }
}

export function createWebTools(): Tool[] {
  return [
    {
      name: 'web_search',
      description: 'Rechercher sur le web (DuckDuckGo). Retourne 5 résultats avec titre, URL, snippet.',
      risk: 'safe',
      parameters: [
        { name: 'query', type: 'string', description: 'Requête de recherche', required: true },
      ],
      execute: search,
    },
    {
      name: 'web_extract',
      description: 'Extraire le contenu texte d\'une page web.',
      risk: 'safe',
      parameters: [
        { name: 'url', type: 'string', description: 'URL de la page à extraire', required: true },
      ],
      execute: extract,
    },
  ];
}