import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TelegramNotifier } from '../src/security/telegram-notifier.js';

test('TelegramNotifier.fromEnv renvoie null si token/chat absents', () => {
  const savedToken = process.env.TELEGRAM_BOT_TOKEN;
  const savedChat = process.env.RAF_CHAT_ID;
  const savedChat2 = process.env.TELEGRAM_CHAT_ID;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.RAF_CHAT_ID;
  delete process.env.TELEGRAM_CHAT_ID;
  try {
    assert.equal(TelegramNotifier.fromEnv(), null);
  } finally {
    if (savedToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = savedToken;
    if (savedChat !== undefined) process.env.RAF_CHAT_ID = savedChat;
    if (savedChat2 !== undefined) process.env.TELEGRAM_CHAT_ID = savedChat2;
  }
});

test('TelegramNotifier.fromEnv construit un notifier si env présent', () => {
  const savedToken = process.env.TELEGRAM_BOT_TOKEN;
  const savedChat = process.env.RAF_CHAT_ID;
  process.env.TELEGRAM_BOT_TOKEN = 'fake-token';
  process.env.RAF_CHAT_ID = '123';
  try {
    const n = TelegramNotifier.fromEnv();
    assert.ok(n instanceof TelegramNotifier);
  } finally {
    if (savedToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = savedToken;
    else delete process.env.TELEGRAM_BOT_TOKEN;
    if (savedChat !== undefined) process.env.RAF_CHAT_ID = savedChat;
    else delete process.env.RAF_CHAT_ID;
  }
});

test('TelegramNotifier.send avale les erreurs réseau (renvoie false, ne throw pas)', async () => {
  // Token/host invalide -> fetch échoue -> doit renvoyer false sans lever.
  const n = new TelegramNotifier({ token: 'invalid', chatId: '0' });
  const ok = await n.send('test');
  assert.equal(typeof ok, 'boolean');
  assert.equal(ok, false);
});
