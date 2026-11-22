import pino from "pino";
import { ClaudeService } from "./claude/claude.service";
import { TelegramService } from "./telegram/telegram.service";
import { AlexaService } from "./alexa/alexa.service";
import { AlexaSignatureVerifier } from "./alexa/alexa-signature.verifier";
import { AlexaWebhookController } from "./http/alexa-webhook.controller";
import { RequestLoggerMiddleware } from "./http/request-logger.middleware";
import { GlobalErrorHandler } from "./http/global-error-handler";
import { App } from "./http/app";
import { Server } from "./http/server";

async function bootstrap(): Promise<void> {
  if (!process.env.ALEXA_SKILL_ID) {
    throw new Error("Variável de ambiente obrigatória ausente: ALEXA_SKILL_ID");
  }

  const logger = pino({
    level: process.env.LOG_LEVEL ?? "info"
  })

  const claudeService = new ClaudeService(logger);
  const telegramService = new TelegramService(logger);
  const alexaService = new AlexaService(claudeService, telegramService, logger);
  const signatureVerifier = new AlexaSignatureVerifier();
  const alexaController = new AlexaWebhookController(alexaService, signatureVerifier);
  const requestLogger = new RequestLoggerMiddleware(logger);
  const errorHandler = new GlobalErrorHandler(logger);

  const app = new App(alexaController, requestLogger, errorHandler);
  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  const server = new Server(app.instance(), port, logger);

  server.start();
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(`Falha ao iniciar o claude-alexa: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
})
