import type { Express } from "express";
import type { Logger } from "pino";

export class Server {
  constructor(
    private readonly app: Express,
    private readonly port: number,
    private readonly logger: Logger
  ) {}

  start(): void {
    this.app.listen(this.port, () => {
      this.logger.info(`claude-alexa escutando na porta ${this.port}`);
    })
  }
}
