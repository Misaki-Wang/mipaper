#!/usr/bin/env node

import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const SITE_ROOT = resolve(REPO_ROOT, "site");
const DEFAULT_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 250;

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
]);

const SCENARIOS = [
  {
    name: "cool-daily",
    path: "/cool-daily.html",
    readyExpression: `
      document.querySelectorAll("[data-cadence-report]").length > 0 &&
      (document.querySelector("#hero-report-date")?.textContent || "").trim() !== "" &&
      (document.querySelector("#hero-report-date")?.textContent || "").trim() !== "-" &&
      document.querySelectorAll("#daily-floating-toc [data-toc-target]").length > 0 &&
      !/failed to load/i.test(document.body.innerText)
    `,
    heroExpression: `(document.querySelector("#hero-report-date")?.textContent || "").trim()`,
    switchExpression: `
      (() => {
        const current =
          document.querySelector("[data-cadence-report].active")?.dataset.cadenceReport ||
          document.querySelector("#report-select")?.value ||
          "";
        const nextButton = [...document.querySelectorAll("[data-cadence-report]")].find(
          (button) => (button.dataset.cadenceReport || "") && button.dataset.cadenceReport !== current
        );
        if (!nextButton) {
          throw new Error("No secondary daily snapshot available");
        }
        nextButton.click();
        return nextButton.dataset.cadenceReport;
      })()
    `,
    controlSummaryExpression: `document.querySelectorAll("[data-cadence-report]").length`,
  },
  {
    name: "hf-daily",
    path: "/hf-daily.html",
    readyExpression: `
      document.querySelectorAll("[data-hf-cadence-report]").length > 0 &&
      (document.querySelector("#hf-hero-date")?.textContent || "").trim() !== "" &&
      (document.querySelector("#hf-hero-date")?.textContent || "").trim() !== "-" &&
      document.querySelectorAll("#hf-floating-toc [data-toc-target]").length > 0 &&
      !/failed to load/i.test(document.body.innerText)
    `,
    heroExpression: `(document.querySelector("#hf-hero-date")?.textContent || "").trim()`,
    switchExpression: `
      (() => {
        const current =
          document.querySelector("[data-hf-cadence-report].is-active")?.dataset.hfCadenceReport || "";
        const nextButton = [...document.querySelectorAll("[data-hf-cadence-report]")].find(
          (button) => (button.dataset.hfCadenceReport || "") && button.dataset.hfCadenceReport !== current
        );
        if (!nextButton) {
          throw new Error("No secondary HF snapshot available");
        }
        nextButton.click();
        return nextButton.dataset.hfCadenceReport;
      })()
    `,
    controlSummaryExpression: `document.querySelectorAll("[data-hf-cadence-report]").length`,
  },
  {
    name: "conference",
    path: "/conference.html",
    readyExpression: `
      document.querySelector("#conference-select")?.options.length > 0 &&
      (document.querySelector("#conference-hero-venue")?.textContent || "").trim() !== "" &&
      (document.querySelector("#conference-hero-venue")?.textContent || "").trim() !== "-" &&
      document.querySelectorAll("#conference-floating-toc [data-toc-target]").length > 0 &&
      !/failed to load/i.test(document.body.innerText)
    `,
    heroExpression: `(document.querySelector("#conference-hero-venue")?.textContent || "").trim()`,
    switchExpression: `
      (() => {
        const select = document.querySelector("#conference-select");
        const values = [...select.options].map((option) => option.value).filter(Boolean);
        const next = values.find((value) => value !== select.value);
        if (!next) {
          throw new Error("No secondary conference snapshot available");
        }
        select.value = next;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return next;
      })()
    `,
    controlSummaryExpression: `document.querySelector("#conference-select")?.options?.length ?? null`,
  },
  {
    name: "trending",
    path: "/trending.html",
    readyExpression: `
      document.querySelectorAll("[data-trending-cadence-report]").length > 0 &&
      (document.querySelector("#trending-hero-date")?.textContent || "").trim() !== "" &&
      (document.querySelector("#trending-hero-date")?.textContent || "").trim() !== "-" &&
      document.querySelectorAll("#trending-floating-toc [data-toc-target]").length > 0 &&
      !/failed to load/i.test(document.body.innerText)
    `,
    heroExpression: `(document.querySelector("#trending-hero-date")?.textContent || "").trim()`,
    switchExpression: `
      (() => {
        const current =
          document.querySelector("[data-trending-cadence-report].is-active")?.dataset.trendingCadenceReport ||
          document.querySelector("#trending-report-select")?.value ||
          "";
        const nextButton = [...document.querySelectorAll("[data-trending-cadence-report]")].find(
          (button) => (button.dataset.trendingCadenceReport || "") && button.dataset.trendingCadenceReport !== current
        );
        if (!nextButton) {
          throw new Error("No secondary trending snapshot available");
        }
        nextButton.click();
        return nextButton.dataset.trendingCadenceReport;
      })()
    `,
    controlSummaryExpression: `document.querySelectorAll("[data-trending-cadence-report]").length`,
  },
];

