import "dotenv/config";
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { authRoutes, companyRoutes, busRoutes, responderRoutes, telemetryRoutes, mapsRoutes, sessionRoutes, driverRoutes, routeRoutes, journeyRoutes, incidentRoutes, dispatchRoutes } from "./routes/index.js";
import { errorHandler } from "./middleware/index.js";
import { attachTelemetryServer } from "./services/index.js";

const app = express();

// Reflect the request origin so the app works from localhost, a phone on the LAN,
// or an HTTPS tunnel. Auth is Bearer-token based (no cookies), so this is safe here.
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({ status: "OK" });
});

app.use("/auth", authRoutes);
app.use("/companies", companyRoutes);
app.use("/buses", busRoutes);
app.use("/responders", responderRoutes);
app.use("/telemetry", telemetryRoutes);
app.use("/maps", mapsRoutes);
app.use("/sessions", sessionRoutes);
app.use("/driver", driverRoutes);
app.use("/routes", routeRoutes);
app.use("/journeys", journeyRoutes);
app.use("/incidents", incidentRoutes);
app.use("/dispatches", dispatchRoutes);

// Serve the built frontend (if present) so a single HTTPS tunnel can expose
// both the app and the API on the same secure origin (required for phone GPS).
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(here, "../../Front-End/dist");
const API_PREFIXES = [
  "/auth",
  "/companies",
  "/buses",
  "/responders",
  "/telemetry",
  "/maps",
  "/sessions",
  "/driver",
  "/routes",
  "/journeys",
  "/incidents",
  "/dispatches",
  "/health",
  "/ws",
  "/assets",
];

if (fs.existsSync(path.join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist));
  app.use((req: Request, res: Response, next) => {
    if (req.method !== "GET") return next();
    if (API_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`))) return next();
    if (!req.accepts("html")) return next();
    return res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((_req: Request, res: Response) => {
  return res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
});

app.use(errorHandler);

const PORT = Number(process.env["PORT"]) || 3000;

const server = http.createServer(app);
attachTelemetryServer(server);

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) out.push(entry.address);
    }
  }
  return out;
}

// Bind on all IPv4 interfaces so a phone on the same Wi-Fi can reach it.
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  for (const ip of lanAddresses()) {
    console.log(`  LAN: http://${ip}:${PORT}`);
  }
});