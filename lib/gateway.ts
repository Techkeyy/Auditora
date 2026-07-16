import OpenAI from "openai";
import type { CallCost } from "./types";

export const GATEWAY_BASE_URL =
  process.env.GATEWAY_BASE_URL || "https://openrouter.ai/api/v1";

/** Returns a configured client, or null when no key is set (→ mock mode). */
export function getClient(): OpenAI | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: GATEWAY_BASE_URL,
    defaultHeaders: {
      // OpenRouter attribution headers (optional, improves rate limits)
      "HTTP-Referer": process.env.AUDITORA_PUBLIC_URL || "http://localhost:3000",
      "X-Title": "Auditora",
    },
  });
}

export function hasKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** Map an OpenRouter model slug ("openai/gpt-4.1") to its provider, for display. */
export function providerOf(model: string): string {
  const prefix = model.split("/")[0]?.toLowerCase() ?? "";
  const NAMES: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    deepseek: "DeepSeek",
    "meta-llama": "Meta",
    mistralai: "Mistral",
    qwen: "Qwen",
    "x-ai": "xAI",
    moonshotai: "Moonshot",
  };
  return NAMES[prefix] || prefix || "unknown";
}

export interface ChatResult {
  content: string;
  cost: CallCost;
  model: string;
}

/**
 * One chat call through OpenRouter, capturing content and real spend.
 * `usage: {include: true}` asks OpenRouter to attach the exact USD cost
 * of the call to the response body — real numbers, not estimates.
 */
export async function chat(
  model: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<ChatResult> {
  const client = getClient();
  if (!client) throw new Error("No OPENROUTER_API_KEY set");

  const data = await client.chat.completions.create({
    model,
    messages,
    temperature: opts.temperature ?? 0.1,
    // Headroom so reasoning models don't burn the budget before emitting,
    // and so long findings JSON is never truncated.
    max_tokens: opts.maxTokens ?? 4096,
    // OpenRouter extension: return exact usage accounting on the response.
    usage: { include: true },
  } as any);

  const usage = (data as any).usage ?? {};
  return {
    content: data.choices[0]?.message?.content ?? "",
    cost: {
      usd: typeof usage.cost === "number" ? usage.cost : 0,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
    },
    model,
  };
}
