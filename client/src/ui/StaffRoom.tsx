import { useEffect, useMemo, useState } from 'react';
import { useStore, type Agent } from '../store';
import { api } from '../api';
import { badgeRole, COMPANY_NAME, staffNumber, STAFF_SHIRTS } from '../../../shared/brand';
import { CestisLogo } from '../brand';
import { shirtName, staffShirt } from '../world/uniform';
import { cheerFor, FX_HOLD, highFive, officeJam, onCelebrate } from '../world/staffFun';
import { Panel } from './Overlays';
import { ding } from './sfx';

// The people side of the office: the staff ID card you see when you look at someone, the staff directory (B),
// high fives (V), shirt changes (C), the Employee of the Month and the confetti when work gets merged.

const STATUS: Record<string, string> = {
  idle: 'Available',
  preparing: 'Setting up',
  working: 'Working',
  done: 'Just finished',
  error: 'Needs a hand',
  interrupted: 'Paused',
};

function statusOf(a: Agent) {
  return STATUS[a.status] ?? a.status;
}

function doing(a: Agent) {
  if (a.role === 'ceo') return 'Running the company';
  if (a.task === 'qa' && a.prNumber) return `Testing PR #${a.prNumber}`;
  if (a.task === 'fix' && a.prNumber) return `Fixing PR #${a.prNumber}`;
  if (a.issueNumber) return `Issue #${a.issueNumber}${a.issueTitle ? ` · ${a.issueTitle}` : ''}`;
  return 'Ready for the next job';
}

/** The best performer: most merged PRs, then the lowest staff number for a stable pick. */
export function employeeOfTheMonth(agents: Agent[]) {
  const staff = agents.filter((a) => a.role !== 'ceo' && (a.merged ?? 0) > 0);
  staff.sort((a, b) => (b.merged ?? 0) - (a.merged ?? 0) || a.name.localeCompare(b.name));
  return staff[0] ?? null;
}

/** Swaps someone's staff shirt for the next colour in the range (or a chosen one); saved on the server for everyone. */
export function changeShirt(a: Agent, color?: string) {
  const cur = staffShirt(a);
  const i = STAFF_SHIRTS.findIndex((s) => s.color === cur);
  const next = color ?? STAFF_SHIRTS[(i + 1) % STAFF_SHIRTS.length].color;
  void api.updateAgent(a.id, { color: next }).then(() => useStore.getState().pushToast('info', `👕 ${a.name} is now in ${shirtName(next)}`));
}

export function giveHighFive(a: Agent) {
  const busy = a.status === 'working' || a.status === 'preparing';
  if (!highFive(a.id, cheerFor(busy))) {
    const floor = useStore.getState().repos.find((r) => r.id === a.repoId)?.floor;
    useStore.getState().pushToast('info', `${a.name} works on ${floor ? `floor ${floor}` : 'the ground floor'}: go and see them for a high five ✋`);
  }
}

export function StaffIdCard({ agent, star }: { agent: Agent; star?: boolean }) {
  const shirt = staffShirt(agent);
  return (
    <div className={`idcard idcard-${agent.role}`} style={{ ['--shirt' as string]: shirt }}>
      <div className="idcard-head">
        <CestisLogo width={74} />
        <span>STAFF ID</span>
      </div>
      <div className="idcard-body">
        <div className="idcard-photo" aria-hidden>
          <span style={{ background: agent.skin }} />
          {star && <b title="Employee of the Month">🏆</b>}
        </div>
        <div className="idcard-text">
          <div className="idcard-name">{agent.name}</div>
          <div className="idcard-role">{badgeRole(agent)}</div>
          <div className="idcard-meta">
            {staffNumber(agent.id)} · 👕 {shirtName(shirt)}
          </div>
          <div className="idcard-meta">
            <i className={`dot dot-${agent.status}`} /> {statusOf(agent)} · ✅ {agent.merged ?? 0} merged
          </div>
        </div>
      </div>
      <div className="idcard-doing">{doing(agent)}</div>
    </div>
  );
}

/** Shown beside the crosshair when you look at a member of staff. */
export function FocusStaffCard() {
  const focus = useStore((s) => s.focus);
  const agents = useStore((s) => s.agents);
  const overlay = useStore((s) => s.overlay);
  const id = focus?.id.startsWith('agent-') ? focus.id.slice('agent-'.length) : null;
  const agent = id ? agents[id] : undefined;
  const star = useMemo(() => employeeOfTheMonth(Object.values(agents)), [agents]);
  if (!agent || overlay) return null;
  return (
    <div className="focus-card">
      <StaffIdCard agent={agent} star={star?.id === agent.id} />
      <div className="focus-card-keys">
        <kbd>V</kbd> high five · <kbd>C</kbd> new shirt · <kbd>B</kbd> staff room
      </div>
    </div>
  );
}

