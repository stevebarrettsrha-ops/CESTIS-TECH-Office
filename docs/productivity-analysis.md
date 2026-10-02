# Productivity rate analysis: C.E.S.T.I.S Office 1.0.0

This analysis covers every source file extracted from `cestis-office.zip`.
"Productivity rate" here means how many GitHub issues the office turns into merged pull requests in a given time.
The report covers what controls that rate, where time is lost, and whether the office can measure it.
References are `file:line`. Anything marked *(inferred)* is reasoning rather than behaviour confirmed by a test.

## Summary

- **The code is healthy.** Typecheck passes, all 305 unit tests pass (28 files), and the production build succeeds.
- **The office can't report its own productivity rate.**
  - It records almost no history. QA records are deleted when a PR closes.
  - Cost and turn counts reset at the start of every task.
  - The "merged" counter undercounts developers.
  - The trophy count is capped at the 8 most recent PRs.
- **Most lost throughput comes from five things:**
  1. Stopped agents never rejoin the pool.
  2. Full QA re-runs after small fixes.
  3. The merge loop only advances every 45 s.
  4. Usage pacing counts QA sessions against new work.
  5. Self-update drains when the office develops itself.
- **There is no watchdog on hung agent sessions.** One stuck CLI holds a desk and a session slot indefinitely.

## 1. Codebase baseline

| Check | Result |
| --- | --- |
| `npm run typecheck` | ✅ clean |
| `npm test` (Vitest) | ✅ 28 files, 305 passed, 1 todo, about 5 s |
| `npm run build` | ✅ builds, with a warning about chunks over 2 MB |

| Area | Source lines | Test lines |
| --- | ---: | ---: |
| `server/` | 8,863 | 1,183 |
| `client/src/` | 15,278 | 1,366 |
| `shared/` | 508 | 180 |
| `scripts/` | 542 | 112 |
| `bin/`, `e2e/` | 540 | (e2e is the test) |

- **The orchestrator is the least-tested part.**
  - `server/swarm.ts` (3,185 lines) holds the scheduling, QA, fix and merge loop, and has no unit test file.
  - `agentRunner.ts`, `cliRunner.ts`, `github.ts`, `previews.ts`, `previewRunner.ts` and `ptyClient.ts` also have none.
  - The pure decisions (`pacing.ts`, `mergeGate.ts`, `issues.ts`) are well tested.
- **About 36% of client code is games and toys.**
  - That is 2,576 lines in `ui/games/`, 2,970 in `world/toys/` and about 480 in staff features.
  - The physics engine (Rapier, 2.2 MB) is loaded lazily, which is good.
  - The main bundle is still 1.9 MB (536 KB gzipped).

## 2. How work flows (and the clocks that control it)

| Clock | Value | Where |
| --- | --- | --- |
| GitHub sync per floor (also the **only** place merges advance) | 45 s | `server/config.ts:17`, `swarm.ts:1176` |
| Scheduler tick | 8 s | `config.ts:19` |
| Error cooldown after a failed session | 2 min | `swarm.ts:242` |
| Retry after GitHub refuses a merge | 10 min | `swarm.ts:1057` |
| QA rounds before `needs-human` | 3 | `swarm.ts:215` |
| QA desks per floor / dev desks per floor | 3 / 12 | `swarm.ts:214` |
| Pacing cap after a usage warning | 3 sessions (default) | `pacing.ts:23` |
| Office self-update drain | up to 20 min | `officeUpdate.ts:16` |
| Session timeout / inactivity watchdog | **none** | `cliRunner.ts:715` (only logs at 60 s) |

The flow runs: backlog → auto-assign (if the floor has it on) → prepare desk (under a per-repo git lock) → develop → PR
→ QA queue → QA session → pass, or fix and re-QA (up to 3 rounds) → merge gate (QA'd SHA, green checks, up-to-date
branch) → merged.
Each scheduler pass runs pipeline work (QA, fixes) before it starts new issues (`swarm.ts:2363-2387`).

## 3. Bottlenecks, ranked by likely impact on throughput

