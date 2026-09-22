import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const activeWorkflows = [
  ".github/workflows/phase-c-monitor.yml",
  ".github/workflows/pages.yml",
];

test("Gold50 active workflows pin external actions to immutable SHAs", async () => {
  for (const path of activeWorkflows) {
    const text = await readFile(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*-?\s*uses:\s*([^\s#]+)/);
      if (!m) continue;
      const ref = m[1];
      if (ref.startsWith("./")) continue;
      assert.match(ref, /^[^@]+@[0-9a-f]{40}$/i, `${path}: mutable or non-SHA action reference: ${ref}`);
    }
  }
});
