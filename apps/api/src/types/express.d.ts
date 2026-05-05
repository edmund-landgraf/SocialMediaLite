import type { StorageProvider } from "../storage/types.js";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      storage: StorageProvider;
    }
  }
}

export {};
