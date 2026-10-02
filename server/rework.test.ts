import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseParents, retestBrief, type RetestInput } from './rework.ts';

const HEAD = 'feedface00000000000000000000000000000000';
const SINCE = 'c0ffee1234567890000000000000000000000000';
const brief = (over: Partial<RetestInput> = {}) =>
  retestBrief({ round: 2, fixReason: 'qa', summary: 'The save button does nothing.', fixInstructions: 'Wire up onSave.', sinceSha: SINCE, passed: false, headSha: HEAD, base: 'main', ...over });

describe('retestBrief', () => {
  it('says nothing on a first round', () => {
    expect(brief({ round: 1 })).toBe('');
  });

  it('points a re-test after a failed round at the findings, then at what changed since', () => {
    const text = brief();
    expect(text).toContain("Last round's findings:\nThe save button does nothing.\nWire up onSave.\nCheck those first.");
    expect(text).toContain('git diff c0ffee1 HEAD');
    expect(text).toContain('git log --oneline c0ffee1..HEAD');
    expect(text).toContain('Run the test suite, linters and build again');
    expect(text).not.toContain('Re-check the whole PR.');
  });

  it('explains why a passed PR is back', () => {
    expect(brief({ fixReason: 'conflict', passed: true })).toMatch(/^QA passed it before; since then the branch was updated with main to resolve merge conflicts\./);
    expect(brief({ fixReason: 'checks', passed: true })).toMatch(/^QA passed it before; since then the developer changed the code to fix failing GitHub checks\./);
    expect(brief({ fixReason: null, passed: true })).toMatch(/^QA passed it before, and new commits arrived since\./);
  });

  it('re-checks the whole PR when it does not know what QA last saw, or nothing changed', () => {
    expect(brief({ sinceSha: null })).toMatch(/Re-check the whole PR\.$/);
    expect(brief({ sinceSha: HEAD })).toMatch(/Re-check the whole PR\.$/);
    expect(brief({ sinceSha: null })).not.toContain('git diff');
  });
});

describe('parseParents', () => {
  it('splits a rev-list --parents line', () => {
    expect(parseParents('a b c')).toEqual({ sha: 'a', parents: ['b', 'c'] });
    expect(parseParents('  a  \r')).toEqual({ sha: 'a', parents: [] });
    expect(parseParents('')).toBeNull();
  });
});

// onlyCleanMerges against a real throwaway repo (a temp folder with spaces in its path).
describe('onlyCleanMerges', async () => {
  const savedConfig = process.env.GIT_CONFIG_GLOBAL;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'office clean merges '));
  const gitConfig = path.join(root, 'gitconfig');
  await fs.writeFile(gitConfig, '[user]\n\tname = Rework Test\n\temail = rework-test@example.com\n[init]\n\tdefaultBranch = main\n');
  process.env.GIT_CONFIG_GLOBAL = gitConfig;
  const { git } = await import('./exec.ts');
  const { onlyCleanMerges } = await import('./workspace.ts');

  const dir = path.join(root, 'repo');
  const g = (...args: string[]) => git(args, { cwd: dir });
  const commitFile = async (file: string, text: string, msg = `edit ${file}`) => {
    await fs.writeFile(path.join(dir, file), text);
    await g('add', file);
    await g('commit', '-q', '-m', msg);
    return g('rev-parse', 'HEAD');
  };
  let passed = ''; // where QA signed off on the PR branch

  beforeAll(() => fs.mkdir(dir, { recursive: true }));
  afterAll(async () => {
    process.env.GIT_CONFIG_GLOBAL = savedConfig;
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  });

  beforeEach(async () => {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 });
    await fs.mkdir(dir);
    await g('init', '-q', '-b', 'main');
    await commitFile('app.txt', 'one\ntwo\nthree\n', 'start');
    await g('checkout', '-q', '-b', 'swarm/issue-1');
    passed = await commitFile('feature.txt', 'the feature\n', 'the PR');
    await g('checkout', '-q', 'main');
    await commitFile('other.txt', 'someone else merged this\n', 'other work');
    await g('checkout', '-q', 'swarm/issue-1');
  });

  const head = () => g('rev-parse', 'HEAD');

  it('passes a clean merge of main', async () => {
    await g('merge', '-q', '--no-edit', 'main');
    expect(await onlyCleanMerges(dir, passed, await head(), 'main')).toBe(true);
  });

  it('passes several clean merges of main in a row', async () => {
    await g('merge', '-q', '--no-edit', 'main');
    await g('checkout', '-q', 'main');
    await commitFile('more.txt', 'more\n');
    await g('checkout', '-q', 'swarm/issue-1');
    await g('merge', '-q', '--no-edit', 'main');
    expect(await onlyCleanMerges(dir, passed, await head(), 'main')).toBe(true);
  });

  it('fails a merge whose conflicts were resolved by hand', async () => {
    await commitFile('app.txt', 'one\nTWO (branch)\nthree\n');
    passed = await head();
    await g('checkout', '-q', 'main');
    await commitFile('app.txt', 'one\nTWO (main)\nthree\n');
    await g('checkout', '-q', 'swarm/issue-1');
    await g('merge', '-q', '--no-edit', 'main').catch(() => undefined); // conflicts
    await fs.writeFile(path.join(dir, 'app.txt'), 'one\nTWO (both)\nthree\n');
    await g('add', 'app.txt');
    await g('commit', '-q', '--no-edit');
    expect(await onlyCleanMerges(dir, passed, await head(), 'main')).toBe(false);
  });

  it('fails a merge that was changed by hand', async () => {
    await g('merge', '-q', '--no-edit', 'main');
    await fs.writeFile(path.join(dir, 'feature.txt'), 'a sneaky change\n');
    await g('add', 'feature.txt');
    await g('commit', '-q', '--amend', '--no-edit');
    expect(await onlyCleanMerges(dir, passed, await head(), 'main')).toBe(false);
  });

  it('fails new commits of the PR, before or after a merge', async () => {
    await commitFile('feature.txt', 'a fix\n');
    expect(await onlyCleanMerges(dir, passed, await head(), 'main')).toBe(false);
    await g('merge', '-q', '--no-edit', 'main');
    expect(await onlyCleanMerges(dir, passed, await head(), 'main')).toBe(false);
  });

  it('fails a merge of a branch other than main', async () => {
    await g('checkout', '-q', '-b', 'side', 'main~1');
    await commitFile('side.txt', 'not on main\n');
    await g('checkout', '-q', 'swarm/issue-1');
    await g('merge', '-q', '--no-edit', 'side');
    expect(await onlyCleanMerges(dir, passed, await head(), 'main')).toBe(false);
  });

  it('fails rewritten history and an unchanged head', async () => {
    await g('commit', '-q', '--amend', '-m', 'the PR, reworded');
    expect(await onlyCleanMerges(dir, passed, await head(), 'main')).toBe(false);
    await g('reset', '-q', '--hard', passed);
    expect(await onlyCleanMerges(dir, passed, passed, 'main')).toBe(false);
  });
});
