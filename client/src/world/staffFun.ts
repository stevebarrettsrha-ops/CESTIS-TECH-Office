// Little social moments between the manager and the staff: high fives, shout-outs and office-wide celebrations.
// A tiny event bus, so the HUD, the player's keys and the 3D characters can all join in without the store.

type Listener = (text: string) => void;

const highFives = new Map<string, Set<Listener>>();
const party = new Set<(reason: string) => void>();

/** ?holdfx slows these moments right down, so a slow screenshot tool can still catch them. */
export const FX_HOLD = typeof location !== 'undefined' && location.search.includes('holdfx') ? 25 : 1;
export const HIGH_FIVE_MS = 1800 * FX_HOLD;

const CHEERS = ['Yeah!', 'Big up!', 'Respect!', 'Irie!', 'Wicked!', 'Up top!', 'Nice one!', 'Bless!', 'Boom!', 'Yes boss!'];
const BUSY_CHEERS = ['Quick one!', 'Still coding!', 'On it!', 'Nearly done!'];

/** Picks what someone says back. Busy people keep it short. */
export function cheerFor(busy: boolean, r = Math.random()) {
  const pool = busy ? BUSY_CHEERS : CHEERS;
  return pool[Math.floor(r * pool.length) % pool.length];
}

export function onHighFive(agentId: string, fn: Listener) {
  let set = highFives.get(agentId);
  if (!set) highFives.set(agentId, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

/** Gives someone a high five; returns false when nobody by that id is in the building. */
export function highFive(agentId: string, text: string) {
  const set = highFives.get(agentId);
  if (!set?.size) return false;
  set.forEach((fn) => fn(text));
  return true;
}

export function onCelebrate(fn: (reason: string) => void) {
  party.add(fn);
  return () => {
    party.delete(fn);
  };
}

/** J: confetti, and everyone on this floor (or in the lobby) jumps up and cheers. */
export function officeJam(floor: number) {
  celebrate(floor === 0 ? 'Office jam in the lobby! 🎶' : `Office jam on floor ${floor}! 🎶`);
  highFives.forEach((set) => set.forEach((fn) => fn(cheerFor(false))));
}

/** Confetti for everyone: a merged PR, a new hire, or just because. */
export function celebrate(reason: string) {
  party.forEach((fn) => fn(reason));
}
