// objects.js — placeable world objects + their behaviors
import * as THREE from 'three';
const TAU = Math.PI*2;

// ---- shared geometries/materials cache ----
const cache = { geo:{}, mat:{} };
function G(key, geom){ if(!cache.geo[key]) cache.geo[key]=geom; return cache.geo[key]; }
function M(key, mat){ if(!cache.mat[key]) cache.mat[key]=mat; return cache.mat[key]; }

// color helper per chapter palette
function pal(palette, key){ return new THREE.Color(palette[key]); }

// =================== builders ===================
// Each builder returns { root: THREE.Group, update(dt,t,ctx), getData(), kind, fx }
// ctx: { world, eco, isNight, fxGroup }

function makeCloud(palette){
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:1, flatShading:true, transparent:true, opacity:0.92 });
  for(let i=0;i<4;i++){
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 + Math.random()*0.2, 0), mat);
    s.position.set((Math.random()-0.5)*1.2, (Math.random()-0.5)*0.25, (Math.random()-0.5)*1.2);
    s.scale.set(1, 0.55, 1);
    root.add(s);
  }
  // hover bob
  const baseY = root.position.y;
  return {
    root, kind:'cloud', floatHeight: 2.4,
    update(dt, t, ctx){
      root.position.y = baseY + Math.sin(t*1.1 + root.userData.phase)*0.08;
      // emit rain handled by eco via list
    }
  };
}

function makeWindmill(palette){
  const root = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: pal(palette,'rock').lerp(new THREE.Color(0xffffff),0.1).getHex(), roughness:1, flatShading:true });
  // post
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.2, 6), woodMat);
  post.position.y = 0.6; post.castShadow = true;
  root.add(post);
  // hub
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.1,8), new THREE.MeshStandardMaterial({ color:0x444030, roughness:0.8 }));
  hub.rotation.x = Math.PI/2;
  hub.position.set(0, 1.05, 0.1);
  root.add(hub);
  // blades
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d0, roughness:1, flatShading:true, side:THREE.DoubleSide });
  const bladeGroup = new THREE.Group();
  bladeGroup.position.copy(hub.position);
  for(let i=0;i<4;i++){
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), bladeMat);
    blade.position.set(0.35, 0, 0);
    const wrap = new THREE.Group();
    wrap.add(blade);
    wrap.rotation.z = i*Math.PI/2;
    bladeGroup.add(wrap);
  }
  root.add(bladeGroup);
  root.userData.blades = bladeGroup;
  root.userData.windDir = new THREE.Vector3(1,0,0);
  return {
    root, kind:'windmill',
    update(dt, t, ctx){
      bladeGroup.rotation.z += dt*2.4;
    }
  };
}

function makeTree(palette){
  const root = new THREE.Group();
  const style = palette._style || 'nordic';
  // trunk
  const trunkMat = new THREE.MeshStandardMaterial({ color:0x6b4a2a, roughness:1, flatShading:true });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.5, 5), trunkMat);
  trunk.position.y = 0.25; trunk.castShadow = true;
  root.add(trunk);
  // foliage depends on style
  const leafCol = pal(palette,'grass');
  const leafMat = new THREE.MeshStandardMaterial({ color: leafCol, roughness:1, flatShading:true });
  let foliage;
  if(style==='nordic'){
    // conical pine
    foliage = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 7), leafMat);
    foliage.position.y = 0.9;
    // second cone
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 7), leafMat);
    f2.position.y = 1.3;
    const grp = new THREE.Group(); grp.add(foliage); grp.add(f2);
    foliage = grp;
  } else if(style==='cosmos'){
    foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4,0), new THREE.MeshStandardMaterial({ color: leafCol.clone().lerp(new THREE.Color(0x6080ff),0.4), roughness:0.4, flatShading:true, emissive:leafCol.clone().multiplyScalar(0.3) }));
    foliage.position.y = 0.7;
  } else if(style==='candy'){
    foliage = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshStandardMaterial({ color:0xff8ab0, roughness:0.6, flatShading:true }));
    foliage.position.y = 0.8;
  } else {
    foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), leafMat);
    foliage.position.y = 0.78;
  }
  foliage.castShadow = true;
  root.add(foliage);
  root.userData.growth = 0; // 0..1 grow-in
  root.scale.setScalar(0.4);
  return {
    root, kind:'tree',
    update(dt, t, ctx){
      if(root.userData.growth < 1){
        root.userData.growth = Math.min(1, root.userData.growth + dt*0.7);
        const s = 0.4 + 0.6*easeOut(root.userData.growth);
        root.scale.setScalar(s);
      }
      // gentle sway
      root.rotation.z = Math.sin(t*1.4 + root.userData.phase)*0.04;
    }
  };
}

