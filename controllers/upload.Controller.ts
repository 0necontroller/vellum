import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { ENV } from "../lib/environments";
import {
  minioClient,
  BUCKET_NAME,
  STREAMING_CONTENT_TYPES,
} from "../lib/s3client";
import {
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

/**
 * Check if a video file is compatible with Shaka Packager
 * @param filePath Path to the video file
 * @returns Object with isCompatible flag and reason if not compatible
 */
async function checkShakaCompatibility(
  filePath: string
): Promise<{ isCompatible: boolean; reason?: string }> {
  try {
    // Use ffprobe to get file information
    const cmd = `ffprobe -v error -show_entries format=format_name,duration -show_streams -of json "${filePath}"`;
    const output = execSync(cmd, { encoding: "utf-8" });
    const info = JSON.parse(output);

    // Check if file has video and audio streams
    const videoStream = info.streams?.find(
      (s: any) => s.codec_type === "video"
    );
    const audioStream = info.streams?.find(
      (s: any) => s.codec_type === "audio"
    );

    if (!videoStream) {
      return { isCompatible: false, reason: "No video stream found" };
    }

    // Check if duration is too short (less than 2 seconds)
    const duration = parseFloat(info.format?.duration || "0");
    if (duration < 2) {
      return {
        isCompatible: false,
        reason: "Video is too short for Shaka Packager",
      };
    }

    return { isCompatible: true };
  } catch (error) {
    console.error("Error checking Shaka compatibility:", error);
    return { isCompatible: false, reason: "Unable to analyze video file" };
  }
}

export async function transcodeAndUpload(
  localPath: string,
  filename: string,
  packager: string = "ffmpeg"
) {
  const name = path.parse(filename).name;
  const outputDir = path.join(__dirname, `../videos/${name}`);
  fs.mkdirSync(outputDir, { recursive: true });

  // If Shaka is selected, check compatibility first
  if (packager === "shaka") {
    const compatibility = await checkShakaCompatibility(localPath);
    if (!compatibility.isCompatible) {
      console.log(`Video not compatible with Shaka: ${compatibility.reason}`);
      console.log("Falling back to FFmpeg");
      packager = "ffmpeg";
    }
  }

  let cmd: string;

  if (packager === "shaka") {
    // Create subdirectories for different quality renditions and segment types
    fs.mkdirSync(`${outputDir}/audio`, { recursive: true });
    fs.mkdirSync(`${outputDir}/video_low`, { recursive: true });
    fs.mkdirSync(`${outputDir}/video_med`, { recursive: true });
    fs.mkdirSync(`${outputDir}/video_high`, { recursive: true });

    // Simplified Shaka Packager command with compatible parameters
    // Based on error feedback and compatibility testing
    cmd = `packager \
      in="${localPath}",stream=audio,segment_template=${outputDir}/audio/$Number$.ts,playlist_name=${outputDir}/audio/main.m3u8,hls_group_id=audio,hls_name=ENGLISH \
      in="${localPath}",stream=video,segment_template=${outputDir}/video_low/$Number$.ts,playlist_name=${outputDir}/video_low/main.m3u8,iframe_playlist_name=${outputDir}/video_low/iframe.m3u8,resolution=640x360,bps=800000 \
      in="${localPath}",stream=video,segment_template=${outputDir}/video_med/$Number$.ts,playlist_name=${outputDir}/video_med/main.m3u8,iframe_playlist_name=${outputDir}/video_med/iframe.m3u8,resolution=854x480,bps=1500000 \
      in="${localPath}",stream=video,segment_template=${outputDir}/video_high/$Number$.ts,playlist_name=${outputDir}/video_high/main.m3u8,iframe_playlist_name=${outputDir}/video_high/iframe.m3u8,resolution=1280x720,bps=3000000 \
      --hls_master_playlist_output ${outputDir}/index.m3u8 \
      --segment_duration 10 \
      --hls_playlist_type VOD \
      --default_language en \
      --mpd_output ${outputDir}/manifest.mpd \
      --hls_media_sequence_number 0`;

    console.log("Using Shaka Packager to transcode video");
  } else {
    // Default to FFmpeg
    cmd = `ffmpeg -i "${localPath}" \
      -profile:v baseline -level 3.0 -start_number 0 \
      -hls_time 10 -hls_list_size 0 -f hls "${outputDir}/index.m3u8"`;

    console.log("Using FFmpeg to transcode video");
  }

  try {
    console.log(`Starting transcoding with ${packager}...`);
    console.log(`Input file: ${localPath}`);
    console.log(`Output directory: ${outputDir}`);

    // Log the command for debugging purposes
    console.log(`Executing command: ${cmd}`);

    // Execute the command with stdio inheritance to see progress
    execSync(cmd, { stdio: "inherit" });

    console.log(`Transcoding complete with ${packager}`);

    // Verify essential files exist
    if (packager === "shaka") {
      const masterPlaylist = path.join(outputDir, "index.m3u8");
      if (!fs.existsSync(masterPlaylist)) {
        throw new Error(`Master playlist file not found at ${masterPlaylist}`);
      }

      // Check at least one video track was created
      const videoLowDir = path.join(outputDir, "video_low");
      if (
        !fs.existsSync(videoLowDir) ||
        fs.readdirSync(videoLowDir).length === 0
      ) {
        throw new Error("No video segments were created");
      }
    } else {
      // Check FFmpeg output
      const masterPlaylist = path.join(outputDir, "index.m3u8");
      if (!fs.existsSync(masterPlaylist)) {
        throw new Error(`Master playlist file not found at ${masterPlaylist}`);
      }
    }

    // List the output files for verification
    console.log("Generated files:");
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
    listFiles(outputDir);
  } catch (error) {
    console.error(`Error during transcoding with ${packager}:`, error);

    if (packager === "shaka") {
      console.log("Falling back to FFmpeg due to Shaka Packager error");
      // Try again with FFmpeg
      return await transcodeAndUpload(localPath, filename, "ffmpeg");
    } else {
      throw new Error(`Failed to transcode video with ${packager}`);
    }
  }

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
        await minioClient.send(
          new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: data,
            ContentType: contentType,
          })
        );
        console.log(`Uploaded: ${key}`);
      }
    }
  }

  // Start the recursive upload
  await uploadFile(outputDir, name);

  // Store packager info as metadata for later retrieval
  const metadataFile = path.join(outputDir, "metadata.json");
  const metadata = {
    name,
    packager,
    createdAt: new Date().toISOString(),
    source: path.basename(localPath),
  };
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

  // Also upload metadata to S3
  await minioClient.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `${name}/metadata.json`,
      Body: JSON.stringify(metadata, null, 2),
      ContentType: "application/json",
    })
  );

  return `${ENV.S3_ENDPOINT}/${BUCKET_NAME}/${name}/index.m3u8`;
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

    const { CommonPrefixes = [] } = await minioClient.send(command);
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

        const response = await minioClient.send(metadataCommand);
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
