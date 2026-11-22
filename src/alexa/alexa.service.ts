import type { Logger } from "pino";
import { ClaudeService } from "../claude/claude.service";
import { ClaudeCliResult } from "../claude/claude.types";
import { TelegramService } from "../telegram/telegram.service";
import { AlexaIntent, AlexaRequestEnvelope, AlexaResponseEnvelope } from "./alexa.types";

export class AlexaService {
  private readonly claudeResponseDeadlineMs = Number.parseInt(process.env.CLAUDE_RESPONSE_DEADLINE_MS ?? "7500", 10);
  private readonly redactedPlaceholder = "[redacted]";

  private readonly welcome = "Opa, estou aqui.";
  private readonly goodbye = "Até logo.";
  private readonly help = "Como posso ajudar?";
  private readonly misunderstood = "Desculpe, não entendi.";
  private readonly timeoutNotice = "Resposta do Claude demorou mais que o esperado. Vou te avisar no Telegram quando concluir.";
  private readonly genericError = "Não consegui responder agora.";

  private readonly claudeSystemPrompt = [
    "Você é um assistente de voz que responde através de um alto-falante Alexa, em português do Brasil.",
    "",
    "Responda como uma pessoa responderia em voz alta: de forma natural, direta, clara e sem rodeios. Não use frases de introdução antes de responder.",
    "",
    "Responda em uma única frase curta, no máximo duas quando for estritamente necessário. Seja conciso, mas não omita informações importantes para responder corretamente.",
    "",
    "Não sugira ações adicionais, não ofereça ajuda complementar e não faça perguntas de acompanhamento. Se a pergunta não estiver clara, responda com a interpretação mais provável em vez de pedir esclarecimento.",
    "",
    "Como suas respostas serão reproduzidas por voz, utilize apenas texto simples, sem Markdown, listas, emojis, títulos ou caracteres decorativos. Evite abreviações que dificultem a pronúncia e prefira frases fáceis de compreender oralmente.",
    "",
    "Você tem um tempo muito curto para responder. Use o menor número possível de chamadas de ferramentas, combine chamadas quando possível e não verifique a mesma informação mais de uma vez. Responda assim que tiver informação suficiente, sem buscas ou confirmações adicionais."
  ].join("\n");

  private readonly claudeIntentPrefixes: Record<string, string> = {
    CreateIntent: "O usuário quer criar",
    OpenIntent: "O usuário quer abrir",
    QuestionIntent: "O usuário perguntou"
  };

  constructor(
    private readonly claudeService: ClaudeService,
    private readonly telegramService: TelegramService,
    private readonly logger: Logger
  ) { }

  async handleRequest(envelope: AlexaRequestEnvelope): Promise<AlexaResponseEnvelope> {
    const { request } = envelope;

    switch (request.type) {
      case "LaunchRequest":
        return this.buildResponse(this.welcome, false);
      case "IntentRequest":
        return this.handleIntent(envelope, request.intent);
      case "SessionEndedRequest":
        return this.buildResponse(undefined, true);
      default:
        return this.buildResponse(this.misunderstood, true);
    }
  }

  private async handleIntent(envelope: AlexaRequestEnvelope, intent: AlexaIntent): Promise<AlexaResponseEnvelope> {
    switch (intent.name) {
      case "AMAZON.StopIntent":
      case "AMAZON.CancelIntent":
        return this.buildResponse(this.goodbye, true);
      case "AMAZON.HelpIntent":
        return this.buildResponse(this.help, false);
      case "CreateIntent":
      case "OpenIntent":
      case "QuestionIntent":
        return this.handleClaudeIntent(envelope, intent);
      default:
        return this.buildResponse(this.misunderstood, false);
    }
  }

  private async handleClaudeIntent(envelope: AlexaRequestEnvelope, intent: AlexaIntent): Promise<AlexaResponseEnvelope> {
    const slotValue = intent.slots ? Object.values(intent.slots)[0]?.value : undefined;

    if (!slotValue) {
      return this.buildResponse(this.misunderstood, false);
    }

    const prefix = this.claudeIntentPrefixes[intent.name] ?? this.claudeIntentPrefixes.QuestionIntent;
    const question = `${prefix}: ${slotValue}`;

    const askPromise = this.claudeService.ask({
      question,
      systemPrompt: this.claudeSystemPrompt
    })

    const timeoutPromise = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), this.claudeResponseDeadlineMs);
    })

    try {
      const outcome = await Promise.race([askPromise, timeoutPromise]);

      if (outcome === "timeout") {
        this.notifyWhenClaudeResponds(askPromise, envelope, intent);
        return this.buildResponse(this.timeoutNotice, true);
      }

      this.log(envelope, intent, "success");
      return this.buildResponse(outcome.result, false);
    } catch {
      this.log(envelope, intent, "error");
      return this.buildResponse(this.genericError, false);
    }
  }

  private notifyWhenClaudeResponds(askPromise: Promise<ClaudeCliResult>, envelope: AlexaRequestEnvelope, intent: AlexaIntent): void {
    askPromise.then(async (result) => {
      this.log(envelope, intent, "success");
      await this.telegramService.sendMessage(result.result);
    }).catch(() => {
      this.log(envelope, intent, "error");
    })
  }

  private log(envelope: AlexaRequestEnvelope, intent: AlexaIntent, status: "success" | "error"): void {
    this.logger.info({
      event: "alexa.intent",
      sessionId: envelope.session?.sessionId,
      intent: intent.name,
      status
    })

    this.logger.debug({
      event: "alexa.intent.detail",
      payload: this.redactEnvelope(envelope)
    })
  }

  private redactEnvelope(envelope: AlexaRequestEnvelope): AlexaRequestEnvelope {
    const redacted = structuredClone(envelope);

    if (redacted.context.System.apiAccessToken) {
      redacted.context.System.apiAccessToken = this.redactedPlaceholder;
    }
    if (redacted.context.System.user?.permissions?.consentToken) {
      redacted.context.System.user.permissions.consentToken = this.redactedPlaceholder;
    }
    if (redacted.session?.user?.permissions?.consentToken) {
      redacted.session.user.permissions.consentToken = this.redactedPlaceholder;
    }

    return redacted;
  }

  private buildResponse(speechText: string | undefined, shouldEndSession: boolean): AlexaResponseEnvelope {
    return {
      version: "1.0",
      response: {
        outputSpeech: speechText
          ? {
            type: "PlainText",
            text: speechText
          }
          : undefined,
        shouldEndSession
      }
    }
  }
}
