import { Router } from "express";
import {
  getUploadedVideos,
  uploadVideo,
} from "../controllers/upload.Controller";
import {
  createVideoUpload,
  getVideoStatus,
  listAllVideos,
} from "../controllers/video.Controller";
import { handleWebhookCallback } from "../controllers/webhook.Controller";
import multer from "multer";

const router = Router();
const upload = multer({ dest: "uploads/" });

// Legacy upload endpoint (keeping for backward compatibility)
router.post("/upload", upload.single("video"), uploadVideo);

// New TUS-based video endpoints
router.post("/video/create", createVideoUpload);
router.get("/video/:uploadId/status", getVideoStatus);
router.get("/videos", listAllVideos);

// Webhook callback endpoint
router.post("/callback", handleWebhookCallback);

// Legacy videos endpoint (keeping for backward compatibility)
router.get("/upload/videos", getUploadedVideos);

export default router;
