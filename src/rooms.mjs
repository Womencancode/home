/* Community rooms: private rooms by discipline, named in the pack (careers.rooms.list: id, name, focus, blurb). "Request access" puts
 * an email on the waitlist under the room's own feature id (room-<id>), so the owner sees who asked and can export them. A room shows
 * as "Opening soon" until it is opened: by "open": true in the pack, or by the owner at /admin/rooms (site setting "rooms.open"). */
import { PACK } from './site.mjs';
import { careersConfig } from './careers.mjs';

export const ROOM_SOON = 'Opening soon';
export const ROOM_OPEN = 'Open';
export const OPEN_SETTING = 'rooms.open';

/** The pack's rooms, in order; [] when rooms are off. */
export const roomsOf = (pack = PACK) => { const c = careersConfig(pack); return c && c.rooms ? c.rooms.list : []; };
export const roomById = (id, pack = PACK) => roomsOf(pack).find((r) => r.id === id) || null;

/** The waitlist feature a room's requests are stored under. */
export const roomFeature = (id) => `room-${id}`;

/** Each room with its state: the owner's saved choice ({ id: true|false }) wins over the pack's "open". */
export function roomsWithState(saved, pack = PACK) {
  const s = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  return roomsOf(pack).map((r) => ({ ...r, open: typeof s[r.id] === 'boolean' ? s[r.id] : r.open }));
}

/** The waitlist features rooms add, for the owner's waitlist page: [{ id: 'room-<id>', label }]. */
export const roomFeatures = (pack = PACK) => roomsOf(pack).map((r) => ({ id: roomFeature(r.id), label: `Room: ${r.name}` }));
