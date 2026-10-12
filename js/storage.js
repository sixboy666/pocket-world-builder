// storage.js — save/load progress & free-build layouts
const KEY = 'pwb.save.v1';

const DEFAULT = {
  completed: {},        // levelId -> {stars, best}
  unlocked: { 'n-1': true },
  tutorialSeen: {},
  settings: { music: true, sfx: true, quality: 'auto' },
  freeLayouts: {}      // chapter -> [{objects:[...]}]
};

let cache = null;

export function load(){
  try{
    const raw = localStorage.getItem(KEY);
    cache = raw ? Object.assign(structuredClone(DEFAULT), JSON.parse(raw)) : structuredClone(DEFAULT);
    if(!cache.completed) cache.completed = {};
    if(!cache.unlocked) cache.unlocked = { 'n-1': true };
    if(!cache.tutorialSeen) cache.tutorialSeen = {};
    if(!cache.settings) cache.settings = DEFAULT.settings;
    if(!cache.freeLayouts) cache.freeLayouts = {};
  }catch(e){
    cache = structuredClone(DEFAULT);
  }
  return cache;
}

export function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(cache)); }catch(e){}
}

export function get(){ return cache || load(); }

export function completeLevel(id, stars){
  const c = get();
  const prev = c.completed[id];
  if(!prev || stars > prev.stars){
    c.completed[id] = { stars, best: stars };
  }
  save();
}

export function isUnlocked(id){ return !!get().unlocked[id]; }

export function unlock(id){
  const c = get();
  c.unlocked[id] = true;
  save();
}

export function totalCompleted(){
  const c = get();
  return Object.keys(c.completed).length;
}

export function markTutorial(id){
  const c = get();
  c.tutorialSeen[id] = true;
  save();
}

export function sawTutorial(id){ return !!get().tutorialSeen[id]; }

export function setSetting(k, v){
  const c = get();
  c.settings[k] = v;
  save();
}

export function saveFreeLayout(chapter, layout){
  const c = get();
  if(!c.freeLayouts[chapter]) c.freeLayouts[chapter] = [];
  c.freeLayouts[chapter].push(layout);
  save();
}
