/**
 * Brooklyn Documentation Service - Intelligent doc access with platform awareness
 * Part of extensible documentation framework supporting multiple tools
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getLogger } from "../../shared/pino-logger.js";
import type {
  BrooklynDocsTopic,
  DocumentationQueryArgs,
  DocumentationResponse,
  DocumentationSearchResult,
  DocumentationService,
  DocumentationTopic,
  Platform,
} from "./types.js";

// Lazy logger initialization pattern
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("brooklyn-docs");
  }
  return logger;
}

// Get project root directory
// When bundled, we need to use process.cwd() as the binary runs from project root
// In development, we can use relative paths from the source location
const projectRoot = process.cwd();

export class BrooklynDocsService implements DocumentationService {
  private topics: BrooklynDocsTopic[] = [
    // Native dependencies topic removed; consolidated under browser-based rendering
    {
      id: "getting-started",
      title: "Getting Started with Brooklyn",
      description: "Quick setup guide and basic usage examples",
      keywords: ["setup", "start", "quick", "install", "claude", "mcp", "browser"],
      category: "guides",
      filePath: "docs/development/local-dev-mode/index.md",
      sections: ["Installation", "Configuration", "First Steps"],
    },
    {
      id: "troubleshooting",
      title: "Troubleshooting Common Issues",
      description: "Solutions for common Brooklyn and browser automation problems",
      keywords: [
        "error",
        "fail",
        "problem",
        "debug",
        "browser",
        "timeout",
        "permission",
        "install",
      ],
      category: "support",
      filePath: "docs/development/local-dev-mode/troubleshooting.md",
      sections: ["Browser Issues", "Installation Problems", "Performance"],
    },
    {
      id: "installation",
      title: "Installation Guide",
      description: "Complete installation instructions for all platforms",
      keywords: ["install", "setup", "binary", "build", "requirements"],
      platforms: ["darwin", "linux", "win32"],
      category: "installation",
      filePath: "docs/installation/native-dependencies.md",
    },
    {
      id: "architecture",
      title: "Brooklyn Architecture",
      description: "Understanding Brooklyn's internal architecture and design patterns",
      keywords: ["architecture", "design", "mcp", "browser", "pool", "router", "engine"],
      category: "technical",
      filePath: "docs/development/local-dev-mode/architecture.md",
    },
    {
      id: "examples",
      title: "Usage Examples",
      description: "Practical examples and common usage patterns",
      keywords: ["example", "usage", "pattern", "guide", "tutorial"],
      category: "guides",
      filePath: "docs/development/local-dev-mode/usage.md",
    },
  ];

  getTopics(): DocumentationTopic[] {
    return this.topics;
  }

  async getTopic(topicId: string, platform?: Platform): Promise<DocumentationResponse> {
    const log = ensureLogger();

    try {
      const topic = this.topics.find((t) => t.id === topicId);
      if (!topic) {
        return {
          success: false,
          error: `Topic '${topicId}' not found. Available topics: ${this.topics.map((t) => t.id).join(", ")}`,
        };
      }

      const resolvedPlatform = this.resolvePlatform(platform);
      log.info("Retrieving documentation topic", {
        topicId,
        platform: resolvedPlatform,
        filePath: topic.filePath,
      });

      const content = await this.readDocumentationFile(topic.filePath);
      const filteredContent = await this.filterContentForPlatform(content, resolvedPlatform, topic);

      return {
        success: true,
        topic: topicId,
        platform: resolvedPlatform,
        content: filteredContent,
        relatedTopics: this.getRelatedTopics(topicId),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error("Failed to retrieve topic", { topicId, platform, error: errorMessage });

      return {
        success: false,
        error: `Failed to retrieve topic '${topicId}': ${errorMessage}`,
      };
    }
  }

  async search(query: string, platform?: Platform): Promise<DocumentationResponse> {
    const log = ensureLogger();

    try {
      const resolvedPlatform = this.resolvePlatform(platform);
      log.info("Searching documentation", { query, platform: resolvedPlatform });

      const results: DocumentationSearchResult[] = [];
      const keywords = query.toLowerCase().split(/\\s+/);

      // Search through all topics
      for (const topic of this.topics) {
        // Skip if topic doesn't match platform filter
        if (
          resolvedPlatform !== "auto" &&
          topic.platforms &&
          !topic.platforms.includes(resolvedPlatform)
        ) {
          continue;
        }

        // Calculate relevance based on keyword matches
        const relevance = this.calculateRelevance(keywords, topic);
        if (relevance > 0.1) {
          try {
            const content = await this.readDocumentationFile(topic.filePath);
            const excerpt = this.extractExcerpt(content, keywords);

            results.push({
              title: topic.title,
              excerpt,
              section: topic.category,
              relevance,
              platform: resolvedPlatform,
              content: topic.id, // Store topic ID for potential full retrieval
            });
          } catch (error) {
            log.warn("Failed to read documentation file for search", {
              topicId: topic.id,
              filePath: topic.filePath,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Sort by relevance
      results.sort((a, b) => b.relevance - a.relevance);

      return {
        success: true,
        searchQuery: query,
        results: results.slice(0, 10), // Limit to top 10 results
        suggestions: this.generateSearchSuggestions(query),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error("Documentation search failed", { query, platform, error: errorMessage });

      return {
        success: false,
        error: `Search failed: ${errorMessage}`,
      };
    }
  }

  async getFormatted(args: DocumentationQueryArgs): Promise<DocumentationResponse> {
    const log = ensureLogger();

    try {
      // Handle topic-based requests
      if (args.topic) {
        return await this.getTopic(args.topic, args.platform);
      }

      // Handle search-based requests
      if (args.search) {
        return await this.search(args.search, args.platform);
      }

      // Handle "all" topics request
      if (args.topic === "all") {
        const platform = this.resolvePlatform(args.platform);
        const allContent: string[] = [];
        const relatedTopics: string[] = [];

        for (const topic of this.topics) {
          if (platform !== "auto" && topic.platforms && !topic.platforms.includes(platform)) {
            continue;
          }

          try {
            const content = await this.readDocumentationFile(topic.filePath);
            const filteredContent = await this.filterContentForPlatform(content, platform, topic);
            allContent.push(`# ${topic.title}\\n\\n${filteredContent}`);
            relatedTopics.push(topic.id);
          } catch (error) {
            log.warn("Failed to include topic in 'all' request", {
              topicId: topic.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return {
          success: true,
          topic: "all",
          platform,
          content: allContent.join("\\n\\n---\\n\\n"),
          relatedTopics,
        };
      }

      return {
        success: false,
        error: "Please specify either 'topic' or 'search' parameter",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error("Failed to format documentation", { args, error: errorMessage });

      return {
        success: false,
        error: `Failed to format documentation: ${errorMessage}`,
      };
    }
  }

  getRelatedTopics(topicId: string): string[] {
    const topic = this.topics.find((t) => t.id === topicId);
    if (!topic) return [];

    // Find related topics based on category and keywords
    return this.topics
      .filter(
        (t) =>
          t.id !== topicId &&
          (t.category === topic.category ||
            t.keywords.some((keyword) => topic.keywords.includes(keyword))),
      )
      .map((t) => t.id)
      .slice(0, 3); // Limit to 3 related topics
  }

  /**
   * Resolve platform to actual platform string
   */
  private resolvePlatform(platform?: Platform): Platform {
    if (!platform || platform === "auto") {
      return process.platform as Platform;
    }
    return platform;
  }

  /**
   * Read documentation file from project
   */
  private async readDocumentationFile(filePath: string): Promise<string> {
    const fullPath = join(projectRoot, filePath);
    return await readFile(fullPath, "utf-8");
  }

  /**
   * Filter content based on platform (extract platform-specific sections)
   */
  private async filterContentForPlatform(
    content: string,
    platform: Platform,
    topic: BrooklynDocsTopic,
  ): Promise<string> {
    if (platform === "auto" || !topic.platforms?.includes(platform)) {
      return content; // Return full content if no platform filtering needed
    }

    // Extract platform-specific sections
    const platformNames = {
      darwin: ["macOS", "Mac", "Darwin", "brew"],
      linux: ["Linux", "Ubuntu", "Debian", "apt", "dnf", "yum"],
      win32: ["Windows", "Win32", "choco", "scoop"],
    };

    const platformTerms = platformNames[platform] || [];
    const lines = content.split("\\n");
    const filteredLines: string[] = [];
    let inRelevantSection = false;
    let sectionLevel = 0;

    for (const line of lines) {
      // Check for headers
      const headerMatch = line.match(/^(#+)\\s+(.+)$/);
      if (headerMatch?.[1] && headerMatch[2]) {
        const level = headerMatch[1].length;
        const headerText = headerMatch[2];

        // Check if this header is platform-relevant
        const isPlatformRelevant = platformTerms.some((term) =>
          headerText.toLowerCase().includes(term.toLowerCase()),
        );

        if (isPlatformRelevant) {
          inRelevantSection = true;
          sectionLevel = level;
          filteredLines.push(line);
        } else if (inRelevantSection && level <= sectionLevel) {
          // End of relevant section
          inRelevantSection = false;
        } else if (!inRelevantSection) {
          // Keep general headers
          filteredLines.push(line);
        }
      } else if (
        inRelevantSection ||
        !platformTerms.some(
          (term) =>
            line.toLowerCase().includes(term.toLowerCase()) &&
            !platformTerms.some((pt) => pt.toLowerCase() === platform),
        )
      ) {
        // Keep lines in relevant sections or general lines
        filteredLines.push(line);
      }
    }

    return filteredLines.join("\\n");
  }

  /**
   * Calculate relevance score based on keyword matches
   */
  private calculateRelevance(queryKeywords: string[], topic: BrooklynDocsTopic): number {
    let score = 0;
    const topicKeywords = [
      ...topic.keywords,
      topic.title.toLowerCase(),
      topic.description.toLowerCase(),
    ];

    for (const queryKeyword of queryKeywords) {
      for (const topicKeyword of topicKeywords) {
        if (topicKeyword.includes(queryKeyword) || queryKeyword.includes(topicKeyword)) {
          score += topicKeyword === queryKeyword ? 1 : 0.7; // Exact match vs partial match
        }
      }
    }

    return Math.min(score / queryKeywords.length, 1); // Normalize to 0-1
  }

  /**
   * Extract relevant excerpt from content based on keywords
   */
  private extractExcerpt(content: string, keywords: string[]): string {
    const sentences = content.split(/[.!?]\\s+/);

    // Find sentence with most keyword matches
    let bestSentence = "";
    let bestScore = 0;

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      const score = keywords.reduce(
        (acc, keyword) => acc + (lowerSentence.includes(keyword) ? 1 : 0),
        0,
      );

      if (score > bestScore) {
        bestScore = score;
        bestSentence = sentence;
      }
    }

    return bestSentence.trim().substring(0, 200) + (bestSentence.length > 200 ? "..." : "");
  }

  /**
   * Generate search suggestions based on available topics
   */
  private generateSearchSuggestions(query: string): string[] {
    const suggestions = new Set<string>();
    const queryLower = query.toLowerCase();

    // Add keywords from topics that partially match
    for (const topic of this.topics) {
      for (const keyword of topic.keywords) {
        if (keyword.includes(queryLower) || queryLower.includes(keyword)) {
          suggestions.add(keyword);
        }
      }
    }

    return Array.from(suggestions).slice(0, 5);
  }
}
