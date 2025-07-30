import { Channel } from "amqplib";
import { transcodeAndUpload } from "../controllers/utils/upload-utils";
import { updateVideoRecord } from "../lib/videoStore";
import { RabbitMQQueues } from "../lib/rabbitmq";
import axios from "axios";
import fs from "fs/promises";
import path from "path";

export interface VideoProcessingMessage {
  uploadId: string;
  filePath: string;
  filename: string;
  packager: "ffmpeg";
  callbackUrl?: string;
}

export const startVideoProcessingWorker = async (channel: Channel) => {
  console.log("🎬 Starting video processing worker...");

  await channel.assertQueue(RabbitMQQueues.VIDEO_PROCESSING, { durable: true });

  // Set prefetch to 1 to process one video at a time
  channel.prefetch(1);

  channel.consume(RabbitMQQueues.VIDEO_PROCESSING, async (msg) => {
    if (!msg) return;

    try {
      const job: VideoProcessingMessage = JSON.parse(msg.content.toString());
      console.log(`📹 Processing video: ${job.filename} (${job.uploadId})`);

      // Update status to processing
      updateVideoRecord(job.uploadId, {
        status: "processing",
        progress: 10,
      });

      // Process the video
      const streamUrl = await transcodeAndUpload(
        job.filePath,
        job.filename,
        job.uploadId
      );

      // Update status to completed
      const updatedRecord = updateVideoRecord(job.uploadId, {
        status: "completed",
        progress: 100,
        streamUrl,
      });

      console.log(`✅ Video processing completed: ${job.filename}`);

      // Clean up the original video file from disk after successful processing
      try {
        await fs.unlink(job.filePath);
        console.log(`🗑️ Cleaned up original video file: ${job.filePath}`);
      } catch (cleanupError) {
        console.warn(
          `⚠️ Failed to cleanup video file ${job.filePath}:`,
          cleanupError
        );
        // Don't fail the entire process if cleanup fails
      }

      // Send webhook callback if provided
      if (job.callbackUrl && updatedRecord) {
        try {
          const response = await axios.post(job.callbackUrl, {
            videoId: job.uploadId,
            filename: job.filename,
            status: "completed",
            streamUrl,
          });

          if (response.status === 200) {
            // Update callback status to completed
            updateVideoRecord(job.uploadId, {
              callbackStatus: "completed",
              callbackLastAttempt: new Date(),
            });
            console.log(
              `📞 Webhook callback sent successfully to: ${job.callbackUrl}`
            );
          } else {
            // First retry attempt failed, will be retried by cron job
            updateVideoRecord(job.uploadId, {
              callbackRetryCount: 1,
              callbackLastAttempt: new Date(),
            });
            console.log(
              `⚠️ Webhook callback failed with status ${response.status}, will retry`
            );
          }
        } catch (webhookError) {
          // First retry attempt failed, will be retried by cron job
          updateVideoRecord(job.uploadId, {
            callbackRetryCount: 1,
            callbackLastAttempt: new Date(),
          });
          console.error(
            "Failed to send webhook callback, will retry:",
            webhookError
          );
        }
      }

      // Acknowledge message
      channel.ack(msg);
    } catch (error) {
      console.error("❌ Video processing failed:", error);

      try {
        const job: VideoProcessingMessage = JSON.parse(msg.content.toString());

        // Update status to failed
        const updatedRecord = updateVideoRecord(job.uploadId, {
          status: "failed",
          error: error instanceof Error ? error.message : "Processing failed",
        });

        // Clean up the original video file from disk even on failure
        // to prevent disk space accumulation
        try {
          await fs.unlink(job.filePath);
          console.log(`🗑️ Cleaned up failed video file: ${job.filePath}`);
        } catch (cleanupError) {
          console.warn(
            `⚠️ Failed to cleanup failed video file ${job.filePath}:`,
            cleanupError
          );
          // Don't fail the entire process if cleanup fails
        }

        // Send webhook callback for failure if provided
        if (job.callbackUrl && updatedRecord) {
          try {
            const response = await axios.post(job.callbackUrl, {
              videoId: job.uploadId,
              filename: job.filename,
              status: "failed",
              error:
                error instanceof Error ? error.message : "Processing failed",
            });

            if (response.status === 200) {
              // Update callback status to completed
              updateVideoRecord(job.uploadId, {
                callbackStatus: "completed",
                callbackLastAttempt: new Date(),
              });
            } else {
              // First retry attempt failed, will be retried by cron job
              updateVideoRecord(job.uploadId, {
                callbackRetryCount: 1,
                callbackLastAttempt: new Date(),
              });
            }
          } catch (webhookError) {
            // First retry attempt failed, will be retried by cron job
            updateVideoRecord(job.uploadId, {
              callbackRetryCount: 1,
              callbackLastAttempt: new Date(),
            });
            console.error(
              "Failed to send failure webhook callback, will retry:",
              webhookError
            );
          }
        }
      } catch (parseError) {
        console.error(
          "Failed to parse message for error handling:",
          parseError
        );
      }

      // Acknowledge message even on failure to prevent infinite retry
      channel.ack(msg);
    }
  });

  console.log("🎬 Video processing worker started");
};
