import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Logger } from "pino";
import { ClaudeAskOptions, ClaudeCliResult } from "./claude.types";

const execFileAsync = promisify(execFile);

export class ClaudeService {
  private readonly binaryPath = path.join(process.cwd(), "node_modules", ".bin", "claude");
  private readonly model = process.env.CLAUDE_MODEL ?? "haiku";
  private readonly effort = process.env.CLAUDE_EFFORT ?? "low";
  private readonly maxTurns = process.env.CLAUDE_MAX_TURNS ?? "3";
  private readonly restricted = (process.env.CLAUDE_RESTRICTED ?? "true").toLowerCase() === "true";
  private readonly settingsPath = path.join(process.cwd(), ".claude", "settings.json");
  private readonly timeoutMs = 60000;
  private readonly maxBufferBytes = 10 * 1024 * 1024;

  constructor(private readonly logger: Logger) { }

  async ask(options: ClaudeAskOptions): Promise<ClaudeCliResult> {
    let result: ClaudeCliResult;

    try {
      result = await this.runCli(options);
    } catch (error) {
      this.logger.error({
        event: "claude.ask",
        status: "error",
        model: this.model
      }, "Falha ao chamar a CLI do Claude");
      throw error;
    }

    this.logger.info({
      event: "claude.ask",
      status: result.is_error ? "error" : "success",
      model: this.model,
      effort: this.effort,
      sessionId: result.session_id,
      durationMs: result.duration_ms,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      totalCostUsd: result.total_cost_usd
    }, "Chamada da CLI do Claude concluída");

    this.logger.debug({
      event: "claude.ask.detail",
      question: options.question,
      answer: result.result
    }, "Pergunta e resposta da CLI do Claude");

    if (result.is_error) {
      throw new Error(result.result);
    }

    return result;
  }

  private async runCli(options: ClaudeAskOptions): Promise<ClaudeCliResult> {
    const args = [
      "-p",
      options.question,
      "--model",
      this.model,
      "--effort",
      this.effort,
      "--permission-prompts",
      "none",
      "--max-turns",
      this.maxTurns,
      "--output-format",
      "json",
      "--append-system-prompt",
      options.systemPrompt
    ];

    if (this.restricted) {
      args.push("--restricted");
    }

    if (existsSync(this.settingsPath)) {
      args.push("--settings", this.settingsPath);
    }

    const { stdout } = await execFileAsync(this.binaryPath, args, {
      timeout: this.timeoutMs,
      maxBuffer: this.maxBufferBytes
    })

    return JSON.parse(stdout) as ClaudeCliResult;
  }
}
