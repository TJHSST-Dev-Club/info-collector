import { promises as fs, constants as fsConstants, watch } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import { spawn } from "child_process";

type Submission = {
  name: string;
  email: string;
  prompt: string;
  allowEmail: boolean;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const CSV_PATH =
  process.env.CSV_FILE || path.resolve(__dirname, "../submissions.csv");
const SSH_HOST = process.env.SSH_HOST || process.env.SCP_HOST || "5.161.84.99";
const SSH_USER = process.env.SSH_USER || process.env.SCP_USER || "root";
const SSH_KEY_PATH =
  process.env.SSH_KEY_PATH ||
  path.join(process.env.HOME || "~", ".ssh", "infoCollect");
const REMOTE_BASE_DIR = process.env.REMOTE_BASE_DIR || "/var/www/activityfair";
const SITE_BASE_URL =
  process.env.SITE_BASE_URL || "https://activityfair.tjdev.club";

let isShuttingDown = false;
let downloadsWatcherStarted = false;
let downloadsWatcher: ReturnType<typeof watch> | null = null;
let lastSubmitterEmail: string | null = null;
let lastSubmitterName: string | null = null;
const processingDownloads = new Set<string>();

async function getDownloadsDir(): Promise<string> {
  const envOverride = process.env.DOWNLOADS_DIR;
  if (envOverride && envOverride.trim()) {
    return path.resolve(envOverride);
  }

  const home = os.homedir();
  const platform = process.platform;

  if (platform === "linux") {
    try {
      const configPath = path.join(home, ".config", "user-dirs.dirs");
      const content = await fs.readFile(configPath, "utf8");
      const match = content.match(/XDG_DOWNLOAD_DIR=(.*)/);
      if (match && match[1]) {
        let dir = match[1].trim();
        if (dir.startsWith('"') && dir.endsWith('"')) {
          dir = dir.slice(1, -1);
        }
        dir = dir.replace("$HOME", home);
        return path.resolve(dir);
      }
    } catch {
      // fall through to default
    }
  }

  // macOS and Windows default to ~/Downloads
  return path.join(home, "Downloads");
}

async function watchDownloadsForZips(): Promise<void> {
  if (downloadsWatcherStarted) return;
  downloadsWatcherStarted = true;

  const downloadsDir = await getDownloadsDir();
  try {
    await fs.access(downloadsDir, fsConstants.F_OK);
  } catch {
    console.warn(`Downloads directory not found at ${downloadsDir}`);
    return;
  }

  const seen = new Set<string>();
  try {
    const initial = await fs.readdir(downloadsDir);
    for (const name of initial) {
      if (name.toLowerCase().endsWith(".zip")) {
        seen.add(name);
      }
    }
  } catch {
    // ignore
  }

  downloadsWatcher = watch(
    downloadsDir,
    { persistent: true, encoding: "utf8" },
    (_event: string, filename: string | null) => {
      const name = typeof filename === "string" ? filename : "";
      if (!name || !name.toLowerCase().endsWith(".zip")) return;
      if (seen.has(name) || processingDownloads.has(name)) return;
      processingDownloads.add(name);
      void (async () => {
        try {
          const full = path.join(downloadsDir, name);
          try {
            const stat = await fs.stat(full);
            if (!stat.isFile()) return;
          } catch {
            return;
          }
          seen.add(name);
          console.log(`Detected downloaded zip: ${name}`);
          await handleDownloadedZip(full);
        } catch {
          // ignore handler errors
        } finally {
          processingDownloads.delete(name);
        }
      })();
    }
  );

  console.log(`Watching for .zip files in ${downloadsDir}`);
}

// handleDownloadedZip is implemented later in the file with Docker build logic

function toCsvValue(value: string): string {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

async function ensureHeader() {
  try {
    await fs.access(CSV_PATH, fsConstants.F_OK);
  } catch {
    const header =
      ["timestamp", "name", "email", "prompt", "allowEmail"].join(",") + "\n";
    await fs.writeFile(CSV_PATH, header, "utf8");
  }
}

async function appendSubmission(data: Submission) {
  await ensureHeader();
  const timestamp = new Date().toISOString();
  const row =
    [
      timestamp,
      toCsvValue(data.name),
      toCsvValue(data.email),
      toCsvValue(data.prompt),
      String(Boolean(data.allowEmail)),
    ].join(",") + "\n";
  await fs.appendFile(CSV_PATH, row, "utf8");
  lastSubmitterEmail = data.email;
  lastSubmitterName = data.name;
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

const server = Bun.serve({
  port: PORT,
  fetch: async (req) => {
    if (isShuttingDown) {
      const origin = req.headers.get("origin");
      return new Response("Server shutting down", {
        status: 503,
        headers: { "Content-Type": "text/plain", ...corsHeaders(origin) },
      });
    }
    const url = new URL(req.url);
    const origin = req.headers.get("origin");

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (req.method === "POST" && url.pathname === "/submit") {
      try {
        const json = (await req.json()) as Partial<Submission>;
        if (
          !json ||
          typeof json.name !== "string" ||
          typeof json.email !== "string" ||
          typeof json.prompt !== "string" ||
          json.allowEmail !== true
        ) {
          return new Response(
            JSON.stringify({ ok: false, error: "Invalid payload" }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders(origin),
              },
            }
          );
        }

        await appendSubmission({
          name: json.name.trim(),
          email: json.email.trim(),
          prompt: json.prompt,
          allowEmail: true,
        });

        // Start watching Downloads for .zip files after the first successful submission
        void watchDownloadsForZips();

        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ ok: false, error: "Bad Request" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(origin),
            },
          }
        );
      }
    }

    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders(origin),
    });
  },
});

