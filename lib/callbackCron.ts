import axios from "axios";
import * as cron from "node-cron";
import {
  getVideosWithPendingCallbacks,
  updateVideoRecord,
  getVideoRecord,
} from "./videoStore";

export class CallbackCronService {
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  /**
   * Start the cron job that runs every minute
   */
  start() {
    if (this.isRunning) {
      console.log("⏰ Callback cron service is already running");
      return;
    }

    console.log("⏰ Starting callback cron service (runs every minute)");
    this.isRunning = true;

    // Run immediately on start
    this.processCallbacks();

    // Create cron job that runs every minute
    this.cronJob = cron.schedule(
      "* * * * *",
      () => {
        this.processCallbacks();
      },
      {
        timezone: "UTC",
      }
    );

    console.log("⏰ Callback cron job scheduled to run every minute");
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob.destroy();
      this.cronJob = null;
    }
    this.isRunning = false;
    console.log("⏰ Callback cron service stopped");
  }

  /**
   * Process pending callbacks
   */
  private async processCallbacks() {
    try {
      const pendingVideos = getVideosWithPendingCallbacks();

      if (pendingVideos.length === 0) {
        return;
      }

      console.log(`📞 Processing ${pendingVideos.length} pending callbacks`);

      for (const video of pendingVideos) {
        await this.processVideoCallback(video);
      }
    } catch (error) {
      console.error("Error processing callbacks:", error);
    }
  }

  /**
   * Process a single video callback
   */
  private async processVideoCallback(video: any) {
    if (!video.callbackUrl) return;

    try {
      console.log(
        `📞 Attempting callback for video ${video.id} (attempt ${
          video.callbackRetryCount + 1
        }/4)`
      );

      const callbackData = {
        videoId: video.id,
        filename: video.filename,
        status: video.status,
        ...(video.streamUrl && { streamUrl: video.streamUrl }),
        ...(video.error && { error: video.error }),
      };

      const response = await axios.post(video.callbackUrl, callbackData, {
        timeout: 10000, // 10 second timeout
      });

      if (response.status === 200) {
        // Callback successful
        updateVideoRecord(video.id, {
          callbackStatus: "completed",
          callbackLastAttempt: new Date(),
        });
        console.log(`✅ Callback successful for video ${video.id}`);
      } else {
        // Non-200 response, increment retry count
        await this.handleCallbackFailure(video, `HTTP ${response.status}`);
      }
    } catch (error) {
      // Network error or timeout, increment retry count
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await this.handleCallbackFailure(video, errorMessage);
    }
  }

  /**
   * Handle callback failure and update retry count
   */
  private async handleCallbackFailure(video: any, errorMessage: string) {
    const newRetryCount = video.callbackRetryCount + 1;

    if (newRetryCount >= 4) {
      // Max retries reached, mark as failed
      updateVideoRecord(video.id, {
        callbackStatus: "failed",
        callbackRetryCount: newRetryCount,
        callbackLastAttempt: new Date(),
      });
      console.log(
        `❌ Callback failed permanently for video ${video.id} after 4 attempts`
      );
    } else {
      // Increment retry count
      updateVideoRecord(video.id, {
        callbackRetryCount: newRetryCount,
        callbackLastAttempt: new Date(),
      });
      console.log(
        `⚠️ Callback failed for video ${video.id} (attempt ${newRetryCount}/4): ${errorMessage}`
      );
    }
  }

  /**
   * Get the current status of the cron service
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      cronSchedule: "* * * * *", // Every minute
      nextRun:
        this.cronJob && this.isRunning
          ? "Next execution within 1 minute"
          : null,
    };
  }
}

// Export a singleton instance
export const callbackCronService = new CallbackCronService();
