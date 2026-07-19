/**
 * TelegramNotifier — Envoi de notifications sortantes vers Raf via le bot
 * Harnais Atlas. Sens UNIQUE (pas d'attente de réponse, contrairement à
 * TelegramApprovalChannel qui, lui, attend un ✅/❌).
 *
 * Usage typique : pousser le rapport du matin (job Scheduler) sur le
 * téléphone de Raf au lieu de le laisser dormir dans le graphe.
 *
 * 0 dépendance npm — fetch direct vers l'API Telegram.
 * Fail-safe silencieux : si token/chat absents ou envoi en échec, on
 * log et on continue (une notif ratée ne doit jamais casser le cortex).
 */

const API = (token: string, method: string) =>
  `https://api.telegram.org/bot${token}/${method}`;

export interface TelegramNotifierOpts {
  token: string;
  chatId: string;
}

export class TelegramNotifier {
  private token: string;
  private chatId: string;

  constructor(opts: TelegramNotifierOpts) {
    this.token = opts.token;
    this.chatId = opts.chatId;
  }

  /**
   * Construit un notifier depuis l'environnement, ou null si non configuré.
   * Réutilise les mêmes variables que le canal d'approbation.
   */
  static fromEnv(): TelegramNotifier | null {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.RAF_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return null;
    return new TelegramNotifier({ token, chatId });
  }

  /**
   * Envoie un message. Renvoie true si l'API a accepté, false sinon.
   * Ne lève jamais : les erreurs sont avalées (fire-and-forget).
   * Telegram limite un message à 4096 caractères -> on tronque.
   */
  async send(text: string): Promise<boolean> {
    const clipped = text.length > 4000 ? text.slice(0, 3990) + '\n…(tronqué)' : text;
    try {
      const res = await fetch(API(this.token, 'sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: clipped,
          parse_mode: 'Markdown',
        }),
      });
      if (!res.ok) {
        console.log(`[TelegramNotifier] envoi refusé (HTTP ${res.status})`);
        return false;
      }
      const data: any = await res.json();
      return data.ok === true;
    } catch (e: any) {
      console.log(`[TelegramNotifier] erreur d'envoi: ${e.message}`);
      return false;
    }
  }
}
