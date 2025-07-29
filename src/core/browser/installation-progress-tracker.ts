/**
 * Installation progress tracking for user feedback
 * Provides real-time updates during browser installation
 */

import { getLogger } from "../../shared/pino-logger.js";
import type { BrowserInstallationProgress, BrowserType } from "./types.js";

// Lazy logger initialization
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("browser-installation-progress");
  }
  return logger;
}

export class InstallationProgressTracker {
  private currentProgress: BrowserInstallationProgress;
  private startTime: number;
  private progressCallbacks: Array<(progress: BrowserInstallationProgress) => void> = [];
  private lastReportedProgress = 0;
  private readonly reportThreshold = 5; // Report every 5% change

  constructor(private readonly browserType: BrowserType) {
    this.currentProgress = {
      phase: "checking",
      progress: 0,
      message: `Checking ${browserType} installation status...`,
    };
    this.startTime = Date.now();
  }

  /**
   * Subscribe to progress updates
   */
  onProgress(callback: (progress: BrowserInstallationProgress) => void): void {
    this.progressCallbacks.push(callback);
    // Immediately send current progress
    callback(this.currentProgress);
  }

  /**
   * Update installation phase
   */
  setPhase(phase: BrowserInstallationProgress["phase"], message?: string, progress?: number): void {
    const phaseProgress = this.getPhaseProgress(phase);
    this.currentProgress = {
      ...this.currentProgress,
      phase,
      progress: progress ?? phaseProgress,
      message: message ?? this.getDefaultPhaseMessage(phase),
    };

    this.reportProgress();
  }

  /**
   * Update download progress
   */
  updateDownloadProgress(bytesDownloaded: number, totalBytes: number): void {
    const percentage = Math.round((bytesDownloaded / totalBytes) * 100);
    const downloadPhaseProgress = 10 + percentage * 0.6; // Download is 10-70% of total

    this.currentProgress = {
      ...this.currentProgress,
      phase: "downloading",
      progress: downloadPhaseProgress,
      bytesDownloaded,
      totalBytes,
      message: `Downloading ${this.browserType}: ${this.formatBytes(bytesDownloaded)} / ${this.formatBytes(totalBytes)}`,
      estimatedTimeRemaining: this.estimateTimeRemaining(bytesDownloaded, totalBytes),
    };

    // Only report if progress changed significantly
    if (Math.abs(downloadPhaseProgress - this.lastReportedProgress) >= this.reportThreshold) {
      this.reportProgress();
      this.lastReportedProgress = downloadPhaseProgress;
    }
  }

  /**
   * Mark installation as complete
   */
  complete(message?: string): void {
    this.setPhase(
      "complete",
      message ?? `${this.browserType} installation completed successfully`,
      100,
    );
    ensureLogger().info("Browser installation completed", {
      browserType: this.browserType,
      duration: Date.now() - this.startTime,
    });
  }

  /**
   * Mark installation as failed
   */
  fail(error: Error | string): void {
    const errorMessage = error instanceof Error ? error.message : error;
    this.setPhase(
      "failed",
      `Failed to install ${this.browserType}: ${errorMessage}`,
      this.currentProgress.progress,
    );
    ensureLogger().error("Browser installation failed", {
      browserType: this.browserType,
      error: errorMessage,
      duration: Date.now() - this.startTime,
    });
  }

  /**
   * Get current progress state
   */
  getProgress(): BrowserInstallationProgress {
    return { ...this.currentProgress };
  }

  // Private helper methods

  private reportProgress(): void {
    ensureLogger().debug("Installation progress update", {
      browserType: this.browserType,
      phase: this.currentProgress.phase,
      progress: this.currentProgress.progress,
    });

    for (const callback of this.progressCallbacks) {
      try {
        callback(this.currentProgress);
      } catch (error) {
        ensureLogger().warn("Progress callback error", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private getPhaseProgress(phase: BrowserInstallationProgress["phase"]): number {
    switch (phase) {
      case "checking":
        return 5;
      case "downloading":
        return 10; // Will be updated with actual download progress
      case "extracting":
        return 75;
      case "verifying":
        return 90;
      case "complete":
        return 100;
      case "failed":
        return this.currentProgress.progress; // Keep current progress
      default:
        return 0;
    }
  }

  private getDefaultPhaseMessage(phase: BrowserInstallationProgress["phase"]): string {
    switch (phase) {
      case "checking":
        return `Checking ${this.browserType} installation status...`;
      case "downloading":
        return `Downloading ${this.browserType} browser...`;
      case "extracting":
        return `Extracting ${this.browserType} files...`;
      case "verifying":
        return `Verifying ${this.browserType} installation...`;
      case "complete":
        return `${this.browserType} installation completed`;
      case "failed":
        return `${this.browserType} installation failed`;
      default:
        return `Installing ${this.browserType}...`;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
  }

  private estimateTimeRemaining(bytesDownloaded: number, totalBytes: number): number {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    if (bytesDownloaded === 0 || elapsedSeconds < 1) {
      return 0;
    }

    const bytesPerSecond = bytesDownloaded / elapsedSeconds;
    const remainingBytes = totalBytes - bytesDownloaded;
    return Math.round(remainingBytes / bytesPerSecond);
  }
}

/**
 * Format estimated time for display
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`;
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0
      ? `${minutes} minutes ${remainingSeconds} seconds`
      : `${minutes} minutes`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes > 0 ? `${hours} hours ${minutes} minutes` : `${hours} hours`;
}
