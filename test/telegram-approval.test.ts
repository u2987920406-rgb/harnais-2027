import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TelegramApprovalChannel } from '../src/security/telegram-approval.js';

test('TelegramApprovalChannel: ask refuse si envoi échoue (fail-safe)', async () => {
  const origFetch = global.fetch;
  // fetch renvoie toujours une erreur -> le canal doit refuser par défaut
  (global as any).fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const ch = new TelegramApprovalChannel({ token: 'x', chatId: '123' });
  const ok = await ch.ask('shell_exec', { command: 'ls' }, 'test');
  assert.equal(ok, false);
  (global as any).fetch = origFetch;
});

test('TelegramApprovalChannel: ask formate le message Markdown', async () => {
  let sentText = '';
  const origFetch = global.fetch;
  (global as any).fetch = async (_url: string, opts: any) => {
    const body = JSON.parse(opts.body);
    if (body.text) sentText = body.text;
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 1 } }),
    };
  };
  const ch = new TelegramApprovalChannel({ token: 'x', chatId: '123', pollTimeoutMs: 100 });
  // le waitForResponse va timeout (pas de réponse simulée) -> refuse
  const ok = await ch.ask('shell_exec', { command: 'ls -la' }, 'validation requise');
  assert.equal(ok, false);
  assert.ok(sentText.includes('ATLAS — DEMANDE D'), 'le message doit annoncer la demande');
  assert.ok(sentText.includes('shell_exec'), 'le message doit contenir le nom de l\'outil');
  assert.ok(sentText.includes('ls -la'), 'le message doit contenir les params');
  (global as any).fetch = origFetch;
});

test('TelegramApprovalChannel: ask valide si réponse ✅', async () => {
  let call = 0;
  const origFetch = global.fetch;
  (global as any).fetch = async (_url: string, opts: any) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    if (body && body.text) {
      // envoi de la demande
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 10 } }) };
    }
    // getUpdates (GET, pas de body) -> on simule une réponse ✅ de Raf
    call++;
    if (call === 1) {
      return {
        ok: true, status: 200,
        json: async () => ({
          ok: true,
          result: [{ update_id: 1, message: { message_id: 11, chat: { id: '123' }, text: '✅' } }],
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, result: [] }) };
  };
  const ch = new TelegramApprovalChannel({ token: 'x', chatId: '123', pollTimeoutMs: 2000 });
  const ok = await ch.ask('shell_exec', { command: 'ls' }, 'test');
  assert.equal(ok, true);
  (global as any).fetch = origFetch;
});
