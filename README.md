# Info Collector

A React + TypeScript form with a Bun API that saves names and emails to CSV.

## Install

Install Git, Node.js 22.12+ (for Vite), and Bun, then run:

```sh
git clone https://github.com/TJHSST-Dev-Club/info-collector.git
cd info-collector
bun install
```

## Local development

From the repo root, start both the frontend and API (requires Bash):

```sh
bash start_server.sh
```

Open the URL printed by Vite (usually http://localhost:5173). The API runs at
http://localhost:8787 and saves submissions to `submissions.csv` in the repo root.
No `.env` file is required for local development. Press Ctrl+C to stop both servers.

To run them separately, use two terminals in the repo root:

```sh
bun run http-serve
```

```sh
bun run dev
```

Keep the API on port 8787: the frontend currently uses that address directly.
You can check the API at http://localhost:8787/health.

## Other commands

```sh
bun run lint     # Run ESLint
bun run build    # Type-check and build the frontend into dist/
bun run preview  # Preview the built frontend (API must run separately)
```
