import { Request, Response } from "express";
import { listVideos, transcodeAndUpload } from "./utils/upload-utils";
import { IServerResponse } from "../types/response";

/**
 * @openapi
 * components:
 *   schemas:
 *     VideoUploadRequest:
 *       type: object
 *       properties:
 *         file:
 *           type: string
 *           format: binary
 *           description: Video file to upload
 *     VideoResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         url:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *     ServerResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [success, error]
 *         message:
 *           type: string
 *         data:
 *           oneOf:
 *             - type: "null"
 *             - type: object
 *             - type: array
 */

/**
 * @openapi
 * /api/v1/upload/videos:
 *   get:
 *     summary: Get list of uploaded videos
 *     tags: [Upload]
 *     responses:
 *       200:
 *         description: Videos retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ServerResponse'
 *                 - type: object
 *                   properties:
 *                     status:
 *                       example: success
 *                     message:
 *                       example: Videos retrieved successfully
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/VideoResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ServerResponse'
 *                 - type: object
 *                   properties:
 *                     status:
 *                       example: error
 *                     message:
 *                       example: Failed to upload video
 *                     data:
 *                       type: object
 *                       properties:
 *                         packager:
 *                           type: string
 *                           example: ffmpeg
 */
export const getUploadedVideos = async (
  req: Request,
  res: Response<IServerResponse>
) => {
  try {
    const videos = await listVideos();
    res.status(200).json({
      status: "success",
      message: "Videos retrieved successfully",
      data: videos,
    });
  } catch (err) {
    console.error(err);
    // Provide more detailed error message
    const errorMessage =
      err instanceof Error ? err.message : "Failed to upload video";
    res.status(500).json({
      status: "error",
      message: errorMessage,
      data: null,
    });
  }
};
