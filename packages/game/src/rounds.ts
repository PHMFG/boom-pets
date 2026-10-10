// Every kind of round the game can be playing. Readers check `gameMode` before touching what only one kind has:
// `round.gameMode === 'paint'` leaves a field whose rules are that game's.
import type { Field } from './minis/field';
import type { AnyRules } from './minis';
import type { Round } from './round';

type FieldOf<Rules> = Rules extends AnyRules ? Field<Rules> : never;
export type AnyField = FieldOf<AnyRules>;
export type AnyRound = Round | AnyField;
