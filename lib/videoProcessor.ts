import { Channel } from "amqplib";
import { transcodeAndUpload } from "../controllers/utils/upload-utils";
import { updateVideoRecord } from "../lib/videoStore";
import { RabbitMQQueues } from "../lib/rabbitmq";
import { ENV } from "../lib/environments";
import axios from "axios";
import fs from "fs/promises";
import path from "path";

export interface VideoProcessingMessage {
  uploadId: string;
  filePath: string;
  filename: string;
  packager: "ffmpeg";
  callbackUrl?: string;
  s3Path?: string;
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
        job.uploadId,
        job.s3Path
      );

      // Update status to completed
      const updatedRecord = updateVideoRecord(job.uploadId, {
        status: "completed",
        progress: 100,
        streamUrl,
      });

      console.log(`✅ Video processing completed: ${job.filename}`);

      // Clean up all related files after successful processing and S3 upload
      await cleanupVideoFiles(job.uploadId, job.filePath);

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
        } catch (webhookError: any) {
          // First retry attempt failed, will be retried by cron job
          updateVideoRecord(job.uploadId, {
            callbackRetryCount: 1,
            callbackLastAttempt: new Date(),
          });
          console.error(
            "Failed to send webhook callback, will retry:",
            webhookError.message
          );
        }
      }

      // Acknowledge message
      channel.ack(msg);
    } catch (error: any) {
      console.error("❌ Video processing failed:", error.message);

      try {
        const job: VideoProcessingMessage = JSON.parse(msg.content.toString());

        // Update status to failed
        const updatedRecord = updateVideoRecord(job.uploadId, {
          status: "failed",
          error: error instanceof Error ? error.message : "Processing failed",
        });

        // Clean up all related files even on failure to prevent disk space accumulation
        await cleanupVideoFiles(job.uploadId, job.filePath);

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
          } catch (webhookError: any) {
            // First retry attempt failed, will be retried by cron job
            updateVideoRecord(job.uploadId, {
              callbackRetryCount: 1,
              callbackLastAttempt: new Date(),
            });
            console.error(
              "Failed to send failure webhook callback, will retry:",
              webhookError.message
            );
          }
        }
      } catch (parseError: any) {
        console.error(
          "Failed to parse message for error handling:",
          parseError.message
        );
      }

      // Acknowledge message even on failure to prevent infinite retry
      channel.ack(msg);
    }
  });

  console.log("🎬 Video processing worker started");
};

/**
 * Clean up all files related to a video processing job
 */
const cleanupVideoFiles = async (
  uploadId: string,
  originalFilePath: string
) => {
  console.log(`🗑️ Starting cleanup for uploadId: ${uploadId}`);
  const cleanupTasks = [];

  // 1. Clean up the original video file from TUS uploads directory
  console.log(`🗑️ Attempting to cleanup original file: ${originalFilePath}`);
  cleanupTasks.push(
    fs
      .unlink(originalFilePath)
      .then(() =>
        console.log(`🗑️ Cleaned up original video file: ${originalFilePath}`)
      )
      .catch((error) =>
        console.warn(
          `⚠️ Failed to cleanup original video file ${originalFilePath}:`,
          error.message
        )
      )
  );

  // 2. Clean up TUS-related files (metadata files, etc.)
  // Use absolute path from process.cwd() instead of __dirname to avoid build path issues
  const uploadsDir = path.resolve(process.cwd(), ENV.UPLOAD_PATH);
  console.log(`🗑️ TUS uploads directory: ${uploadsDir}`);
  const tusFiles = [
    path.join(uploadsDir, `${uploadId}.json`), // TUS metadata file
    path.join(uploadsDir, uploadId), // TUS data file (if exists)
  ];

  for (const tusFile of tusFiles) {
    console.log(`🗑️ Attempting to cleanup TUS file: ${tusFile}`);
    cleanupTasks.push(
      fs
        .unlink(tusFile)
        .then(() => console.log(`🗑️ Cleaned up TUS file: ${tusFile}`))
        .catch((error) => {
          // Only log as warning since some files might not exist
          if (error.code !== "ENOENT") {
            console.warn(
              `⚠️ Failed to cleanup TUS file ${tusFile}:`,
              error.message
            );
          } else {
            console.log(`🗑️ TUS file not found (already cleaned): ${tusFile}`);
          }
        })
    );
  }

  // 3. Clean up processed video files directory (HLS segments, playlist, etc.)
  // The video processing creates files in controllers/videos/ directory
  const processedVideoDir = path.resolve(
    process.cwd(),
    "controllers",
    "videos",
    uploadId
  );
  console.log(
    `🗑️ Attempting to cleanup processed video directory: ${processedVideoDir}`
  );
  cleanupTasks.push(
    fs
      .rm(processedVideoDir, { recursive: true, force: true })
      .then(() =>
        console.log(
          `🗑️ Cleaned up processed video directory: ${processedVideoDir}`
        )
      )
      .catch((error) =>
        console.warn(
          `⚠️ Failed to cleanup processed video directory ${processedVideoDir}:`,
          error.message
        )
      )
  );

  // Execute all cleanup tasks in parallel
  await Promise.allSettled(cleanupTasks);
  console.log(`🗑️ Cleanup completed for uploadId: ${uploadId}`);
};
