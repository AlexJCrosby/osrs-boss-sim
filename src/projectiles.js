// src/projectiles.js
export function createProjectiles(THREE, { scene } = {}) {
  const active = [];

  // ---------- Materials ----------
  const rangeMat = new THREE.MeshStandardMaterial({
    color: 0x003b0a,         // very dark green
    emissive: 0x001a06,
    emissiveIntensity: 1.2,
    transparent: true,
    opacity: 0.92,           // high opacity
    roughness: 0.25,
    metalness: 0.6,
  });

  const mageMat = new THREE.MeshStandardMaterial({
    color: 0xff0000,         // bright red
    emissive: 0xff2a2a,
    emissiveIntensity: 2.2,
    transparent: true,
    opacity: 0.9,
    roughness: 0.3,
    metalness: 0.1,
  });

  // ---------- Geometry ----------
  // Sharp crystal: a stretched octahedron for ranged
  const rangeGeo = new THREE.OctahedronGeometry(0.18, 0);
  // Fireball: simple sphere
  const mageGeo = new THREE.SphereGeometry(0.16, 14, 14);

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function vecLerp(out, a, b, t) {
    out.set(
      lerp(a.x, b.x, t),
      lerp(a.y, b.y, t),
      lerp(a.z, b.z, t)
    );
    return out;
  }

  /**
   * Spawns a projectile from `from` to `to`.
   * style: "RANGE" | "MAGE"
   * from/to: THREE.Vector3
   */
  function spawnBossProjectile({ style, from, to }) {
    const isRange = style === "RANGE";

    const mesh = new THREE.Mesh(isRange ? rangeGeo : mageGeo, isRange ? rangeMat : mageMat);
    mesh.renderOrder = 50; // ensure it's visible over most things
    scene.add(mesh);

    // Shape tweaks
    if (isRange) {
      // Make it a tall shard + slightly rotated so it looks "sharp"
      mesh.scale.set(1.25, 2.7, 1.25);
      mesh.rotation.set(Math.PI * 0.2, Math.PI * 0.25, Math.PI * 0.1);
    } else {
      // Fireball: slightly larger + will pulse in update
      mesh.scale.set(1.25, 1.25, 1.25);
    }

    // Glow light for mage 
    let light = null;
    if (!isRange) {
      light = new THREE.PointLight(0xff2a2a, 0.9, 2.2);
      light.position.copy(from);
      scene.add(light);
    }

    active.push({
      mesh,
      light,
      style,
      from: from.clone(),
      to: to.clone(),
      t: 0,
      duration: 0.6, // seconds 
    });
  }

  function updateVisual(dt) {
    // iterate backwards to allow splice
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.t += dt / p.duration;

      const t = Math.min(1, p.t);

      // Base position lerp
      const pos = new THREE.Vector3();
      vecLerp(pos, p.from, p.to, t);

      // Add an arc so it feels like a projectile
      // higher arc for mage
      const arc = (p.style === "MAGE") ? 0.22 : 0.12;
      pos.y += Math.sin(t * Math.PI) * arc;

      p.mesh.position.copy(pos);
      if (p.light) p.light.position.copy(pos);

      // Fireball pulse for life
      if (p.style === "MAGE") {
        const pulse = 1 + Math.sin((t * 12) * Math.PI) * 0.08;
        p.mesh.scale.set(1.25 * pulse, 1.25 * pulse, 1.25 * pulse);
      }

      // Crystal spin
      if (p.style === "RANGE") {
        p.mesh.rotation.y += dt * 6.5;
      }

      if (p.t >= 1) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose?.(); // geometries are shared; safe no-op

        if (p.light) scene.remove(p.light);

        active.splice(i, 1);
      }
    }
  }

  function reset() {
    // Remove all active projectiles immediately
    for (const p of active) {
      scene.remove(p.mesh);
      if (p.light) scene.remove(p.light);
    }
    active.length = 0;
  }

  return {
    spawnBossProjectile,
    updateVisual,
    reset,
  };
}
