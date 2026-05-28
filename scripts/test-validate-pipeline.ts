/**
 * Compile-time tests for validate-pipeline.ts
 *
 * Uses only Node's built-in `assert` — no test runner required.
 * Run: ts-node --project tsconfig.scripts.json scripts/test-validate-pipeline.ts
 */

import assert from "assert";
import {
  validatePipeline,
  pipelineTopoOrder,
  CausalityViolationError,
  PipelineCycleError,
  UnknownDependencyError,
  DerivedNodeGroundingError,
  SourcePurityError,
  type PipelineNodeContract,
} from "../lib/compiler/validate-pipeline";

// ── Test harness ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}\n    ${msg}`);
    failed++;
  }
}

function assertThrows(
  fn:            () => unknown,
  errorClass:    new (...args: never[]) => Error,
  messagePart?:  string,
): void {
  try {
    fn();
    assert.fail(`Expected ${errorClass.name} to be thrown, but no error was thrown`);
  } catch (err) {
    if (!(err instanceof errorClass)) {
      throw new Error(
        `Expected ${errorClass.name}, got ${(err as Error).constructor?.name ?? "unknown"}: ${(err as Error).message}`,
      );
    }
    if (messagePart && !err.message.includes(messagePart)) {
      throw new Error(
        `Error message did not contain "${messagePart}".\nActual: ${err.message}`,
      );
    }
  }
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const VALID_PIPELINE: readonly PipelineNodeContract[] = [
  {
    id:        "ingest",
    role:      "source",
    inputs:    [],
    outputs:   ["projectId", "userId"],
    dependsOn: [],
  },
  {
    id:        "generate-brief",
    role:      "derived",
    inputs:    ["projectId", "userId"],
    outputs:   ["briefId", "recommended_angle"],
    dependsOn: ["ingest"],
  },
  {
    id:        "generate-script",
    role:      "derived",
    inputs:    ["briefId", "projectId"],
    outputs:   ["scriptId", "hook"],
    dependsOn: ["generate-brief"],
  },
  {
    id:        "extract-hooks",
    role:      "derived",
    inputs:    ["scriptId"],
    outputs:   ["hookId"],
    dependsOn: ["generate-script"],
  },
  {
    id:        "generate-shot-plan",
    role:      "transform",
    inputs:    ["scriptId", "hookId"],
    outputs:   ["shotPlanId"],
    dependsOn: ["extract-hooks"],
  },
];

// ── Tests ──────────────────────────────────────────────────────────────────────

console.log("\nvalidate-pipeline: happy path\n");

test("valid pipeline passes without error", () => {
  assert.strictEqual(validatePipeline(VALID_PIPELINE), true);
});

test("pipelineTopoOrder returns correct execution sequence", () => {
  const order = pipelineTopoOrder(VALID_PIPELINE);
  assert.deepStrictEqual(order, [
    "ingest",
    "generate-brief",
    "generate-script",
    "extract-hooks",
    "generate-shot-plan",
  ]);
});

test("single-node pipeline with no dependencies passes", () => {
  const nodes: readonly PipelineNodeContract[] = [
    { id: "root", role: "source", inputs: [], outputs: ["x"], dependsOn: [] },
  ];
  assert.strictEqual(validatePipeline(nodes), true);
});

test("empty pipeline passes", () => {
  assert.strictEqual(validatePipeline([]), true);
});

test("transform node with all-external inputs passes", () => {
  // "externalId" not produced by any node in the graph → treated as external input
  const nodes: readonly PipelineNodeContract[] = [
    { id: "t", role: "transform", inputs: ["externalId"], outputs: ["result"], dependsOn: [] },
  ];
  assert.strictEqual(validatePipeline(nodes), true);
});

// ── Cycle detection ────────────────────────────────────────────────────────────

console.log("\nvalidate-pipeline: cycle detection\n");

test("two-node cycle throws PipelineCycleError", () => {
  const nodes: readonly PipelineNodeContract[] = [
    { id: "A", role: "transform", dependsOn: ["B"] },
    { id: "B", role: "transform", dependsOn: ["A"] },
  ];
  assertThrows(() => validatePipeline(nodes), PipelineCycleError);
});

test("three-node cycle throws PipelineCycleError", () => {
  const nodes: readonly PipelineNodeContract[] = [
    { id: "A", role: "transform", dependsOn: ["C"] },
    { id: "B", role: "transform", dependsOn: ["A"] },
    { id: "C", role: "transform", dependsOn: ["B"] },
  ];
  assertThrows(() => validatePipeline(nodes), PipelineCycleError);
});

// ── Unknown dependency ─────────────────────────────────────────────────────────

console.log("\nvalidate-pipeline: unknown dependency\n");

test("dependsOn referencing non-existent node throws UnknownDependencyError", () => {
  const nodes: readonly PipelineNodeContract[] = [
    { id: "A", role: "source",    dependsOn: ["ghost"] },
  ];
  assertThrows(() => validatePipeline(nodes), UnknownDependencyError, "ghost");
});

// ── Derived node grounding ─────────────────────────────────────────────────────

console.log("\nvalidate-pipeline: derived node grounding\n");

test("derived node with no dependsOn throws DerivedNodeGroundingError", () => {
  const nodes: readonly PipelineNodeContract[] = [
    { id: "orphan-hook", role: "derived", inputs: [], outputs: ["hookId"], dependsOn: [] },
  ];
  assertThrows(() => validatePipeline(nodes), DerivedNodeGroundingError, "orphan-hook");
});

test("derived node with dependsOn passes grounding check", () => {
  const nodes: readonly PipelineNodeContract[] = [
    { id: "root",  role: "source",  outputs: ["x"],    dependsOn: [] },
    { id: "child", role: "derived", inputs: ["x"], outputs: ["y"], dependsOn: ["root"] },
  ];
  assert.strictEqual(validatePipeline(nodes), true);
});

// ── Source purity ──────────────────────────────────────────────────────────────

console.log("\nvalidate-pipeline: source purity\n");

test("source node consuming pipeline-produced field throws SourcePurityError", () => {
  // "briefId" is produced by "generate-brief", so "ingest" cannot consume it
  const nodes: readonly PipelineNodeContract[] = [
    { id: "generate-brief", role: "derived",   outputs: ["briefId"], dependsOn: ["ingest"] },
    { id: "ingest",         role: "source",    inputs: ["briefId"], outputs: ["userId"], dependsOn: [] },
  ];
  assertThrows(
    () => validatePipeline(nodes),
    SourcePurityError,
    "briefId",
  );
});

test("source node with empty inputs passes purity check", () => {
  const nodes: readonly PipelineNodeContract[] = [
    { id: "src", role: "source", inputs: [], outputs: ["x"], dependsOn: [] },
  ];
  assert.strictEqual(validatePipeline(nodes), true);
});

// ── Causality direction ────────────────────────────────────────────────────────

console.log("\nvalidate-pipeline: causality direction\n");

test("THE BUG: generate-script requiring hookId throws CausalityViolationError", () => {
  // This is the exact bug that triggered this enforcement layer:
  // hookId is produced AFTER scripts, but the old route required it BEFORE.
  const nodes: readonly PipelineNodeContract[] = [
    {
      id:        "ingest",
      role:      "source",
      outputs:   ["projectId", "briefId"],
      dependsOn: [],
    },
    {
      id:        "generate-script",
      role:      "derived",
      // THE BUG: hookId consumed here, but hookId is only produced by extract-hooks (below)
      inputs:    ["briefId", "projectId", "hookId"],
      outputs:   ["scriptId"],
      dependsOn: ["ingest"],
    },
    {
      id:        "extract-hooks",
      role:      "derived",
      inputs:    ["scriptId"],
      outputs:   ["hookId"],
      dependsOn: ["generate-script"],
    },
  ];
  assertThrows(
    () => validatePipeline(nodes),
    CausalityViolationError,
    "hookId",
  );
});

test("CausalityViolationError message names both nodes and the field", () => {
  const nodes: readonly PipelineNodeContract[] = [
    { id: "A", role: "source",    outputs: ["x"],   dependsOn: [] },
    { id: "B", role: "derived",   inputs: ["y"], outputs: ["y"], dependsOn: ["A"] },
    { id: "C", role: "transform", inputs: ["x", "y"], outputs: ["z"], dependsOn: ["A"] },
    // C does NOT depend on B, but consumes B's output "y" — inverted causality
  ];
  try {
    validatePipeline(nodes);
    assert.fail("Expected CausalityViolationError");
  } catch (err) {
    assert.ok(err instanceof CausalityViolationError, `Wrong error type: ${(err as Error).constructor?.name}`);
    assert.ok(err.message.includes("C"),  `Missing consuming node: ${err.message}`);
    assert.ok(err.message.includes("B"),  `Missing producing node: ${err.message}`);
    assert.ok(err.message.includes("y"),  `Missing field name: ${err.message}`);
  }
});

test("transform node correctly ordering outputs → downstream passes", () => {
  const nodes: readonly PipelineNodeContract[] = [
    { id: "src",   role: "source",    outputs: ["id"],   dependsOn: [] },
    { id: "brief", role: "derived",   inputs: ["id"],    outputs: ["briefId"], dependsOn: ["src"] },
    { id: "use",   role: "transform", inputs: ["briefId"], outputs: ["done"], dependsOn: ["brief"] },
  ];
  assert.strictEqual(validatePipeline(nodes), true);
});

// ── Diamond DAG ────────────────────────────────────────────────────────────────

console.log("\nvalidate-pipeline: diamond DAG (two paths to same node)\n");

test("valid diamond (A → B, A → C, B + C → D) passes", () => {
  const nodes: readonly PipelineNodeContract[] = [
    { id: "A", role: "source",    outputs: ["x"],    dependsOn: [] },
    { id: "B", role: "derived",   inputs: ["x"],     outputs: ["b_out"], dependsOn: ["A"] },
    { id: "C", role: "derived",   inputs: ["x"],     outputs: ["c_out"], dependsOn: ["A"] },
    { id: "D", role: "transform", inputs: ["b_out", "c_out"], outputs: ["final"], dependsOn: ["B", "C"] },
  ];
  assert.strictEqual(validatePipeline(nodes), true);
});

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error(`\n[FAIL] ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log(`\n[PASS] All tests passed`);
  process.exit(0);
}
