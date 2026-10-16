// Project-authored isolated shell adapter. See THIRD_PARTY_NOTICES.md.
import { tool } from "@opencode-ai/plugin"

const MAX_OUTPUT_CHARS = 120_000

function bounded(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text
  return text.slice(0, MAX_OUTPUT_CHARS) + "\n[output truncated by exam harness]"
}

export default tool({
  description:
    "Run a shell command in the isolated, network-disabled scientific-computing container. " +
    "The current examination workspace is mounted at /workspace and is the working directory. " +
    "Native file tools use host workspace paths; when an absolute path is required, " +
    "use the host workspace absolute path, never the container's /workspace path. " +
    "You can write submission files through bash under /workspace/submission/. " +
    "An omitted timeout requests 120 seconds; explicitly request longer for a longer computation, " +
    "subject to the configurable command cap and remaining examination time.",
  args: {
    command: tool.schema.string().describe("Shell command to execute inside the exam container"),
    timeout: tool.schema
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional timeout in milliseconds; default 120000 (120 seconds), capped by the configured project limit and remaining examination time"),
    description: tool.schema.string().optional().describe("Short description of the command"),
  },
  async execute(args, context) {
    const runner = process.env.RESEARCH_EXAM_SHELL_RUNNER
    if (!runner) throw new Error("isolated shell runner is not configured")
    // The runner supplies the configured cap; do not silently invent one if missing.
    const configuredSeconds = Number(process.env.RESEARCH_EXAM_COMMAND_TIMEOUT_MAX)
    if (!Number.isInteger(configuredSeconds) || configuredSeconds <= 0) {
      throw new Error("exam command timeout cap must be a positive integer number of seconds")
    }
    const configuredMax = configuredSeconds * 1000
    const timeoutMs = Math.min(args.timeout ?? 120_000, configuredMax)
    const proc = Bun.spawn(
      [runner, context.directory, String(Math.ceil(timeoutMs / 1000)), args.command],
      {
        cwd: context.directory,
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    const merged = [stdout, stderr].filter(Boolean).join("\n")
    return bounded(`${merged}\n[exit_code=${exitCode}]`.trim())
  },
})
