/**
 * Communication platform integration interfaces
 * For Slack, Mattermost, and other team communication tools
 */

export interface CommunicationProvider {
  name: string;
  sendMessage(channel: string, message: string): Promise<void>;
  sendNotification(user: string, message: string): Promise<void>;
  sendStatusUpdate(channel: string, status: BrooklenStatus): Promise<void>;
  sendErrorAlert(channel: string, error: BrooklenError): Promise<void>;
}

export interface BrooklenStatus {
  service: string;
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  browserPool: {
    total: number;
    available: number;
    active: number;
  };
  teams: {
    active: number;
    totalUsage: number;
  };
  timestamp: Date;
}

export interface BrooklenError {
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  context: Record<string, unknown>;
  timestamp: Date;
  teamId?: string;
}

export interface SlackIntegration extends CommunicationProvider {
  webhookUrl: string;
  botToken?: string;
  channelMappings: Record<string, string>; // team -> channel
}

export interface MattermostIntegration extends CommunicationProvider {
  webhookUrl: string;
  accessToken?: string;
  channelMappings: Record<string, string>; // team -> channel
}

export interface CommunicationTools {
  name: "brooklyn_notify";
  description: "Send notifications to team communication channels";
  inputSchema: {
    type: "object";
    properties: {
      platform: {
        type: "string";
        enum: ["slack", "mattermost"];
      };
      channel: {
        type: "string";
        description: "Channel or user to notify";
      };
      message: {
        type: "string";
        description: "Message to send";
      };
      type: {
        type: "string";
        enum: ["message", "status", "error"];
        default: "message";
      };
    };
    required: ["platform", "channel", "message"];
  };
}
