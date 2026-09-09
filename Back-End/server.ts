import "dotenv/config";
import http from "node:http";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { authRoutes, companyRoutes, busRoutes, responderRoutes, telemetryRoutes, mapsRoutes } from "./routes/index.js";
import { errorHandler, httpError } from "./middleware/index.js";
import { attachTelemetryServer } from "./services/index.js";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(httpError({ error: { code: "CORS_DENIED", message: "Origin not allowed." } }));
    },
  }),
);
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

app.use((_req: Request, res: Response) => {
  return res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
});

app.use(errorHandler);

const PORT = Number(process.env["PORT"]) || 3000;

const server = http.createServer(app);
attachTelemetryServer(server);

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});