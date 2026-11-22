import { NextFunction, Request, Response, Router } from "express";
import { AlexaService } from "../alexa/alexa.service";
import { AlexaSignatureVerifier } from "../alexa/alexa-signature.verifier";

export class AlexaWebhookController {
  constructor(
    private readonly alexaService: AlexaService,
    private readonly signatureVerifier: AlexaSignatureVerifier
  ) {}

  router(): Router {
    const router = Router();
    router.post("/", this.signatureVerifier.middleware(), this.handle);
    return router;
  }

  private handle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const response = await this.alexaService.handleRequest(req.body);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };
}