/** The staff directory: everyone's ID card, shirts to pick, and the Employee of the Month. */
export function StaffRoom() {
  const agents = useStore((s) => s.agents);
  const repos = useStore((s) => s.repos);
  const goToFloor = useStore((s) => s.goToFloor);
  const list = useMemo(() => Object.values(agents), [agents]);
  const star = useMemo(() => employeeOfTheMonth(list), [list]);
  const groups = useMemo(() => {
    const out: { key: string; title: string; floor: number; people: Agent[] }[] = [];
    const lobby = list.filter((a) => !a.repoId);
    if (lobby.length) out.push({ key: 'lobby', title: 'Head office · Lobby', floor: 0, people: lobby });
    for (const r of repos) {
      const people = list.filter((a) => a.repoId === r.id).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'dev' ? -1 : 1));
      if (people.length) out.push({ key: r.id, title: `Floor ${r.floor} · ${r.fullName}`, floor: r.floor, people });
    }
    return out;
  }, [list, repos]);

  return (
    <Panel title={<>👥 Staff room · {COMPANY_NAME}</>} wide accent="#3fa7f5">
      <div className="staffroom">
        <div className="staffroom-top">
          <div className="eotm">
            <div className="eotm-title">🏆 Employee of the Month</div>
            {star ? (
              <>
                <StaffIdCard agent={star} star />
                <p className="muted small">
                  {star.name} has helped get {star.merged} pull request{star.merged === 1 ? '' : 's'} merged. Big up!
                </p>
              </>
            ) : (
              <p className="muted">Nobody yet: the first person to get a pull request merged takes the title.</p>
            )}
          </div>
          <div className="staffroom-intro">
            <p>
              Everyone hired at {COMPANY_NAME} wears a staff shirt with the company logo, in one of {STAFF_SHIRTS.length} colours, and a name badge with their role. Pick a new shirt for
              anyone below, send them a high five, or call an office jam to celebrate.
            </p>
            <div className="row wrap">
              <button className="btn" onClick={() => officeJam(useStore.getState().floor)}>
                🎉 Office jam (J)
              </button>
              <span className="muted small">
                {list.length} staff · {list.filter((a) => a.status === 'working' || a.status === 'preparing').length} working right now
              </span>
            </div>
          </div>
        </div>
        {groups.map((g) => (
          <section key={g.key} className="staffroom-floor">
            <div className="staffroom-floor-head">
              <h3>{g.title}</h3>
              <button className="btn btn-small btn-ghost" onClick={() => goToFloor(g.floor)}>
                Go there ▸
              </button>
            </div>
            <div className="staffroom-grid">
              {g.people.map((a) => (
                <div key={a.id} className="staffroom-person">
                  <StaffIdCard agent={a} star={star?.id === a.id} />
                  <div className="swatches" role="radiogroup" aria-label={`${a.name}'s shirt`}>
                    {STAFF_SHIRTS.map((s) => (
                      <button
                        key={s.color}
                        className={`swatch ${staffShirt(a) === s.color ? 'swatch-on' : ''}`}
                        style={{ background: s.color }}
                        title={s.name}
                        aria-label={s.name}
                        onClick={() => changeShirt(a, s.color)}
                      />
                    ))}
                  </div>
                  <button className="btn btn-small" onClick={() => giveHighFive(a)}>
                    ✋ High five
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}

const COLORS = ['#e72b28', '#004aad', '#ffffff', '#ffbe0b', '#06d6a0', '#f15bb5', '#3fa7f5'];

/** Confetti and a banner, whenever something is celebrated. */
export function Confetti() {
  const [party, setParty] = useState<{ id: number; reason: string } | null>(null);
  useEffect(
    () =>
      onCelebrate((reason) => {
        ding();
        setParty({ id: Date.now(), reason });
      }),
    [],
  );
  useEffect(() => {
    if (!party) return;
    const t = setTimeout(() => setParty(null), 4200 * FX_HOLD);
    return () => clearTimeout(t);
  }, [party]);
  const pieces = useMemo(
    () =>
      party
        ? Array.from({ length: 90 }, (_, i) => ({
            left: Math.random() * 100,
            delay: Math.random() * 0.8 * FX_HOLD,
            dur: (2.2 + Math.random() * 1.6) * FX_HOLD,
            color: COLORS[i % COLORS.length],
            spin: Math.random() * 720 - 360,
            drift: Math.random() * 160 - 80,
            w: 6 + Math.random() * 8,
          }))
        : [],
    [party],
  );
  if (!party) return null;
  return (
    <div className="confetti" key={party.id} aria-live="polite">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: p.w,
            height: p.w * 0.45,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            ['--spin' as string]: `${p.spin}deg`,
            ['--drift' as string]: `${p.drift}px`,
          }}
        />
      ))}
      <div className="confetti-banner" style={{ animationDuration: `${4.2 * FX_HOLD}s` }}>
        <CestisLogo width={64} />
        <span>{party.reason}</span>
      </div>
    </div>
  );
}
