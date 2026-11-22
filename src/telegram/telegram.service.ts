import type { Logger } from "pino";

export class TelegramService {
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN;
  private readonly chatId = process.env.TELEGRAM_CHAT_ID;
  private readonly enabled = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

  constructor(private readonly logger: Logger) {
    if (!this.enabled) {
      this.logger.warn("Fallback do Telegram desativado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID não configurados).");
    }
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.enabled) {
      this.logger.info({
        event: "telegram.send.skipped"
      })
      return;
    }

    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: this.chatId,
        text
      })
    })

    if (!response.ok) {
      this.logger.error({
        event: "telegram.send.failed",
        status: response.status
      })
      throw new Error(`Telegram API responded with status ${response.status}`);
    }
  }
}
