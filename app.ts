import path from "path";
import cors from "cors";
import express from "express";
import v1router from "./router/uploadGroup";
import { Borgen, Logger } from "borgen";
import { ENV } from "./lib/environments";
import cookieParser from "cookie-parser";
import generateOpenAPISpec, { apiDocsServer } from "./docs/openapi";
import { apiReference } from "@scalar/express-api-reference";
import { initRabbitMQ } from "./lib/rabbitmq";

export const allowedOrigins = ["http://localhost:8001"];

const app = express();

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.use(Borgen({}));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  "/api/v1/docs",
  apiReference({
    url: `${apiDocsServer}/openapi`,
  })
);

// Routes
app.use("/api/v1", v1router);

const startServer = async () => {
  if (ENV.NODE_ENV === "dev") {
    generateOpenAPISpec();
  }

  // Initialize RabbitMQ
  await initRabbitMQ();

  app.listen(ENV.SERVER_PORT, () => {
    Logger.info({ message: `Server is running on port ${ENV.SERVER_PORT}` });
  });
};

startServer();
