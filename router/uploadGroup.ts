import { Router } from "express";
import {
  createVideoUpload,
  getVideoStatus,
  listAllVideos,
  getCallbackStatus,
} from "../controllers/video.Controller";
import { authenticateBearer } from "../lib/auth";

const router = Router();

// Apply Bearer token authentication to all routes
router.use(authenticateBearer);

// TUS-based video endpoints
router.post("/video/create", createVideoUpload);
router.get("/video/:uploadId/status", getVideoStatus);
router.get("/video/:uploadId/callback-status", getCallbackStatus);
router.get("/videos", listAllVideos);

export default router;
