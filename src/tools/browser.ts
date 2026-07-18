/**
 * BrowserTool — Navigateur interactif SOUVERAIN via Chrome DevTools Protocol (CDP).
 *
 * 0 dependance npm: utilise le WebSocket natif de Node (global WebSocket) et
 * un Chrome deja installe sur la machine (--remote-debugging-port).
 * Permet: naviguer, cliquer, taper du texte, lire le DOM (snapshot),
 * faire des screenshots. Equivalent souverain a Playwright, sans SDK externe.
 *
 * Chrome est lance en mode headless-debug par l'outil (chemin configurable
 * via CHROME_PATH, defaut: Program Files x86).
 *
 * Risque: safe (lecture/ecriture navigateur local, sandbox).
 */

import { Tool, ToolResult } from './registry.js';
import { spawn, type ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CHROME_PATH = process.env.CHROME_PATH
  ?? 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';

const DEBUG_PORT = 9222;
const WS_TIMEOUT = 30_000;

/** Client CDP minimal par-dessus WebSocket natif. */
class CDPClient {
  private ws: any;
  private id = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private sessionId?: string;

  constructor(ws: any) { this.ws = ws; this.ws.onmessage = (ev: any) => this.onMessage(ev.data); }

  private onMessage(data: any) {
    let msg: any;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.id && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    }
  }

  send(method: string, params: any = {}, sessionId?: string): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const payload = JSON.stringify({ id, method, params, sessionId });
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, WS_TIMEOUT);
      this.pending.get(id)!.resolve = (v) => { clearTimeout(t); resolve(v); };
      this.pending.get(id)!.reject = (e) => { clearTimeout(t); reject(e); };
      this.ws.send(payload);
    });
  }

  /** Attache une session de page (target) pour les commandes DOM. */
  async attachTarget(targetId: string): Promise<string> {
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    this.sessionId = sessionId;
    return sessionId;
  }

  get session() { return this.sessionId; }
}

interface BrowserState {
  proc?: ChildProcess;
  ws?: any;
  cdp?: CDPClient;
  targetId?: string;
}

let state: BrowserState = {};

async function getCdp(): Promise<CDPClient> {
  if (state.cdp) return state.cdp;
  if (!existsSync(CHROME_PATH)) throw new Error(`Chrome introuvable: ${CHROME_PATH} (definir CHROME_PATH)`);

  // Lance Chrome en mode debug
  const userData = join(__dirname, '..', '..', '.chrome-debug');
  state.proc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userData}`,
    'about:blank',
  ], { stdio: 'ignore' });

  // Attend le endpoint CDP
  let wsUrl = '';
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://localhost:${DEBUG_PORT}/json/version`);
      const d = await r.json() as any;
      wsUrl = d.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!wsUrl) throw new Error('Chrome CDP non disponible (port 9222)');

  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e: any) => reject(new Error('WS CDP echec: ' + (e.message ?? '?')));
  });
  state.ws = ws;
  state.cdp = new CDPClient(ws);
  return state.cdp;
}

async function ensurePage(): Promise<CDPClient> {
  const cdp = await getCdp();
  if (!state.targetId) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    state.targetId = targetId;
    await cdp.attachTarget(targetId);
  }
  return cdp;
}

