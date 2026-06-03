// Drift-driven mutation engine.
// This is what makes the system "self-healing."
// Inputs: Zero-Critic drift reports + failure clusters
// Outputs: mutated PromptAST with tighter constraints

import type { PromptAST, CharacterConstraints, EnvironmentConstraints } from "../ast";

export type MutationType =
  | "strengthen_constraint"
  | "add_negative_constraint"
  | "narrow_constraint"
  | "reorder_priority"
  | "reduce_ambiguity";

export interface DriftReport {
  characterScore: number;
  environmentScore: number;
  objectScore: number;
  issues: string[];
}

export interface MutationResult {
  mutatedAST: PromptAST;
  mutationType: MutationType;
  mutationDescription: string;
  expectedImprovementPct: number;
}

// ── Mutation rules ────────────────────────────────────────────────────────────

function strengthenCharacter(ast: PromptAST): PromptAST {
  if (!ast.characterConstraints) return ast;
  return {
    ...ast,
    characterConstraints: {
      ...ast.characterConstraints,
      enforcementStrength: Math.min(1.0, ast.characterConstraints.enforcementStrength + 0.15),
      forbiddenVariations: [
        ...ast.characterConstraints.forbiddenVariations,
        "clothing color change",
        "hairstyle change",
        "face feature alteration",
      ],
    },
  };
}

function addNegativeConstraints(ast: PromptAST, drift: DriftReport): PromptAST {
  const negatives: string[] = [...ast.negativeConstraints];

  if (drift.characterScore < 70) {
    negatives.push("character identity change", "multiple people", "extra characters");
  }
  if (drift.environmentScore < 70) {
    negatives.push("scene location shift", "lighting change", "background replacement");
  }
  if (drift.objectScore < 80) {
    negatives.push("missing props", "extra objects", "prop duplication");
  }

  return { ...ast, negativeConstraints: [...new Set(negatives)] };
}

function reorderPriority(ast: PromptAST): PromptAST {
  // Move critical constraints to front of priority order
  const newOrder: PromptAST["priorityOrder"] = ["characterConstraints", "environmentConstraints", "objectConstraints", "motionRules", "scene", "styleRules"];
  return { ...ast, priorityOrder: newOrder };
}

function narrowCharacterConstraints(ast: PromptAST): PromptAST {
  if (!ast.characterConstraints) return ast;
  const c = ast.characterConstraints;
  // Narrow ambiguous traits (add specificity)
  const narrowed = c.identityLock.map(trait =>
    trait.endsWith(".") ? trait : `${trait} — EXACT SAME AS PREVIOUS FRAMES.`,
  );
  return {
    ...ast,
    characterConstraints: { ...c, identityLock: narrowed },
  };
}

// ── Main mutation selector ────────────────────────────────────────────────────

export function mutatAST(ast: PromptAST, drift: DriftReport): MutationResult {
  // Select mutation strategy based on worst-performing dimension
  const worstDimension = drift.characterScore < drift.environmentScore
    ? (drift.characterScore < drift.objectScore ? "character" : "object")
    : (drift.environmentScore < drift.objectScore ? "environment" : "object");

  let mutatedAST = ast;
  let mutationType: MutationType;
  let description: string;
  let improvement: number;

  if (drift.characterScore < 50 && ast.characterConstraints) {
    mutatedAST = strengthenCharacter(addNegativeConstraints(ast, drift));
    mutatedAST = reorderPriority(mutatedAST);
    mutationType = "strengthen_constraint";
    description = `Strengthened character identity lock (score was ${drift.characterScore}). Added ${ast.negativeConstraints.length} negative constraints.`;
    improvement = 30;
  } else if (worstDimension === "character" && drift.characterScore < 75) {
    mutatedAST = narrowCharacterConstraints(addNegativeConstraints(ast, drift));
    mutationType = "narrow_constraint";
    description = `Narrowed character constraints to reduce ambiguity. Score was ${drift.characterScore}.`;
    improvement = 20;
  } else if (worstDimension === "environment" && drift.environmentScore < 75) {
    mutatedAST = addNegativeConstraints(ast, drift);
    mutationType = "add_negative_constraint";
    description = `Added environment negative constraints. Score was ${drift.environmentScore}.`;
    improvement = 15;
  } else {
    mutatedAST = reorderPriority(addNegativeConstraints(ast, drift));
    mutationType = "reorder_priority";
    description = `Reordered constraint priority for better model compliance.`;
    improvement = 10;
  }

  return {
    mutatedAST,
    mutationType,
    mutationDescription: description,
    expectedImprovementPct: improvement,
  };
}
