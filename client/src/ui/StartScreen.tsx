import { usePhoneBadge, useStore } from '../store';
import { requestLook } from '../world/Player';
import { CEO_ID } from '../../../shared/types';
import { SetupWizard } from './SetupWizard';
import { unlockAudio } from './sfx';
import { CestisLogo } from '../brand';
import { COMPANY_NAME } from '../../../shared/brand';

export function StartScreen() {
  const started = useStore((s) => s.started);
  const loaded = useStore((s) => s.loaded);
  const connected = useStore((s) => s.connected);
  const demo = useStore((s) => s.demo);
  const repos = useStore((s) => s.repos);
  const agents = useStore((s) => s.agents);
  const settings = useStore((s) => s.settings);
  const start = useStore((s) => s.start);
  const waiting = usePhoneBadge();
  if (started) return null;
  if (loaded && !settings.setupDone) return <SetupWizard />;

  const enter = () => {
    start();
    unlockAudio();
    requestLook();
  };
  const ceo = agents[CEO_ID];
  const staff = Object.values(agents).filter((a) => a.role !== 'ceo').length;

  return (
    <div className="start">
      <div className="start-card">
        <div className="start-brand">
          <CestisLogo width={220} />
        </div>
        <h1 className="start-company">{settings.companyName || COMPANY_NAME}</h1>
        <p className="start-tag">{settings.managerName ? `Welcome back, ${settings.managerName}.` : 'A cartoon office where a team of AI coding agents works through your GitHub issues.'}</p>
        <ul className="start-list">
          <li>
            🏢 {repos.length} project{repos.length === 1 ? '' : 's'}, {staff} {staff === 1 ? 'person' : 'people'} on staff{ceo ? `, and ${ceo.name} in the corner office` : ''}.
          </li>
          <li>👕 Everyone on staff wears the company shirt and a name badge. <kbd>B</kbd> opens the staff room, <kbd>V</kbd> high-fives whoever you're looking at.</li>
          <li>{waiting ? `📱 ${waiting} thing${waiting === 1 ? '' : 's'} waiting on your phone. Press P once you're in.` : '📱 Press P anywhere for your phone.'}</li>
          <li>
            💻 Walk up behind anyone to watch their screen, or press <kbd>E</kbd> (or click) on things to use them. <kbd>H</kbd> for help.
          </li>
        </ul>
        <button className="btn btn-big" onClick={enter} disabled={!loaded}>
          {loaded ? 'Enter the office' : connected ? 'Loading…' : 'Connecting to the swarm server…'}
        </button>
        <div className="start-meta">{demo && <span className="pill pill-demo">DEMO MODE: fake repos, fake agents</span>}</div>
      </div>
    </div>
  );
}
