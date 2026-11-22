import express, { Express, Request } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { AlexaWebhookController } from "./alexa-webhook.controller";
import { RequestLoggerMiddleware } from "./request-logger.middleware";
import { GlobalErrorHandler } from "./global-error-handler";

export class App {
  private readonly express: Express;
  private readonly rateLimitWindowMs = 60 * 1000;
  private readonly rateLimitMax = 10;

  constructor(
    private readonly alexaController: AlexaWebhookController,
    private readonly requestLogger: RequestLoggerMiddleware,
    private readonly errorHandler: GlobalErrorHandler
  ) {
    this.express = express();
    this.configure();
  }

  instance(): Express {
    return this.express;
  }

  private configure(): void {
    this.express.set("trust proxy", "loopback");
    this.express.disable("x-powered-by");
    this.express.use(helmet());
    this.express.use(this.requestLogger.handle);
    this.express.use(
      rateLimit({
        windowMs: this.rateLimitWindowMs,
        max: this.rateLimitMax,
        standardHeaders: true,
        legacyHeaders: false
      })
    )

    this.express.get("/healthz", (_req, res) => {
      res.status(200).json({
        status: "ok"
      })
    })

    this.express.use("/alexa", express.json({
      verify: (req, _res, buf) => {
        (req as Request).rawBody = buf;
      }
    }), this.alexaController.router());

    this.express.use(this.errorHandler.handle);
  }
}
