export type SchemaArtifact = {
  readonly version:     string;
  readonly generatedAt: string;
  readonly tables: Record<string, {
    readonly columns: string[];
  }>;
};

export type NodeTrace = {
  readonly nodeId:      string;
  readonly input:       unknown;
  readonly output:      unknown;
  readonly hash:        string;
  readonly executedAt:  string;
};

export type ExecutionArtifact = {
  readonly graphHash:     string;
  readonly schemaVersion: string;
  readonly inputs:        unknown;
  readonly outputs:       unknown;
  readonly nodeTrace:     NodeTrace[];
  readonly createdAt:     string;
};
