import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import { ENV } from "../../lib/environments";
import { s3Client, BUCKET_NAME } from "../../lib/s3client";
import {
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { publishToQueue, RabbitMQQueues } from "../../lib/rabbitmq";
import { updateVideoRecord } from "../../lib/videoStore";

export interface VideoProcessingJob {
  uploadId: string;
  filePath: string;
  filename: string;
  packager: "ffmpeg";
  callbackUrl?: string;
  s3Path?: string;
}

export const processVideoAsync = async (job: VideoProcessingJob) => {
  await publishToQueue(RabbitMQQueues.VIDEO_PROCESSING, job);
};

// Function to upload files recursively (for handling subdirectories)
async function uploadFile(dirPath: string, prefix: string, uploadId?: string) {
  const files = await fsPromises.readdir(dirPath);

  // Process files in batches to reduce memory pressure
  const BATCH_SIZE = 5;
  const fileBatches = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    fileBatches.push(files.slice(i, i + BATCH_SIZE));
  }

  let uploadedCount = 0;
  let totalFiles = 0;

  // Count total files for progress tracking
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = await fsPromises.stat(filePath);
    if (!stats.isDirectory()) {
      totalFiles++;
    }
  }

  for (const batch of fileBatches) {
    const uploadPromises = batch.map(async (file) => {
      const filePath = path.join(dirPath, file);
      const stats = await fsPromises.stat(filePath);

      if (stats.isDirectory()) {
        // Create a new prefix for the subdirectory and recurse
        const newPrefix = `${prefix}/${file}`;
        await uploadFile(filePath, newPrefix, uploadId);
      } else {
        // Upload the file using streaming to reduce memory usage
        const data = await fsPromises.readFile(filePath);

        // Determine content type based on file extension
        let contentType;
        if (file.endsWith(".m3u8")) {
          contentType = "application/vnd.apple.mpegurl";
        } else if (file.endsWith(".ts")) {
          contentType = "video/MP2T";
        } else if (file.endsWith(".mp4")) {
          contentType = "video/mp4";
        } else if (file.endsWith(".m4s")) {
          contentType = "video/iso.segment";
        } else if (file.endsWith(".mpd")) {
          contentType = "application/dash+xml";
        } else if (file.endsWith(".vtt")) {
          contentType = "text/vtt";
        } else if (file.endsWith(".jpg") || file.endsWith(".jpeg")) {
          contentType = "image/jpeg";
        } else if (file.endsWith(".png")) {
          contentType = "image/png";
        } else {
          contentType = "application/octet-stream";
        }

        const key = `${prefix}/${file}`;
        await s3Client.send(
          new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: data,
            ContentType: contentType,
            ACL: "public-read",
          })
        );
        console.log(`Uploaded: ${key}`);
        uploadedCount++;

        // Update progress periodically during upload
        if (uploadId && totalFiles > 10 && uploadedCount % 5 === 0) {
          const uploadProgress =
            Math.floor((uploadedCount / totalFiles) * 15) + 80; // 80-95% range
          updateVideoRecord(uploadId, {
            progress: Math.min(uploadProgress, 95),
          });
        }
      }
    });

    // Process batch uploads in parallel
    await Promise.all(uploadPromises);

    // Add a small delay between batches to prevent overwhelming the system
    if (fileBatches.indexOf(batch) < fileBatches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

const listFiles = (dir: string, indent = "") => {
  if (!fs.existsSync(dir)) {
    console.log(`${indent}Directory not found: ${dir}`);
    return;
  }

  const items = fs.readdirSync(dir);
  items.forEach((item) => {
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);
    if (stats.isDirectory()) {
      console.log(`${indent}📁 ${item}/`);
      listFiles(itemPath, indent + "  ");
    } else {
      const size = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`${indent}📄 ${item} (${size} MB)`);
    }
  });
};

