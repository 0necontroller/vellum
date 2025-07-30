import { Router } from "express";
import { getUploadedVideos } from "../controllers/upload.Controller";
import {
  createVideoUpload,
  getVideoStatus,
  listAllVideos,
  getCallbackStatus,
} from "../controllers/video.Controller";
import { handleWebhookCallback } from "../controllers/webhook.Controller";

const router = Router();

// TUS-based video endpoints
router.post("/video/create", createVideoUpload);
router.get("/video/:uploadId/status", getVideoStatus);
router.get("/video/:uploadId/callback-status", getCallbackStatus);
router.get("/videos", listAllVideos);

// Webhook callback endpoint
router.post("/callback", handleWebhookCallback);

// Legacy videos endpoint (keeping for backward compatibility)
router.get("/upload/videos", getUploadedVideos);

export default router;
