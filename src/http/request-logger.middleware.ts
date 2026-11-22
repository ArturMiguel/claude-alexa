import { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";

export class RequestLoggerMiddleware {
  constructor(private readonly logger: Logger) {}

  handle = (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = Date.now();

    res.on("finish", () => {
      this.logger.info({
        event: "http.request",
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt
      })
    })

    next();
  };
}
