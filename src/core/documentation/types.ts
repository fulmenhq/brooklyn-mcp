/**
 * Documentation Service Types - Extensible framework for tool-specific docs
 * Supports brooklyn_docs, future claude_docs, playwright_docs, etc.
 */

export type Platform = "darwin" | "linux" | "win32" | "auto";
export type DocumentationFormat = "markdown" | "summary" | "structured";

export interface DocumentationTopic {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  platforms?: Platform[];
  category: string;
}

export interface DocumentationSearchResult {
  title: string;
  excerpt: string;
  section: string;
  relevance: number;
  platform?: Platform;
  url?: string;
  content?: string;
}

export interface DocumentationResponse {
  success: boolean;
  topic?: string;
  platform?: Platform;
  searchQuery?: string;
  content?: string;
  results?: DocumentationSearchResult[];
  relatedTopics?: string[];
  suggestions?: string[];
  error?: string;
}

export interface DocumentationQueryArgs {
  topic?: string;
  search?: string;
  platform?: Platform;
  format?: DocumentationFormat;
}

/**
 * Base interface for all documentation services
 * Extensible pattern for brooklyn_docs, claude_docs, etc.
 */
export interface DocumentationService {
  /**
   * Get available topics for this documentation source
   */
  getTopics(): DocumentationTopic[];

  /**
   * Retrieve specific topic documentation
   */
  getTopic(topicId: string, platform?: Platform): Promise<DocumentationResponse>;

  /**
   * Search within documentation content
   */
  search(query: string, platform?: Platform): Promise<DocumentationResponse>;

  /**
   * Get formatted documentation content
   */
  getFormatted(args: DocumentationQueryArgs): Promise<DocumentationResponse>;

  /**
   * Get related topics based on current query
   */
  getRelatedTopics(topicId: string): string[];
}

/**
 * Brooklyn-specific documentation topics
 */
export interface BrooklynDocsTopic extends DocumentationTopic {
  filePath: string;
  sections?: string[];
  dependencies?: string[];
}
