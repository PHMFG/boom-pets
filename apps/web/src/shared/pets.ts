// The 24 Cube Pets. Every model ships the same eight clips (verified with tools/inspect-glb.ts).
export const PET_IDS = [
  'beaver', 'bee', 'bunny', 'cat', 'caterpillar', 'chick', 'cow', 'crab',
  'deer', 'dog', 'elephant', 'fish', 'fox', 'giraffe', 'hog', 'koala',
  'lion', 'monkey', 'panda', 'parrot', 'penguin', 'pig', 'polar', 'tiger',
] as const;
export type PetId = (typeof PET_IDS)[number];

export const PET_CLIPS = ['static', 'idle', 'walk', 'run', 'eat', 'dance', 'gesture-positive', 'gesture-negative'] as const;
export type PetClip = (typeof PET_CLIPS)[number];

/** Which shipped clip plays under each game state. Dash, hit and fall have no clip: code drives them. */
export const PET_STATE_CLIP = {
  rest: 'static',
  idle: 'idle',
  walk: 'walk',
  run: 'run',
  munch: 'eat',
  win: 'dance',
  cheer: 'gesture-positive',
  sulk: 'gesture-negative',
} as const satisfies Record<string, PetClip>;

export const petModelUrl = (id: PetId): string => `/models/pets/animal-${id}.glb`;
