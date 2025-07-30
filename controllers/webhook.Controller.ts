import { Request, Response } from "express";
import { IServerResponse } from "../types/response";

/**
 * @openapi
 * components:
 *   schemas:
 *     WebhookCallbackRequest:
 *       type: object
 *       properties:
 *         videoId:
 *           type: string
 *           description: Video identifier
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         filename:
 *           type: string
 *           description: Original filename
 *           example: "video.mp4"
 *         status:
 *           type: string
 *           enum: [completed, failed]
 *           description: Processing status
 *         streamUrl:
 *           type: string
 *           description: HLS streaming URL (available when completed)
 *           example: "http://localhost:9000/video-streams/550e8400-e29b-41d4-a716-446655440000/playlist.m3u8"
 *         error:
 *           type: string
 *           description: Error message (if failed)
 */

/**
 * @openapi
 * /api/v1/callback:
 *   post:
 *     summary: Webhook callback endpoint
 *     description: Receives webhook callbacks when video processing completes or fails
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WebhookCallbackRequest'
 *     responses:
 *       200:
 *         description: Callback received successfully
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
 *                       example: Webhook callback received
 *       400:
 *         description: Invalid callback data
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
 *                       example: Invalid callback data
 */
export const handleWebhookCallback = async (
  req: Request,
  res: Response<IServerResponse>
) => {
  try {
    const { videoId, filename, status, streamUrl, error } = req.body;

    console.log(`📞 Received webhook callback:`, {
      videoId,
      filename,
      status,
      streamUrl,
      error,
    });

    // Here you can add custom logic to handle the callback
    // For example, update your application's database, send notifications, etc.

    res.json({
      status: "success",
      message: "Webhook callback received",
      data: {
        received: true,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error handling webhook callback:", error);
    res.status(400).json({
      status: "error",
      message: "Invalid callback data",
      data: null,
    });
  }
};
