/* Shared ground height. Creatures stand on the same surface the mesh is built from --
 * a flat plane under a rolling landscape is the single thing that reads as fake fastest. */
export function groundHeight(x, z) {
  return Math.sin(x * 0.055) * 0.55 + Math.cos(z * 0.043) * 0.45
       + Math.sin((x + z) * 0.021) * 0.7
}
export const WORLD_RADIUS = 60