export async function transcodeAndUpload(
  localPath: string,
  filename: string,
  uploadId?: string,
  s3Path?: string
) {
  const name = uploadId || path.parse(filename).name;

  // Construct the S3 prefix using custom path if provided
  const s3Prefix = s3Path ? `${s3Path.replace(/^\/|\/$/g, "")}/${name}` : name;

  // Use absolute path from process.cwd() to avoid build path issues
  const outputDir = path.resolve(process.cwd(), "controllers", "videos", name);
  fs.mkdirSync(outputDir, { recursive: true });

  // Update progress if uploadId is provided
  if (uploadId) {
    updateVideoRecord(uploadId, { progress: 25 });
  }

  // Use FFmpeg for transcoding
  const cmd = `ffmpeg -i "${localPath}" \
    -profile:v baseline -level 3.0 -start_number 0 \
    -hls_time 3 -hls_list_size 0 -f hls "${outputDir}/index.m3u8"`;

  console.log("Using FFmpeg to transcode video");

  try {
    console.log("Starting transcoding with FFmpeg...");
    console.log(`Input file: ${localPath}`);
    console.log(`Output directory: ${outputDir}`);

    // Log the command for debugging purposes
    console.log(`Executing command: ${cmd}`);

    // Execute the command with stdio inheritance to see progress
    execSync(cmd, { stdio: "inherit" });

    console.log("Transcoding complete with FFmpeg");

    // Update progress if uploadId is provided
    if (uploadId) {
      updateVideoRecord(uploadId, { progress: 60 });
    }

    // Generate thumbnail from the original video
    console.log("Generating thumbnail...");
    const thumbnailPath = path.join(outputDir, "thumbnail.jpg");
    const thumbnailCmd = `ffmpeg -y -i "${localPath}" -ss 00:00:01.000 -vframes 1 -q:v 2 "${thumbnailPath}"`;

    console.log(`Executing thumbnail command: ${thumbnailCmd}`);
    execSync(thumbnailCmd, { stdio: "inherit" });

    if (fs.existsSync(thumbnailPath)) {
      console.log(`Thumbnail generated successfully: ${thumbnailPath}`);
    } else {
      console.warn("Thumbnail generation may have failed - file not found");
    }

    // Update progress if uploadId is provided
    if (uploadId) {
      updateVideoRecord(uploadId, { progress: 75 });
    }

    // Verify essential files exist
    const masterPlaylist = path.join(outputDir, "index.m3u8");
    if (!fs.existsSync(masterPlaylist)) {
      throw new Error(`Master playlist file not found at ${masterPlaylist}`);
    }

    // List the output files for verification
    console.log("Generated files:");
    listFiles(outputDir);
  } catch (error) {
    console.error("Error during transcoding with FFmpeg:", error);
    throw new Error("Failed to transcode video with FFmpeg");
  }

  // Update progress before starting S3 upload
  if (uploadId) {
    updateVideoRecord(uploadId, { progress: 80 });
  }

  console.log("🚀 Starting S3 upload process...");
  // Start the recursive upload
  await uploadFile(outputDir, s3Prefix, uploadId);

  // Update progress after S3 upload
  if (uploadId) {
    updateVideoRecord(uploadId, { progress: 95 });
  }

  // Store metadata for later retrieval
  const metadataFile = path.join(outputDir, "metadata.json");
  const metadata = {
    name,
    packager: "ffmpeg",
    createdAt: new Date().toISOString(),
    source: path.basename(localPath),
    hasThumbnail: fs.existsSync(path.join(outputDir, "thumbnail.jpg")),
  };
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

  // Also upload metadata to S3
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `${s3Prefix}/metadata.json`,
      Body: JSON.stringify(metadata, null, 2),
      ContentType: "application/json",
      ACL: "public-read",
    })
  );

  return `${BUCKET_NAME}.${ENV.S3_ENDPOINT}/${s3Prefix}/index.m3u8`;
}

// Interface for video information
interface VideoInfo {
  url: string;
  name: string;
  packager?: string;
  createdAt?: string;
}

export async function listVideos(): Promise<VideoInfo[]> {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Delimiter: "/",
    });

    const { CommonPrefixes = [] } = await s3Client.send(command);
    const folders = CommonPrefixes.map((prefix) =>
      prefix.Prefix?.replace(/\/$/, "")
    ).filter((prefix): prefix is string => !!prefix);

    // Create a list of promises that fetch metadata for each video
    const videoInfoPromises = folders.map(async (folder) => {
      const videoInfo: VideoInfo = {
        url: `${BUCKET_NAME}.${ENV.S3_ENDPOINT}/${folder}/index.m3u8`,
        name: folder,
      };

      // Try to get metadata if it exists
      try {
        const metadataCommand = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: `${folder}/metadata.json`,
        });

        const response = await s3Client.send(metadataCommand);
        if (response && response.Body) {
          // Convert stream to string
          const streamToString = async (stream: any): Promise<string> => {
            const chunks: Buffer[] = [];
            return new Promise((resolve, reject) => {
              stream.on("data", (chunk: Buffer) => chunks.push(chunk));
              stream.on("error", reject);
              stream.on("end", () =>
                resolve(Buffer.concat(chunks).toString("utf8"))
              );
            });
          };

          const body = await streamToString(response.Body);
          const metadata = JSON.parse(body);
          videoInfo.packager = metadata.packager;
          videoInfo.createdAt = metadata.createdAt;
        }
      } catch (err) {
        // Metadata doesn't exist or couldn't be retrieved - that's fine
        console.log(`No metadata found for ${folder}`);
      }

      return videoInfo;
    });

    return await Promise.all(videoInfoPromises);
  } catch (error) {
    console.error("Error listing videos:", error);
    throw new Error("Failed to list videos");
  }
}
