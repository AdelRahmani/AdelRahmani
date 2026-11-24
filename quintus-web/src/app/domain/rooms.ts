/** Mesures d'une pièce (écrans Rooms et Localisations). */
import { OPENING_TYPES } from './constants';
import { num, r2, sum } from './math';
import { Room } from './models';

export interface RoomMeasures {
  length: number;
  width: number;
  height: number;
  floor: number;
  ceiling: number;
  perimeter: number;
  wallsGross: number;
  /** murs, ouvertures déduites */
  walls: number;
  /** périmètre moins la largeur des portes et baies */
  skirting: number;
  volume: number;
}

export function roomMeasures(
  room: Pick<Room, 'length' | 'width' | 'height' | 'surface' | 'openings'>,
): RoomMeasures {
  let length = num(room.length);
  let width = num(room.width);
  const height = num(room.height);
  let floor = r2(length * width);
  if (!(length > 0) && num(room.surface) > 0) {
    // surface seule connue : dimensions estimées au nombre d'or
    floor = num(room.surface);
    length = r2(Math.sqrt(floor * 1.618));
    width = width > 0 ? width : r2(floor / length);
  } else if (!(width > 0) && num(room.surface) > 0 && length > 0) {
    floor = num(room.surface);
    width = r2(floor / length);
  }
  const perimeter = r2((length + width) * 2);
  const openings = room.openings ?? [];
  const openingsArea = r2(sum(openings, (o) => num(o.width) * num(o.height)));
  const doorsWidth = r2(
    sum(
      openings.filter((o) => OPENING_TYPES.includes(o.type)),
      (o) => o.width,
    ),
  );
  return {
    length,
    width,
    height,
    floor,
    ceiling: floor,
    perimeter,
    wallsGross: r2(perimeter * height),
    walls: Math.max(0, r2(perimeter * height - openingsArea)),
    skirting: Math.max(0, r2(perimeter - doorsWidth)),
    volume: r2(floor * height),
  };
}
