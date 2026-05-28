/**
 * Node I/O contract enforcement.
 *
 * Call validateNodeOutput() after every node execution to ensure the output
 * shape matches the declared contract. A missing field is caught immediately
 * at the producing node — not silently propagated as undefined to downstream
 * consumers where the root cause would be invisible.
 *
 * Usage:
 *   const output = await node.execute(input);
 *   validateNodeOutput(node.id, output, node.outputs ?? {});
 */

export class NodeContractError extends Error {
  constructor(
    public readonly nodeId: string,
    public readonly reason: string,
  ) {
    super(`[NODE CONTRACT BREAK] "${nodeId}": ${reason}`);
    this.name = "NodeContractError";
  }
}

/**
 * Validates that `output` contains every key declared in `outputSchema`.
 * Throws NodeContractError on the first missing field.
 */
export function validateNodeOutput(
  nodeId:       string,
  output:       unknown,
  outputSchema: Record<string, string>,
): void {
  if (output == null) {
    throw new NodeContractError(nodeId, "returned null/undefined output");
  }

  if (typeof output !== "object" || Array.isArray(output)) {
    throw new NodeContractError(nodeId, `output must be a plain object, got ${Array.isArray(output) ? "array" : typeof output}`);
  }

  const out = output as Record<string, unknown>;
  for (const key of Object.keys(outputSchema)) {
    if (!(key in out)) {
      throw new NodeContractError(nodeId, `missing required output field "${key}" (expected type: ${outputSchema[key]})`);
    }
  }
}

/**
 * Validates that `input` contains every key declared in `inputSchema`.
 * Call before execute() to catch missing inputs at the consumer boundary.
 */
export function validateNodeInput(
  nodeId:      string,
  input:       unknown,
  inputSchema: Record<string, string>,
): void {
  if (input == null) {
    throw new NodeContractError(nodeId, "received null/undefined input");
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    throw new NodeContractError(nodeId, `input must be a plain object, got ${typeof input}`);
  }

  const inp = input as Record<string, unknown>;
  for (const key of Object.keys(inputSchema)) {
    if (!(key in inp)) {
      throw new NodeContractError(nodeId, `missing required input field "${key}" (expected type: ${inputSchema[key]})`);
    }
  }
}
