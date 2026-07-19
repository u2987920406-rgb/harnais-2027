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
          result: [{ update_id: 1, message: { message_id: 11, chat: { id: '123' }, from: { id: 123 }, text: '✅' } }],
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

test('TelegramApprovalChannel: ignore une reponse ✅ d\'un AUTRE membre du chat (durcissement expediteur)', async () => {
  // Meme chat.id que l'approverUserId attendu, mais from.id different : un
  // membre non-autorise (cas GROUPE) ne doit jamais pouvoir valider a la place
  // de Raf. Sans ce test, le durcissement pourrait regresser silencieusement.
  let call = 0;
  const origFetch = global.fetch;
  (global as any).fetch = async (_url: string, opts: any) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    if (body && body.text) {
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 10 } }) };
    }
    call++;
    if (call === 1) {
      return {
        ok: true, status: 200,
        json: async () => ({
          ok: true,
          // meme chat (groupe), mais expediteur = 999 != approverUserId (123)
          result: [{ update_id: 1, message: { message_id: 11, chat: { id: '123' }, from: { id: 999 }, text: '✅' } }],
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, result: [] }) };
  };
  const ch = new TelegramApprovalChannel({ token: 'x', chatId: '123', approverUserId: '123', pollTimeoutMs: 300 });
  const ok = await ch.ask('shell_exec', { command: 'rm -rf' }, 'test');
  assert.equal(ok, false, 'un message venant d\'un autre expediteur ne doit jamais approuver');
  (global as any).fetch = origFetch;
});

test('TelegramApprovalChannel: approverUserId explicite honore une reponse du bon expediteur en groupe', async () => {
  let call = 0;
  const origFetch = global.fetch;
  (global as any).fetch = async (_url: string, opts: any) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    if (body && body.text) {
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 10 } }) };
    }
    call++;
    if (call === 1) {
      return {
        ok: true, status: 200,
        json: async () => ({
          ok: true,
          result: [{ update_id: 1, message: { message_id: 11, chat: { id: '-100groupe' }, from: { id: 777 }, text: '✅' } }],
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, result: [] }) };
  };
  const ch = new TelegramApprovalChannel({ token: 'x', chatId: '-100groupe', approverUserId: '777', pollTimeoutMs: 2000 });
  const ok = await ch.ask('shell_exec', { command: 'ls' }, 'test');
  assert.equal(ok, true);
  (global as any).fetch = origFetch;
});
