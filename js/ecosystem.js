// ecosystem.js — rain, wind, water flow, creatures
import * as THREE from 'three';
const TAU = Math.PI*2;

// ---- particle pool (rain + wind streaks) ----
class ParticlePool{
  constructor(scene, count, geom, mat, size){
    this.geom = geom; this.mat = mat;
    this.points = new THREE.Points(geom, mat);
    this.points.frustumCulled = false;
    this.mat.size = size || 0.08;
    this.mat.transparent = true;
    this.mat.depthWrite = false;
    this.positions = new Float32Array(count*3);
    this.vel = new Float32Array(count*3);
    this.life = new Float32Array(count);
    this.max = count;
    geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count*3), 3));
    this.colors = geom.attributes.color.array;
    for(let i=0;i<count;i++) this.life[i] = -1;
    scene.add(this.points);
  }
  spawn(x,y,z, vx,vy,vz, r,g,b, life){
    for(let i=0;i<this.max;i++){
      if(this.life[i]<0){
        this.positions[i*3]=x; this.positions[i*3+1]=y; this.positions[i*3+2]=z;
        this.vel[i*3]=vx; this.vel[i*3+1]=vy; this.vel[i*3+2]=vz;
        this.colors[i*3]=r; this.colors[i*3+1]=g; this.colors[i*3+2]=b;
        this.life[i] = life;
        return i;
      }
    }
    return -1;
  }
  update(dt, world){
    const pos = this.positions, vel = this.vel, life = this.life, col = this.colors;
    for(let i=0;i<this.max;i++){
      if(life[i] < 0) continue;
      life[i] -= dt;
      if(life[i] <= 0){ life[i] = -1; pos[i*3+1] = -999; continue; }
      pos[i*3]   += vel[i*3]   * dt;
      pos[i*3+1] += vel[i*3+1] * dt;
      pos[i*3+2] += vel[i*3+2] * dt;
      // gravity for rain
      vel[i*3+1] -= 9 * dt;
      // collision with island surface
      const x = pos[i*3], z = pos[i*3+2];
      const r = Math.hypot(x,z);
      if(r < world.radius){
        const h = world.sampleHeight(x,z);
        if(pos[i*3+1] < h + 0.02){
          // splash: stop & kill
          life[i] = Math.min(life[i], 0.05);
          vel[i*3] *= 0.2; vel[i*3+1] = -vel[i*3+1]*0.2; vel[i*3+2] *= 0.2;
          if(life[i] <= 0) life[i] = -1, pos[i*3+1] = -999;
        }
      } else if(pos[i*3+1] < -4){
        life[i] = -1; pos[i*3+1] = -999;
      }
    }
    this.geom.attributes.position.needsUpdate = true;
    this.geom.attributes.color.needsUpdate = true;
  }
  clear(){
    for(let i=0;i<this.max;i++){ this.life[i] = -1; this.positions[i*3+1] = -999; }
    this.geom.attributes.position.needsUpdate = true;
  }
}

