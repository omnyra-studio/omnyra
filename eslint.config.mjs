import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// ── Architecture Import Boundary Enforcement ───────────────────────────────────
// Forbidden import patterns — mirrors architecture/allowed-pipelines.json.
// Any import matching these paths fails the build at lint time,
// before CI architecture-gate scan runs.
const FORBIDDEN_IMPORT_PATTERNS = [
  "**/synclabs/**",
  "**/sync-lipsync/**",
  "**/legacy-avatar/**",
  "**/legacyAvatarPipeline/**",
];

const eslintConfig = defineConfig([
  ...nextVitals,

  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ── Import boundary rule ─────────────────────────────────────────────────────
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: FORBIDDEN_IMPORT_PATTERNS,
          paths: [
            {
              name: "lib/providers",
              importNames: ["callSyncLabs", "pollSyncLabs"],
              message:
                "[ARCHITECTURE VIOLATION] SyncLabs is decommissioned. " +
                "Use lib/guards/legacy-pipeline-guard.ts for enforcement, " +
                "or lib/providers/hedra.ts for avatar generation.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
