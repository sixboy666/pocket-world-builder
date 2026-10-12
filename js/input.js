// input.js — camera orbit, pinch zoom, drag-drop object placement
import * as THREE from 'three';

const TWO_PI = Math.PI*2;

export class Input {
  constructor(canvas, camera, world){
    this.canvas = canvas;
    this.camera = camera;
    this.world = world;

    // orbit state
    this.azimuth = 0.6;       // around Y
    this.polar = 0.95;        // from vertical
    this.distance = 14;
    this.minDist = 9; this.maxDist = 22;
    this.minPolar = 0.45; this.maxPolar = 1.3;
    this.target = new THREE.Vector3(0, 0.5, 0);

    // gesture state
    this.pointers = new Map();   // id -> {x,y,startX,startY}
    this.lastPinchDist = 0;
    this.dragging = null;        // {mode:'orbit'|'place', id, startX, startY, kind}

    // placement state
    this.placing = null;         // {kind} when user picked from tray
    this.previewMesh = null;
    this.previewValid = false;
    this.onPlace = null;         // callback(kind, point) -> bool success
    this.onOrbit = null;

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._tmp = new THREE.Vector3();

    this._bind();
  }

  _bind(){
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this._onDown(e), { passive:false });
    window.addEventListener('pointermove', e => this._onMove(e), { passive:false });
    window.addEventListener('pointerup', e => this._onUp(e), { passive:false });
    window.addEventListener('pointercancel', e => this._onUp(e), { passive:false });
    c.addEventListener('wheel', e => this._onWheel(e), { passive:false });
  }

  startPlacing(kind){
    this.placing = { kind };
    this._updatePreview(true);
  }

  cancelPlacing(){
    this.placing = null;
    if(this.previewMesh){ this.world.scene.remove(this.previewMesh); this.previewMesh = null; }
  }

  _updatePreview(show){
    if(!this.placing){ return; }
    // Preview will be created by main.js via createObject; here we just position a ghost
    // We use a simple sphere indicator + a ground ring
    if(!this.previewMesh && show){
      const mat = new THREE.MeshBasicMaterial({ color:0x5fd0ff, transparent:true, opacity:0.45, depthWrite:false, depthTest:true, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 });
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), mat);
      m.visible = false;
      // ground ring for clearer placement indicator
      const ringMat = new THREE.MeshBasicMaterial({ color:0x5fd0ff, transparent:true, opacity:0.6, depthWrite:false, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3,0.36,24), ringMat);
      ring.rotation.x = -Math.PI/2;
      ring.position.y = 0.02;
      m.add(ring);
      this.world.scene.add(m);
      this.previewMesh = m;
    }
  }

  _setNDC(e){
    const r = this.canvas.getBoundingClientRect();
    this._ndc.x = ((e.clientX - r.left)/r.width)*2 - 1;
    this._ndc.y = -((e.clientY - r.top)/r.height)*2 + 1;
  }

  _raySurface(){
    this._raycaster.setFromCamera(this._ndc, this.camera);
    return this.world.surfacePointFromRay(this._raycaster);
  }

  _onDown(e){
    e.preventDefault();
    if(e.target !== this.canvas){
      // touches starting on UI (tray buttons handle themselves)
      return;
    }
    this.pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
    (e.target).setPointerCapture && (e.target).setPointerCapture(e.pointerId);

    if(this.pointers.size === 1){
      this.dragging = {
        id: e.pointerId,
        startX: e.clientX, startY: e.clientY,
        mode: this.placing ? 'place' : 'orbit',
        lastX: e.clientX, lastY: e.clientY,
        moved: false,
        kind: this.placing ? this.placing.kind : null,
      };
    } else if(this.pointers.size === 2){
      // begin pinch
      this.dragging = null;
      const pts = [...this.pointers.values()];
      this.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  }

  _onMove(e){
    if(!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
    e.preventDefault();

    if(this.pointers.size === 2){
      // pinch zoom
      const pts = [...this.pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if(this.lastPinchDist){
        const ratio = this.lastPinchDist / d;
        this.distance = Math.max(this.minDist, Math.min(this.maxDist, this.distance * ratio));
      }
      this.lastPinchDist = d;
      this._applyCamera();
      return;
    }

    if(!this.dragging) return;
    const dx = e.clientX - this.dragging.lastX;
    const dy = e.clientY - this.dragging.lastY;
    this.dragging.lastX = e.clientX; this.dragging.lastY = e.clientY;
    if(Math.abs(e.clientX - this.dragging.startX) + Math.abs(e.clientY - this.dragging.startY) > 6) this.dragging.moved = true;

    if(this.dragging.mode === 'orbit'){
      this.azimuth -= dx * 0.005;
      this.polar = Math.max(this.minPolar, Math.min(this.maxPolar, this.polar - dy * 0.005));
      this._applyCamera();
    } else if(this.dragging.mode === 'place'){
      // update preview position
      this._setNDC(e);
      const hit = this._raySurface();
      if(this.previewMesh){
        if(hit){
          this.previewMesh.position.copy(hit);
          this.previewMesh.position.y += 0.1;
          this.previewMesh.visible = true;
          this.previewValid = true;
          this.previewMesh.material.color.setHex(0x7af6a0);
        } else {
          this.previewMesh.visible = false;
          this.previewValid = false;
        }
      }
    }
  }

  _onUp(e){
    if(!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);

    if(this.dragging && this.dragging.id === e.pointerId){
      if(this.dragging.mode === 'place'){
        // try to place at current position
        this._setNDC(e);
        const hit = this._raySurface();
        if(hit && this.onPlace){
          const ok = this.onPlace(this.dragging.kind, hit);
          if(ok){
            this.cancelPlacing();
          }
        }
      }
      this.dragging = null;
    }
    if(this.pointers.size === 1){
      // resume orbit with remaining pointer
      const [id, p] = [...this.pointers.entries()][0];
      this.dragging = { id, startX:p.x, startY:p.y, lastX:p.x, lastY:p.y, mode:'orbit', moved:false };
      this.lastPinchDist = 0;
    } else if(this.pointers.size === 0){
      this.lastPinchDist = 0;
    }
  }

  _onWheel(e){
    e.preventDefault();
    const f = Math.exp(e.deltaY * 0.001);
    this.distance = Math.max(this.minDist, Math.min(this.maxDist, this.distance * f));
    this._applyCamera();
  }

  _applyCamera(){
    const x = this.target.x + Math.sin(this.azimuth) * Math.sin(this.polar) * this.distance;
    const z = this.target.z + Math.cos(this.azimuth) * Math.sin(this.polar) * this.distance;
    const y = this.target.y + Math.cos(this.polar) * this.distance;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
    if(this.onOrbit) this.onOrbit();
  }

  resetView(){
    this.azimuth = 0.6; this.polar = 0.95; this.distance = 14;
    this._applyCamera();
  }

  rotate(delta){
    this.azimuth += delta;
    this._applyCamera();
  }

  dispose(){
    this.cancelPlacing();
  }
}
