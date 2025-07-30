import amqp, { Channel } from "amqplib";
import { ENV } from "./environments";

let channel: Channel | null = null;

export enum RabbitMQQueues {
  VIDEO_PROCESSING = "video_processing",
}

async function connectWithRetry(
  retries = 10,
  delay = 10000
): Promise<amqp.ChannelModel> {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqp.connect(
        `amqp://${ENV.RABBITMQ_DEFAULT_USER}:${ENV.RABBITMQ_DEFAULT_PASS}@rabbitmq:5672`
      );
      console.log("✅ Connected to RabbitMQ");
      return conn;
    } catch (err) {
      console.warn(
        `⚠️ RabbitMQ not ready, retrying in ${delay}ms... (${i + 1}/${retries})`
      );
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw new Error("❌ Failed to connect to RabbitMQ after multiple attempts");
}

/**
 * Initialize RabbitMQ connection and channel
 */
export const initRabbitMQ = async (): Promise<void> => {
  try {
    const connection = await connectWithRetry();
    channel = await connection.createChannel();
    console.log("✅ RabbitMQ connected successfully");

    // Start video processing worker
    if (channel) {
      const { startVideoProcessingWorker } = await import("./videoProcessor");
      await startVideoProcessingWorker(channel);
    }
  } catch (error) {
    console.error("Failed to connect to RabbitMQ:", error);
    throw error;
  }
};

/**
 * Get the RabbitMQ channel
 */
export const getChannel = (): Channel | null => {
  return channel;
};

/**
 * Publish a message to a RabbitMQ queue
 */
export const publishToQueue = async (
  queueName: string,
  message: Record<string, any>
): Promise<void> => {
  if (!channel) {
    throw new Error("RabbitMQ channel is not initialized");
  }

  try {
    await channel.assertQueue(queueName, { durable: true });
    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
    console.log(`✅ Message sent to queue ${queueName}`);
  } catch (error) {
    console.error("Failed to publish message to RabbitMQ:", error);
    throw error;
  }
};
