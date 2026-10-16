// Execute the actual adapter logic with a mocked plugin API and process launcher.
// No OpenCode installation, container, network request, or API credential is used.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import vm from "node:vm"
import test from "node:test"

const original = readFileSync(new URL("../adapters/opencode/bash.ts", import.meta.url), "utf8")
const executable = stripTypeScriptTypes(original)
  .replace(/^import \{ tool \} from "@opencode-ai\/plugin"\s*$/m, "")
  .replace("export default tool(", "globalThis.adapter = tool(")

function fixture(cap) {
  const schema = new Proxy({}, { get: () => () => schema })
  const tool = Object.assign((definition) => definition, { schema })
  const calls = []
  const context = {
    tool, Response,
    process: { env: { RESEARCH_EXAM_SHELL_RUNNER: "/test/bridge", ...cap } },
    Bun: { spawn(args, options) {
      calls.push({ args, options })
      return { stdout: new Blob(["synthetic output"]).stream(),
        stderr: new Blob([]).stream(), exited: Promise.resolve(0) }
    } },
  }
  vm.runInNewContext(executable, context)
  return { adapter: context.adapter, calls }
}

test("omitted timeout retains the documented 120-second default", async () => {
  const { adapter, calls } = fixture({ RESEARCH_EXAM_COMMAND_TIMEOUT_MAX: "7200" })
  const result = await adapter.execute({ command: "scientific calculation" }, { directory: "/test/workspace" })
  assert.equal(calls[0].args[2], "120")
  assert.equal(calls[0].args[1], "/test/workspace")
  assert.equal(calls[0].options.cwd, "/test/workspace")
  assert.match(result, /exit_code=0/)
})

test("long explicit timeout works, while configured caps remain effective", async () => {
  const { adapter, calls } = fixture({ RESEARCH_EXAM_COMMAND_TIMEOUT_MAX: "7200" })
  for (const timeout of [1500000, 8000000, 1000]) {
    await adapter.execute({ command: "synthetic command", timeout }, { directory: "/test/workspace" })
  }
  assert.deepEqual(calls.map((call) => call.args[2]), ["1500", "7200", "1"])
})

test("missing or invalid deployment cap fails rather than inventing a fallback", async () => {
  for (const value of [undefined, "0", "-1", "bad"]) {
    const { adapter, calls } = fixture(value === undefined ? {} : { RESEARCH_EXAM_COMMAND_TIMEOUT_MAX: value })
    await assert.rejects(adapter.execute({ command: "unused" }, { directory: "/test/workspace" }), /positive integer/)
    assert.equal(calls.length, 0)
  }
})
