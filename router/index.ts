import { Router } from "express";
import uploadGroup from "./uploadGroup";

const router = Router();

router.use("/upload", uploadGroup);

export default router;