1. **Stopped agents drop out for good, and keep their issue.**
   - Causes: a manager Stop, Esc in the terminal, or a restart while slots are full.
   - The agent ends up `stopped`. Only `idle` and `done` count as free (`swarm.ts:240`).
   - `issueTaken` still treats a `stopped` developer as holding the issue (`swarm.ts:1441`).
   - Each stop removes one worker and one issue from circulation until the manager steps in.
   - *Fix:* after a cooldown like the error one, return `stopped` agents to the pool and release their issue.
2. **Small fixes trigger a full QA round.**
   - A conflict or checks fix sets the PR back to `passed` without updating `passedSha` (`swarm.ts:2110-2114`).
   - The merge gate sees a new head and requeues a whole QA round (`mergeGate.ts:42`).
   - The QA prompt says to re-check everything.
   - Ordinary QA failures also get a complete fresh QA pass.
   - *Fix:* re-test only the change (`git diff passedSha..head`). For a clean merge from main with green CI, skip the re-test.
3. **The merge loop moves one step per 45 s sync.**
   - Fetching details, updating the branch, waiting for checks and merging each wait for the next sync.
   - A sync that is already running drops further calls (`swarm.ts:1159`).
   - When several PRs pass at once, they merge one after another at that pace.
   - *Fix:* poll every 10–15 s while PRs are waiting to merge, or hand off to GitHub's native auto-merge or merge queue.
4. **Pacing chokes new issues once QA is busy.**
   - After a usage warning, new issues may start only while fewer than `pacingSessions` agents are busy (`pacing.ts:23`).
   - The busy count includes QA, fixes and the CEO (`swarm.ts:808`), so three QA sessions mean zero new issues.
   - A 90% warning on the 7-day limit can hold the office there until that window resets *(inferred: possibly days)*.
   - *Fix:* count only issue sessions toward the cap, and scale the cap to the remaining budget and time left in the window.
5. **The office freezes while it updates itself.**
   - If the office's own repo is one of its floors, every merge marks it as behind (`swarm.ts:1093-1096`).
   - With auto-update on (the default), nothing new starts for up to 20 minutes, then sessions are stopped.
   - After the restart, QA starts over from scratch.
   - *Fix:* batch updates (minimum interval, or only when idle), or turn off auto-update for that floor.
6. **Hung sessions are never reclaimed.**
   - A CLI stuck on a setup or permission screen, or one running a dev server in the foreground, holds its desk and slot forever.
   - *Fix:* if no hook event arrives for N minutes, nudge the agent, then stop and requeue the work.
7. **Fixes usually go to someone without context.**
   - Authors take new issues straight away, so QA failures tend to go to another developer.
   - That developer starts a fresh session with no context (`swarm.ts:2265-2271`) *(inferred)*.
   - *Fix:* hold a fix for its author for a short window, or let authors take fixes before new issues.
8. **Desk preparation is serialized.**
   - Every `prepareDesk` runs `git fetch` under the per-repo lock (`workspace.ts:255-262`).
   - At startup, or when a pause ends, N agents fetch one after another.
   - On Windows, each session also runs two PowerShell process scans.
   - *Fix:* skip a fetch if one ran in the last ~30 s, or fetch outside the lock.
9. **Evidence uploads delay the QA verdict.**
   - Up to 8 screenshots are committed one after another before the QA status changes (`swarm.ts:2005-2016`).
   - *Fix:* apply the verdict first, then upload in parallel or in the background.
10. **Smaller leaks**
    - An issue that produces no PR is released without counting as a failure, so an unclear issue can loop forever (`swarm.ts:1785-1789`).
    - Only 100 open issues are fetched (`github.ts:44`), so a dependency outside that window looks closed.
    - Every session resolves `npx -y @playwright/mcp@latest` again.

## 4. Can the office measure its productivity rate today? Mostly no

