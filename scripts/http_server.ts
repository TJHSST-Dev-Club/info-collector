import { promises as fs, constants as fsConstants } from "fs"
import path from "path"
import { fileURLToPath } from "url"

type Submission = {
  name: string
  email: string
  prompt: string
  allowEmail: boolean
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8787)
const CSV_PATH = process.env.CSV_FILE || path.resolve(__dirname, "../submissions.csv")

function toCsvValue(value: string): string {
  const escaped = value.replaceAll('"', '""')
  return `"${escaped}"`
}

async function ensureHeader() {
  try {
    await fs.access(CSV_PATH, fsConstants.F_OK)
  } catch {
    const header = ["timestamp", "name", "email", "prompt", "allowEmail"].join(",") + "\n"
    await fs.writeFile(CSV_PATH, header, "utf8")
  }
}

async function appendSubmission(data: Submission) {
  await ensureHeader()
  const timestamp = new Date().toISOString()
  const row = [
    timestamp,
    toCsvValue(data.name),
    toCsvValue(data.email),
    toCsvValue(data.prompt),
    String(Boolean(data.allowEmail)),
  ].join(",") + "\n"
  await fs.appendFile(CSV_PATH, row, "utf8")
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }
}

const server = Bun.serve({
  port: PORT,
  fetch: async (req) => {
    const url = new URL(req.url)
    const origin = req.headers.get("origin")

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) })
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    if (req.method === "POST" && url.pathname === "/submit") {
      try {
        const json = (await req.json()) as Partial<Submission>
        if (
          !json ||
          typeof json.name !== "string" ||
          typeof json.email !== "string" ||
          typeof json.prompt !== "string" ||
          json.allowEmail !== true
        ) {
          return new Response(JSON.stringify({ ok: false, error: "Invalid payload" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
          })
        }

        await appendSubmission({
          name: json.name.trim(),
          email: json.email.trim(),
          prompt: json.prompt,
          allowEmail: true,
        })

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        })
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: "Bad Request" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        })
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders(origin) })
  },
})

console.log(`HTTP server listening on http://localhost:${server.port} → writing to ${CSV_PATH}`)


