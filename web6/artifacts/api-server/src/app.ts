import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

// ---------------------------------------------------------------------------
// CORS — allow the Vercel frontend and any configured origins
// ---------------------------------------------------------------------------
const allowedOrigins: string[] = [];

if (process.env.ALLOWED_ORIGINS) {
  allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()));
}

// Always allow requests with no origin (e.g. server-to-server, mobile)
app.use(
  cors({
    origin: (origin, callback) => {
      // No origin = curl / server-to-server → allow
      if (!origin) return callback(null, true);
      // If no specific origins configured, allow all (development)
      if (allowedOrigins.length === 0) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// Request logging
// ---------------------------------------------------------------------------
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ---------------------------------------------------------------------------
// Body parsers
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Routes — all API routes are under /api
// ---------------------------------------------------------------------------
app.use("/api", router);

export default app;