| What it shows | Problem |
| --- | --- |
| "✅ N merged" on ID cards and **Employee of the Month** | **Undercounts developers.** Credit needs the developer's current `prNumber` to match when the merge is seen (`swarm.ts:1186-1196`), but taking a new issue clears it (`swarm.ts:1618`). QA testers are credited reliably (`swarm.ts:1204`), so the award leans towards QA. The count never resets despite "of the Month", and ties break by name. |
| Lobby trophy "N PRs merged" and the Merged column on the Kanban board | **Capped at 8.** Only the 8 most recent merged PRs are fetched (`github.ts:112`). Demo mode returns every PR, so the demo hides the cap. |
| HUD "in QA / ready to merge" | Real sync never fetches PRs that were closed without merging. Their QA records stay forever and inflate both counts *(inferred)*. The phone counts differently, so the views disagree. |
| Cost (≈$) and turns | Reset at every task start (`swarm.ts:1575-1579`). Shown only inside one agent's terminal. Codex and OpenCode probably report $0 *(inferred)*. |
| Usage / pacing state | In the client store but **no component shows it**. It is also not saved, so a restart loses it. |

**Not recorded at all:** issue→merge cycle time, QA queue wait, QA pass rate, number of fix rounds, merge-gate wait,
agent idle and busy time, cost per merged PR, and time lost to pacing, pauses and drains.

**Cheapest way to add these:**
- Add an append-only event log to `state.json`, or a JSONL file under `SWARM_HOME`.
- Log these events: assigned, PR opened, QA started, QA verdict, fix started, fix ended, passed, merged. Also log agent busy and idle changes.
- Write a history entry at the point where merges are credited (`swarm.ts:1196-1206`). Copy `round`, `retests` and `mergeFixes` from the QA record before it is deleted.
- Credit the developer from `QaRecord.devAgentId`. This fixes the undercount and the 8-PR cap.
- Expose a `metrics` view through the snapshot plus one `ServerEvent`, and handle it in `store.apply`.
- Throughput per day, cycle time, QA bounce rate and cost per merged PR then become simple queries.

## 5. Cost and machine load

- **Every worker runs Opus 5.5 by default** (`swarm.ts:217`), and the CEO always does (`swarm.ts:220`).
  - So all agents share one weekly Opus limit, which makes pacing more likely.
  - The model picker offers Fable 5.1 (about 2.5× the cost of Opus 5.5) without a warning.
  - It doesn't list the current Sonnet (`claude-sonnet-5-5`).
  - A cheaper model for QA is the obvious lever, but the office has no pass-rate data to judge the trade-off.
- **The 3D view redraws all the time** (`frameloop='always'`, `Game.tsx:46`).
  - Soft shadows and DPR up to 1.75 add to the cost.
  - It does pause for the Kanban, terminal and manager panels.
  - It doesn't pause for the staff room, app viewer or phone.
  - An on-demand or throttled frame loop would be the biggest saving.
- **Desk monitors re-upload large textures every 200 ms** for working agents within 8 m (`Desk.tsx:68-90`).
- **State is rewritten often.** The whole of `state.json`, including 200 log lines per agent, is rewritten roughly every 1.5 s while agents are active (`swarm.ts:766-790`).

## 6. Recommended order of work

1. ✅ **Measure first:** add the event log and metrics view from §4, and fix the developer credit and the 8-PR cap. *Done: `server/metrics.ts`, the phone's "This week" section, and merge credit from the QA record.*
2. ✅ **Recover lost capacity:** return `stopped` agents to the pool (§3.1) and add a session watchdog (§3.6). *Done: `server/stopped.ts` and `server/watchdog.ts`.*
3. ✅ **Cut rework:** scope re-tests to the change, and skip QA for clean main merges with green CI (§3.2). *Done: `server/rework.ts` and `onlyCleanMerges` in `server/workspace.ts`.*
4. **Speed up merging:** use a faster merge loop while PRs are waiting, or GitHub auto-merge (§3.3).
5. **Pace smarter:** count only issue sessions toward the cap (§3.4), and batch self-updates (§3.5).
6. **Machine load:** use an on-demand frame loop, and save state less often.

Steps 1–2 are small, contained changes. Run each against the demo office (`--demo`, isolated `SWARM_HOME`) to compare
before and after: once step 1 exists, the demo can produce throughput figures for every later change.
