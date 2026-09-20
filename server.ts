// QuickX: Gateway Server
// Authors: QuickX Team
// Purpose: Serves the QuickX frontend via Vite and proxies /api/* requests
// to the Python backend (quickx_data.db).

import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { spawn, execSync, ChildProcess } from "child_process";
import { createServer as createViteServer } from "vite";

const PORT = 3000;
const PYTHON_BACKEND_PORT = 5001;
const PYTHON_BACKEND_HOST = "127.0.0.1";

let pythonProcess: ChildProcess | null = null;

function ensurePythonBackend() {
  // Step 1: Check if QuickX SQLite database exists, generate if missing
  const dbPath = path.join(process.cwd(), "backend", "quickx_data.db");
  if (!fs.existsSync(dbPath)) {
    console.log("QuickX database not found, initializing SQLite database...");
    try {
      execSync("python3 backend/generator.py", { stdio: "inherit" });
    } catch (err) {
      console.error("Error generating QuickX database:", err);
    }
  }

  // Step 2: Launch Python backend service
  console.log("Starting QuickX Python backend service...");
  pythonProcess = spawn("python3", ["backend/server.py"], {
    stdio: "inherit",
    detached: false
  });

  pythonProcess.on("error", (err) => {
    console.error("QuickX Python backend failed to start:", err);
  });

  pythonProcess.on("exit", (code, signal) => {
    console.log(`QuickX Python backend exited with code ${code}, signal ${signal}`);
  });

  process.on("exit", () => {
    if (pythonProcess) {
      pythonProcess.kill();
    }
  });
}

async function startServer() {
  ensurePythonBackend();

  // Wait 600ms for Python server to initialize
  await new Promise((resolve) => setTimeout(resolve, 600));

  const app = express();
  app.use(express.json());

  // Step 3: Proxy /api/* to the Python backend
  app.all("/api/*", (req, res) => {
    const targetUrl = new URL(req.originalUrl, `http://${PYTHON_BACKEND_HOST}:${PYTHON_BACKEND_PORT}`);

    const options: http.RequestOptions = {
      hostname: PYTHON_BACKEND_HOST,
      port: PYTHON_BACKEND_PORT,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${PYTHON_BACKEND_HOST}:${PYTHON_BACKEND_PORT}`
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on("error", (err) => {
      console.error("Proxy error communicating with Python backend:", err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: "QuickX Python backend temporarily unavailable",
          details: err.message
        });
      }
    });

    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
      proxyReq.setHeader("Content-Type", "application/json");
      proxyReq.write(bodyData);
    }

    proxyReq.end();
  });

  // Step 4: Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`QuickX Web Application running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
