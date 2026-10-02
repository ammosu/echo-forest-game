/** Character identity, vehicle tuning, and art bindings remain separate.
 * The Three.js view composes independent vehicle geometry and original driver sprites.
 * Fixed entries can later support a picker without changing physics or character metadata. */
export type CharacterId = "anbo" | "angoo" | "anmi" | "anje";
export type VehicleId = "moss" | "ember" | "honey" | "breeze";
export interface Vehicle {
  id: VehicleId;
  name: string;
  topSpeed: number;
  acceleration: number;
  handling: number;
  mass: number;
  color: string;
}
export const vehicles: Record<VehicleId, Vehicle> = {
  moss: {
    id: "moss",
    mass: 160,
    name: "苔綠號",
    topSpeed: 3600,
    acceleration: 2100,
    handling: 1,
    color: "#7aa474",
  },
  ember: {
    id: "ember",
    mass: 195,
    name: "紅葉號",
    topSpeed: 3360,
    acceleration: 1800,
    handling: 0.94,
    color: "#db8969",
  },
  honey: {
    id: "honey",
    mass: 140,
    name: "蜂蜜號",
    topSpeed: 3200,
    acceleration: 2400,
    handling: 1.1,
    color: "#ecc765",
  },
  breeze: {
    id: "breeze",
    mass: 115,
    name: "微風號",
    topSpeed: 3430,
    acceleration: 1850,
    handling: 1.08,
    color: "#9cd6c7",
  },
};
export interface RaceEntry {
  characterId: CharacterId;
  vehicleId: VehicleId;
  name: string;
  spriteColumn: number;
}
export const entries: RaceEntry[] = [
  { characterId: "anbo", vehicleId: "moss", name: "Anbo", spriteColumn: 0 },
  { characterId: "angoo", vehicleId: "ember", name: "Angoo", spriteColumn: 0 },
  { characterId: "anmi", vehicleId: "honey", name: "Anmi", spriteColumn: 1 },
  { characterId: "anje", vehicleId: "breeze", name: "Anje", spriteColumn: 2 },
];
export const SEGMENT_LENGTH = 200;
export const TRACK_LENGTH = 48000;
export const LAPS = 3;
export interface Segment {
  curve: number;
  zone: number;
  mapX: number;
  mapY: number;
}
const controlPoints = [
  [0, 0],
  [0, -130],
  [80, -235],
  [220, -230],
  [280, -110],
  [225, 5],
  [330, 120],
  [250, 230],
  [110, 220],
  [5, 155],
  [-105, 105],
  [-90, 20],
];
function point(t: number): [number, number] {
  const n = controlPoints.length,
    p = (t % 1) * n,
    i = Math.floor(p),
    f = p - i;
  const a = controlPoints[(i + n - 1) % n],
    b = controlPoints[i % n],
    c = controlPoints[(i + 1) % n],
    d = controlPoints[(i + 2) % n];
  return [0, 1].map(
    (k) =>
      0.5 *
      (2 * b[k] +
        (-a[k] + c[k]) * f +
        (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * f * f +
        (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * f * f * f),
  ) as [number, number];
}
// Arc-length resampling keeps the map and corners consistent with race distance.
const raw = Array.from({ length: 2401 }, (_, i) => point(i / 2400));
const lengths = [0];
for (let i = 1; i < raw.length; i++)
  lengths.push(
    lengths[i - 1] +
      Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]),
  );
const mapPoints = Array.from({ length: 240 }, (_, i) => {
  const target = (i / 240) * lengths[lengths.length - 1];
  let k = 1;
  while (lengths[k] < target) k++;
  const f = (target - lengths[k - 1]) / (lengths[k] - lengths[k - 1]);
  return [
    raw[k - 1][0] + (raw[k][0] - raw[k - 1][0]) * f,
    raw[k - 1][1] + (raw[k][1] - raw[k - 1][1]) * f,
  ];
});
const headings = mapPoints.map((p, i) =>
  Math.atan2(
    mapPoints[(i + 1) % 240][0] - p[0],
    -(mapPoints[(i + 1) % 240][1] - p[1]),
  ),
);
export const track: Segment[] = mapPoints.map((p, i) => {
  let turn = headings[(i + 1) % 240] - headings[i];
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  return {
    curve: Math.max(-4, Math.min(4, turn * 70)),
    zone: Math.floor(i / 80),
    mapX: p[0],
    mapY: p[1],
  };
});
export const itemBoxes = [4200, 15800, 29200, 41900].map((z, i) => ({
  z,
  x: [0, -0.5, 0.45, 0][i],
}));
export const boostPads = [
  { z: 10000, x: -0.4 },
  { z: 24800, x: 0.4 },
  { z: 37400, x: 0 },
];
// Stumps sit on the road shoulder: inside edges punish cutting a corner too
// tightly, the last one guards the outside; the middle of the road stays clear.
export const obstacles = [
  { z: 13200, x: 0.92 },
  { z: 22400, x: -0.92 },
  { z: 33300, x: 0.92 },
  { z: 45200, x: -0.92 },
];
export const zoneNames = ["晨光林道", "蕨葉彎道", "金色花谷"];
export const mod = (n: number, d: number) => ((n % d) + d) % d;
export const curveAt = (distance: number) =>
  track[Math.floor(mod(distance, TRACK_LENGTH) / SEGMENT_LENGTH)].curve;
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
