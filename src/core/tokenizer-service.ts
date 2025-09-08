/**
 * Tokenizer Service for accurate token counting
 * Supports multiple models with appropriate tokenizers
 */

import { type Tiktoken, getEncoding } from "js-tiktoken";
import { getLogger } from "../shared/pino-logger.js";

// Lazy logger initialization
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("tokenizer");
  }
  return logger;
}

export type TokenizerModel = "claude" | "gpt-4" | "gpt-3.5" | "default";

export interface TokenCountResult {
  tokens: number;
  model: TokenizerModel;
  method: "exact" | "estimated";
  characterCount: number;
  byteCount: number;
}

export class TokenizerService {
  private encoders: Map<string, Tiktoken> = new Map();

  /**
   * Get the appropriate encoder for a model
   */
  private getEncoder(model: TokenizerModel): Tiktoken | null {
    try {
      // Claude uses a similar tokenizer to GPT models for now
      // In future, we could add Claude-specific tokenizer when available
      const encodingName = model === "claude" ? "cl100k_base" : "cl100k_base";

      if (!this.encoders.has(encodingName)) {
        const encoder = getEncoding(encodingName);
        this.encoders.set(encodingName, encoder);
      }

      return this.encoders.get(encodingName) || null;
    } catch (error) {
      ensureLogger().warn({ error, model }, "Failed to load tokenizer, using estimation");
      return null;
    }
  }

  /**
   * Count tokens for a given text
   */
  countTokens(text: string, model: TokenizerModel = "default"): TokenCountResult {
    const byteCount = new TextEncoder().encode(text).length;
    const characterCount = text.length;

    // Try to use exact tokenizer
    const encoder = this.getEncoder(model);
    if (encoder) {
      try {
        const tokens = encoder.encode(text).length;
        return {
          tokens,
          model,
          method: "exact",
          characterCount,
          byteCount,
        };
      } catch (error) {
        ensureLogger().warn({ error }, "Failed to encode text, falling back to estimation");
      }
    }

    // Fallback to estimation
    // Based on empirical data:
    // - English text: ~1 token per 4 characters
    // - Code/HTML: ~1 token per 3.5 characters (more symbols)
    // - Mixed content: ~1 token per 3.8 characters
    const isCode = text.includes("<") && text.includes(">");
    const charsPerToken = isCode ? 3.5 : 4;
    const estimatedTokens = Math.ceil(characterCount / charsPerToken);

    return {
      tokens: estimatedTokens,
      model,
      method: "estimated",
      characterCount,
      byteCount,
    };
  }

  /**
   * Check if content exceeds token limit
   */
  exceedsLimit(text: string, limit: number, model: TokenizerModel = "default"): boolean {
    const result = this.countTokens(text, model);
    return result.tokens > limit;
  }

  /**
   * Get recommended token limit based on model
   */
  getRecommendedLimit(model: TokenizerModel): number {
    // Conservative limits to ensure MCP protocol overhead fits
    switch (model) {
      case "claude":
        return 180000; // Claude 3 has 200k context, leave room for system
      case "gpt-4":
        return 120000; // GPT-4 Turbo has 128k context
      case "gpt-3.5":
        return 15000; // GPT-3.5 has 16k context
      default:
        return 20000; // Conservative default
    }
  }

  /**
   * Clean up encoders to free memory
   */
  cleanup(): void {
    // js-tiktoken doesn't have a free method, just clear the map
    this.encoders.clear();
  }
}

// Singleton instance
export const tokenizerService = new TokenizerService();