export function createBrowserTools(): Tool[] {
  async function navigate(params: Record<string, any>): Promise<ToolResult> {
    const start = Date.now();
    try {
      const cdp = await ensurePage();
      await cdp.send('Page.enable', {}, cdp.session);
      await cdp.send('Page.navigate', { url: params.url }, cdp.session);
      // attend chargement
      await new Promise(r => setTimeout(r, 1500));
      const { result } = await cdp.send('Runtime.evaluate', {
        expression: 'document.title', returnByValue: true,
      }, cdp.session);
      return { success: true, output: `Navigue vers ${params.url}\nTitre: ${result?.value ?? '?'}`, data: { url: params.url }, durationMs: Date.now() - start };
    } catch (e: any) { return { success: false, output: '', error: e.message, durationMs: Date.now() - start }; }
  }

  async function snapshot(params: Record<string, any>): Promise<ToolResult> {
    const start = Date.now();
    try {
      const cdp = await ensurePage();
      const { result } = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const els=[...document.querySelectorAll('a,button,input,textarea,select,h1,h2,h3,p')]; return els.slice(0,${Number(params.limit ?? 40)}).map(e=>({t:e.tagName, txt:(e.textContent||'').trim().slice(0,80), href:e.href||'', name:e.name||e.id||''})); })()`,
        returnByValue: true,
      }, cdp.session);
      const items = result?.value ?? [];
      const out = items.map((i: any, n: number) => `[${n + 1}] <${i.t}> ${i.txt}${i.href ? ' -> ' + i.href : ''}`).join('\n');
      return { success: true, output: out || 'DOM vide', data: { count: items.length }, durationMs: Date.now() - start };
    } catch (e: any) { return { success: false, output: '', error: e.message, durationMs: Date.now() - start }; }
  }

  async function click(params: Record<string, any>): Promise<ToolResult> {
    const start = Date.now();
    try {
      const cdp = await ensurePage();
      const idx = Number(params.index);
      const { result } = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const els=[...document.querySelectorAll('a,button,input,textarea,select')]; const e=els[${idx}]; if(!e) return 'NO'; e.click(); return 'OK'; })()`,
        returnByValue: true,
      }, cdp.session);
      return { success: result?.value === 'OK', output: 'Clic ' + (result?.value ?? '?'), durationMs: Date.now() - start };
    } catch (e: any) { return { success: false, output: '', error: e.message, durationMs: Date.now() - start }; }
  }

  async function type(params: Record<string, any>): Promise<ToolResult> {
    const start = Date.now();
    try {
      const cdp = await ensurePage();
      const idx = Number(params.index);
      const text = String(params.text ?? '');
      await cdp.send('Runtime.evaluate', {
        expression: `(() => { const els=[...document.querySelectorAll('input,textarea')]; const e=els[${idx}]; if(e){ e.focus(); e.value='${text.replace(/'/g, "\\'")}'; e.dispatchEvent(new Event('input',{bubbles:true})); return 'OK'; } return 'NO'; })()`,
        returnByValue: true,
      }, cdp.session);
      return { success: true, output: `Texte saisi: ${text}`, durationMs: Date.now() - start };
    } catch (e: any) { return { success: false, output: '', error: e.message, durationMs: Date.now() - start }; }
  }

  async function close(params: Record<string, any>): Promise<ToolResult> {
    if (state.proc) { try { state.proc.kill('SIGKILL'); } catch {} }
    if (state.ws) { try { state.ws.close(); } catch {} }
    state = {};
    return { success: true, output: 'Navigateur ferme', durationMs: 0 };
  }

  return [
    { name: 'browser_navigate', description: 'Ouvre une page web dans le navigateur souverain (Chrome CDP).', risk: 'safe', parameters: [{ name: 'url', type: 'string', description: 'URL', required: true }], execute: navigate },
    { name: 'browser_snapshot', description: 'Lit les elements cliquables/texte de la page courante (DOM).', risk: 'safe', parameters: [{ name: 'limit', type: 'number', description: 'Max elements', required: false }], execute: snapshot },
    { name: 'browser_click', description: 'Clique sur un element par son index (voir browser_snapshot).', risk: 'safe', parameters: [{ name: 'index', type: 'number', description: 'Index element', required: true }], execute: click },
    { name: 'browser_type', description: 'Saisit du texte dans un champ (index).', risk: 'safe', parameters: [{ name: 'index', type: 'number', description: 'Index du champ', required: true }, { name: 'text', type: 'string', description: 'Texte a saisir', required: true }], execute: type },
    { name: 'browser_close', description: 'Ferme le navigateur souverain.', risk: 'safe', parameters: [], execute: close },
  ];
}
