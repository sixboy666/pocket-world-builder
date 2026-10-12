// main.js — entry point, game loop, state machine
import * as THREE from 'three';
import { World } from './world.js';
import { Ecosystem } from './ecosystem.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { createObject } from './objects.js';
import { CHAPTERS, LEVELS, levelById, nextLevelAfter, getChapter } from './levels.js';
import * as store from './storage.js';

const TOUCH = matchMedia('(pointer: coarse)').matches;
const FLAT_SCREENS = new Set(['loading','menu','levels','settings']);
const TWO_PI = Math.PI*2;

const TUTORIALS = {
  'drag-tree': { emoji:'🌳', title:'Place Your First Tree', body:'Drag objects from the bottom tray onto the grass. Trees grow and attract birds.' },
  'rain':      { emoji:'☁️', title:'Make It Rain', body:'Clouds float above the island and drop rain onto the ground below them.' },
  'animals':   { emoji:'🐦', title:'Welcome Wildlife', body:'Place trees near water and creatures will appear. Each kind of animal counts toward your goal.' },
  'night':     { emoji:'🌙', title:'Light the Night', body:'Tap the moon icon to switch day and night. Lanterns and cottages glow after dark.' },
  'flow':      { emoji:'💧', title:'Guide the Stream', body:'Place water springs uphill so streams flow down to the bay. Use boulders to shape the path.' },
};

