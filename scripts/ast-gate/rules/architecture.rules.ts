// Import graph rules — enforce architectural layer boundaries.

export interface ImportGraphRule {
  id: string;
  description: string;
  // File pattern that triggers this rule (regex against relative path)
  filePattern: RegExp;
  // Import patterns that are FORBIDDEN in matching files
  forbiddenImportPatterns: RegExp[];
  severity: "error" | "warning";
}

export const importGraphRules: ImportGraphRule[] = [
  {
    id: "no-admin-in-client",
    description: "supabaseAdmin must never be imported in client components or pages",
    filePattern: /^(app|components)\/.+\.(tsx?|jsx?)$/,
    forbiddenImportPatterns: [
      /from\s+["'].*supabase[-/]admin/,
      /require\(["'].*supabase[-/]admin/,
    ],
    severity: "error",
  },
  {
    id: "no-server-env-in-client",
    description: "SUPABASE_SERVICE_ROLE_KEY must never be accessed in client-side files",
    filePattern: /^(app|components)\/.+\.(tsx?|jsx?)$/,
    forbiddenImportPatterns: [
      /SUPABASE_SERVICE_ROLE_KEY/,
    ],
    severity: "error",
  },
  {
    id: "no-elevenlabs-outside-api",
    description: "ElevenLabs must only be called from API routes",
    filePattern: /^(?!app\/api\/).+\.(tsx?|jsx?)$/,
    forbiddenImportPatterns: [
      /from\s+["']elevenlabs/,
      /new ElevenLabs/,
    ],
    severity: "error",
  },
  {
    id: "no-direct-fal-in-components",
    description: "@fal-ai/client must only be imported in API routes or lib providers",
    filePattern: /^(app\/(?!api)|components)\/.+\.(tsx?|jsx?)$/,
    forbiddenImportPatterns: [
      /from\s+["']@fal-ai\/client/,
    ],
    severity: "error",
  },
  {
    id: "no-packages-in-app",
    description: "Internal packages (packages/*) should not be imported directly in app/ — use lib/ adapters",
    filePattern: /^app\/.+\.(tsx?|jsx?)$/,
    forbiddenImportPatterns: [
      /from\s+["']\.\.\/\.\.\/packages\//,
      /from\s+["']\.\.\/packages\//,
    ],
    severity: "warning",
  },
  {
    id: "no-next-public-service-role",
    description: "NEXT_PUBLIC_ prefix must never appear on service role key",
    filePattern: /.+/,
    forbiddenImportPatterns: [
      /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/,
      /NEXT_PUBLIC_SERVICE_ROLE/,
    ],
    severity: "error",
  },
];
