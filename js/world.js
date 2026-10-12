// world.js — island, terrain, sky, lighting, day/night
import * as THREE from 'three';

const TAU = Math.PI*2;
const TOUCH = matchMedia('(pointer: coarse)').matches;

// procedural canvas textures (cached by color)
const _texCache = {};
function makeNoiseTexture(baseColor, variant='grass', size=128){
  const key = baseColor + variant;
  if(_texCache[key]) return _texCache[key];
  const c = document.createElement('canvas'); c.width=c.height=size;
  const x = c.getContext('2d');
  const base = new THREE.Color(baseColor);
  x.fillStyle = `rgb(${base.r*255|0},${base.g*255|0},${base.b*255|0})`;
  x.fillRect(0,0,size,size);
  for(let i=0;i<size;i++){
    for(let j=0;j<size;j++){
      if(Math.random()<0.35){
        const n = (Math.random()-0.5)*0.3;
        const r = Math.min(255,Math.max(0,(base.r+n)*255))|0;
        const g = Math.min(255,Math.max(0,(base.g+n)*255))|0;
        const b = Math.min(255,Math.max(0,(base.b+n)*255))|0;
        x.fillStyle = `rgb(${r},${g},${b})`;
        x.fillRect(i,j,1,1);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4,4);
  tex.colorSpace = THREE.SRGBColorSpace;
  _texCache[key] = tex;
  return tex;
}

export class World {
  constructor(scene, renderer){
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.islandGroup = new THREE.Group();
    this.group.add(this.islandGroup);

    this.decorGroup = new THREE.Group();   // trees/props placed by level
    this.group.add(this.decorGroup);

    this.fxGroup = new THREE.Group();      // rain/wind/particles
    this.group.add(this.fxGroup);

    this.creatureGroup = new THREE.Group();
    this.group.add(this.creatureGroup);

    this.time = 0.32;        // 0=dawn 0.5=noon 1=midnight wraps
    this.night = false;
    this.palette = null;
    this.style = 'nordic';
    this.radius = 6.2;       // island top radius
    this.heightData = null; // heightmap sampler
    this.bay = new THREE.Vector3(); // low point for waterflow goal
    this._sun = null; this._hemi = null; this._fill = null; this._ambient=null;
    this._sky = null;
    this._grassMat = null; this._dirtMat=null; this._rockMat=null;
    this._waterMesh = null; this._waterMat = null;
    this._cloudsPassive = [];
  }

  // ---- height sampling (flat top with gentle hills + a bay basin) ----
  sampleHeight(x, z){
    const r = Math.hypot(x, z);
    const R = this.radius;
    if(r > R) return -1;        // off-island
    // gentle rolling hills
    let h = Math.sin(x*0.9)*0.18 + Math.cos(z*0.8)*0.16 + Math.sin((x+z)*0.5)*0.10;
    // bay basin near a fixed direction
    const bayDir = new THREE.Vector2(1, 0.4).normalize();
    const d = (x*bayDir.x + z*bayDir.y);
    const basin = Math.max(0, 1 - (r*r)/(R*R*0.5)) * 0.55;
    // carve basin offset toward bay edge
    const bx = Math.cos(0.3), bz = Math.sin(0.3);
    const bayDist = Math.hypot(x - bx*R*0.7, z - bz*R*0.7);
    const basinShape = Math.max(0, 1 - bayDist/2.2);
    h -= basinShape * 0.8;
    // edge falloff (raise rim slightly)
    const rim = Math.max(0, (r - R*0.78)/(R*0.22));
    h += rim*0.25;
    return h;
  }

  loadLevel(chapter, level){
    this.clearLevel();
    this.palette = chapter.palette;
    this.style = chapter.style;

    this._buildSky();
    this._buildIsland();
    this._buildLights();
    this._buildPassiveClouds();
  }

  clearLevel(){
    while(this.islandGroup.children.length) this.islandGroup.remove(this.islandGroup.children[0]);
    while(this.decorGroup.children.length) this.decorGroup.remove(this.decorGroup.children[0]);
    while(this.fxGroup.children.length) this.fxGroup.remove(this.fxGroup.children[0]);
    while(this.creatureGroup.children.length) this.creatureGroup.remove(this.creatureGroup.children[0]);
    this._cloudsPassive = [];
  }

  _buildSky(){
    if(this._sky){ this.scene.remove(this._sky); this._sky.geometry.dispose(); this._sky.material.dispose(); }
    const p = this.palette;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(80, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms:{
          top:{ value: new THREE.Color(p.sky) },
          bottom:{ value: new THREE.Color(p.fog) },
          night:{ value: 0.0 },
        },
        vertexShader:`varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader:`uniform vec3 top; uniform vec3 bottom; uniform float night; varying vec3 vP;
          void main(){ float t = clamp(vP.y/80.0*0.5+0.5,0.0,1.0); vec3 c = mix(bottom, top, t); c = mix(c, c*0.18, night); gl_FragColor = vec4(c,1.0);} `
      })
    );
    sky.renderOrder = -10;
    this.scene.add(sky);
    this._sky = sky;
    this.scene.fog = new THREE.Fog(new THREE.Color(p.fog).getHex(), 22, 70);
  }

  _buildIsland(){
    const p = this.palette;
    const R = this.radius;
    // top cap geometry — disc with heightmap
    const seg = 40;
    const geo = new THREE.CircleGeometry(R, seg, 0, TAU);
    // lift verts to heightmap, add skirt
    const pos = geo.attributes.position;
    for(let i=0;i<pos.count;i++){
      const x = pos.getX(i), z = pos.getY(i);
      const h = this.sampleHeight(x, z);
      pos.setZ(i, h);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const grassMat = new THREE.MeshStandardMaterial({ color:p.grass, roughness:0.95, metalness:0.0, flatShading:true });
    grassMat.map = makeNoiseTexture(p.grass, 'grass');
    grassMat.needsUpdate = true;
    this._grassMat = grassMat;
    const top = new THREE.Mesh(geo, grassMat);
    top.rotation.x = -Math.PI/2;
    top.receiveShadow = true;
    top.castShadow = false;
    this.islandGroup.add(top);

    // dirt skirt / underside — top ring lifted to match the grass edge so
    // there is no gap/flicker between the grass top and the dirt skirt.
    const skirt = new THREE.CylinderGeometry(R, R*0.3, 2.6, seg, 1, true);
    const skirtPos = skirt.attributes.position;
    for(let i=0;i<skirtPos.count;i++){
      const x = skirtPos.getX(i), y = skirtPos.getY(i), z = skirtPos.getZ(i);
      if(y > 1.2){
        // top ring: snap to grass radius and match heightmap (rim slightly below grass top)
        const r2 = Math.hypot(x, z);
        const nx = r2 > 0.0001 ? (x / r2) * R : x;
        const nz = r2 > 0.0001 ? (z / r2) * R : z;
        const h = this.sampleHeight(nx, nz);
        skirtPos.setX(i, nx);
        skirtPos.setZ(i, nz);
        // mesh is offset by -1.3, so local y = worldY + 1.3; rim 0.02 below grass
        skirtPos.setY(i, h - 0.02 + 1.3);
      } else {
        // bottom/side verts — keep rim noise for variation
        const n = Math.sin(x*1.3)*0.12 + Math.cos(z*1.1)*0.12;
        const r2 = Math.hypot(x,z);
        if(r2>0){
          const scale = (1 + n/Math.max(r2,0.1)*0.06);
          skirtPos.setX(i, x*scale);
          skirtPos.setZ(i, z*scale);
        }
      }
    }
    skirtPos.needsUpdate = true;
    skirt.computeVertexNormals();
    const dirtMat = new THREE.MeshStandardMaterial({ color:p.ground, roughness:1, flatShading:true });
    dirtMat.map = makeNoiseTexture(p.ground, 'dirt');
    dirtMat.needsUpdate = true;
    this._dirtMat = dirtMat;
    const side = new THREE.Mesh(skirt, dirtMat);
    side.position.y = -1.3;
    side.castShadow = true;
    side.receiveShadow = true;
    this.islandGroup.add(side);

    // bottom cap + scattered rocks share a textured rock material
    this._rockMat = new THREE.MeshStandardMaterial({ color:p.rock, roughness:1, flatShading:true });
    this._rockMat.map = makeNoiseTexture(p.rock, 'rock');
    this._rockMat.needsUpdate = true;
    const bottom = new THREE.Mesh(new THREE.ConeGeometry(R*0.32, 1.2, seg), this._rockMat);
    bottom.position.y = -2.7;
    bottom.rotation.y = 0.2;
    this.islandGroup.add(bottom);

    // scattered low rocks on grass for detail
    for(let i=0;i<14;i++){
      const a = Math.random()*TAU;
      const rr = Math.random()*R*0.85;
      const x = Math.cos(a)*rr, z=Math.sin(a)*rr;
      const h = this.sampleHeight(x,z);
      if(h < -0.2) continue;
      const sz = 0.12 + Math.random()*0.22;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(sz, 0),
        this._rockMat
      );
      rock.position.set(x, h + sz*0.4, z);
      rock.rotation.set(Math.random(),Math.random(),Math.random());
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.islandGroup.add(rock);
    }

    // compute bay position (lowest reachable point)
    let best = {h:999, x:0, z:0};
    for(let i=0;i<200;i++){
      const a = Math.random()*TAU, rr = Math.random()*R*0.9;
      const x = Math.cos(a)*rr, z = Math.sin(a)*rr;
      const h = this.sampleHeight(x,z);
      if(h < best.h && h > -0.9){ best = {h, x, z}; }
    }
    this.bay.set(best.x, best.h, best.z);
  }

  _buildLights(){
    const p = this.palette;
    // hemi for soft fill
    this._hemi = new THREE.HemisphereLight(new THREE.Color(p.sky), new THREE.Color(p.ground), 1.0);
    this.scene.add(this._hemi);
    // ambient
    this._ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(this._ambient);
    // sun
    this._sun = new THREE.DirectionalLight(0xffffff, 1.3);
    this._sun.castShadow = true;
    const shadowRes = TOUCH ? 1024 : 2048;
    this._sun.shadow.mapSize.set(shadowRes, shadowRes);
    this._sun.shadow.camera.left=-10; this._sun.shadow.camera.right=10;
    this._sun.shadow.camera.top=10; this._sun.shadow.camera.bottom=-10;
    this._sun.shadow.camera.near=0.5; this._sun.shadow.camera.far=40;
    this._sun.shadow.bias = -0.0005;
    // nicer morning angle; shadows baked once per level + on place
    this._sun.position.set(8, 12, 6);
    this._sun.target.position.set(0, 0, 0);
    this.scene.add(this._sun);
    this.scene.add(this._sun.target);
    // fill light (warm rim)
    this._fill = new THREE.DirectionalLight(0xffd9a0, 0.25);
    this.scene.add(this._fill);
    // bake shadows once on level load instead of recomputing every frame
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
  }

  // re-bake the static shadow map (call after level load + after object placement)
  bakeShadows(){
    if(this.renderer.shadowMap.enabled){
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  _buildPassiveClouds(){
    // a few purely decorative drifting clouds high in sky
    const p = this.palette;
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent:true, opacity:0.55, depthWrite:false });
    for(let i=0;i<4;i++){
      const g = new THREE.SphereGeometry(0.8, 8, 6);
      const cluster = new THREE.Group();
      for(let j=0;j<3;j++){
        const m = new THREE.Mesh(g, cloudMat);
        m.position.set((Math.random()-0.5)*1.5, (Math.random()-0.5)*0.3, (Math.random()-0.5)*1.5);
        m.scale.setScalar(0.6+Math.random()*0.5);
        cluster.add(m);
      }
      cluster.position.set((Math.random()-0.5)*18, 7+Math.random()*2, (Math.random()-0.5)*18);
      cluster.userData.drift = 0.04 + Math.random()*0.05;
      cluster.userData.phase = Math.random()*TAU;
      this.scene.add(cluster);
      this._cloudsPassive.push(cluster);
    }
  }

  setNight(v){
    this.night = v;
  }

  toggleDayNight(){
    this.setNight(!this.night);
  }

  update(dt, t){
    this.time += dt*0.02;
    if(this.time>1) this.time -= 1;

    // day/night lerp
    const n = this.night ? 1 : 0;
    const skyU = this._sky.material.uniforms;
    skyU.night.value += (n - skyU.night.value) * Math.min(1, dt*2);

    // sun position arcs across sky
    const ang = this.night ? -0.6 : 0.8;
    const sx = Math.cos(ang)*12, sy = Math.sin(ang)*9;
    this._sun.position.set(sx, sy, 5);
    this._sun.target.position.set(0,0,0);
    this._sun.intensity = this.night ? 0.12 : 1.3;
    this._sun.color.set(this.night ? 0x6e8bd0 : 0xfff2dd);
    this._hemi.intensity = this.night ? 0.35 : 1.0;
    this._ambient.intensity = this.night ? 0.12 : 0.2;
    this._fill.intensity = this.night ? 0.05 : 0.25;

    // drifting passive clouds
    for(const c of this._cloudsPassive){
      c.position.x += c.userData.drift * dt;
      if(c.position.x > 12) c.position.x = -12;
    }
  }

  // helper: world position on island from raycast (returns null if off-island)
  surfacePointFromRay(ray){
    // intersect with a flat-ish disc at y=0 then sample height
    // We raycast against the top mesh via plane at y=0.
    const plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
    const hit = new THREE.Vector3();
    if(!ray.ray.intersectPlane(plane, hit)) return null;
    const r = Math.hypot(hit.x, hit.z);
    if(r > this.radius) return null;
    const h = this.sampleHeight(hit.x, hit.z);
    hit.y = h;
    return hit;
  }
}
