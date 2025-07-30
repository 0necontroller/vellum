import { Request, Response, NextFunction } from "express";
import { ENV } from "./environments";
import { IServerResponse } from "../types/response";

/**
 * Middleware to authenticate Bearer token against API_KEY from environment
 */
export const authenticateBearer = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    const response: IServerResponse = {
      status: "error",
      message: "Authorization header is required",
      data: null,
    };
    res.status(401).json(response);
    return;
  }

  if (!authHeader.startsWith("Bearer ")) {
    const response: IServerResponse = {
      status: "error",
      message: "Authorization header must start with 'Bearer '",
      data: null,
    };
    res.status(401).json(response);
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (!token) {
    const response: IServerResponse = {
      status: "error",
      message: "Bearer token is required",
      data: null,
    };
    res.status(401).json(response);
    return;
  }

  if (token !== ENV.API_KEY) {
    const response: IServerResponse = {
      status: "error",
      message: "Invalid API key",
      data: null,
    };
    res.status(401).json(response);
    return;
  }

  next();
};