class Game {
  constructor(){
    this.canvas = document.getElementById('webgl');
    this.renderer = new THREE.WebGLRenderer({ canvas:this.canvas, antialias:!TOUCH, powerPreference:'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH?1.5:2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 200);

    this.world = new World(this.scene, this.renderer);
    this.eco = new Ecosystem(this.world);
    this.input = new Input(this.canvas, this.camera, this.world);
    this.ui = new UI();

    this.state = 'loading';     // loading|menu|levels|play|pause|result|freebuild
    this.currentLevel = null;
    this.currentChapter = null;
    this.budget = {};
    this.used = {};
    this.activeKind = null;
    this.placedObjects = [];    // {kind, root, obj, pos}
    this.completed = false;
    this.lastTime = 0;
    this.needsFrame = true;     // render at least one frame
    this.frameEMA = 16.7;
    this.maxDPR = TOUCH ? 1.5 : 2;
    this.lastAdjust = 0;
    this.resultTimers = [];

    this._bindUI();
    this._bindInput();
    this._setupResize();
    this._setupQuality();

    this.ui.showScreen('loading');
    this._init();
  }

  _bindUI(){
    const ui = this.ui;
    ui.onPlay = () => this._goLevels(false);
    ui.onFreeBuild = () => this._goLevels(true);
    ui.onSettings = () => ui.showSettings();
    ui.onSettingsClose = () => ui.hideSettings();
    ui.onLevelPick = (lv) => this._startLevel(lv);
    ui.onFreeChapterPick = (ch) => this._startFreeBuild(ch);
    ui.onTrayPick = (kind) => this._pickKind(kind);
    ui.onMenu = () => this._pause();
    ui.onResume = () => this._resume();
    ui.onRestart = () => this._restart();
    ui.onExit = () => this._exitToMenu();
    ui.onReset = () => this._restart();
    ui.onRotateLeft = () => this.input.rotate(-0.3);
    ui.onRotateRight = () => this.input.rotate(0.3);
    ui.onDayNight = () => { this.world.toggleDayNight(); };
    ui.onResultReplay = () => { ui.hideResult(); this._restart(); };
    ui.onResultNext = () => { ui.hideResult(); const n = nextLevelAfter(this.currentLevel.id); if(n) this._startLevel(n); else this._exitToMenu(); };
    ui.onResultMenu = () => { ui.hideResult(); this._exitToMenu(); };
    ui.onTutOk = () => { ui.hideTutorial(); if(this.currentLevel) store.markTutorial(this.currentLevel.id); };
  }

  _bindInput(){
    this.input.onPlace = (kind, point) => this._placeObject(kind, point);
    this.input.onOrbit = () => { this.needsFrame = true; };
  }

  _setupResize(){
    const onR = () => {
      this.renderer.setSize(innerWidth, innerHeight, false);
      this.camera.aspect = innerWidth/innerHeight;
      this.camera.updateProjectionMatrix();
      this.needsFrame = true;
    };
    addEventListener('resize', onR);
    onR();
  }

  _setupQuality(){
    document.addEventListener('quality-change', (e) => this._applyQuality(e.detail));
    addEventListener('visibilitychange', () => { if(!document.hidden) this.needsFrame = true; });
  }

  _applyQuality(q){
    const s = store.get().settings;
    let tier = q || s.quality || 'auto';
    if(tier === 'auto') tier = TOUCH ? 'low' : 'high';
    if(tier === 'high'){
      this.maxDPR = 2;
      this.renderer.shadowMap.enabled = true;
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.maxDPR));
    } else {
      this.maxDPR = 1;
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1);
    }
    this.needsFrame = true;
  }

  async _init(){
    store.load();
    this._applyQuality();
    // fake loading progress while three initializes
    const steps = ['Waking the tiny world...','Carving the island...','Mixing the paints...','Nearly there...'];
    for(let i=0;i<steps.length;i++){
      this.ui.setLoadingProgress((i+1)/steps.length, steps[i]);
      await this._wait(180);
    }
    this.renderer.compile(this.scene, this.camera);
    this.ui.refreshMenuProgress(LEVELS.length);
    this.ui.bind();
    this._goMenu();
    this._loop(0);
  }

  _wait(ms){ return new Promise(r => setTimeout(r, ms)); }

  _goMenu(){
    this.state = 'menu';
    this.ui.showScreen('menu');
    this.ui.refreshMenuProgress(LEVELS.length);
    this.needsFrame = true;
  }

  _goLevels(freeBuild){
    this.state = 'levels';
    this._freeBuild = freeBuild;
    this.ui.renderLevelSelect(freeBuild);
    this.ui.showScreen('levels');
    this.needsFrame = true;
  }

  _startLevel(lv){
    this.currentLevel = lv;
    this.currentChapter = getChapter(lv.chapter);
    this._beginLevel();
  }

  _startFreeBuild(ch){
    this.currentLevel = { id: ch.id+'-free', chapter: ch.id, name:'Free Build', budget:{}, goal:{type:'freebuild'} };
    this.currentChapter = ch;
    this._beginLevel(true);
  }

  _beginLevel(freeBuild){
    const lv = this.currentLevel;
    const ch = this.currentChapter;
    // load world for chapter
    this.world.loadLevel(ch, lv);
    this.eco.reset();

    // reset camera
    this.input.resetView();

    // budget
    this.budget = freeBuild ? { tree:99, cloud:99, windmill:99, water:99, lighthouse:99, house:99, flower:99, rock:99 }
                            : Object.assign({}, lv.budget);
    this.used = {};
    this.activeKind = null;
    this.input.cancelPlacing();
    this.placedObjects = [];
    this.completed = false;
    this.state = 'play';

    // goal text
    const g = lv.goal || {};
    let goalText;
    if(g.type === 'plants') goalText = `Grow ${g.n} plants`;
    else if(g.type === 'rain') goalText = `Make it rain in ${g.n} spot${g.n>1?'s':''}`;
    else if(g.type === 'waterflow') goalText = `Fill the bay with water`;
    else if(g.type === 'light') goalText = `Light ${g.n} lanterns at night`;
    else if(g.type === 'animals') goalText = `Attract ${g.n} kinds of creature`;
    else goalText = 'Build freely';
    this.ui.setGoal(goalText);

    // tray + hint
    this.ui.showScreen('hud');
    this.ui.renderTray(this.budget, this.used, null);
    if(lv.hint && !freeBuild) this.ui.showHint(lv.hint); else this.ui.hideHint();

    // tutorial
    if(!freeBuild && lv.tutorial && !store.sawTutorial(lv.id)){
      const t = TUTORIALS[lv.tutorial];
      if(t) this.ui.showTutorial(t.emoji, t.title, t.body);
    }
    this._updateGoalProgress();
    this.needsFrame = true;
  }

  _pickKind(kind){
    if(this.used[kind] >= this.budget[kind]) return;
    if(this.activeKind === kind){
      // toggle off
      this.activeKind = null;
      this.input.cancelPlacing();
    } else {
      this.activeKind = kind;
      this.input.startPlacing(kind);
    }
    this.ui.renderTray(this.budget, this.used, this.activeKind);
    this.needsFrame = true;
  }

  _placeObject(kind, point){
    if(this.state !== 'play' && this.state !== 'freebuild') return false;
    if(this.used[kind] >= this.budget[kind]) return false;
    // snap: ensure position on island surface
    const p = point.clone();
    // prevent overlap with existing placements (min distance 0.4)
    for(const o of this.placedObjects){
      if(o.pos.distanceTo(p) < 0.45){
        this.ui.showHint('Too close to another object');
        setTimeout(()=>this.ui.hideHint(), 1200);
        return false;
      }
    }
    const obj = createObject(kind, this.currentChapter.palette);
    if(!obj) return false;
    obj.root.position.copy(p);
    // for cloud, hover above
    if(kind === 'cloud'){
      obj.root.position.y = p.y + 2.4;
    } else {
      obj.root.position.y = p.y;
    }
    obj.root.rotation.y = Math.random()*TWO_PI;
    this.world.decorGroup.add(obj.root);
    this.placedObjects.push({ kind, root: obj.root, obj, pos: p.clone() });
    this.used[kind] = (this.used[kind]||0) + 1;
    this.eco.register(obj, p.clone());
    this.ui.renderTray(this.budget, this.used, this.activeKind);
    this._updateGoalProgress();
    this._checkComplete();
    this.needsFrame = true;
    return true;
  }

  _updateGoalProgress(){
    const g = this.currentLevel.goal || {};
    const isNight = this.world.night;
    let cur = 0, target = 1, counts = '';
    if(g.type === 'plants'){ cur = this.eco.countPlants(); target = g.n; counts = `<b>${cur}</b>/${target} plants`; }
    else if(g.type === 'rain'){ cur = this.eco.countRaining(); target = g.n; counts = `<b>${cur}</b>/${target} rain clouds`; }
    else if(g.type === 'waterflow'){ cur = this.eco.waterReachedBay() ? 1 : 0; target = 1; counts = this.eco.waterReachedBay() ? '<b>Bay filled</b>' : '<b>0</b>/1 bay'; }
    else if(g.type === 'light'){ cur = this.eco.countLightsLit(isNight); target = g.n; counts = `<b>${cur}</b>/${target} lit (needs night)`; }
    else if(g.type === 'animals'){ cur = this.eco.countAnimals(); target = g.n; counts = `<b>${cur}</b>/${target} species`; }
    else if(g.type === 'freebuild'){ cur = 0; target = 0; counts = 'Free build mode'; }
    const p = target > 0 ? Math.min(1, cur/target) : 0;
    this.ui.setGoalProgress(p, counts);
  }

  _checkComplete(){
    if(this.completed) return;
    const g = this.currentLevel.goal || {};
    const isNight = this.world.night;
    let done = false;
    if(g.type === 'plants') done = this.eco.countPlants() >= g.n;
    else if(g.type === 'rain') done = this.eco.countRaining() >= g.n;
    else if(g.type === 'waterflow') done = this.eco.waterReachedBay();
    else if(g.type === 'light') done = isNight && this.eco.countLightsLit(isNight) >= g.n;
    else if(g.type === 'animals') done = this.eco.countAnimals() >= g.n;
    else if(g.type === 'freebuild') done = false;
    if(done){
      this.completed = true;
      setTimeout(() => this._finish(), 900);
    }
  }

  _finish(){
    if(this.currentLevel.goal && this.currentLevel.goal.type === 'freebuild'){
      this._exitToMenu();
      return;
    }
    // compute stars: 3 if under budget, 2 if used all, 1 always
    const totalBudget = Object.values(this.budget).reduce((a,b)=>a+b,0);
    const totalUsed = Object.values(this.used).reduce((a,b)=>a+b,0);
    let stars = 1;
    if(totalUsed <= totalBudget * 0.6) stars = 3;
    else if(totalUsed <= totalBudget) stars = 2;
    store.completeLevel(this.currentLevel.id, stars);
    // unlock next
    const next = nextLevelAfter(this.currentLevel.id);
    if(next) store.unlock(next.id);
    const rewards = this._rewardsFor(this.currentLevel);
    const hasNext = !!next;
    this.ui.showResult(stars, 'WORLD GROWN!', `You grew ${this.currentLevel.name}.`, rewards, hasNext);
    this.state = 'result';
  }

  _rewardsFor(lv){
    const idx = LEVELS.findIndex(l => l.id === lv.id);
    const r = [];
    if((idx+1) % 3 === 0) r.push('New chapter unlocked');
    if(idx === 0) r.push('Clouds unlocked');
    if(idx === 2) r.push('Wildlife discovered');
    if(idx === 4) r.push('Night mode');
    if(r.length === 0) r.push('New decorations');
    return r;
  }

  _pause(){
    if(this.state !== 'play') return;
    this.state = 'pause';
    this.ui.showPause();
    this.needsFrame = true;
  }
  _resume(){
    this.state = 'play';
    this.ui.hidePause();
    this.needsFrame = true;
  }
  _restart(){
    this.ui.hidePause();
    this.ui.hideResult();
    this._clearResultTimers();
    this._beginLevel(this.currentLevel.goal && this.currentLevel.goal.type === 'freebuild');
  }
  _exitToMenu(){
    this.state = 'menu';
    this.ui.hidePause();
    this.ui.hideResult();
    this._clearResultTimers();
    this.ui.showScreen('menu');
    this.ui.refreshMenuProgress(LEVELS.length);
    this.world.clearLevel();
    this.eco.reset();
    this.placedObjects = [];
    this.needsFrame = true;
  }

  _clearResultTimers(){
    this.resultTimers.forEach(t => clearTimeout(t));
    this.resultTimers = [];
  }

  _tuneResolution(now, dt){
    if(this.frameEMA > 21 && now - this.lastAdjust > 500){
      const cur = this.renderer.getPixelRatio();
      const next = Math.max(0.5, cur - 0.12);
      if(next !== cur){ this.renderer.setPixelRatio(next); this.lastAdjust = now; }
    } else if(this.frameEMA < 15.5 && now - this.lastAdjust > 800){
      const cur = this.renderer.getPixelRatio();
      const next = Math.min(this.maxDPR, cur + 0.12);
      if(next !== cur){ this.renderer.setPixelRatio(next); this.lastAdjust = now; }
    }
  }

  _loop(t){
    requestAnimationFrame(this._loop.bind(this));
    const dt = Math.min(0.05, (t - this.lastTime)/1000 || 0.016);
    this.lastTime = t;

    // measure frame
    const frameStart = performance.now();

    const isFlat = FLAT_SCREENS.has(this.state) || this.state === 'loading' || this.state === 'menu' || this.state === 'levels' || this.state === 'pause' || this.state === 'result';

    if(!isFlat || this.needsFrame){
      const tt = t * 0.001;
      if(this.state === 'play' || this.state === 'freebuild' || this.state === 'pause' || this.state === 'result'){
        this.world.update(dt, tt);
        if(this.state === 'play' || this.state === 'freebuild'){
          this.eco.update(dt, tt, this.world.night);
          this._updateGoalProgress();
          this._checkComplete();
        }
      }
      this.input._applyCamera();
      this.renderer.render(this.scene, this.camera);
      this.needsFrame = false;
    }

    const frameDur = performance.now() - frameStart;
    this.frameEMA = this.frameEMA*0.9 + frameDur*0.1;
    if(this.state === 'play') this._tuneResolution(t, frameDur);
  }
}

// boot
const game = new Game();
window.__game = game;
