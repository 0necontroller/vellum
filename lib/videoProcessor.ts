import { Channel } from "amqplib";
import { transcodeAndUpload } from "../controllers/utils/upload-utils";
import { updateVideoRecord } from "../lib/videoStore";
import { ENV } from "../lib/environments";
import { RabbitMQQueues } from "../lib/rabbitmq";
import axios from "axios";

export interface VideoProcessingMessage {
  uploadId: string;
  filePath: string;
  filename: string;
  packager: "ffmpeg" | "shaka";
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

      // Send webhook callback if provided
      if (job.callbackUrl && updatedRecord) {
        try {
          await axios.post(job.callbackUrl, {
            videoId: job.uploadId,
            filename: job.filename,
            status: "completed",
            streamUrl,
          });
          console.log(`📞 Webhook callback sent to: ${job.callbackUrl}`);
        } catch (webhookError) {
          console.error("Failed to send webhook callback:", webhookError);
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

        // Send webhook callback for failure if provided
        if (job.callbackUrl && updatedRecord) {
          try {
            await axios.post(job.callbackUrl, {
              videoId: job.uploadId,
              filename: job.filename,
              status: "failed",
              error:
                error instanceof Error ? error.message : "Processing failed",
            });
          } catch (webhookError) {
            console.error(
              "Failed to send failure webhook callback:",
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
