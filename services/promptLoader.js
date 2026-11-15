import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.resolve(__dirname, '..', 'prompts');

// Cache to prevent repetitive disk I/O on hot paths
let cachedPromptBundle = null;

function safeReadFile(relPath) {
  try {
    const fullPath = path.join(PROMPTS_DIR, relPath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf-8').trim();
    }
  } catch (err) {
    console.warn(`[promptLoader] Failed to read prompt at ${relPath}:`, err.message);
  }
  return '';
}

/**
 * Loads and combines all modular prompt files from disk.
 */
export function loadModularPrompts(forceReload = false) {
  if (cachedPromptBundle && !forceReload) {
    return cachedPromptBundle;
  }

  const master = safeReadFile('master.md');
  const staffArchitect = safeReadFile('personas/staff_architect.md');
  const operationalDispatcher = safeReadFile('personas/operational_dispatcher.md');

  // Guardrails (Negative constraints)
  const dataGuardrail = safeReadFile('guardrails/data_presentation.md');
  const securityGuardrail = safeReadFile('guardrails/security_rbac.md');
  const ballotGuardrail = safeReadFile('guardrails/ballot_confidentiality.md');
  const hallucinationGuardrail = safeReadFile('guardrails/anti_hallucination.md');

  // Templates
  const briefTemplate = safeReadFile('templates/executive_brief.md');
  const actionTemplate = safeReadFile('templates/action_intent.md');
  const standupTemplate = safeReadFile('templates/standup_format.md');

  cachedPromptBundle = {
    master,
    personas: [staffArchitect, operationalDispatcher].filter(Boolean).join('\n\n'),
    guardrails: [dataGuardrail, securityGuardrail, ballotGuardrail, hallucinationGuardrail].filter(Boolean).join('\n\n---\n\n'),
    templates: [briefTemplate, actionTemplate, standupTemplate].filter(Boolean).join('\n\n---\n\n')
  };

  return cachedPromptBundle;
}

/**
 * Assembles the full master system prompt with injected context and user session metadata.
 */
export function buildSystemPrompt({ currentUser, workspaceContext }) {
  const bundle = loadModularPrompts();

  const userContextNotice = `### ACTIVE SESSION SECURITY CONTEXT
Current User: ${currentUser.name} (@${currentUser.handle})
Role: ${currentUser.role} | Track: ${currentUser.team_track || 'General'}
Host / Admin Privileges: ${currentUser.is_host ? 'AUTHORIZED (Lead/Host)' : 'UNAUTHORIZED (Standard Member)'}`;

  return `${bundle.master}

${bundle.personas}

========================================
CURRENT WORKSPACE STATE & LIVE CONTEXT
========================================
${userContextNotice}

${workspaceContext}

========================================
NEGATIVE GUARDRAILS (DOMINANT REJECTIONS)
========================================
${bundle.guardrails}

========================================
ACTION & OUTPUT TEMPLATES
========================================
${bundle.templates}
`;
}
