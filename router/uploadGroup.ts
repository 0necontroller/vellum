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
import { createTusServer } from "../lib/tusServer";
import multer from "multer";

const router = Router();
const upload = multer({ dest: "uploads/" });
const tusServer = createTusServer();

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

// TUS upload handling - must be at the end to catch all TUS requests
router.all("/tus/*", (req, res) => {
  tusServer.handle(req, res);
});

export default router;
