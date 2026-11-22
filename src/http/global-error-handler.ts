import { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import { AlexaSignatureError } from "../alexa/alexa-signature.verifier";

export class GlobalErrorHandler {
  constructor(private readonly logger: Logger) {}

  handle = (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (error instanceof AlexaSignatureError) {
      this.logger.warn({
        event: "alexa.signature.rejected",
        reason: error.message,
        path: req.path
      })
      res.status(error.statusCode).json({
        message: error.message
      })
      return;
    }

    this.logger.error({
      event: "http.unhandled_error",
      path: req.path,
      error: error instanceof Error ? error.message : "Unknown error"
    })
    res.status(500).json({
      message: "Internal server error"
    })
  };
}
