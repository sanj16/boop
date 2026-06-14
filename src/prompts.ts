import { FileContext } from './context';
import { ChangeContext } from './changes';

export const BRIEF_SYSTEM_PROMPT = `You are boop, a concise code context assistant embedded in a developer's editor. You produce short, scannable file briefs that help new developers understand code instantly.

Rules:
- Be extremely concise. Every line should earn its place.
- Use the ## headers exactly as shown in the format.
- Keep "Purpose" to ONE sentence. No filler like "This file..." — start with a verb.
- "Watch out" section: real warnings based on coupling, history, and complexity. Be specific.
- Write like terse release notes, not documentation.
- If a file has caused issues (outages, many PRs, high coupling), call it out clearly.
- You MUST include ALL four sections: Purpose, Architecture position, Recent changes, Watch out.`;

export function buildBriefPrompt(ctx: FileContext): string {
  const dependentsList = ctx.dependents.length > 0
    ? ctx.dependents.map((d) => `${d.file} (${d.count} refs)`).join(', ')
    : 'none detected';

  const hotLabel = ctx.hotFile.level === 'hot' ? '🔴 Hot'
    : ctx.hotFile.level === 'active' ? '🟡 Active'
    : '🟢 Stable';

  const hotDetail = `${hotLabel} — ${ctx.hotFile.commits2Weeks} commits in 2 weeks, ${ctx.hotFile.uniqueAuthors} authors`;

  const ownersList = ctx.owners.length > 0
    ? ctx.owners.map((o) => `${o.name} (${o.commits} commits)`).join(', ')
    : 'unknown';

  const entrypointInfo = ctx.entrypoint
    ? `Entry point: ${ctx.entrypoint.mainFile}\nRun commands: ${ctx.entrypoint.commands.map(c => `${c.label}: ${c.command}`).join(', ')}`
    : 'Entry point: not detected';

  return `Generate a brief for this file.

File: ${ctx.fileName}
Language: ${ctx.language}

Content (first 200 lines):
\`\`\`
${ctx.fileContent}
\`\`\`

Dependencies (from graph): ${ctx.dependencies.length > 0 ? ctx.dependencies.join(', ') : 'none'}
Dependents (from graph): ${dependentsList}
Total call sites across repo: ${ctx.totalCallSites}
Symbols in file: ${ctx.symbols.join(', ') || 'none indexed'}

Recent git history:
${ctx.gitLog || 'No git history available'}

Last edit: ${ctx.gitBlame || 'unknown'}
File stability: ${hotDetail}
Experts: ${ownersList}
${entrypointInfo}

Respond in EXACTLY this format (include ALL sections, no extras):

## Purpose
<one sentence starting with a verb>

## Architecture position
Depends on: <file names or "nothing">
Used by: <file names with ref counts, or "nothing detected">

## Recent changes
<up to 3 lines, each: relative time + short description>

## Watch out
<1-3 bullet points starting with ⚠ — real warnings about coupling, past incidents, complexity, or gotchas. Be specific and actionable.>`;
}

export const CHANGES_SYSTEM_PROMPT = `You are boop, a concise code impact analyst. You assess uncommitted changes and tell the developer what their change MEANS — not what it IS (they can see the diff).

Rules:
- Never repeat the diff lines back. The developer already sees them.
- Focus on IMPACT: what files/systems are affected, will anything break?
- Start verdict with [GOOD], [WARN], or [NOTE].
- [GOOD] = safe, consistent with codebase patterns
- [WARN] = potential issue, conflicts, or risky coupling
- [NOTE] = neutral, but worth knowing
- Be specific: name files, line numbers, functions that could be affected.
- 2-3 sentences max for the verdict.`;

export function buildChangesPrompt(ctx: ChangeContext): string {
  const impactList = ctx.impactedFiles.length > 0
    ? ctx.impactedFiles.map((f) => `${f.file} (${f.count} refs)`).join(', ')
    : 'none detected';

  return `Assess the impact of these uncommitted changes.

File: ${ctx.fileName}
Total call sites in repo: ${ctx.totalCallSites}

Files that depend on this (from graph): ${impactList}

File content for context (first 200 lines):
\`\`\`
${ctx.fileContent}
\`\`\`

Git diff:
\`\`\`diff
${ctx.diff}
\`\`\`

Respond in EXACTLY this format:

## Impact
Affects: <list of files that may be impacted, with reasoning>

## Verdict
<[GOOD], [WARN], or [NOTE] followed by 1-3 sentences explaining why>`;
}
