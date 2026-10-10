// A thin layer over Rapier. Rapier resolves bodies bumping into each other; the floor is handled
// by the round itself (a grid of tiles), so nothing here collides with the ground.
import RAPIER from '@dimforge/rapier3d-compat';
import { arena, STEP } from './tuning';

export type Body = RAPIER.RigidBody;

let loading: Promise<void> | null = null;

/** Loads the physics engine. Must resolve before a Game is created. */
export function initPhysics(): Promise<void> {
  return (loading ??= RAPIER.init());
}

export class Physics {
  private readonly world = new RAPIER.World({ x: 0, y: arena.gravity, z: 0 });

  constructor() {
    this.world.timestep = STEP;
  }

  /** An upright capsule that cannot tip over. Friction is zero so pets slide past each other instead of sticking. */
  addCapsule(x: number, y: number, z: number, radius: number, halfHeight: number, mass: number): Body {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).lockRotations().setCanSleep(false).setCcdEnabled(true),
    );
    this.world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius).setMass(mass).setFriction(0).setRestitution(0.15), body);
    return body;
  }

  addCylinder(x: number, y: number, z: number, radius: number, halfHeight: number, mass: number): Body {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).lockRotations().setCanSleep(false).setCcdEnabled(true),
    );
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(halfHeight, radius).setMass(mass).setFriction(0).setRestitution(0.25), body);
    return body;
  }

  /** Swaps a capsule for one of a new size, for powers that grow or shrink a pet. */
  resizeCapsule(body: Body, radius: number, halfHeight: number, mass: number): void {
    const old = body.collider(0);
    const solid = old.isEnabled();
    this.world.removeCollider(old, true);
    const next = this.world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius).setMass(mass).setFriction(0).setRestitution(0.15), body);
    next.setEnabled(solid);
  }

  /** A carried body passes through everything until it is thrown or released. */
  setSolid(body: Body, solid: boolean): void {
    body.collider(0).setEnabled(solid);
  }

  remove(body: Body): void {
    this.world.removeRigidBody(body);
  }

  step(): void {
    this.world.step();
  }

  /** Rapier's memory is not garbage collected: every world must be freed. */
  free(): void {
    this.world.free();
  }
}
