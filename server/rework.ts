// Cutting rework: a PR that comes back to QA (after fixes, or new commits after QA passed it) is re-tested on what
// changed since QA last gave a verdict, plus a full run of its tests and build, rather than re-checked from scratch.
// Commits that are only clean merges of the default branch skip QA altogether (workspace.ts onlyCleanMerges).

export interface RetestInput {
  round: number;
  fixReason: 'qa' | 'checks' | 'conflict' | null;
  summary: string | null; // last round's findings
  fixInstructions: string | null;
  /** The head QA last gave a verdict on (null: unknown, so the whole PR is re-checked). */
  sinceSha: string | null;
  /** QA passed it at sinceSha (rather than failing it). */
  passed: boolean;
  headSha: string;
  base: string; // the default branch
}

/** The part of the QA prompt that says what this round is about ('' on a first round). */
export function retestBrief(r: RetestInput): string {
  if (r.round <= 1) return '';
  const since = r.sinceSha && r.sinceSha !== r.headSha ? r.sinceSha.slice(0, 7) : null;
  const intro =
    r.fixReason === 'conflict'
      ? `QA passed it before; since then the branch was updated with ${r.base} to resolve merge conflicts.`
      : r.fixReason === 'checks'
        ? 'QA passed it before; since then the developer changed the code to fix failing GitHub checks.'
        : r.passed
          ? 'QA passed it before, and new commits arrived since.'
          : r.summary
            ? `This is a re-test after fixes. Last round's findings:\n${r.summary}\n${r.fixInstructions ?? ''}\nCheck those first.`
            : 'This is a re-test.';
  if (!since) return `${intro}\nRe-check the whole PR.`;
  return [
    intro,
    `Then focus on what changed since ${since}: git log --oneline ${since}..HEAD and git diff ${since} HEAD. Changes that came in from ${r.base} were reviewed there; check where they meet this PR.`,
    `Run the test suite, linters and build again, and re-test the rest of the PR only where the new changes touch it. If git can't find ${since}, re-check the whole PR.`,
  ].join('\n');
}

/** One line of `git rev-list --parents`: a commit and its parents. */
export function parseParents(line: string): { sha: string; parents: string[] } | null {
  const [sha, ...parents] = line.trim().split(/\s+/).filter(Boolean);
  return sha ? { sha, parents } : null;
}
