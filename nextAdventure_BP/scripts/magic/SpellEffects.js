// 見た目と音（草案 16：SpellEffects）
function particle(dim, id, loc) {
  try { dim.spawnParticle(id, loc); } catch {}
}
function sound(dim, id, loc, volume = 1, pitch = 1) {
  try { dim.playSound(id, loc, { volume, pitch }); } catch {}
}
const jitter = (loc, r) => ({
  x: loc.x + (Math.random() - 0.5) * r,
  y: loc.y + (Math.random() - 0.5) * r,
  z: loc.z + (Math.random() - 0.5) * r,
});

export const Fx = {
  castStart(dim, loc, attr = "fire") {
    if (attr === "earth") sound(dim, "dig.gravel", loc, 0.7, 1.3);
    else sound(dim, "fire.ignite", loc, 0.8, 1.2);
  },
  forming(dim, loc, size) {
    if (Math.random() < 0.6) particle(dim, "minecraft:basic_flame_particle", jitter(loc, size * 1.2));
  },
  ready(dim, loc, attr = "fire") {
    if (attr === "earth") {
      sound(dim, "dig.stone", loc, 0.8, 0.9);
      return;
    }
    sound(dim, "fire.ignite", loc, 1.0, 0.8);
    for (let i = 0; i < 4; i++) particle(dim, "minecraft:lava_particle", jitter(loc, 0.3));
  },
  fizzle(dim, loc) {
    sound(dim, "random.fizz", loc, 0.7, 1.4);
    for (let i = 0; i < 4; i++) particle(dim, "minecraft:basic_smoke_particle", jitter(loc, 0.5));
  },
  launch(dim, loc, size) {
    sound(dim, "mob.blaze.shoot", loc, 0.6 + size * 0.4, 1.3 - size * 0.4);
  },
  trail(dim, loc, size) {
    particle(dim, "minecraft:basic_flame_particle", jitter(loc, size * 0.6));
    if (Math.random() < 0.3) particle(dim, "minecraft:basic_smoke_particle", jitter(loc, size * 0.6));
  },
  impact(dim, loc, size) {
    sound(dim, "mob.ghast.fireball", loc, 0.5 + size * 0.5, 1.4 - size * 0.4);
    const n = 4 + Math.round(size * 8);
    for (let i = 0; i < n; i++) particle(dim, "minecraft:basic_flame_particle", jitter(loc, size * 2));
    for (let i = 0; i < 3; i++) particle(dim, "minecraft:lava_particle", jitter(loc, size));
    if (size > 0.8) particle(dim, "minecraft:large_explosion", loc);
  },
  extinguish(dim, loc) {
    sound(dim, "random.fizz", loc, 1.0, 1.0);
    for (let i = 0; i < 8; i++) particle(dim, "minecraft:basic_smoke_particle", jitter(loc, 0.8));
  },
  clash(dim, loc) {
    sound(dim, "random.fizz", loc, 0.8, 0.7);
    for (let i = 0; i < 10; i++) particle(dim, "minecraft:basic_flame_particle", jitter(loc, 1.4));
  },
  fade(dim, loc) {
    for (let i = 0; i < 3; i++) particle(dim, "minecraft:basic_smoke_particle", jitter(loc, 0.4));
  },
};
