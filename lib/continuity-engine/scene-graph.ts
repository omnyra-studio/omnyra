/**
 * Scene Graph Compiler — turns a linear scene list into a directed graph.
 *
 * Supports: branching, retries, alternate takes, recovery paths.
 * Every SceneNode is immutable after creation (only status is mutable by the engine).
 */

export type SceneNodeStatus = "pending" | "rendering" | "complete" | "failed";

export type SceneNode = {
  readonly id:              string;
  readonly index:           number;
  readonly snapshotVersion: number;
  readonly dependsOn:       readonly string[];
  alternateVersions:        string[];   // mutable — retries appended here
  status:                   SceneNodeStatus;
  driftScore:               number;
  readonly metadata: {
    emotion:      string;
    tension:      number;
    cameraLocked: boolean;
    narrativeRole: "hook" | "development" | "climax" | "resolution";
  };
};

export type GraphRenderOrder = Array<{
  nodeId:     string;
  sceneIndex: number;
  canParallel: boolean;
}>;

export class SceneGraphCompiler {
  private readonly nodes = new Map<string, SceneNode>();

  createNode(params: {
    sceneIndex:      number;
    snapshotVersion: number;
    emotion:         string;
    tension:         number;
    narrativeRole:   SceneNode["metadata"]["narrativeRole"];
    dependsOn?:      string[];
  }): SceneNode {
    const node: SceneNode = {
      id:               crypto.randomUUID(),
      index:            params.sceneIndex,
      snapshotVersion:  params.snapshotVersion,
      dependsOn:        Object.freeze(params.dependsOn ?? []),
      alternateVersions: [],
      status:           "pending",
      driftScore:       0,
      metadata: Object.freeze({
        emotion:      params.emotion,
        tension:      params.tension,
        cameraLocked: true,
        narrativeRole: params.narrativeRole,
      }),
    };

    this.nodes.set(node.id, node);
    return node;
  }

  linkAlternate(parentId: string, newNodeId: string): void {
    const parent = this.nodes.get(parentId);
    if (!parent) throw new Error(`SceneGraph: parent node ${parentId} not found`);
    parent.alternateVersions.push(newNodeId);
  }

  setStatus(nodeId: string, status: SceneNodeStatus, driftScore?: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`SceneGraph: node ${nodeId} not found`);
    node.status = status;
    if (driftScore !== undefined) node.driftScore = driftScore;
  }

  /** Return best-take node for a given scene index (lowest drift among completes). */
  bestTake(sceneIndex: number): SceneNode | undefined {
    const candidates = [...this.nodes.values()].filter(
      n => n.index === sceneIndex && n.status === "complete",
    );
    return candidates.sort((a, b) => a.driftScore - b.driftScore)[0];
  }

  /** Topological render order — sequential for now (no actual parallelism without BullMQ). */
  renderOrder(): GraphRenderOrder {
    return [...this.nodes.values()]
      .sort((a, b) => a.index - b.index)
      .map(n => ({
        nodeId:      n.id,
        sceneIndex:  n.index,
        canParallel: n.dependsOn.length === 0,
      }));
  }

  toJSON() {
    return Object.fromEntries(this.nodes);
  }
}
