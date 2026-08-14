import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";

export const healthRouter = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Verifies the API and DB connection are running
 */
healthRouter.get("/", async (req: Request, res: Response<{ status: string; database: string }>) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", database: "connected" });

  } catch (error) {
    res.status(500).json({ status: "error", database: "Database unreachable" });
  }
});