import type { Part } from '../record.ts';
import { bass } from './bass.ts';
import { lead } from './lead.ts';
import { percussion } from './percussion.ts';
import type { Player } from './player.ts';
import { synth } from './synth.ts';

export const PLAYERS: Record<Part, Player> = { synth, percussion, lead, bass };

// The order in which the agents arrive and take a part. Bass is left out.
export const ARRIVAL_ORDER: Part[] = ['synth', 'percussion', 'lead'];
