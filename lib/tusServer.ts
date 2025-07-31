import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import path from "path";
import { publishToQueue, RabbitMQQueues } from "./rabbitmq";
import { ENV } from "./environments";
import { updateVideoRecord, getVideoRecord } from "./videoStore";

export const createTusServer = () => {
  const server = new Server({
    path: "/api/v1/tus",
    datastore: new FileStore({
      directory: path.join(process.cwd(), ENV.UPLOAD_PATH),
    }),
    onUploadFinish: async (req, upload) => {
      console.log(`Upload finished for ${upload.id}`);

      // Get the uploadId from metadata if provided, otherwise use TUS-generated ID
      const uploadId = upload.metadata?.uploadId || upload.id;

      // Double-check the record still exists
      const videoRecord = getVideoRecord(uploadId!);
      if (!videoRecord) {
        console.error(`❌ Video record disappeared during upload: ${uploadId}`);
        return {};
      }

      // Update video record status to processing
      const updatedRecord = updateVideoRecord(uploadId!, {
        status: "processing",
        progress: 0,
      });

      if (!updatedRecord) {
        console.error(`❌ Failed to update video record: ${uploadId}`);
        return {};
      }

      // Trigger video processing via RabbitMQ
      await publishToQueue(RabbitMQQueues.VIDEO_PROCESSING, {
        uploadId: uploadId,
        filePath: upload.storage?.path,
        filename: upload.metadata?.filename || videoRecord.filename,
        packager: "ffmpeg",
        callbackUrl: videoRecord.callbackUrl,
        s3Path: videoRecord.s3Path,
      });

      console.log(`✅ Video queued for processing: ${uploadId}`);
      return {};
    },
    onUploadCreate: async (req, upload) => {
      console.log(`Upload creation requested for ${upload.id}`);

      // Get the uploadId from metadata if provided, otherwise use TUS-generated ID
      const uploadId = upload.metadata?.uploadId || upload.id;

      // Check if video record exists
      const videoRecord = getVideoRecord(uploadId!);
      if (!videoRecord) {
        console.error(`❌ No video record found for upload ID: ${uploadId}`);
        throw new Error(
          `Video record not found. Please create video record first using POST /api/v1/video/create`
        );
      }

      // Validate that the record is in the correct state
      if (videoRecord.status !== "uploading") {
        console.error(
          `❌ Invalid video record status: ${videoRecord.status} for upload ID: ${uploadId}`
        );
        throw new Error(
          `Video record is not in uploading state. Current status: ${videoRecord.status}`
        );
      }

      console.log(`✅ Upload validated for ${uploadId}`);
      return {};
    },
  });

  return server;
};
