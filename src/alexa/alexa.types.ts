export interface AlexaRequestEnvelope {
  version: string;
  session?: {
    new: boolean;
    sessionId: string;
    application: {
      applicationId: string;
    };
    user?: {
      permissions?: {
        consentToken?: string;
      };
    };
  };
  context: {
    System: {
      application: {
        applicationId: string;
      };
      apiAccessToken?: string;
      user?: {
        permissions?: {
          consentToken?: string;
        };
      };
    };
  };
  request: AlexaRequest;
}

export type AlexaRequest =
  | { type: "LaunchRequest"; requestId: string; timestamp: string; locale: string }
  | { type: "IntentRequest"; requestId: string; timestamp: string; locale: string; intent: AlexaIntent; dialogState?: string }
  | { type: "SessionEndedRequest"; requestId: string; timestamp: string; locale: string; reason: string };

export interface AlexaIntent {
  name: string;
  confirmationStatus?: string;
  slots?: Record<string, { name: string; value?: string; confirmationStatus?: string }>;
}

export interface AlexaResponseEnvelope {
  version: string;
  response: {
    outputSpeech?: {
      type: "PlainText" | "SSML";
      text?: string;
      ssml?: string;
    };
    reprompt?: {
      outputSpeech: {
        type: "PlainText";
        text: string;
      };
    };
    shouldEndSession: boolean;
  };
}
