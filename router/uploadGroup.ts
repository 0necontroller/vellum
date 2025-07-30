import { Router } from "express";
import {
  getUploadedVideos,
  uploadVideo,
} from "../controllers/upload.Controller";
import multer from "multer";

const router = Router();
const upload = multer({ dest: "uploads/" });

router.post("/upload", upload.single("video"), uploadVideo);

router.get("/videos", getUploadedVideos);

export default router;
