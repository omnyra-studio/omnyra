export async function generateScript(
  userPrompt:  string,
  analysis:    { suggestedPhysicalActions?: string[] },
  brandMemory: string,
) {
  return {
    fullScript:        "Visual storytelling focused on observable actions.",
    visualDirections:  analysis.suggestedPhysicalActions?.join(". ") || "Focus on body language and object interaction.",
  };
}