async function main() {
  const chromePath = findChromeBinary();
  const userDataDir = await mkdtemp(join(tmpdir(), "cool-paper-smoke-chrome-"));
  const server = await startStaticServer(SITE_ROOT);
  const debuggingPort = await findFreePort();
  const chromeLogs = [];

  let chromeProcess = null;
  let client = null;

  try {
    chromeProcess = spawn(
      chromePath,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${debuggingPort}`,
        `--user-data-dir=${userDataDir}`,
        "--window-size=1440,1200",
        "about:blank",
      ],
      {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    chromeProcess.stdout.on("data", (chunk) => chromeLogs.push(String(chunk).trim()));
    chromeProcess.stderr.on("data", (chunk) => chromeLogs.push(String(chunk).trim()));

    const pageWsUrl = await waitForPageWebSocketUrl(debuggingPort);
    client = await CdpClient.connect(pageWsUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    const runtimeExceptions = [];
    client.on("Runtime.exceptionThrown", (params) => {
      runtimeExceptions.push(formatRuntimeException(params));
    });

    for (const scenario of SCENARIOS) {
      runtimeExceptions.length = 0;
      await runScenario({
        client,
        origin: server.origin,
        scenario,
        runtimeExceptions,
      });
      console.log(`PASS ${scenario.name}`);
    }

    console.log("Smoke test passed for cool-daily, hf-daily, conference, and trending.");
  } catch (error) {
    if (chromeLogs.length) {
      console.error("Chrome logs:");
      chromeLogs
        .filter(Boolean)
        .slice(-20)
        .forEach((line) => console.error(line));
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await client?.close().catch(() => {});
    if (chromeProcess) {
      chromeProcess.kill("SIGTERM");
      await waitForProcessExit(chromeProcess, 5_000).catch(() => {
        chromeProcess.kill("SIGKILL");
        return waitForProcessExit(chromeProcess, 5_000);
      });
    }
    await stopServer(server);
    await rm(userDataDir, { recursive: true, force: true });
  }
}

async function runScenario({ client, origin, scenario, runtimeExceptions }) {
  const url = `${origin}${scenario.path}`;
  await navigate(client, url);
  await waitForScenarioReady(client, scenario, runtimeExceptions, "initial render");
  const initialHero = await evaluate(client, scenario.heroExpression);
  if (!initialHero || initialHero === "-") {
    throw new Error(`${scenario.name} did not render a valid hero value`);
  }
  ensureNoRuntimeExceptions(runtimeExceptions, scenario.name);

  await evaluate(client, scenario.switchExpression);
  await waitForScenarioReady(
    client,
    {
      ...scenario,
      readyExpression: `${scenario.readyExpression} && (${scenario.heroExpression}) !== ${JSON.stringify(initialHero)}`,
    },
    runtimeExceptions,
    "report switch"
  );
  ensureNoRuntimeExceptions(runtimeExceptions, scenario.name);
}

async function waitForScenarioReady(client, scenario, runtimeExceptions, stepName) {
  try {
    await waitForPredicate(client, scenario.readyExpression, `${scenario.name} ${stepName}`);
  } catch (error) {
    const snapshot = await collectScenarioDebugSnapshot(client, scenario).catch(() => null);
    const exceptionText = runtimeExceptions.length ? `\nRuntime exceptions:\n${runtimeExceptions.join("\n")}` : "";
    const snapshotText = snapshot ? `\nScenario snapshot:\n${snapshot}` : "";
    throw new Error(`${error.message}${exceptionText}${snapshotText}`);
  }
}

async function navigate(client, url) {
  const loadEvent = client.waitForEvent("Page.loadEventFired", DEFAULT_TIMEOUT_MS);
  await client.send("Page.navigate", { url });
  await loadEvent;
}

async function waitForPredicate(client, expression, description, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(client, `Boolean(${expression})`)) {
        return;
      }
    } catch (_error) {
      // Ignore transient evaluation failures while the page is navigating.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out while waiting for ${description}`);
}

function ensureNoRuntimeExceptions(exceptions, scenarioName) {
  if (!exceptions.length) {
    return;
  }
  throw new Error(`${scenarioName} raised runtime exceptions:\n${exceptions.join("\n")}`);
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(formatExceptionDetails(response.exceptionDetails));
  }
  if (Object.prototype.hasOwnProperty.call(response.result, "value")) {
    return response.result.value;
  }
  if (response.result.unserializableValue) {
    return response.result.unserializableValue;
  }
  return undefined;
}

async function collectScenarioDebugSnapshot(client, scenario) {
  const controlCount = await evaluate(client, scenario.controlSummaryExpression).catch(() => null);
  const heroValue = await evaluate(client, scenario.heroExpression).catch(() => null);
  const tocCount = await evaluate(
    client,
    `document.querySelectorAll(${JSON.stringify(tocSelectorForPage(scenario.name))}).length`
  ).catch(() => null);
  const excerpt = await evaluate(
    client,
    `document.body.innerText.slice(0, 500)`
  ).catch(() => "");

  return [`controls: ${controlCount}`, `hero: ${heroValue}`, `toc entries: ${tocCount}`, excerpt]
    .filter(Boolean)
    .join("\n");
}

