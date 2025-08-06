import fs from "fs";
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
async function uploadFile(dirPath: string, prefix: string) {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      // Create a new prefix for the subdirectory and recurse
      const newPrefix = `${prefix}/${file}`;
      await uploadFile(filePath, newPrefix);
    } else {
      // Upload the file
      const data = fs.readFileSync(filePath);

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

  // Use FFmpeg for transcoding with multiple quality streams
  const cmd = `ffmpeg -i "${localPath}" \
    -filter_complex "[0:v]split=2[v1][v2]; \
    [v1]scale=w=640:h=360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2[v360]; \
    [v2]scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2[v720]" \
    -map "[v360]" -map 0:a -c:v libx264 -b:v 800k -preset veryfast -c:a aac -b:a 96k \
    -map "[v720]" -map 0:a -c:v libx264 -b:v 2500k -preset veryfast -c:a aac -b:a 128k \
    -f hls \
    -hls_time 4 \
    -hls_playlist_type vod \
    -hls_flags independent_segments \
    -master_pl_name "master.m3u8" \
    -var_stream_map "v:0,a:0,name:360p v:1,a:1,name:720p" \
    -hls_segment_filename "${outputDir}/%v/segment_%03d.ts" \
    "${outputDir}/%v/index.m3u8"`;

  console.log("Using FFmpeg to transcode video with multiple quality streams");

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

  // Start the recursive upload
  await uploadFile(outputDir, s3Prefix);

  // Store metadata for later retrieval
  const metadataFile = path.join(outputDir, "metadata.json");
  const metadata = {
    name,
    packager: "ffmpeg",
    createdAt: new Date().toISOString(),
    source: path.basename(localPath),
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

  return `${ENV.S3_ENDPOINT}/${BUCKET_NAME}/${s3Prefix}/index.m3u8`;
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
        url: `${ENV.S3_ENDPOINT}/${BUCKET_NAME}/${folder}/index.m3u8`,
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
