import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export interface VideoRecord {
  id: string;
  filename: string;
  status: "uploading" | "processing" | "completed" | "failed";
  progress: number;
  streamUrl?: string;
  thumbnailUrl?: string;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  packager?: string;
  callbackUrl?: string;
  callbackStatus: "pending" | "completed" | "failed";
  callbackRetryCount: number;
  callbackLastAttempt?: Date;
  s3Path?: string; // Custom S3 path for storing the video
}

// Initialize SQLite database
const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "videos.db");
const db = new Database(dbPath);

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    streamUrl TEXT,
    thumbnailUrl TEXT,
    createdAt TEXT NOT NULL,
    completedAt TEXT,
    error TEXT,
    packager TEXT,
    callbackUrl TEXT,
    callbackStatus TEXT DEFAULT 'pending',
    callbackRetryCount INTEGER DEFAULT 0,
    callbackLastAttempt TEXT,
    s3Path TEXT
  )
`);

// Add s3Path column if it doesn't exist (for existing databases)
try {
  db.exec(`ALTER TABLE videos ADD COLUMN s3Path TEXT`);
} catch (error) {
  // Column already exists, ignore error
}

// Add thumbnailUrl column if it doesn't exist (for existing databases)
try {
  db.exec(`ALTER TABLE videos ADD COLUMN thumbnailUrl TEXT`);
} catch (error) {
  // Column already exists, ignore error
}

export const createVideoRecord = (data: Partial<VideoRecord>): VideoRecord => {
  const record: VideoRecord = {
    id: data.id as string,
    filename: data.filename || "",
    status: "uploading",
    progress: 0,
    createdAt: new Date(),
    callbackStatus: "pending",
    callbackRetryCount: 0,
    ...data,
  };

  const stmt = db.prepare(`
    INSERT INTO videos (
      id, filename, status, progress, streamUrl, thumbnailUrl, createdAt, completedAt, 
      error, packager, callbackUrl, callbackStatus, callbackRetryCount, callbackLastAttempt, s3Path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    record.id,
    record.filename,
    record.status,
    record.progress,
    record.streamUrl || null,
    record.thumbnailUrl || null,
    record.createdAt.toISOString(),
    record.completedAt?.toISOString() || null,
    record.error || null,
    record.packager || null,
    record.callbackUrl || null,
    record.callbackStatus,
    record.callbackRetryCount,
    record.callbackLastAttempt?.toISOString() || null,
    record.s3Path || null
  );

  return record;
};

export const updateVideoRecord = (
  id: string,
  updates: Partial<VideoRecord>
): VideoRecord | undefined => {
  const record = getVideoRecord(id);
  if (!record) return undefined;

  const updatedRecord = { ...record, ...updates };
  if (updates.status === "completed") {
    updatedRecord.completedAt = new Date();
  }

  const stmt = db.prepare(`
    UPDATE videos 
    SET filename = ?, status = ?, progress = ?, streamUrl = ?, thumbnailUrl = ?, 
        completedAt = ?, error = ?, packager = ?, callbackUrl = ?,
        callbackStatus = ?, callbackRetryCount = ?, callbackLastAttempt = ?, s3Path = ?
    WHERE id = ?
  `);

  stmt.run(
    updatedRecord.filename,
    updatedRecord.status,
    updatedRecord.progress,
    updatedRecord.streamUrl || null,
    updatedRecord.thumbnailUrl || null,
    updatedRecord.completedAt?.toISOString() || null,
    updatedRecord.error || null,
    updatedRecord.packager || null,
    updatedRecord.callbackUrl || null,
    updatedRecord.callbackStatus,
    updatedRecord.callbackRetryCount,
    updatedRecord.callbackLastAttempt?.toISOString() || null,
    updatedRecord.s3Path || null,
    id
  );

  return updatedRecord;
};

export const safelyTransitionToProcessing = (
  id: string
): { success: boolean; record?: VideoRecord } => {
  // First get the current record to check its status
  const currentRecord = getVideoRecord(id);

  if (!currentRecord) {
    return { success: false, record: undefined };
  }

  // If already completed, don't process again
  if (currentRecord.status === "completed") {
    return { success: false, record: currentRecord };
  }

  // If already processing but progress is still 0, allow it (might be stuck)
  if (currentRecord.status === "processing" && currentRecord.progress > 10) {
    return { success: false, record: currentRecord };
  }

  // Allow transition from uploading, failed, or processing with low progress
  const stmt = db.prepare(`
    UPDATE videos 
    SET status = 'processing', progress = 10
    WHERE id = ? AND (status = 'uploading' OR status = 'failed' OR (status = 'processing' AND progress <= 10))
  `);

  const result = stmt.run(id);

  if (result.changes > 0) {
    const record = getVideoRecord(id);
    return { success: true, record };
  } else {
    const record = getVideoRecord(id);
    return { success: false, record };
  }
};

export const getVideoRecord = (id: string): VideoRecord | undefined => {
  const stmt = db.prepare("SELECT * FROM videos WHERE id = ?");
  const row = stmt.get(id) as any;

  if (!row) return undefined;

  return {
    ...row,
    createdAt: new Date(row.createdAt),
    completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
    callbackLastAttempt: row.callbackLastAttempt
      ? new Date(row.callbackLastAttempt)
      : undefined,
  };
};

export const getAllVideos = (): VideoRecord[] => {
  const stmt = db.prepare("SELECT * FROM videos ORDER BY createdAt DESC");
  const rows = stmt.all() as any[];

  return rows.map((row) => ({
    ...row,
    createdAt: new Date(row.createdAt),
    completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
    callbackLastAttempt: row.callbackLastAttempt
      ? new Date(row.callbackLastAttempt)
      : undefined,
  }));
};

export const deleteVideoRecord = (id: string): boolean => {
  const stmt = db.prepare("DELETE FROM videos WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
};

// Get videos with pending callbacks for cron job processing
export const getVideosWithPendingCallbacks = (): VideoRecord[] => {
  const stmt = db.prepare(`
    SELECT * FROM videos 
    WHERE callbackUrl IS NOT NULL 
    AND callbackStatus = 'pending' 
    AND callbackRetryCount < 4
    AND status = 'completed'
    ORDER BY createdAt ASC
  `);
  const rows = stmt.all() as any[];

  return rows.map((row) => ({
    ...row,
    createdAt: new Date(row.createdAt),
    completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
    callbackLastAttempt: row.callbackLastAttempt
      ? new Date(row.callbackLastAttempt)
      : undefined,
  }));
};