function makeWater(palette){
  const root = new THREE.Group();
  const springMat = new THREE.MeshStandardMaterial({ color: pal(palette,'water'), roughness:0.3, metalness:0.0, transparent:true, opacity:0.9, flatShading:false });
  // small mound spring
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), springMat);
  mound.position.y = 0.16; mound.scale.y = 0.4;
  mound.castShadow = true;
  root.add(mound);
  // ripple ring
  const ringMat = new THREE.MeshBasicMaterial({ color: pal(palette,'water'), transparent:true, opacity:0.5, side:THREE.DoubleSide, depthWrite:false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 16), ringMat);
  ring.rotation.x = -Math.PI/2;
  ring.position.y = 0.02;
  root.add(ring);
  root.userData.ring = ring;
  return {
    root, kind:'water',
    update(dt, t, ctx){
      const s = 1 + Math.sin(t*3)*0.06;
      ring.scale.set(s,s,s);
      ring.material.opacity = 0.35 + Math.sin(t*3)*0.15;
    }
  };
}

function makeLighthouse(palette){
  const root = new THREE.Group();
  // tower
  const baseMat = new THREE.MeshStandardMaterial({ color:0xf4ecd8, roughness:0.8, flatShading:true });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.7, 8), baseMat);
  tower.position.y = 0.35; tower.castShadow = true;
  root.add(tower);
  // red band
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.2, 8), new THREE.MeshStandardMaterial({ color:0xc0402a, roughness:0.8, flatShading:true }));
  band.position.y = 0.55;
  root.add(band);
  // top
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.18, 8), new THREE.MeshStandardMaterial({ color:0x404040, roughness:0.6, flatShading:true }));
  top.position.y = 0.8;
  root.add(top);
  // lamp
  const lampMat = new THREE.MeshStandardMaterial({ color:0xffe6a0, emissive:0xffcc40, emissiveIntensity:0.0, roughness:0.4 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), lampMat);
  lamp.position.y = 0.7;
  root.add(lamp);
  // point light
  const light = new THREE.PointLight(0xffd070, 0, 4.5, 2);
  light.position.y = 0.8;
  root.add(light);
  root.userData.lamp = lamp;
  root.userData.light = light;
  return {
    root, kind:'lighthouse',
    update(dt, t, ctx){
      const lit = ctx.isNight;
      const target = lit ? 1.2 : 0.0;
      light.intensity += (target - light.intensity)*Math.min(1,dt*4);
      lampMat.emissiveIntensity += ((lit?1.4:0.05) - lampMat.emissiveIntensity)*Math.min(1,dt*4);
      if(lit) lamp.scale.setScalar(1+Math.sin(t*6)*0.08);
      else lamp.scale.setScalar(1);
    }
  };
}

function makeHouse(palette){
  const root = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color:0xf0e4cc, roughness:0.9, flatShading:true });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.4,0.5), wallMat);
  walls.position.y = 0.2; walls.castShadow = true;
  root.add(walls);
  // roof
  const roofMat = new THREE.MeshStandardMaterial({ color:0xb04030, roughness:0.8, flatShading:true });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.35, 4), roofMat);
  roof.position.y = 0.57; roof.rotation.y = Math.PI/4; roof.castShadow = true;
  root.add(roof);
  // window light
  const winMat = new THREE.MeshStandardMaterial({ color:0xfff0a0, emissive:0xffd060, emissiveIntensity:0.0 });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.12,0.12), winMat);
  win.position.set(0,0.22,0.251);
  root.add(win);
  root.userData.win = win; root.userData.winMat = winMat;
  return {
    root, kind:'house',
    update(dt,t,ctx){
      const target = ctx.isNight ? 1.2 : 0;
      winMat.emissiveIntensity += (target - winMat.emissiveIntensity)*Math.min(1,dt*4);
    }
  };
}

