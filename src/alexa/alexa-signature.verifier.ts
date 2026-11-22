import { createVerify, X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import type { NextFunction, Request, Response } from "express";
import { AlexaRequestEnvelope } from "./alexa.types";

export class AlexaSignatureError extends Error {
  readonly statusCode = 400;
}

export class AlexaSignatureVerifier {
  private readonly trustedRoots = rootCertificates.map((pem) => new X509Certificate(pem));
  private readonly certChainFetchTimeoutMs = 5000;
  private readonly timestampToleranceMs = 150 * 1000;
  private readonly certChainHostname = "s3.amazonaws.com";
  private readonly certChainPathPrefix = "/echo.api/";
  private readonly certSanHostname = "echo-api.amazon.com";
  private readonly skillId = process.env.ALEXA_SKILL_ID;

  middleware() {
    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
      try {
        await this.verify(req);
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  private async verify(req: Request): Promise<void> {
    const certChainUrl = req.headers["signaturecertchainurl"] as string | undefined;
    const signature = req.headers["signature-256"] as string | undefined;
    const rawBody = req.rawBody;

    if (!certChainUrl || !signature || !rawBody) {
      throw new AlexaSignatureError("Missing Alexa signature headers.");
    }

    this.validateCertChainUrl(certChainUrl);

    const certs = await this.fetchCertChain(certChainUrl);
    this.validateCertChain(certs);
    this.validateSignature(this.certAt(certs, 0), signature, rawBody);
    this.validateTimestamp(req.body as AlexaRequestEnvelope);
    this.validateApplicationId(req.body as AlexaRequestEnvelope);
  }

  private validateCertChainUrl(certChainUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(certChainUrl);
    } catch {
      throw new AlexaSignatureError("Invalid certificate chain URL.");
    }

    const normalizedPath = parsed.pathname.replace(/\/{2,}/g, "/");

    if (parsed.protocol.toLowerCase() !== "https:") {
      throw new AlexaSignatureError("Certificate chain URL must use HTTPS.");
    }
    if (parsed.hostname.toLowerCase() !== this.certChainHostname) {
      throw new AlexaSignatureError("Certificate chain URL has an invalid host.");
    }
    if (!normalizedPath.startsWith(this.certChainPathPrefix)) {
      throw new AlexaSignatureError("Certificate chain URL has an invalid path.");
    }
    if (parsed.port && parsed.port !== "443") {
      throw new AlexaSignatureError("Certificate chain URL has an invalid port.");
    }
  }

  private async fetchCertChain(certChainUrl: string): Promise<X509Certificate[]> {
    const response = await fetch(certChainUrl, {
      signal: AbortSignal.timeout(this.certChainFetchTimeoutMs)
    })

    if (!response.ok) {
      throw new AlexaSignatureError("Could not fetch the certificate chain.");
    }

    const body = await response.text();
    const pemBlocks = body.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    if (!pemBlocks || pemBlocks.length === 0) {
      throw new AlexaSignatureError("Certificate chain is empty.");
    }

    return pemBlocks.map((pem) => new X509Certificate(pem));
  }

  private validateCertChain(certs: X509Certificate[]): void {
    const signingCert = this.certAt(certs, 0);
    const now = Date.now();

    if (now < new Date(signingCert.validFrom).getTime() || now > new Date(signingCert.validTo).getTime()) {
      throw new AlexaSignatureError("Signing certificate is not valid.");
    }
    if (!signingCert.subjectAltName?.includes(this.certSanHostname)) {
      throw new AlexaSignatureError("Signing certificate is missing the required SAN.");
    }

    for (let i = 0; i < certs.length - 1; i++) {
      const current = this.certAt(certs, i);
      const next = this.certAt(certs, i + 1);
      if (!current.checkIssued(next) || !current.verify(next.publicKey)) {
        throw new AlexaSignatureError("Certificate chain is not trusted.");
      }
    }

    const top = this.certAt(certs, certs.length - 1);
    const isTrusted = this.trustedRoots.some((root) => top.checkIssued(root) && top.verify(root.publicKey));
    if (!isTrusted) {
      throw new AlexaSignatureError("Certificate chain does not terminate at a trusted root.");
    }
  }

  private certAt(certs: X509Certificate[], index: number): X509Certificate {
    const cert = certs[index];
    if (!cert) {
      throw new AlexaSignatureError("Certificate chain is malformed.");
    }
    return cert;
  }

  private validateSignature(signingCert: X509Certificate, signature: string, rawBody: Buffer): void {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(rawBody);
    verifier.end();

    if (!verifier.verify(signingCert.publicKey, signature, "base64")) {
      throw new AlexaSignatureError("Request signature is invalid.");
    }
  }

  private validateTimestamp(body: AlexaRequestEnvelope): void {
    const timestamp = body?.request?.timestamp;
    if (!timestamp) {
      throw new AlexaSignatureError("Request timestamp is missing.");
    }

    const requestTime = new Date(timestamp).getTime();
    if (Number.isNaN(requestTime) || Math.abs(Date.now() - requestTime) > this.timestampToleranceMs) {
      throw new AlexaSignatureError("Request timestamp is outside the allowed tolerance.");
    }
  }

  private validateApplicationId(body: AlexaRequestEnvelope): void {
    const applicationId = body?.context?.System?.application?.applicationId;
    if (!this.skillId || applicationId !== this.skillId) {
      throw new AlexaSignatureError("Application ID does not match.");
    }
  }
}
