// Spectators: pets that nobody is playing, standing round a map and watching the round. They idle, fidget,
// turn to follow the action, cheer when something good happens and flinch when something goes off. A world
// with someone in it who cares what happens is a world that is alive.
//
// They must never be taken for players: they stand OFF the floor (on a ledge, a balloon, a bench, a
// speaker), they are smaller than a player's pet, their outline is white with no seat colour, and they have
// no ring and no name. A map places them where its scenery has somewhere to stand.
import { Group, MathUtils } from 'three';
import { PET_IDS, type PetClip, type PetId } from '../../../shared/pets';
import { colors } from '../../../shared/tokens';
import { createPet, INK_LINE, OUTLINE, type PetInstance } from '../../render/assets';

/** Where one spectator stands: its feet, which way it faces when nothing is going on (radians, 0 is toward the camera), and its size if not the usual. */
export type Spot = { x: number; y?: number; z: number; turn?: number; scale?: number };

/** A spectator's size beside a player's pet (which is 0.72 of the model). */
const SIZE = 0.5;
const CROSSFADE = 0.18;
/** Seconds between one fidget and the next, for each spectator on its own clock. */
const FIDGET = { least: 2.5, most: 7 };
const backOut = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

type Member = {
  pet: PetInstance;
  /** Moved and turned by code; the model inside it plays its clips. */
  holder: Group;
  spot: Spot;
  size: number;
  clip: PetClip;
  /** Seconds left of whatever it is doing instead of idling. */
  busy: number;
  fidgetIn: number;
  /** A hop in progress, 1 to 0, and how high it goes. */
  hop: number;
  lift: number;
  /** Which way it is facing. */
  facing: number;
  /** What it is about to do, once its own small delay has run out: a crowd never moves as one. */
  next: { clip: PetClip; seconds: number; lift: number; wait: number } | null;
  age: number;
};

export class Crowd {
  readonly group = new Group();
  private readonly members: Member[] = [];
  /** What the crowd is watching, if anything. */
  private watching: { x: number; z: number } | null = null;

  /**
   * `seed` picks which pets come: the same number brings the same crowd, so a map looks the same each time.
   * `leave` lists pets not to bring (the ones being played, if the map knows them).
   */
  constructor(spots: readonly Spot[], options: { seed?: number; leave?: readonly string[] } = {}) {
    const pool = PET_IDS.filter(id => !options.leave?.includes(id));
    let state = (options.seed ?? 1) * 2654435761;
    const next = () => {
      state = (Math.imul(state ^ (state >>> 15), 2246822507) + 0x9e3779b9) | 0;
      return (state >>> 0) / 4294967296;
    };
    const order = [...pool].sort(() => next() - 0.5);
    spots.forEach((spot, index) => {
      const id: PetId = order[index % order.length]!;
      const pet = createPet(id, colors.white);
      const size = SIZE * (spot.scale ?? 1);
      pet.model.scale.setScalar(size);
      // An outline is as thick as the model is big: thinned, so a small pet is not all edge.
      pet.outline.uniforms.thickness!.value = OUTLINE * 0.8;
      pet.ink.uniforms.thickness!.value = (OUTLINE + INK_LINE) * 0.8;
      const holder = new Group();
      holder.add(pet.model);
      holder.position.set(spot.x, spot.y ?? 0, spot.z);
      holder.rotation.y = spot.turn ?? 0;
      holder.scale.setScalar(0.001);
      this.group.add(holder);
      const action = pet.actions.get('idle');
      // Each starts somewhere else in the clip, or they breathe in step like a choir.
      if (action) {
        action.play();
        action.time = next() * action.getClip().duration;
      }
      this.members.push({ pet, holder, spot, size, clip: 'idle', busy: 0, fidgetIn: FIDGET.least + next() * FIDGET.most, hop: 0, lift: 0, facing: spot.turn ?? 0, next: null, age: -0.25 - index * 0.06 });
    });
  }

  /** Something to celebrate: they dance and hop for that long, each starting a moment after its neighbour. */
  cheer(seconds = 2.2): void {
    for (const member of this.members) this.act(member, 'dance', seconds, 0.3);
  }

  /** Something went off, or someone went out: a start, and a shake of the head. */
  gasp(): void {
    for (const member of this.members) this.act(member, 'gesture-negative', 0.9, 0.45);
  }

  /** A good move, smaller than a win: a nod or a clap from each, and no more. */
  clap(): void {
    for (const member of this.members) this.act(member, 'gesture-positive', 1.1, 0.12);
  }

  /** What to look at from now on (the leader, the bomb, the cat), or null to face the front again. */
  watch(target: { x: number; z: number } | null): void {
    this.watching = target;
  }

  /** Once a frame. */
  update(dt: number): void {
    for (const member of this.members) {
      const { pet, holder, spot } = member;
      member.age += dt;
      // They pop in one after another as the map arrives.
      const arrive = Math.max(0, Math.min(1, member.age / 0.3));
      holder.scale.setScalar(Math.max(0.001, arrive === 1 ? 1 : backOut(arrive)));

      if (member.next) {
        member.next.wait -= dt;
        if (member.next.wait <= 0) {
          member.busy = member.next.seconds;
          member.hop = 1;
          member.lift = member.next.lift;
          this.play(member, member.next.clip);
          member.next = null;
        }
      } else if (member.busy > 0) {
        member.busy -= dt;
        if (member.busy <= 0) this.play(member, 'idle');
      } else {
        // Left alone, each fidgets on its own clock: a small hop, or a look round.
        member.fidgetIn -= dt;
        if (member.fidgetIn <= 0) {
          member.fidgetIn = FIDGET.least + Math.random() * (FIDGET.most - FIDGET.least);
          member.hop = 1;
          member.lift = 0.12;
        }
      }

      member.hop = Math.max(0, member.hop - dt / 0.32);
      holder.position.y = (spot.y ?? 0) + Math.sin(member.hop * Math.PI) * member.lift;

      // Toward what is being watched, by the short way round, never snapping.
      const wanted = this.watching ? Math.atan2(this.watching.x - spot.x, this.watching.z - spot.z) : (spot.turn ?? 0);
      member.facing += Math.atan2(Math.sin(wanted - member.facing), Math.cos(wanted - member.facing)) * (1 - Math.exp(-4 * dt));
      holder.rotation.y = member.facing;
      pet.mixer.update(dt);
    }
  }

  dispose(): void {
    for (const member of this.members) member.pet.dispose();
    this.group.removeFromParent();
  }

  /** Sets a member to do something other than idling, after its own small delay, with a hop. */
  private act(member: Member, clip: PetClip, seconds: number, lift: number): void {
    member.next = { clip, seconds, lift: lift * MathUtils.randFloat(0.7, 1.2), wait: Math.random() * 0.35 };
  }

  private play(member: Member, clip: PetClip): void {
    if (member.clip === clip) return;
    const next = member.pet.actions.get(clip);
    const previous = member.pet.actions.get(member.clip);
    if (!next) return;
    next.reset().fadeIn(CROSSFADE).play();
    previous?.fadeOut(CROSSFADE);
    member.clip = clip;
  }
}
