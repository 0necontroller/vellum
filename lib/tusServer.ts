import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import path from "path";
import { publishToQueue, RabbitMQQueues } from "./rabbitmq";
import { ENV } from "./environments";
import { updateVideoRecord } from "./videoStore";

export const createTusServer = () => {
  const server = new Server({
    path: "/api/v1/tus",
    datastore: new FileStore({
      directory: path.join(process.cwd(), ENV.UPLOAD_PATH),
    }),
    onUploadFinish: async (req, upload) => {
      console.log(`Upload finished for ${upload.id}`);

      // Update video record status
      updateVideoRecord(upload.id!, {
        status: "processing",
        progress: 0,
      });

      // Trigger video processing via RabbitMQ
      await publishToQueue(RabbitMQQueues.VIDEO_PROCESSING, {
        uploadId: upload.id,
        filePath: upload.storage?.path,
        filename: upload.metadata?.filename,
        packager: upload.metadata?.packager || "ffmpeg",
        callbackUrl: upload.metadata?.callbackUrl,
      });

      return {};
    },
    onUploadCreate: async (req, upload) => {
      console.log(`Upload created for ${upload.id}`);

      // Update video record with upload progress
      updateVideoRecord(upload.id!, {
        status: "uploading",
      });

      return {};
    },
  });

  return server;
};
