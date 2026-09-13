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

import { dirname, isAbsolute, join, resolve } from "@std/path";

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

/**
 * The CFCM config an evaluation run uses: the user's own, with query text logged.
 *
 * Query text is off by default because a person's searches are theirs. An
 * evaluation's searches are an agent answering a prompt we wrote, and without
 * them a behaviour divergence says *that* the search missed and never *what*
 * was searched: the pilot's PARTIAL_MATCH on the slug scenario could only be
 * guessed at by replaying plausible phrasings by hand.
 *
 * The copy lives in the run's CFCM home, so relative paths are made absolute
 * against the original file first. Otherwise "./capabilities" would quietly
 * point somewhere else and condition A would search an empty registry.
 */
export function evalConfig(raw: Record<string, unknown>, baseDir: string): Record<string, unknown> {
  const config = structuredClone(raw);
  const absolute = (path: string) =>
    /^[a-z][a-z0-9+.-]*:\/\//i.test(path) || isAbsolute(path) ? path : resolve(join(baseDir, path));

  const capfoundry = config.capfoundry as Record<string, unknown> | undefined;
  if (capfoundry && typeof capfoundry.registry === "string" && capfoundry.registry.length > 0) {
    capfoundry.registry = absolute(capfoundry.registry);
  }
  for (const ns of (config.namespaces as Record<string, unknown>[] | undefined) ?? []) {
    const source = ns?.source as Record<string, unknown> | undefined;
    if (source && typeof source.path === "string") source.path = absolute(source.path);
  }
  config.telemetry = { ...(config.telemetry as Record<string, unknown> ?? {}), logQueryText: true };
  return config;
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

  private skillText: string | null = null;

  /** The skill body without its frontmatter, as condition A's standing instruction. */
  private async awarenessSkill(): Promise<string> {
    if (this.skillText !== null) return this.skillText;
    const raw = await Deno.readTextFile(
      join(this.repoRoot, "skills/capability-awareness/SKILL.md"),
    );
    this.skillText = raw.replace(/^---[\s\S]*?---\s*/, "").trim();
    return this.skillText;
  }

  private async writeMcpConfig(dir: string, cfcmHome: string): Promise<string> {
    const path = join(dir, "mcp.json");
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(await Deno.readTextFile(this.configPath));
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) throw err;
    }
    const configPath = join(cfcmHome, "cfcm.json");
    await Deno.writeTextFile(configPath, JSON.stringify(evalConfig(raw, dirname(this.configPath))));

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
            env: { CFCM_CONFIG: configPath, CFCM_HOME: cfcmHome },
          },
        },
      }),
    );
    return path;
  }

  /**
   * The command line for one run. Separate so the flags that decide whether
   * the experiment measures anything can be tested without spending money.
   */
  async buildArgs(options: DriverOptions): Promise<string[]> {
    const args = [
      "-p",
      options.prompt,
      "--output-format",
      "json",
      // Without a permission mode, print mode refuses Write: there is nobody to
      // approve it, so the agent reasons, is denied, and exits clean with an
      // empty workspace. Every scenario then fails in both conditions, which
      // reads as a falsification result and is a harness bug.
      //
      // acceptEdits rather than bypassPermissions. An agent that never has to
      // ask is not the agent anyone runs, and changing what the agent is
      // allowed to do changes what is being measured. Found by Marie.
      "--permission-mode",
      "acceptEdits",
      // A skill installed in the user's global skills directory loads in both
      // conditions. capability-awareness was installed that way, so the
      // control arm was being told to search for capabilities with no tool to
      // search with — the variable under test leaking into the control.
      // Disabling skills in both arms, then supplying the one condition A is
      // meant to have, makes its presence a design decision rather than an
      // accident of whoever runs the harness.
      "--disable-slash-commands",
    ];

    if (options.cfcmEnabled) {
      args.push("--mcp-config", await this.writeMcpConfig(options.workspace, options.cfcmHome));
      // acceptEdits covers file edits and nothing else. MCP tools need their own
      // grant, and without it condition A can *see* CFCM and is refused the
      // moment it tries to use it. That produced a probe run with zero searches
      // that read as "the agent chose not to search" and was really "the agent
      // was not allowed to". A full evaluation run in that state would have
      // reported CapFoundry giving no advantage — a falsification-shaped
      // result caused by a missing flag.
      //
      // Named explicitly rather than granting the whole server, so condition A
      // is allowed exactly the four tools CFCM exposes and nothing it grows
      // later without someone deciding to.
      args.push(
        "--allowedTools",
        ["cfcm_search", "cfcm_invoke", "cfcm_describe", "cfcm_submit_candidate"]
          .map((tool) => `mcp__cfcm__${tool}`)
          .join(","),
      );
      // MVP section 22 defines condition A as CFCM *and* the Capability
      // Awareness Skill. An MCP server the agent has not been told about is a
      // different experiment: in a probe the agent solved the task correctly
      // and never searched.
      args.push("--append-system-prompt", await this.awarenessSkill());
    }

    return args;
  }

  async run(options: DriverOptions): Promise<AgentRun> {
    const args = await this.buildArgs(options);

    const started = performance.now();
    const command = new Deno.Command("claude", {
      args,
      cwd: options.workspace,
      // Without this the CLI waits three seconds for stdin on every run —
      // wall-clock noise charged identically to both arms, but noise all the
      // same in the one number the latency comparison reads.
      stdin: "null",
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
