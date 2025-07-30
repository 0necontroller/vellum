import "dotenv/config";

export const ENV = {
  SERVER_PORT: process.env.SERVER_PORT || 8001,
  UPLOAD_PATH: process.env.UPLOAD_PATH || "./uploads",
  MAX_FILE_SIZE: process.env.MAX_FILE_SIZE || "50mb",
  ALLOWED_FILE_TYPES: (
    process.env.ALLOWED_FILE_TYPES || "image/jpeg,image/png"
  ).split(","),
  MAX_FILES: parseInt(process.env.MAX_FILES || "5", 10),
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || "minio",
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || "minio123",
  S3_ENDPOINT: process.env.S3_ENDPOINT || "http://localhost:9000",
  S3_BUCKET: process.env.S3_BUCKET || "my-bucket",
  NODE_ENV: process.env.NODE_ENV || "dev",
  RABBITMQ_DEFAULT_USER: process.env.RABBITMQ_DEFAULT_USER || "guest",
  RABBITMQ_DEFAULT_PASS: process.env.RABBITMQ_DEFAULT_PASS || "guest",
};
