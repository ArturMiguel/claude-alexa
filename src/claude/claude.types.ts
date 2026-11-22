export interface ClaudeAskOptions {
  question: string;
  systemPrompt: string;
}

export interface ClaudeCliResult {
  type: string;
  subtype: string;
  is_error: boolean;
  result: string;
  session_id: string;
  num_turns: number;
  duration_ms: number;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