function tocSelectorForPage(name) {
  switch (name) {
    case "cool-daily":
      return "#daily-floating-toc [data-toc-target]";
    case "hf-daily":
      return "#hf-floating-toc [data-toc-target]";
    case "conference":
      return "#conference-floating-toc [data-toc-target]";
    case "trending":
      return "#trending-floating-toc [data-toc-target]";
    default:
      return "[data-toc-target]";
  }
}

async function waitForPageWebSocketUrl(debuggingPort) {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${debuggingPort}/json/list`);
      const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (pageTarget) {
        return pageTarget.webSocketDebuggerUrl;
      }
    } catch (_error) {
      // Chrome may not be ready yet.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Timed out while waiting for Chrome DevTools websocket");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function startStaticServer(root) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") {
        pathname = "/cool-daily.html";
      }
      const normalizedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
      let targetPath = resolve(root, `.${normalizedPath}`);
      if (!targetPath.startsWith(root)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const data = await readFile(targetPath);
      response.writeHead(200, {
        "Content-Type": MIME_TYPES.get(extname(targetPath)) || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(data);
    } catch (error) {
      const status = error?.code === "ENOENT" ? 404 : 500;
      response.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(status === 404 ? "Not found" : "Internal server error");
    }
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectPromise);
      resolvePromise();
    });
  });

  const address = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

async function stopServer(serverState) {
  if (!serverState?.server) {
    return;
  }
  await new Promise((resolvePromise) => {
    serverState.server.close(() => resolvePromise());
  });
}

async function findFreePort() {
  const probe = http.createServer();
  return new Promise((resolvePromise, rejectPromise) => {
    probe.once("error", rejectPromise);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolvePromise(address.port));
    });
  });
}

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch (_error) {
      // Keep scanning.
    }
  }

  throw new Error("Could not find a Chrome or Chromium binary. Set CHROME_BIN to continue.");
}

function formatRuntimeException(params) {
  const details = params?.exceptionDetails || {};
  return formatExceptionDetails(details);
}

function formatExceptionDetails(details) {
  const description = details?.exception?.description || details?.text || "Unknown runtime error";
  const line = Number.isFinite(details?.lineNumber) ? details.lineNumber + 1 : null;
  const column = Number.isFinite(details?.columnNumber) ? details.columnNumber + 1 : null;
  const location = line ? ` (${line}${column ? `:${column}` : ""})` : "";
  return `${description}${location}`;
}

function sleep(durationMs) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, durationMs));
}

function waitForProcessExit(child, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise();
      return;
    }
    const timer = setTimeout(() => rejectPromise(new Error("Timed out while waiting for Chrome to exit")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

class CdpClient {
  static async connect(url) {
    const client = new CdpClient(url);
    await client.open();
    return client;
  }

  constructor(url) {
    this.url = url;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener("message", (event) => this.handleMessage(event));
    this.ws.addEventListener("close", () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error("CDP websocket closed"));
      }
      this.pending.clear();
    });

    await new Promise((resolvePromise, rejectPromise) => {
      this.ws.addEventListener("open", () => resolvePromise(), { once: true });
      this.ws.addEventListener("error", (event) => rejectPromise(event.error || new Error("Failed to open CDP websocket")), {
        once: true,
      });
    });
  }

  async close() {
    if (!this.ws || this.ws.readyState >= WebSocket.CLOSING) {
      return;
    }
    await new Promise((resolvePromise) => {
      this.ws.addEventListener("close", () => resolvePromise(), { once: true });
      this.ws.close();
    });
  }

  on(method, callback) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(callback);
    this.listeners.set(method, listeners);
  }

  waitForEvent(method, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        cleanup();
        rejectPromise(new Error(`Timed out while waiting for CDP event ${method}`));
      }, timeoutMs);

      const handler = (params) => {
        cleanup();
        resolvePromise(params);
      };

      const cleanup = () => {
        clearTimeout(timer);
        const listeners = this.listeners.get(method) || [];
        this.listeners.set(
          method,
          listeners.filter((listener) => listener !== handler)
        );
      };

      this.on(method, handler);
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  handleMessage(event) {
    const payload = JSON.parse(String(event.data));
    if (payload.id) {
      const pending = this.pending.get(payload.id);
      if (!pending) {
        return;
      }
      this.pending.delete(payload.id);
      if (payload.error) {
        pending.reject(new Error(payload.error.message || `CDP command failed: ${payload.error.code}`));
        return;
      }
      pending.resolve(payload.result || {});
      return;
    }

    const listeners = this.listeners.get(payload.method) || [];
    listeners.forEach((listener) => listener(payload.params));
  }
}

await main();