console.log(
  `HTTP server listening on http://localhost:${server.port} → writing to ${CSV_PATH}`
);

async function gracefulExit(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Received ${signal}, stopping server...`);
  try {
    server.stop();
  } catch (err) {
    console.error("Error while stopping server:", err);
  }
  try {
    downloadsWatcher && downloadsWatcher.close();
  } catch (err) {
    console.error("Error while closing downloads watcher:", err);
  }
  const forceTimeout = setTimeout(() => {
    console.error("Force exiting after timeout");
    process.exit(1);
  }, 5000);
  // @ts-ignore - unref may not exist in some runtimes
  forceTimeout.unref && forceTimeout.unref();
  await new Promise((r) => setTimeout(r, 50));
  console.log("Server stopped. Goodbye.");
  process.exit(0);
}

process.on("SIGINT", () => {
  void gracefulExit("SIGINT");
});

process.on("SIGTERM", () => {
  void gracefulExit("SIGTERM");
});

function sanitizeLocalPart(localPart: string): string {
  const cleaned = localPart.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned || "unknown";
}

async function handleDownloadedZip(zipPath: string) {
  console.log(`Handling downloaded zip: ${zipPath}`);
  try {
    await waitForStableFile(zipPath);
    const email = lastSubmitterEmail || "unknown@example.com";
    const localPart = sanitizeLocalPart(email.split("@")[0] || "unknown");
    const displayName = (lastSubmitterName || "there").trim();
    const siteUrl = `${SITE_BASE_URL}/${localPart}/`;
    const buildsRoot = path.resolve(__dirname, "../builds", localPart);
    await fs.mkdir(buildsRoot, { recursive: true });

    const zipFileName = path.basename(zipPath);
    const zipBase = zipFileName.replace(/\.zip$/i, "");
    const outputDir = path.join(buildsRoot, zipBase);
    await fs.mkdir(outputDir, { recursive: true });

    const dockerImage = process.env.DOCKER_NODE_IMAGE || "node:20-alpine";

    const shellScript = [
      // be resilient to build failures so we can still collect any output
      "set +e",
      // allow TypeScript errors without failing the build (CRA and some tools respect this)
      "export TSC_COMPILE_ON_ERROR=true",
      "export CI=true",
      "apk add --no-cache unzip >/dev/null || true",
      "mkdir -p /workspace",
      "cd /workspace",
      'unzip -q "/input/upload.zip" || { echo "Unzip failed" >&2; exit 0; }',
      // If there is no package.json, treat it as a static export and copy ONLY contents
      "PKG_JSON=$(find /workspace -maxdepth 2 -type f -name package.json -print -quit)",
      'OUT_DIR="/output/${zipBase}"',
      'mkdir -p "$OUT_DIR"',
      'if [ -z "$PKG_JSON" ]; then',
      '  ROOT_DIR="/workspace"',
      "  TOP_DIRS=$(find /workspace -mindepth 1 -maxdepth 1 -type d | wc -l)",
      "  TOP_FILES=$(find /workspace -mindepth 1 -maxdepth 1 -type f | wc -l)",
      '  if [ "$TOP_DIRS" -eq 1 ] && [ "$TOP_FILES" -eq 0 ]; then',
      "    ROOT_DIR=$(find /workspace -mindepth 1 -maxdepth 1 -type d -print -quit)",
      "  fi",
      '  if [ -d "$ROOT_DIR/dist" ]; then SRC_DIR="$ROOT_DIR/dist"; elif [ -d "$ROOT_DIR/build" ]; then SRC_DIR="$ROOT_DIR/build"; else SRC_DIR="$ROOT_DIR"; fi',
      '  cp -R "$SRC_DIR"/* "$OUT_DIR" 2>/dev/null || true',
      "  exit 0",
      "fi",
      'PKG_DIR="${PKG_JSON%/package.json}"',
      'cd "$PKG_DIR"',
      // install deps; try ci then install; keep going even if it fails
      "if [ -f package-lock.json ]; then npm ci || npm install || true; else npm install || true; fi",
      // Prefer Vite build for vite projects; fall back to package build
      "npx --yes vite build || node ./node_modules/.bin/vite build || TSC_COMPILE_ON_ERROR=true npm run build --if-present || true",
      `OUT_DIR="/output/${zipBase}"`,
      'mkdir -p "$OUT_DIR"',
      'if [ -d dist ]; then cp -R dist/* "$OUT_DIR"; elif [ -d build ]; then cp -R build/* "$OUT_DIR"; else echo "No dist/build found" > "$OUT_DIR/NO_DIST_FOUND.txt"; fi',
      // always exit 0 so the host process does not fail
      "exit 0",
    ].join("\n");

    await runCommand("docker", [
      "run",
      "--rm",
      "-v",
      `${zipPath}:/input/upload.zip:ro`,
      "-v",
      `${buildsRoot}:/output`,
      dockerImage,
      "sh",
      "-lc",
      shellScript,
    ]);

    console.log(`Build completed. Output at: ${outputDir}`);

    // make directory exist

    await runCommand("ssh", [
      "-i",
      SSH_KEY_PATH,
      `${SSH_USER}@${SSH_HOST}`,
      `mkdir -p ${REMOTE_BASE_DIR}/${localPart} && find ${REMOTE_BASE_DIR}/${localPart} -mindepth 1 -maxdepth 1 -exec rm -rf {} +`,
    ]);
    // starting scp
    await runCommand("scp", [
      "-i",
      SSH_KEY_PATH,
      "-r",
      path.join(outputDir, "."),
      `${SSH_USER}@${SSH_HOST}:${REMOTE_BASE_DIR}/${localPart}/`,
    ]);

    // flatten key web assets: move any nested html/css/js files to the root of the user's directory
    await runCommand("ssh", [
      "-i",
      SSH_KEY_PATH,
      `${SSH_USER}@${SSH_HOST}`,
      `ROOT="${REMOTE_BASE_DIR}/${localPart}"; find "$ROOT" -mindepth 2 -type f \\( -name '*.html' -o -name '*.css' -o -name '*.js' \\) -exec mv -n {} "$ROOT/" \\;`,
    ]);

    // replace /assets/ references with /{localPart}/ in all web files
    await runCommand("ssh", [
      "-i",
      SSH_KEY_PATH,
      `${SSH_USER}@${SSH_HOST}`,
      `ROOT="${REMOTE_BASE_DIR}/${localPart}"; find "$ROOT" -type f \\( -name '*.html' -o -name '*.css' -o -name '*.js' \\) -exec sed -i 's|/assets/|/${localPart}/|g' {} \\;`,
    ]);

    // send notification email via SMTP
    try {
      const nodemailer = (await import("nodemailer")).default;
      const smtpHost = process.env.SMTP_HOST || "";
      const smtpPort = Number(process.env.SMTP_PORT || 465);
      const smtpUser = process.env.SMTP_USERNAME || "";
      const smtpPass = process.env.SMTP_PASSWORD || "";
      if (!smtpHost || !smtpUser || !smtpPass) {
        console.warn("SMTP credentials missing; skipping email notification");
      } else {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: true,
          auth: { user: smtpUser, pass: smtpPass },
        });
        const info = await transporter.sendMail({
          from: "TJHSST Dev Club <hello@tjdev.club>",
          to: lastSubmitterEmail || smtpUser,
          subject: `Hey ${displayName}, your Activity Fair site is live`,
          text: `Hey ${displayName},\n\nWe've set up your Activity Fair submission. You can view it here:\n${siteUrl}\n\nQuick heads up: sign up for our 8th period ASAP, spots fill up fast!\nLearn more at https://tjdev.club\n\nThanks,\nDev Club`,
          html: `<p>Hey ${displayName},</p>
                 <p>Your Activity Fair website submission is online! You can view it here:</p>
                 <p><a href="${siteUrl}">${siteUrl}</a></p>
                 <p>Quick heads up: make sure sign up for our Wednesday 8B block before the spots fill up!</p>
                 <p>Learn more at <a href="https://tjdev.club">tjdev.club</a></p>
                 <p>Thanks,<br/>Dev Club</p>`,
        });
        console.log(`Email sent: ${info.messageId}`);
      }
    } catch (mailErr) {
      console.error("Failed to send email:", mailErr);
    }
  } catch (err) {
    console.error("Failed to handle downloaded zip:", err);
  }
}

async function waitForStableFile(
  filePath: string,
  timeoutMs = 10000,
  stableCycles = 3
): Promise<void> {
  const start = Date.now();
  let lastSize = -1;
  let stableCount = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size === lastSize) {
        stableCount += 1;
        if (stableCount >= stableCycles) return;
      } else {
        stableCount = 0;
        lastSize = stat.size;
      }
    } catch {
      // file may not exist yet
      stableCount = 0;
      lastSize = -1;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}
