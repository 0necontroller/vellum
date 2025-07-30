import { Request, Response, Router } from "express";
import {
  listVideos,
  transcodeAndUpload,
} from "../controllers/upload.Controller";
import multer from "multer";

const router = Router();
const upload = multer({ dest: "uploads/" });

router.post(
  "/upload",
  upload.single("video"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }
      // Get the packager type from the form data (default to ffmpeg if not provided)
      const packager = req.body.packager || "ffmpeg";
      await transcodeAndUpload(req.file.path, req.file.originalname, packager);
      res.redirect("/");
    } catch (err) {
      console.error(err);
      // Provide more detailed error message
      const errorMessage =
        err instanceof Error ? err.message : "Failed to upload video";
      res.status(500).json({
        error: errorMessage,
        packager: req.body.packager || "ffmpeg",
      });
    }
  }
);

router.get("/videos", async (_, res) => {
  const videos = await listVideos();
  res.status(200).json(videos);
});

export default router;
