import { v4 as uuidv4 } from "uuid";

export interface VideoRecord {
  id: string;
  filename: string;
  status: "uploading" | "processing" | "completed" | "failed";
  progress: number;
  streamUrl?: string;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  packager?: string;
}

// In-memory store for video records
// In production, this should be replaced with a database
const videos = new Map<string, VideoRecord>();

export const createVideoRecord = (data: Partial<VideoRecord>): VideoRecord => {
  const record: VideoRecord = {
    id: data.id || uuidv4(),
    filename: data.filename || "",
    status: "uploading",
    progress: 0,
    createdAt: new Date(),
    ...data,
  };
  videos.set(record.id, record);
  return record;
};

export const updateVideoRecord = (
  id: string,
  updates: Partial<VideoRecord>
): VideoRecord | undefined => {
  const record = videos.get(id);
  if (record) {
    Object.assign(record, updates);
    if (updates.status === "completed") {
      record.completedAt = new Date();
    }
    videos.set(id, record);
  }
  return record;
};

export const getVideoRecord = (id: string): VideoRecord | undefined => {
  return videos.get(id);
};

export const getAllVideos = (): VideoRecord[] => {
  return Array.from(videos.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
};

export const deleteVideoRecord = (id: string): boolean => {
  return videos.delete(id);
};
