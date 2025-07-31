import "dotenv/config";

export const ENV = {
  SERVER_PORT: process.env.SERVER_PORT || 8001,
  UPLOAD_PATH: process.env.UPLOAD_PATH || "./uploads",
  MAX_FILE_SIZE: process.env.MAX_FILE_SIZE || "100mb",
  ALLOWED_FILE_TYPES: (
    process.env.ALLOWED_FILE_TYPES || "video/mp4,video/avi,video/mov,video/mkv"
  ).split(","),
  MAX_FILES: parseInt(process.env.MAX_FILES || "10", 10),
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || "minio",
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || "minio123",
  S3_ENDPOINT: process.env.S3_ENDPOINT || "http://localhost:9000",
  S3_BUCKET: process.env.S3_BUCKET || "my-bucket",
  NODE_ENV: process.env.NODE_ENV || "dev",
  RABBITMQ_DEFAULT_USER: process.env.RABBITMQ_DEFAULT_USER || "guest",
  RABBITMQ_DEFAULT_PASS: process.env.RABBITMQ_DEFAULT_PASS || "guest",
  API_KEY: process.env.API_KEY || "your_api_key_here",
  ALLOWED_ORIGINS:
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:3000,http://localhost:3001",
};

export const allowedOrigins = ENV.ALLOWED_ORIGINS.split(",");
