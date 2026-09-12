/**
 * Agent drivers for the A/B harness (PRD-FEAT-015.2).
 *
 * The harness measures; a driver runs one agent once. Keeping them apart means
 * the measurement machinery — workspace setup, scoring, telemetry extraction,
 * variance — is testable with a driver that costs nothing, and only the last
 * step spends money.
 *
 * The two conditions differ by exactly one thing: whether CFCM's MCP server is
 * configured. Same model, same prompt, same workspace layout, same everything
 * else. If a second difference creeps in, the comparison stops being about
 * CapFoundry.
 */

import { join } from "@std/path";

export interface AgentRun {
  transcript: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  costUsd: number | null;
  durationMs: number;
  timedOut: boolean;
  failed: boolean;
}

export interface DriverOptions {
  prompt: string;
  workspace: string;
  /** Condition A when true, control when false. The only difference. */
  cfcmEnabled: boolean;
  timeoutSeconds: number;
  /** Per-run CFCM home, so one run's telemetry is not another's. */
  cfcmHome: string;
}

export interface AgentDriver {
  readonly id: string;
  run(options: DriverOptions): Promise<AgentRun>;
}

/**
 * Runs Claude Code in print mode.
 *
 * Condition A gets an --mcp-config naming the CFCM server; condition B gets no
 * flag at all rather than a config with the server disabled, because a
 * disabled server still costs a startup and still tells the agent something
 * exists.
 */
export class ClaudeCodeDriver implements AgentDriver {
  readonly id = "claude-code";

  constructor(
    private readonly repoRoot: string,
    private readonly configPath: string,
  ) {}

  private async writeMcpConfig(dir: string, cfcmHome: string): Promise<string> {
    const path = join(dir, "mcp.json");
    await Deno.writeTextFile(
      path,
      JSON.stringify({
        mcpServers: {
          cfcm: {
            command: "deno",
            args: [
              "run",
              "--allow-read",
              "--allow-write",
              "--allow-net",
              "--allow-run",
              "--allow-env",
              "--quiet",
              join(this.repoRoot, "cfcm/mcp/server.ts"),
            ],
            env: { CFCM_CONFIG: this.configPath, CFCM_HOME: cfcmHome },
          },
        },
      }),
    );
    return path;
  }

  async run(options: DriverOptions): Promise<AgentRun> {
    const args = ["-p", options.prompt, "--output-format", "json"];
    if (options.cfcmEnabled) {
      args.push("--mcp-config", await this.writeMcpConfig(options.workspace, options.cfcmHome));
    }

    const started = performance.now();
    const command = new Deno.Command("claude", {
      args,
      cwd: options.workspace,
      stdout: "piped",
      stderr: "piped",
    });

    const child = command.spawn();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch { /* already gone */ }
    }, options.timeoutSeconds * 1000);

    const output = await child.output();
    clearTimeout(timer);
    const durationMs = performance.now() - started;

    const stdout = new TextDecoder().decode(output.stdout);
    if (timedOut || !output.success) {
      // A timeout is not a result. It is recorded so a run that produced
      // nothing cannot be silently averaged in as a zero.
      return {
        transcript: stdout,
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
        costUsd: null,
        durationMs,
        timedOut,
        failed: true,
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return {
        transcript: stdout,
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
        costUsd: null,
        durationMs,
        timedOut: false,
        failed: true,
      };
    }

    const usage = (parsed.usage ?? {}) as Record<string, number>;
    return {
      transcript: String(parsed.result ?? ""),
      inputTokens: usage.input_tokens ?? null,
      outputTokens: usage.output_tokens ?? null,
      // Reported separately because cache creation is an artifact of how the
      // session was warmed rather than of the task, and rolling it into one
      // "tokens" figure would make the two conditions look different for a
      // reason that is not CapFoundry.
      cachedInputTokens: (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0),
      costUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null,
      durationMs,
      timedOut: false,
      failed: false,
    };
  }
}

/** Scripted responses, so the harness itself can be tested without spending anything. */
export class MockDriver implements AgentDriver {
  readonly id = "mock";

  constructor(
    private readonly respond: (
      options: DriverOptions,
    ) =>
      | (Partial<AgentRun> & { transcript: string })
      | Promise<Partial<AgentRun> & { transcript: string }>,
  ) {}

  async run(options: DriverOptions): Promise<AgentRun> {
    const scripted = await this.respond(options);
    return ({
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 0,
      costUsd: 0,
      durationMs: 1,
      timedOut: false,
      failed: false,
      ...scripted,
    });
  }
}
