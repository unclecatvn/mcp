import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ObsidianMCPServer } from "../../mcpServer.js";

let dir;
beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-obsidian-srv-")));
  fs.mkdirSync(path.join(dir, "rw"));
  fs.mkdirSync(path.join(dir, "ro"));
  fs.writeFileSync(path.join(dir, "ro", "Hello.md"), "hello #greeting");
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function connect(env) {
  const { server } = new ObsidianMCPServer({ env });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(b);
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = r.content[0].text;
    return r.isError ? { error: text } : JSON.parse(text);
  };
  return { client, call };
}

describe("ObsidianMCPServer", () => {
  it("hides write tools when every vault is readonly", async () => {
    const { client, call } = await connect({ OBSIDIAN_RO_PATH: path.join(dir, "ro") });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "list_notes",
      "list_vaults",
      "read_note",
      "search_notes",
    ]);
    // Single vault: `vault` may be omitted.
    expect((await call("read_note", { path: "Hello" })).tags).toEqual(["greeting"]);
    expect(client.getInstructions()).toMatch(/vault-relative/);
  });

  it("round-trips write/read/delete and enforces per-vault mode", async () => {
    const { client, call } = await connect({
      OBSIDIAN_RW_PATH: path.join(dir, "rw"),
      OBSIDIAN_RW_MODE: "readwrite",
      OBSIDIAN_RO_PATH: path.join(dir, "ro"),
    });
    expect((await client.listTools()).tools).toHaveLength(6);
    expect((await call("list_vaults")).vaults).toEqual([
      { name: "rw", path: path.join(dir, "rw"), mode: "readwrite" },
      { name: "ro", path: path.join(dir, "ro"), mode: "readonly" },
    ]);

    expect(await call("write_note", { vault: "rw", path: "A/Note", content: "x [[B]]" })).toEqual({
      path: "A/Note.md",
      mode: "create",
      bytes: 7,
    });
    expect((await call("read_note", { vault: "rw", path: "A/Note.md" })).links).toEqual(["B"]);
    expect((await call("list_notes", { vault: "rw" })).notes).toEqual(["A/Note.md"]);
    expect((await call("search_notes", { vault: "rw", query: "[[b]]" })).results).toHaveLength(1);
    expect((await call("delete_note", { vault: "rw", path: "A/Note" })).trashedTo).toBe(
      ".trash/A/Note.md",
    );

    expect((await call("write_note", { vault: "ro", path: "X", content: "x" })).error).toMatch(
      /readonly.*OBSIDIAN_RO_MODE=readwrite/,
    );
    expect((await call("read_note", { path: "Hello" })).error).toMatch(
      /Pass "vault" — one of: rw, ro/,
    );
    expect((await call("read_note", { vault: "nope", path: "Hello" })).error).toMatch(
      /Unknown vault "nope"/,
    );
    expect((await call("list_notes", { vault: "ro", limit: 0 })).error).toMatch(/limit/);
  });

  it("explains how to configure when no vault is set", async () => {
    const { call } = await connect({});
    expect((await call("list_notes")).error).toMatch(/OBSIDIAN_<NAME>_PATH/);
    expect(await call("list_vaults")).toEqual({ vaults: [] });
  });
});
