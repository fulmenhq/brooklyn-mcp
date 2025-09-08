/**
 * Unit tests for TokenizerService
 * Tests token counting, model support, and fallback estimation
 */

import type { Tiktoken } from "js-tiktoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokenizerService } from "./tokenizer-service.js";

// Mock js-tiktoken
vi.mock("js-tiktoken", () => ({
  getEncoding: vi.fn(),
}));

// Mock logger
vi.mock("../shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  })),
}));

describe("TokenizerService", () => {
  let service: TokenizerService;
  let mockEncoder: Partial<Tiktoken>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TokenizerService();

    // Create mock encoder
    mockEncoder = {
      encode: vi.fn((text: string) => {
        // Simple mock: ~4 chars per token
        const tokenCount = Math.ceil(text.length / 4);
        return new Array(tokenCount);
      }),
    };
  });

  describe("countTokens", () => {
    it("should count tokens using exact tokenizer when available", async () => {
      const { getEncoding } = await import("js-tiktoken");
      vi.mocked(getEncoding).mockReturnValue(mockEncoder as Tiktoken);

      const text = "Hello, this is a test message for token counting.";
      const result = service.countTokens(text, "claude");

      expect(result).toMatchObject({
        tokens: expect.any(Number),
        model: "claude",
        method: "exact",
        characterCount: text.length,
        byteCount: new TextEncoder().encode(text).length,
      });
      expect(result.tokens).toBeGreaterThan(0);
      expect(getEncoding).toHaveBeenCalledWith("cl100k_base");
    });

    it("should fall back to estimation when tokenizer fails to load", async () => {
      const { getEncoding } = await import("js-tiktoken");
      vi.mocked(getEncoding).mockImplementation(() => {
        throw new Error("Tokenizer not available");
      });

      const text = "Hello, this is a test message.";
      const result = service.countTokens(text, "gpt-4");

      expect(result).toMatchObject({
        tokens: Math.ceil(text.length / 4), // Estimation for plain text
        model: "gpt-4",
        method: "estimated",
        characterCount: text.length,
        byteCount: new TextEncoder().encode(text).length,
      });
    });

    it("should estimate differently for code/HTML content", async () => {
      const { getEncoding } = await import("js-tiktoken");
      vi.mocked(getEncoding).mockImplementation(() => {
        throw new Error("Tokenizer not available");
      });

      const htmlText = "<div>Hello <span>world</span></div>";
      const result = service.countTokens(htmlText, "default");

      // HTML/code uses 3.5 chars per token estimation
      expect(result.tokens).toBe(Math.ceil(htmlText.length / 3.5));
      expect(result.method).toBe("estimated");
    });

    it("should handle empty strings", () => {
      const result = service.countTokens("", "claude");

      expect(result.tokens).toBe(0);
      expect(result.characterCount).toBe(0);
      expect(result.byteCount).toBe(0);
    });

    it("should handle very long text", () => {
      const longText = "a".repeat(100000);
      const result = service.countTokens(longText, "gpt-4");

      expect(result.tokens).toBeGreaterThan(0);
      expect(result.characterCount).toBe(100000);
      expect(result.method).toBeDefined();
    });

    it("should handle unicode characters correctly", () => {
      const unicodeText = "Hello 世界 🌍 مرحبا";
      const result = service.countTokens(unicodeText, "claude");

      expect(result.characterCount).toBe(unicodeText.length);
      expect(result.byteCount).toBe(new TextEncoder().encode(unicodeText).length);
      expect(result.byteCount).toBeGreaterThan(result.characterCount); // Unicode takes more bytes
    });

    it("should cache encoders for performance", async () => {
      const { getEncoding } = await import("js-tiktoken");
      vi.mocked(getEncoding).mockReturnValue(mockEncoder as Tiktoken);

      // First call
      service.countTokens("test", "claude");
      expect(getEncoding).toHaveBeenCalledTimes(1);

      // Second call with same model should use cache
      service.countTokens("test again", "claude");
      expect(getEncoding).toHaveBeenCalledTimes(1); // Still only called once
    });

    it("should handle encoder encoding failures gracefully", async () => {
      const { getEncoding } = await import("js-tiktoken");
      const failingEncoder = {
        encode: vi.fn(() => {
          throw new Error("Encoding failed");
        }),
      };
      vi.mocked(getEncoding).mockReturnValue(failingEncoder as unknown as Tiktoken);

      const text = "test text";
      const result = service.countTokens(text, "gpt-3.5");

      expect(result.method).toBe("estimated");
      expect(result.tokens).toBe(Math.ceil(text.length / 4));
    });
  });

  describe("exceedsLimit", () => {
    it("should return true when tokens exceed limit", () => {
      const longText = "a".repeat(100000); // ~25000 tokens estimated
      const result = service.exceedsLimit(longText, 10000, "default");

      expect(result).toBe(true);
    });

    it("should return false when tokens are under limit", () => {
      const shortText = "Hello world";
      const result = service.exceedsLimit(shortText, 1000, "default");

      expect(result).toBe(false);
    });

    it("should handle exact limit boundary", async () => {
      const { getEncoding } = await import("js-tiktoken");
      const exactEncoder = {
        encode: vi.fn(() => new Array(100)), // Exactly 100 tokens
      };
      vi.mocked(getEncoding).mockReturnValue(exactEncoder as unknown as Tiktoken);

      const text = "test";
      const exactLimit = service.exceedsLimit(text, 100, "claude");
      const underLimit = service.exceedsLimit(text, 101, "claude");
      const overLimit = service.exceedsLimit(text, 99, "claude");

      expect(exactLimit).toBe(false); // Equal to limit is not exceeding
      expect(underLimit).toBe(false);
      expect(overLimit).toBe(true);
    });
  });

  describe("getRecommendedLimit", () => {
    it("should return correct limit for Claude", () => {
      const limit = service.getRecommendedLimit("claude");
      expect(limit).toBe(180000);
    });

    it("should return correct limit for GPT-4", () => {
      const limit = service.getRecommendedLimit("gpt-4");
      expect(limit).toBe(120000);
    });

    it("should return correct limit for GPT-3.5", () => {
      const limit = service.getRecommendedLimit("gpt-3.5");
      expect(limit).toBe(15000);
    });

    it("should return conservative default for unknown models", () => {
      const limit = service.getRecommendedLimit("default");
      expect(limit).toBe(20000);
    });
  });

  describe("cleanup", () => {
    it("should clear encoder cache", async () => {
      const { getEncoding } = await import("js-tiktoken");
      vi.mocked(getEncoding).mockReturnValue(mockEncoder as Tiktoken);

      // Create some cached encoders
      service.countTokens("test", "claude");
      service.countTokens("test", "gpt-4");

      // Cleanup
      service.cleanup();

      // After cleanup, new calls should create new encoders
      vi.mocked(getEncoding).mockClear();
      service.countTokens("test", "claude");
      expect(getEncoding).toHaveBeenCalledTimes(1);
    });

    it("should handle multiple cleanup calls gracefully", () => {
      expect(() => {
        service.cleanup();
        service.cleanup();
        service.cleanup();
      }).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle special characters in text", () => {
      const specialText = 'Hello\n\tWorld\r\n!@#$%^&*()_+{}[]|\\:";<>?,./~`';
      const result = service.countTokens(specialText, "default");

      expect(result.tokens).toBeGreaterThan(0);
      expect(result.characterCount).toBe(specialText.length);
    });

    it("should handle text with only whitespace", () => {
      const whitespaceText = "   \n\t\r\n   ";
      const result = service.countTokens(whitespaceText, "claude");

      expect(result.tokens).toBeGreaterThan(0);
      expect(result.characterCount).toBe(whitespaceText.length);
    });

    it("should handle text with repeated patterns", () => {
      const repeatedText = "abcd".repeat(1000);
      const result = service.countTokens(repeatedText, "gpt-4");

      expect(result.tokens).toBeGreaterThan(0);
      expect(result.characterCount).toBe(4000);
    });

    it("should handle mixed content detection", async () => {
      const { getEncoding } = await import("js-tiktoken");
      vi.mocked(getEncoding).mockImplementation(() => {
        throw new Error("Force estimation");
      });

      const mixedText = "Normal text with <some>HTML</some> content mixed in";
      const result = service.countTokens(mixedText, "default");

      // Should detect as code due to angle brackets
      expect(result.tokens).toBe(Math.ceil(mixedText.length / 3.5));
    });
  });

  describe("integration scenarios", () => {
    it("should handle typical MCP workflow", async () => {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head><title>Test Page</title></head>
          <body>
            <h1>Welcome</h1>
            <p>This is a test page with some content.</p>
          </body>
        </html>
      `;

      const result = service.countTokens(htmlContent, "claude");
      const exceedsSmallLimit = service.exceedsLimit(htmlContent, 10, "claude");
      const exceedsLargeLimit = service.exceedsLimit(htmlContent, 10000, "claude");

      expect(result.tokens).toBeGreaterThan(0);
      expect(result.method).toBeDefined();
      expect(exceedsSmallLimit).toBe(true);
      expect(exceedsLargeLimit).toBe(false);
    });

    it("should handle large content that exceeds model limits", () => {
      const hugeContent = "x".repeat(1000000); // 1M characters

      const claudeResult = service.countTokens(hugeContent, "claude");
      const exceedsClaude = service.exceedsLimit(
        hugeContent,
        service.getRecommendedLimit("claude"),
        "claude",
      );

      expect(claudeResult.tokens).toBeGreaterThan(180000);
      expect(exceedsClaude).toBe(true);
    });

    it("should provide consistent results for same input", () => {
      const text = "Consistent test message";

      const result1 = service.countTokens(text, "gpt-4");
      const result2 = service.countTokens(text, "gpt-4");

      expect(result1).toEqual(result2);
    });

    it("should handle different models with same text", () => {
      const text = "Test message for multiple models";

      const claudeResult = service.countTokens(text, "claude");
      const gpt4Result = service.countTokens(text, "gpt-4");
      const gpt35Result = service.countTokens(text, "gpt-3.5");
      const defaultResult = service.countTokens(text, "default");

      // All should have same character and byte counts
      expect(claudeResult.characterCount).toBe(gpt4Result.characterCount);
      expect(gpt4Result.characterCount).toBe(gpt35Result.characterCount);
      expect(gpt35Result.characterCount).toBe(defaultResult.characterCount);

      // Token counts might vary slightly based on encoder
      expect(claudeResult.tokens).toBeGreaterThan(0);
      expect(gpt4Result.tokens).toBeGreaterThan(0);
      expect(gpt35Result.tokens).toBeGreaterThan(0);
      expect(defaultResult.tokens).toBeGreaterThan(0);
    });
  });
});
