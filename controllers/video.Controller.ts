import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  createVideoRecord,
  getVideoRecord,
  getAllVideos,
} from "../lib/videoStore";
import { IServerResponse } from "../types/response";

/**
 * @openapi
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: API_KEY
 *       description: Bearer token authentication using API key from environment
 *   schemas:
 *     VideoUploadSessionRequest:
 *       type: object
 *       required:
 *         - filename
 *         - filesize
 *       properties:
 *         filename:
 *           type: string
 *           description: Name of the video file
 *           example: "video.mp4"
 *         filesize:
 *           type: number
 *           description: Size of the video file in bytes
 *           example: 104857600
 *         packager:
 *           type: string
 *           enum: [ffmpeg]
 *           default: ffmpeg
 *           description: Video processing packager to use
 *         callbackUrl:
 *           type: string
 *           description: Optional webhook URL for processing completion notifications
 *           example: "https://myapp.com/webhook"
 *     VideoUploadSessionResponse:
 *       type: object
 *       properties:
 *         uploadId:
 *           type: string
 *           description: Unique identifier for the upload session
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         uploadUrl:
 *           type: string
 *           description: TUS upload URL for client-side uploads
 *           example: "http://localhost:8001/api/v1/tus/files/550e8400-e29b-41d4-a716-446655440000"
 *         expiresIn:
 *           type: number
 *           description: Upload session expiration time in seconds
 *           example: 3600
 *     VideoStatus:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Video identifier
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         filename:
 *           type: string
 *           description: Original filename
 *           example: "video.mp4"
 *         status:
 *           type: string
 *           enum: [uploading, processing, completed, failed]
 *           description: Current processing status
 *         progress:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *           description: Processing progress percentage
 *           example: 75
 *         streamUrl:
 *           type: string
 *           description: HLS streaming URL (available when completed)
 *           example: "http://localhost:9000/video-streams/550e8400-e29b-41d4-a716-446655440000/playlist.m3u8"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         completedAt:
 *           type: string
 *           format: date-time
 *           description: Completion timestamp (if completed)
 *         error:
 *           type: string
 *           description: Error message (if failed)
 */

/**
 * @openapi
 * /api/v1/video/create:
 *   post:
 *     summary: Create a video upload session
 *     description: Creates a TUS upload session and returns a presigned URL for direct frontend uploads
 *     tags: [Video]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VideoUploadSessionRequest'
 *     responses:
 *       200:
 *         description: Upload session created successfully
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
 *                       example: Upload session created
 *                     data:
 *                       $ref: '#/components/schemas/VideoUploadSessionResponse'
 *       400:
 *         description: Invalid request parameters
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
 *                       example: Missing required fields
 *       401:
 *         description: Unauthorized - Invalid or missing Bearer token
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
 *                       example: Invalid API key
 */
export const createVideoUpload = async (
  req: Request,
  res: Response<IServerResponse>
) => {
  try {
    const { filename, filesize, packager = "ffmpeg", callbackUrl } = req.body;

    if (!filename || !filesize) {
      res.status(400).json({
        status: "error",
        message: "Missing required fields: filename and filesize",
        data: null,
      });
      return;
    }

    const uploadId = uuidv4();
    const uploadUrl = `${req.protocol}://${req.get(
      "host"
    )}/api/v1/tus/files/${uploadId}`;

    createVideoRecord({
      id: uploadId,
      filename,
      status: "uploading",
      packager,
      callbackUrl,
    });

    res.json({
      status: "success",
      message: "Upload session created",
      data: {
        uploadId,
        uploadUrl,
        expiresIn: 3600,
      },
    });
  } catch (error) {
    console.error("Error creating video upload session:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create upload session",
      data: null,
    });
  }
};

/**
 * @openapi
 * /api/v1/video/{uploadId}/status:
 *   get:
 *     summary: Get video processing status
 *     tags: [Video]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *         description: The video upload ID
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Video status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ServerResponse'
 *                 - type: object
 *                   properties:
 *                     status:
 *                       example: success
 *                     data:
 *                       $ref: '#/components/schemas/VideoStatus'
 *       401:
 *         description: Unauthorized - Invalid or missing Bearer token
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
 *                       example: Invalid API key
 *       404:
 *         description: Video not found
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
 *                       example: Video not found
 */
export const getVideoStatus = async (
  req: Request,
  res: Response<IServerResponse>
) => {
  try {
    const { uploadId } = req.params;
    const video = getVideoRecord(uploadId);

    if (!video) {
      res.status(404).json({
        status: "error",
        message: "Video not found",
        data: null,
      });
      return;
    }

    res.json({
      status: "success",
      message: "Video status retrieved successfully",
      data: video,
    });
  } catch (error) {
    console.error("Error getting video status:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get video status",
      data: null,
    });
  }
};

/**
 * @openapi
 * /api/v1/videos:
 *   get:
 *     summary: List all videos
 *     description: Get a list of all uploaded and processed videos
 *     tags: [Video]
 *     security:
 *       - BearerAuth: []
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
 *                         $ref: '#/components/schemas/VideoStatus'
 *       401:
 *         description: Unauthorized - Invalid or missing Bearer token
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
 *                       example: Invalid API key
 */
export const listAllVideos = async (
  req: Request,
  res: Response<IServerResponse>
) => {
  try {
    const videos = getAllVideos();
    res.json({
      status: "success",
      message: "Videos retrieved successfully",
      data: videos,
    });
  } catch (error) {
    console.error("Error listing videos:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to list videos",
      data: null,
    });
  }
};

/**
 * @openapi
 * /api/v1/video/{uploadId}/callback-status:
 *   get:
 *     summary: Get callback status for a video
 *     description: Get the current callback delivery status for a specific video
 *     tags: [Video]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *         description: Upload session ID
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Callback status retrieved successfully
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
 *                       example: Callback status retrieved successfully
 *                     data:
 *                       type: object
 *                       properties:
 *                         callbackUrl:
 *                           type: string
 *                           nullable: true
 *                         callbackStatus:
 *                           type: string
 *                           enum: [pending, completed, failed]
 *                         callbackRetryCount:
 *                           type: number
 *                         callbackLastAttempt:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *       401:
 *         description: Unauthorized - Invalid or missing Bearer token
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
 *                       example: Invalid API key
 *       404:
 *         description: Video not found
 */
export const getCallbackStatus = async (
  req: Request,
  res: Response<IServerResponse>
) => {
  try {
    const { uploadId } = req.params;
    const video = getVideoRecord(uploadId);

    if (!video) {
      res.status(404).json({
        status: "error",
        message: "Video not found",
        data: null,
      });
      return;
    }

    res.json({
      status: "success",
      message: "Callback status retrieved successfully",
      data: {
        callbackUrl: video.callbackUrl,
        callbackStatus: video.callbackStatus,
        callbackRetryCount: video.callbackRetryCount,
        callbackLastAttempt: video.callbackLastAttempt,
      },
    });
  } catch (error) {
    console.error("Error getting callback status:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get callback status",
      data: null,
    });
  }
};