export class Ecosystem {
  constructor(world){
    this.world = world;
    this.scene = world.scene;
    this.placed = [];        // active placed objects {kind, root, obj}
    this.rainSpawners = [];  // cloud positions
    this.waterSources = [];  // water positions
    this.windSources = [];   // windmill positions
    this.lights = [];        // lighthouse/house positions
    this.creatures = [];
    this.wetZones = [];      // {x,z,r,strength}

    // rain pool
    this.rainPool = new ParticlePool(
      this.scene, 400,
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ size:0.08, vertexColors:true, transparent:true, opacity:0.8, depthWrite:false }),
      0.08
    );
    // wind pool (streaks) — reuse same kind of points
    this.windPool = new ParticlePool(
      this.scene, 120,
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ size:0.16, vertexColors:true, transparent:true, opacity:0.4, depthWrite:false }),
      0.16
    );

    // water flow mesh (a network of thin ribbons) — approximated as instanced quills
    this._waterRibbons = null;
    this._bayDisc = null;
    this._waterDirty = true;   // rebuild ribbons only when dirty (fixes per-frame flicker)

    // creature counts by species for goal
    this.creatureKinds = new Set();
  }

  reset(){
    this.placed = [];
    this.rainSpawners = [];
    this.waterSources = [];
    this.windSources = [];
    this.lights = [];
    this.creatures = [];
    this.wetZones = [];
    this.creatureKinds.clear();
    this.rainPool.clear();
    this.windPool.clear();
    if(this._waterRibbons){ this.scene.remove(this._waterRibbons); this._waterRibbons.geometry.dispose(); this._waterRibbons.material.dispose(); this._waterRibbons = null; }
    if(this._bayDisc){ this.scene.remove(this._bayDisc); this._bayDisc.geometry.dispose(); this._bayDisc.material.dispose(); this._bayDisc = null; }
    this._waterDirty = true;
  }

  register(obj, position){
    this.placed.push({ kind: obj.kind, root: obj.root, obj, position });
    if(obj.kind === 'cloud'){
      this.rainSpawners.push({ pos: position.clone(), obj });
    } else if(obj.kind === 'water'){
      this.waterSources.push({ pos: position.clone(), obj });
      this._waterDirty = true;
    } else if(obj.kind === 'windmill'){
      this.windSources.push({ pos: position.clone(), obj });
    } else if(obj.kind === 'lighthouse' || obj.kind === 'house'){
      this.lights.push({ pos: position.clone(), obj });
    }
  }

  // ---- goal evaluation ----
  countPlants(){ return this.placed.filter(p => p.kind==='tree' || p.kind==='flower').length; }
  countRaining(){ return this.rainSpawners.length; }
  countLightsLit(isNight){ return isNight ? this.lights.length : 0; }
  countAnimals(){ return this.creatureKinds.size; }

  waterReachedBay(){
    if(this.waterSources.length === 0) return false;
    // simple rule: at least one water source exists and a path exists (always true if placed)
    // refined: ensure water source is uphill (y >= bay.y + 0.1)
    const bay = this.world.bay;
    return this.waterSources.some(w => w.pos.y >= bay.y + 0.05);
  }

  // ---- spawning creatures ----
  maybeSpawnCreatures(dt, isNight){
    // conditions for spawning:
    //  bird     — needs tree + (day)
    //  fish      — needs water
    //  firefly   — needs lighthouse at night
    //  butterfly — needs flower (day)
    const have = (k) => this.placed.some(p => p.kind===k);
    const tree = have('tree'), water = have('water'), light = have('lighthouse')||have('house'), flower = have('flower');

    const targetCounts = {};
    if(tree) targetCounts.bird = Math.min(3, this.placed.filter(p=>p.kind==='tree').length + 1);
    if(water) targetCounts.fish = Math.min(3, this.waterSources.length + 1);
    if(light && isNight) targetCounts.firefly = 2 + this.lights.length;
    if(flower) targetCounts.butterfly = Math.min(3, this.placed.filter(p=>p.kind==='flower').length);

    for(const kind of Object.keys(targetCounts)){
      const cur = this.creatures.filter(c=>c.kind===kind).length;
      const need = targetCounts[kind] - cur;
      if(need > 0 && Math.random() < dt * 1.6){
        this._spawnCreature(kind);
      }
    }
  }

  _spawnCreature(kind){
    const pos = new THREE.Vector3();
    let attractor = null;
    if(kind === 'bird'){
      const trees = this.placed.filter(p=>p.kind==='tree');
      attractor = trees[Math.floor(Math.random()*trees.length)];
      pos.copy(attractor.position); pos.y += 1.5;
    } else if(kind === 'fish'){
      const w = this.waterSources[Math.floor(Math.random()*this.waterSources.length)];
      pos.copy(w.position); pos.y += 0.1;
    } else if(kind === 'firefly'){
      const l = this.lights[Math.floor(Math.random()*this.lights.length)];
      pos.copy(l.position); pos.y += 0.6 + Math.random()*0.8;
      pos.x += (Math.random()-0.5)*1.2;
      pos.z += (Math.random()-0.5)*1.2;
    } else if(kind === 'butterfly'){
      const f = this.placed.filter(p=>p.kind==='flower');
      const a = f[Math.floor(Math.random()*f.length)];
      pos.copy(a.position); pos.y += 0.4;
    }

    const root = new THREE.Group();
    let body;
    if(kind === 'bird'){
      body = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 5),
        new THREE.MeshStandardMaterial({ color:0xff8a4a, roughness:0.7, flatShading:true })
      );
      body.scale.set(1, 0.8, 1.4);
      root.add(body);
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.2,0.12), new THREE.MeshStandardMaterial({ color:0xffffff, side:THREE.DoubleSide, transparent:true, opacity:0.7 }));
      wing.position.z = -0.04;
      const wg = new THREE.Group(); wg.add(wing); wg.position.y = 0.04;
      root.add(wg);
      root.userData.wing = wg;
    } else if(kind === 'fish'){
      body = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6),
        new THREE.MeshStandardMaterial({ color:0xff8a4a, roughness:0.6, flatShading:true }));
      body.rotation.x = Math.PI/2;
      root.add(body);
    } else if(kind === 'firefly'){
      body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5),
        new THREE.MeshBasicMaterial({ color:0xfff4a0 }));
      root.add(body);
      const pl = new THREE.PointLight(0xffe070, 0.5, 1.2);
      root.add(pl);
      root.userData.light = pl;
    } else if(kind === 'butterfly'){
      body = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4),
        new THREE.MeshStandardMaterial({ color:0x303030 }));
      root.add(body);
      const wingMat = new THREE.MeshStandardMaterial({ color:0xff6ab0, side:THREE.DoubleSide, transparent:true, opacity:0.85 });
      const w1 = new THREE.Mesh(new THREE.PlaneGeometry(0.1,0.08), wingMat);
      w1.position.x = 0.06;
      const w2 = w1.clone(); w2.position.x = -0.06; w2.rotation.y = Math.PI;
      const wg = new THREE.Group(); wg.add(w1); wg.add(w2); wg.position.y = 0.03;
      root.add(wg);
      root.userData.wing = wg;
    }

    root.position.copy(pos);
    root.userData.kind = kind;
    root.userData.phase = Math.random()*TAU;
    root.userData.t = 0;
    root.userData.target = pos.clone();
    root.userData.home = pos.clone();
    this.world.creatureGroup.add(root);
    this.creatures.push({ kind, root, body });
    this.creatureKinds.add(kind);
  }

  _updateCreatures(dt, t, isNight){
    for(const c of this.creatures){
      const r = c.root;
      r.userData.t += dt;
      if(c.kind === 'bird'){
        // circle around home tree
        const a = t*0.6 + r.userData.phase;
        const target = r.userData.home.clone();
        target.x += Math.cos(a)*0.8;
        target.z += Math.sin(a)*0.8;
        target.y += Math.sin(t*2)*0.1;
        r.position.lerp(target, Math.min(1, dt*1.4));
        if(r.userData.wing) r.userData.wing.rotation.x = Math.sin(t*18)*0.6;
      } else if(c.kind === 'fish'){
        // bob in water
        r.position.y = r.userData.home.y + Math.sin(t*2 + r.userData.phase)*0.05;
        r.rotation.y = Math.sin(t*0.6 + r.userData.phase)*0.4;
      } else if(c.kind === 'firefly'){
        // jitter around
        const a = t*1.2 + r.userData.phase;
        const target = r.userData.home.clone();
        target.x += Math.cos(a)*0.6;
        target.y += Math.sin(a*2)*0.4 + 0.5;
        target.z += Math.sin(a)*0.6;
        r.position.lerp(target, Math.min(1, dt*1.5));
        if(r.userData.light) r.userData.light.intensity = 0.3 + Math.sin(t*8)*0.25;
        c.body.material.color.setHSL(0.14, 1, 0.6 + Math.sin(t*8)*0.2);
      } else if(c.kind === 'butterfly'){
        // flit around flowers
        const a = t*1.6 + r.userData.phase;
        const target = r.userData.home.clone();
        target.x += Math.cos(a)*0.5;
        target.y += 0.4 + Math.sin(a*2)*0.2;
        target.z += Math.sin(a*1.4)*0.5;
        r.position.lerp(target, Math.min(1, dt*2));
        if(r.userData.wing){
          r.userData.wing.rotation.y = Math.sin(t*20)*0.7;
        }
      }
    }
  }

  // ---- rain emission ----
  _emitRain(dt){
    for(const c of this.rainSpawners){
      const rate = 12; // per second
      const n = Math.floor(rate*dt + Math.random());
      for(let i=0;i<n;i++){
        const ox = (Math.random()-0.5)*1.4;
        const oz = (Math.random()-0.5)*1.4;
        this.rainPool.spawn(
          c.pos.x + ox, c.pos.y - 0.3, c.pos.z + oz,
          (Math.random()-0.5)*0.4, -2.5, (Math.random()-0.5)*0.4,
          0.5, 0.7, 1.0, 1.6
        );
      }
      // mark wet zone under cloud
      this._markWet(c.pos.x, c.pos.z, 1.4, dt);
    }
  }

  _markWet(x, z, r, dt){
    let zone = this.wetZones.find(w => Math.hypot(w.x-x, w.z-z) < 0.5);
    if(!zone){ this.wetZones.push({ x, z, r, strength: 0 }); zone = this.wetZones[this.wetZones.length-1]; }
    zone.strength = Math.min(1, zone.strength + dt*0.6);
  }

  _emitWind(dt, t){
    for(const w of this.windSources){
      const dir = w.obj.root.userData.windDir || new THREE.Vector3(1,0,0);
      const rate = 6;
      const n = Math.floor(rate*dt + Math.random());
      for(let i=0;i<n;i++){
        this.windPool.spawn(
          w.pos.x + (Math.random()-0.5)*0.5,
          w.pos.y + 0.6 + Math.random()*0.6,
          w.pos.z + (Math.random()-0.5)*0.5,
          dir.x*2.0, 0.05, dir.z*2.0,
          0.85, 0.92, 0.95, 0.9
        );
      }
    }
  }

  // ---- water flow visualization ----
  // Rebuilds only when _waterDirty. Meshes are created ONCE and added to the
  // scene once; subsequent rebuilds just swap the position BufferAttribute in
  // place and move the bay disc — no add/remove per frame, so no flicker.
  _buildWaterRibbons(){
    if(!this._waterDirty) return;
    this._waterDirty = false;

    const bay = this.world.bay;

    // for each water source, build a path downhill toward bay (simple gradient descent)
    const positions = [];
    for(const src of this.waterSources){
      let p = src.pos.clone();
      p.y = this.world.sampleHeight(p.x, p.z) + 0.03;
      const steps = 60;
      for(let i=0;i<steps;i++){
        positions.push(p.x, p.y, p.z);
        // gradient via sampling
        let bestG = null, bestDy = 0;
        const candidates = [
          new THREE.Vector2(0.2,0), new THREE.Vector2(-0.2,0),
          new THREE.Vector2(0,0.2), new THREE.Vector2(0,-0.2),
          new THREE.Vector2(0.14,0.14), new THREE.Vector2(-0.14,0.14),
          new THREE.Vector2(0.14,-0.14), new THREE.Vector2(-0.14,-0.14)
        ];
        for(const c of candidates){
          const nx = p.x + c.x, nz = p.z + c.y;
          if(Math.hypot(nx,nz) > this.world.radius) continue;
          const nh = this.world.sampleHeight(nx,nz);
          const dy = p.y - nh;
          if(dy > bestDy){ bestDy = dy; bestG = c; }
        }
        if(!bestG || bestDy < 0.0005){
          // flatten — push toward bay
          const toBay = new THREE.Vector2(bay.x - p.x, bay.z - p.z).normalize().multiplyScalar(0.2);
          bestG = toBay;
        }
        p.x += bestG.x; p.z += bestG.y;
        p.y = this.world.sampleHeight(p.x, p.z) + 0.03;
        // stop if reached bay (close enough)
        if(Math.hypot(p.x-bay.x, p.z-bay.z) < 0.4){ positions.push(bay.x, bay.y+0.03, bay.z); break; }
        if(Math.hypot(p.x,p.z) > this.world.radius) break;
      }
    }

    // no water / no path — hide persistent meshes and bail
    if(positions.length === 0){
      if(this._waterRibbons){ this._waterRibbons.visible = false; this._waterRibbons.geometry.setDrawRange(0, 0); }
      if(this._bayDisc) this._bayDisc.visible = false;
      return;
    }

    // create the line mesh exactly once; afterwards just refresh positions
    if(!this._waterRibbons){
      const mat = new THREE.LineBasicMaterial({ color: 0x5fc4ee, transparent:true, opacity:0.85, linewidth:2 });
      const line = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
      line.renderOrder = 2;
      line.visible = false;
      this.scene.add(line);
      this._waterRibbons = line;
    }
    const geo = this._waterRibbons.geometry;
    // dispose the previous position attribute, then attach a fresh one of any size
    if(geo.attributes.position) geo.deleteAttribute('position');
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeBoundingSphere();
    this._waterRibbons.visible = true;

    // bay disc — create once, then just reposition
    if(!this._bayDisc){
      const bayDisc = new THREE.Mesh(
        new THREE.CircleGeometry(0.6, 16),
        new THREE.MeshStandardMaterial({ color: 0x5fc4ee, transparent:true, opacity:0.7, roughness:0.3, metalness:0 })
      );
      bayDisc.rotation.x = -Math.PI/2;
      this.scene.add(bayDisc);
      this._bayDisc = bayDisc;
    }
    this._bayDisc.position.set(bay.x, bay.y + 0.02, bay.z);
    this._bayDisc.visible = true;
  }

  update(dt, t, isNight){
    this._emitRain(dt);
    this._emitWind(dt, t);
    this.rainPool.update(dt, this.world);
    this.windPool.update(dt, this.world);
    if(this._waterDirty) this._buildWaterRibbons();
    this.maybeSpawnCreatures(dt, isNight);
    this._updateCreatures(dt, t, isNight);

    // decay wet zones slowly if no rain
    for(const z of this.wetZones){
      if(this.rainSpawners.length === 0 || Math.hypot(this.rainSpawners[0].pos.x - z.x, this.rainSpawners[0].pos.z - z.z) > 1.6){
        z.strength = Math.max(0, z.strength - dt*0.2);
      }
    }

    // update each placed object's update()
    const ctx = { world: this.world, eco: this, isNight, fxGroup: this.world.fxGroup };
    for(const p of this.placed){
      if(p.obj.update) p.obj.update(dt, t, ctx);
    }
  }
}
