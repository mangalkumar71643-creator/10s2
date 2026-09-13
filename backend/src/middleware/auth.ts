import { NextFunction, Request, Response } from "express";
import { verifyChatToken, verifyToken } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: "USER" | "ADMIN" };
      chatUserId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    req.user = { userId: payload.userId, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/** Auth for the Live Support chat page (see support.routes.ts) — accepts
 * only the short-lived, chat-scoped token minted by POST
 * /support/chat/session, never a full session token. */
export function requireChatAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  try {
    const payload = verifyChatToken(header.slice("Bearer ".length));
    req.chatUserId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "This chat link has expired. Please reopen Live Support from the app." });
  }
}
