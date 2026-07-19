/**
 * TelegramApprovalChannel — Canal d'approbation via le bot Telegram Harnais Atlas.
 *
 * Quand Atlas (mode permission/edit) doit valider une action dangereuse,
 * il envoie une demande à Raf sur Telegram et attend sa réponse (✅/❌).
 *
 * 0 dépendance npm — fetch direct vers l'API Telegram.
 * Fail-safe: si le token ou le chat est absent, ask() refuse par défaut.
 */

import type { ApprovalChannel } from '../core/cortex.js';

export interface TelegramApprovalOpts {
  token: string;
  chatId: string;
  pollTimeoutMs?: number;
}

const API = (token: string, method: string, q = '') =>
  `https://api.telegram.org/bot${token}/${method}${q ? '?' + q : ''}`;

export class TelegramApprovalChannel implements ApprovalChannel {
  private token: string;
  private chatId: string;
  private pollTimeoutMs: number;
  private lastUpdateId = 0;
  private offset = 0;

  constructor(opts: TelegramApprovalOpts) {
    this.token = opts.token;
    this.chatId = opts.chatId;
    this.pollTimeoutMs = opts.pollTimeoutMs ?? 30000;
  }

  /** Envoie une demande d'approbation et attend la réponse (✅/❌). */
  async ask(tool: string, params: Record<string, any>, reason: string): Promise<boolean> {
    const preview = JSON.stringify(params, null, 0).slice(0, 500);
    const msg =
      `🔐 *ATLAS — DEMANDE D'APPROBATION*\n\n` +
      `Outil: \`${tool}\`\n` +
      `Raison: ${reason}\n\n` +
      `Paramètres:\n\`\`\`\n${preview}\n\`\`\`\n\n` +
      `Réponds ✅ pour *VALIDER* ou ❌ pour *REFUSER*.`;

    try {
      const sent = await this.sendMessage(msg);
      if (!sent) return false; // échec envoi => refuse (fail-safe)

      // Attend la réponse de Raf (long-poll sur les updates)
      const answer = await this.waitForResponse(sent.message_id);
      await this.sendMessage(answer ? '✅ *Validé* par Raf.' : '❌ *Refusé* par Raf.');
      return answer;
    } catch (e: any) {
      console.log(`[TelegramApproval] erreur: ${e.message} -> REFUS par défaut`);
      return false; // fail-safe: jamais d'exécution silencieuse
    }
  }

  private async sendMessage(text: string): Promise<{ message_id: number } | null> {
    const body = JSON.stringify({
      chat_id: this.chatId,
      text,
      parse_mode: 'Markdown',
    });
    const res = await fetch(API(this.token, 'sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.ok ? { message_id: data.result.message_id } : null;
  }

  /** Long-poll les messages entrants jusqu'à une réponse ✅/❌ de Raf. */
  private async waitForResponse(sinceMessageId: number): Promise<boolean> {
    const deadline = Date.now() + this.pollTimeoutMs;
    while (Date.now() < deadline) {
      const q = new URLSearchParams({
        chat_id: this.chatId,
        offset: String(this.offset + 1),
        timeout: '10',
      });
      const res = await fetch(API(this.token, 'getUpdates', q.toString()));
      if (!res.ok) continue;
      const data: any = await res.json();
      if (!data.ok) continue;

      for (const upd of data.result ?? []) {
        this.offset = Math.max(this.offset, upd.update_id);
        const msg = upd.message;
        if (!msg || msg.message_id <= sinceMessageId) continue;
        if (String(msg.chat.id) !== this.chatId) continue;
        const text = (msg.text ?? '').trim();
        if (text.includes('✅') || /^oui|yes|ok|valide/i.test(text)) return true;
        if (text.includes('❌') || /^non|no|refuse/i.test(text)) return false;
      }
      // petite pause pour ne pas spammer l'API
      await new Promise((r) => setTimeout(r, 500));
    }
    return false; // timeout => refuse par défaut
  }
}
