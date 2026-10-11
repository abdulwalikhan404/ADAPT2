import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_BYTES = 1_000_000;

export class AdaptEngineError extends Error {
  constructor(message: string, readonly stderr = "") {
    super(message);
    this.name = "AdaptEngineError";
  }
}

function resolveEnginePath(): string {
  const override = process.env["ADAPT_ENGINE_BIN"];
  if (override) return override;

  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDirectory, "native", "adapt-engine-cli"),
    path.resolve(moduleDirectory, "../../dist/native/adapt-engine-cli"),
    path.resolve(process.cwd(), "dist/native/adapt-engine-cli"),
    path.resolve(process.cwd(), "artifacts/api-server/dist/native/adapt-engine-cli"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function runAdaptEngine<T>(request: Record<string, unknown>): Promise<T> {
  const executable = resolveEnginePath();

  return new Promise<T>((resolve, reject) => {
    const child = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback: (value: never) => void, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value as never);
    };

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(reject, new AdaptEngineError("Native ADAPT engine timed out", stderr));
    }, ENGINE_TIMEOUT_MS);
    timeout.unref();

    child.on("error", (error) => {
      finish(reject, new AdaptEngineError("Could not start native ADAPT engine", error.message));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(reject, new AdaptEngineError("Native ADAPT engine output exceeded the limit", stderr));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-8_000);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        finish(
          reject,
          new AdaptEngineError(
            `Native ADAPT engine exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
            stderr,
          ),
        );
        return;
      }

      try {
        finish(resolve, JSON.parse(stdout) as T);
      } catch (error) {
        finish(
          reject,
          new AdaptEngineError(
            "Native ADAPT engine returned invalid JSON",
            error instanceof Error ? error.message : stderr,
          ),
        );
      }
    });

    child.stdin.on("error", (error) => {
      finish(reject, new AdaptEngineError("Could not send input to native ADAPT engine", error.message));
    });
    child.stdin.end(JSON.stringify(request));
  });
}