function makeFlower(palette){
  const root = new THREE.Group();
  const stemMat = new THREE.MeshStandardMaterial({ color:0x4ca050, roughness:1, flatShading:true });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.22,4), stemMat);
  stem.position.y = 0.11;
  root.add(stem);
  const colors = [0xff7ab0,0xffd060,0x7ab0ff,0xff8a4a,0xc060ff];
  const col = colors[Math.floor(Math.random()*colors.length)];
  const petalMat = new THREE.MeshStandardMaterial({ color:col, roughness:0.6, flatShading:true });
  const petal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1,0), petalMat);
  petal.position.y = 0.24; petal.scale.y = 0.5;
  root.add(petal);
  root.userData.growth = 0;
  root.scale.setScalar(0.3);
  return {
    root, kind:'flower',
    update(dt,t,ctx){
      if(root.userData.growth<1){
        root.userData.growth = Math.min(1, root.userData.growth + dt*1.0);
        root.scale.setScalar(0.3 + 0.7*easeOut(root.userData.growth));
      }
    }
  };
}

function makeRock(palette){
  const root = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: pal(palette,'rock'), roughness:1, flatShading:true });
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), rockMat);
  rock.position.y = 0.12; rock.rotation.set(Math.random(),Math.random(),Math.random());
  rock.castShadow = true; rock.receiveShadow = true;
  root.add(rock);
  return { root, kind:'rock', update(){} };
}

const BUILDERS = {
  cloud: makeCloud, windmill: makeWindmill, tree: makeTree, water: makeWater,
  lighthouse: makeLighthouse, house: makeHouse, flower: makeFlower, rock: makeRock
};

function easeOut(x){ return 1 - Math.pow(1-x, 3); }

export function createObject(kind, palette){
  const b = BUILDERS[kind];
  if(!b) return null;
  const obj = b(palette);
  obj.root.userData.kind = kind;
  obj.root.userData.phase = Math.random()*TAU;
  return obj;
}

// small in-world icons for tray preview (svg strings)
export const KIND_ICON = {
  cloud:`<svg viewBox="0 0 36 36"><path d="M9 24c-3 0-5-2-5-5s2-5 5-5c0-3 3-5 6-5s5 2 6 4c1-1 2-2 4-2 3 0 5 2 5 5 2 0 4 2 4 4s-2 4-4 4H9z" fill="currentColor"/></svg>`,
  windmill:`<svg viewBox="0 0 36 36"><path d="M18 20l-2 8h4l-2-8M18 16L10 8M18 16l8-8M18 16l8 8M18 16l-8 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="18" cy="16" r="2.4" fill="currentColor"/></svg>`,
  tree:`<svg viewBox="0 0 36 36"><path d="M18 30v-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M18 4l8 12H10zM18 12l6 10H12z" fill="currentColor"/></svg>`,
  water:`<svg viewBox="0 0 36 36"><path d="M18 6c5 6 9 10 9 15a9 9 0 01-18 0c0-5 4-9 9-15z" fill="currentColor"/></svg>`,
  lighthouse:`<svg viewBox="0 0 36 36"><path d="M14 30l3-20h2l3 20z" fill="currentColor"/><circle cx="18" cy="9" r="3" fill="currentColor"/><path d="M18 9l8-3M18 9l8 3" stroke="currentColor" stroke-width="1.6"/></svg>`,
  house:`<svg viewBox="0 0 36 36"><path d="M6 18L18 8l12 10v2H6z" fill="currentColor"/><path d="M10 20v10h16V20" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  flower:`<svg viewBox="0 0 36 36"><circle cx="18" cy="10" r="4" fill="currentColor"/><circle cx="11" cy="14" r="3.4" fill="currentColor"/><circle cx="25" cy="14" r="3.4" fill="currentColor"/><circle cx="14" cy="20" r="3" fill="currentColor"/><circle cx="22" cy="20" r="3" fill="currentColor"/><path d="M18 24v6" stroke="currentColor" stroke-width="2"/></svg>`,
  rock:`<svg viewBox="0 0 36 36"><path d="M6 26l6-14 8-4 8 6 4 12-6 4H10z" fill="currentColor"/></svg>`,
};
