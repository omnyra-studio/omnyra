/**
 * Shot Planner — assigns professional shot types to each beat.
 *
 * Pure local logic, no API call. Enforces camera evolution rules:
 * - Never same shot type twice in a row
 * - Progresses from wide (establish) to tight (emotion) and back
 * - Reaction shots follow action shots
 */

import type { CinematicBeat, ShotPlan, ShotType, CameraMovement, NarrativeRole } from "./types";

interface ShotTemplate {
  shotType:    ShotType;
  movement:    CameraMovement;
  focalLength: string;
  framing:     string;
  lensNote:    string;
}

const ROLE_PRIMARY_SHOT: Record<NarrativeRole, ShotTemplate> = {
  establish: {
    shotType:    'wide',
    movement:    'slow push in',
    focalLength: '35mm wide',
    framing:     'subject small in frame, environment dominant',
    lensNote:    'deep focus, full environment visible',
  },
  introduce: {
    shotType:    'medium',
    movement:    'slow push in',
    focalLength: '50mm standard',
    framing:     'subject centered, waist up',
    lensNote:    'slight background blur, subject sharp',
  },
  conflict: {
    shotType:    'close-up',
    movement:    'static',
    focalLength: '85mm portrait',
    framing:     'face filling frame, tension visible',
    lensNote:    'shallow depth of field, eyes sharp',
  },
  reaction: {
    shotType:    'reaction',
    movement:    'static',
    focalLength: '85mm portrait',
    framing:     'tight on face, micro-expression visible',
    lensNote:    'very shallow depth of field',
  },
  development: {
    shotType:    'tracking',
    movement:    'tracking left',
    focalLength: '50mm standard',
    framing:     'subject moving through space',
    lensNote:    'moderate depth of field',
  },
  climax: {
    shotType:    'close-up',
    movement:    'slow push in',
    focalLength: '85mm portrait',
    framing:     'extreme close on eyes or hands',
    lensNote:    'razor-thin depth of field',
  },
  resolution: {
    shotType:    'wide',
    movement:    'slow pull back',
    focalLength: '35mm wide',
    framing:     'subject small, environment reclaims space',
    lensNote:    'deep focus, world feels larger than subject',
  },
};

// Fallback shot sequence for evolution when primary would repeat
const SHOT_ROTATION: ShotType[] = [
  'wide', 'medium', 'close-up', 'tracking', 'reaction', 'over-shoulder', 'insert', 'pov', 'drone',
];

const MOVEMENT_FOR_SHOT: Record<ShotType, CameraMovement[]> = {
  'wide':         ['static', 'slow pull back', 'slow push in', 'slow pan left'],
  'medium':       ['slow push in', 'static', 'slow pan right', 'tracking right'],
  'close-up':     ['static', 'slow push in', 'tilt up'],
  'over-shoulder': ['static', 'slow pan left'],
  'pov':          ['handheld', 'static'],
  'tracking':     ['tracking left', 'tracking right', 'slow push in'],
  'drone':        ['slow pull back', 'slow pan right', 'slow pan left'],
  'insert':       ['static', 'tilt down', 'tilt up'],
  'reaction':     ['static', 'slow push in'],
};

export function planShots(beats: CinematicBeat[]): ShotPlan[] {
  const plans: ShotPlan[] = [];
  let prevShotType: ShotType | null = null;

  for (const beat of beats) {
    let template = ROLE_PRIMARY_SHOT[beat.narrativeRole];

    // Evolution rule: never repeat same shot type consecutively
    if (template.shotType === prevShotType) {
      // Pick next shot type in rotation that isn't the same
      const rotIdx = SHOT_ROTATION.indexOf(prevShotType);
      const nextType = SHOT_ROTATION[(rotIdx + 1) % SHOT_ROTATION.length];
      const movements = MOVEMENT_FOR_SHOT[nextType];
      const movement  = movements[beat.index % movements.length];
      template = {
        shotType:    nextType,
        movement,
        focalLength: getShotFocalLength(nextType),
        framing:     `Evolved framing: ${nextType} capturing ${beat.emotion}`,
        lensNote:    'cinematic depth',
      };
    }

    plans.push({
      beatIndex:   beat.index,
      shotType:    template.shotType,
      movement:    template.movement,
      focalLength: template.focalLength,
      framing:     template.framing,
      lensNote:    template.lensNote,
    });

    prevShotType = template.shotType;
  }

  return plans;
}

function getShotFocalLength(shotType: ShotType): string {
  const map: Record<ShotType, string> = {
    'wide':          '35mm wide',
    'medium':        '50mm standard',
    'close-up':      '85mm portrait',
    'over-shoulder': '50mm standard',
    'pov':           '28mm wide',
    'tracking':      '50mm standard',
    'drone':         '24mm ultra-wide',
    'insert':        '100mm macro',
    'reaction':      '85mm portrait',
  };
  return map[shotType] ?? '50mm standard';
}
