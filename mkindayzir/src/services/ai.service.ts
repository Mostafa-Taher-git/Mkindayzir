import prisma from "@/lib/prisma";
import { getEncryptionKey, decrypt } from "@/lib/encryption";
import { audit } from "@/lib/helpers";

export type ProviderType = "openrouter" | "openai" | "anthropic" | "custom";

export interface ProviderConfig {
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onChunk?: (chunk: string) => void;
  onToolCall?: (toolCall: { name: string; arguments: Record<string, unknown> }) => void;
  onToolResult?: (toolResult: { name: string; result: unknown }) => void;
  onDone?: (result: { content: string; tokensUsed?: number }) => void;
  onError?: (error: Error) => void;
}

const DEFAULT_PROVIDERS: Record<string, { baseUrl: string; defaultModel: string }> = {
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", defaultModel: "meta-llama/llama-3.1-8b-instruct:free" },
  openai: { baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-3-haiku-20240307" },
  custom: { baseUrl: "", defaultModel: "" },
};

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 20;

  const existing = rateLimitStore.get(userId);

  if (existing && now < existing.resetAt) {
    if (existing.count >= maxRequests) {
      return false;
    }
    existing.count++;
    return true;
  }

  rateLimitStore.set(userId, { count: 1, resetAt: now + windowMs });
  return true;
}

async function streamChatInternal(
  messages: Array<{ role: string; content: string }>,
  providerConfig: ProviderConfig,
  tools?: Array<Record<string, unknown>> | any[],
  callbacks?: StreamCallbacks,
  userId?: string
): Promise<void> {
  if (userId && !checkRateLimit(userId)) {
    const error = new Error("Rate limit exceeded. Please try again later.");
    callbacks?.onError?.(error);
    throw error;
  }

  const isAnthropic = providerConfig.name === "anthropic";

  const requestBody: Record<string, unknown> = {
    model: providerConfig.model,
    messages,
    stream: true,
  };

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
  }

  if (isAnthropic) {
    requestBody.max_tokens = 4096;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${providerConfig.apiKey}`,
  };

  if (isAnthropic) {
    headers["anthropic-version"] = "2023-06-01";
    headers["x-api-key"] = providerConfig.apiKey;
    delete headers["Authorization"];
  }

  const response = await fetch(
    `${providerConfig.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(
      `AI provider error (${response.status}): ${errorText}`
    );
    callbacks?.onError?.(error);
    throw error;
  }

  if (!response.body) {
    const error = new Error("Response body is not readable");
    callbacks?.onError?.(error);
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let totalTokens = 0;
  let fullContent = "";
  let onDoneCalled = false;

  const fireOnDone = (result: { content: string; tokensUsed?: number }) => {
    if (onDoneCalled) return;
    onDoneCalled = true;
    callbacks?.onDone?.(result);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        fireOnDone({ content: fullContent, tokensUsed: totalTokens || undefined });
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || !trimmed.startsWith("data: ")) {
          continue;
        }

        const data = trimmed.slice(6);

          if (data === "[DONE]") {
            fireOnDone({ content: fullContent, tokensUsed: totalTokens || undefined });
            return;
          }

        try {
          const parsed = JSON.parse(data);

          if (isAnthropic && parsed.type === "content_block_delta") {
            const token = parsed.delta?.text || "";
            fullContent += token;
            if (callbacks?.onToken) callbacks.onToken(token);
            if (callbacks?.onChunk) callbacks.onChunk(token);
            continue;
          }

          if (isAnthropic && parsed.type === "message_stop") {
            continue;
          }

          const choices = parsed.choices;
          if (!choices || choices.length === 0) continue;

          const choice = choices[0];
          const delta = choice.delta;

          if (delta?.content) {
            fullContent += delta.content;
            if (callbacks?.onToken) callbacks.onToken(delta.content);
            if (callbacks?.onChunk) callbacks.onChunk(delta.content);
          }

          if (delta?.tool_calls) {
            for (const toolCall of delta.tool_calls) {
              const functionData = toolCall.function || {};
              const name = functionData.name || "";
              let args: Record<string, unknown> = {};

              if (functionData.arguments) {
                try {
                  args = JSON.parse(functionData.arguments);
                } catch {
                  args = { raw: functionData.arguments };
                }
              }

              callbacks?.onToolCall?.({ name, arguments: args });
            }
          }

          if (choice.finish_reason === "stop" || choice.finish_reason === "tool_use") {
            const usage = parsed.usage;
            if (usage) {
              totalTokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
            }
            fireOnDone({ content: fullContent, tokensUsed: totalTokens || undefined });
          }
        } catch {
          // skip unparseable chunks
        }
      }
    }
  } catch (error) {
    callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

export class AIService {
  async getProviderConfig(user: {
    id: string;
    aiApiKey?: string | null;
    aiProvider?: string | null;
    aiModel?: string | null;
  }): Promise<ProviderConfig> {
    const providerName = (user.aiProvider || "openrouter") as ProviderType;
    const providerDefaults = DEFAULT_PROVIDERS[providerName] || DEFAULT_PROVIDERS.openrouter;

    // If aiApiKey is not on the user object (not selected in session query),
    // fetch it directly from the database
    let encryptedApiKey = user.aiApiKey;
    if (!encryptedApiKey) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { aiApiKey: true },
      });
      encryptedApiKey = dbUser?.aiApiKey;
    }

    if (!encryptedApiKey) {
      throw new Error("No API key configured. Please add your API key in Settings.");
    }

    const encryptionKey = getEncryptionKey();
    const apiKey = decrypt(encryptedApiKey, encryptionKey);

    return {
      name: providerName,
      provider: providerName,
      baseUrl: providerDefaults.baseUrl,
      apiKey,
      model: user.aiModel || providerDefaults.defaultModel,
    };
  }

  async getAvailableModels(providerName: ProviderType): Promise<
    Array<{ id: string; name: string }>
  > {
    const providerDefaults = DEFAULT_PROVIDERS[providerName] || DEFAULT_PROVIDERS.openrouter;
    const baseUrl = providerDefaults.baseUrl;

    if (!baseUrl) {
      throw new Error("Custom provider requires a base URL");
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = (await response.json()) as { data?: Array<{ id: string; name?: string }> };
    const models = data.data || [];

    return models.map((m) => ({ id: m.id, name: m.name || m.id }));
  }

  async streamChat(
    messages: Array<{ role: string; content: string }>,
    providerConfig: ProviderConfig,
    tools?: Array<Record<string, unknown>> | any[],
    callbacks?: StreamCallbacks,
    userId?: string
  ): Promise<void> {
    return streamChatInternal(messages, providerConfig, tools, callbacks, userId);
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    user: { id: string; role: string }
  ): Promise<unknown> {
    const { executeTool } = await import("./ai-tools.service");
    return executeTool(toolName, args, user);
  }
}
