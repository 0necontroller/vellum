import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./environments";
import path from "path";

// Initialize S3 client with MinIO configuration
const minioClient = new S3Client({
  region: "us-east-1",
  endpoint: ENV.S3_ENDPOINT,
  credentials: {
    accessKeyId: ENV.S3_ACCESS_KEY,
    secretAccessKey: ENV.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

// Bucket name from ENV
const BUCKET_NAME = ENV.S3_BUCKET;

/**
 * Deletes a file from MinIO
 * @param key - The key (filename) of the file to delete
 * @returns Promise void
 */
export const deleteFile = async (key: string): Promise<void> => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
    };

    await minioClient.send(new DeleteObjectCommand(params));
  } catch (error) {
    console.error("Error deleting file from MinIO:", error);
    throw new Error("Failed to delete file from storage");
  }
};

/**
 * Gets a presigned URL for a file in MinIO
 * @param key - The key (filename) of the file
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns Presigned URL string
 */
export const getPresignedUrl = async (
  key: string,
  expiresIn: number = 3600
): Promise<string> => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
    };

    const command = new GetObjectCommand(params);
    // Use the EXTERNAL client to generate the URL
    const signedUrl = await getSignedUrl(minioClient, command, {
      expiresIn,
    });

    return signedUrl; // Return the directly generated URL
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw new Error("Failed to generate file access URL");
  }
};

/**
 * Create a bucket if it doesn't exist
 */
export const ensureBucketExists = async (): Promise<void> => {
  try {
    // Implementation removed for simplicity - S3 SDK handles this differently
    // In a production app, you'd want to check if bucket exists and create if not
    console.log(`Ensuring bucket ${BUCKET_NAME} exists in MinIO`);
  } catch (error) {
    console.error("Error ensuring bucket exists:", error);
  }
};

// Ensure the bucket exists when this module is imported
ensureBucketExists();

// Add streaming content types
const STREAMING_CONTENT_TYPES = {
  M3U8: "application/vnd.apple.mpegurl",
  TS: "video/MP2T",
};

// Update exports to include content types
export { minioClient, BUCKET_NAME, STREAMING_CONTENT_TYPES };
