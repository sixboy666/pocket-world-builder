// levels.js — chapter + level data

// Object kinds placeable in the world.
// Each kind: id, name, icon (svg), max per level (default), color for tray chip
export const KINDS = {
  cloud:     { id:'cloud',     name:'Cloud',     color:'#cfe6ff' },
  windmill:  { id:'windmill',  name:'Windmill',  color:'#ffd9a3' },
  tree:      { id:'tree',      name:'Tree',      color:'#9fe6a8' },
  water:     { id:'water',     name:'Spring',    color:'#7ad0ff' },
  lighthouse:{ id:'lighthouse', name:'Lantern',  color:'#ffe08a' },
  house:     { id:'house',      name:'Cottage',   color:'#ffb0a0' },
  flower:    { id:'flower',     name:'Bloom',     color:'#ff9ed0' },
  rock:      { id:'rock',       name:'Boulder',   color:'#c0c4cc' },
};

export const CHAPTERS = [
  {
    id:'nordic',
    name:'NORDIC ISLE',
    theme:'Snow-capped pines and cozy wooden cottages.',
    palette:{ ground:'#dfe7ef', grass:'#9fc7a0', rock:'#8b93a3', water:'#7fc4ee', sky:'#9fb8d8', fog:'#d4e0ee' },
    style:'nordic',
  },
  {
    id:'paper',
    name:'PAPER MEADOW',
    theme:'Bright cut-paper hills in cheerful colors.',
    palette:{ ground:'#ffd98a', grass:'#8fe89a', rock:'#c8a0c8', water:'#6fc6ff', sky:'#a0e0ff', fog:'#fff4d6' },
    style:'paper',
  },
  {
    id:'glass',
    name:'CRYSTAL REEF',
    theme:'A transparent world of glass and light.',
    palette:{ ground:'#bfeaff', grass:'#9fe0ff', rock:'#8fd0ff', water:'#5fb8ff', sky:'#1a2c5a', fog:'#0a1838' },
    style:'glass',
  },
  {
    id:'zen',
    name:'ZEN GARDEN',
    theme:'Quiet stones, sakura petals, lantern light.',
    palette:{ ground:'#e8dcc0', grass:'#a8c89a', rock:'#9a8e7a', water:'#7fc4d8', sky:'#f0c4d0', fog:'#f4e0d0' },
    style:'zen',
  },
  {
    id:'cosmos',
    name:'STAR ISLE',
    theme:'A floating rock among glowing constellations.',
    palette:{ ground:'#1a2444', grass:'#2a3c6a', rock:'#3a4870', water:'#4060a8', sky:'#070a18', fog:'#0a1228' },
    style:'cosmos',
  },
  {
    id:'clock',
    name:'CLOCKWORK KEY',
    theme:'Brass gears, steam pipes, mechanical wonder.',
    palette:{ ground:'#3a2c1a', grass:'#5a4828', rock:'#6a5838', water:'#5fb0c4', sky:'#2a1c10', fog:'#3a2c1a' },
    style:'clock',
  },
  {
    id:'candy',
    name:'CANDY COVE',
    theme:'Pastel sweets, lollipop trees and frosting shores.',
    palette:{ ground:'#ffe0ea', grass:'#ffc4d8', rock:'#c8a0d8', water:'#9fd8ff', sky:'#c0e8ff', fog:'#fff0f6' },
    style:'candy',
  },
];

// Goal types:
//   'animals'   -> need N distinct creatures spawned
//   'rain'      -> make it rain in K zones
//   'waterflow' -> water must reach the bay (low point)
//   'light'     -> N lights lit at night
//   'plants'    -> grow N plants/trees
//   'freebuild' -> no goal; sandbox
export const LEVELS = [
  // ---- NORDIC ----
  { id:'n-1', chapter:'nordic', name:'First Snow', tutorial:'drag-tree',
    budget:{ tree:3, cloud:1 }, goal:{ type:'plants', n:3 },
    hint:'Drag trees onto the grass.' },
  { id:'n-2', chapter:'nordic', name:'Rainfall', tutorial:'rain',
    budget:{ cloud:2, tree:2 }, goal:{ type:'rain', n:2 },
    hint:'Clouds drop rain where they float.' },
  { id:'n-3', chapter:'nordic', name:'Wildlife', tutorial:'animals',
    budget:{ tree:3, water:1, cloud:1 }, goal:{ type:'animals', n:3 },
    hint:'Trees + water attract creatures.' },
  { id:'n-4', chapter:'nordic', name:'Lantern Night', tutorial:'night',
    budget:{ lighthouse:3, tree:2, cloud:1 }, goal:{ type:'light', n:3 },
    hint:'Tap the moon to bring night; lanterns glow.' },
  { id:'n-5', chapter:'nordic', name:'Bay Stream', tutorial:'flow',
    budget:{ water:2, rock:2, tree:1 }, goal:{ type:'waterflow', n:1 },
    hint:'Place springs uphill; rocks guide the flow.' },

  // ---- PAPER ----
  { id:'p-1', chapter:'paper', name:'Paper Bloom', budget:{ flower:4, tree:2 }, goal:{ type:'plants', n:6 } },
  { id:'p-2', chapter:'paper', name:'Paper Rain', budget:{ cloud:3, flower:3 }, goal:{ type:'rain', n:3 } },
  { id:'p-3', chapter:'paper', name:'Origami Birds', budget:{ tree:3, flower:2, water:1 }, goal:{ type:'animals', n:4 } },

  // ---- GLASS ----
  { id:'g-1', chapter:'glass', name:'Glass Garden', budget:{ tree:3, flower:2, water:1 }, goal:{ type:'plants', n:5 } },
  { id:'g-2', chapter:'glass', name:'Crystal Rain', budget:{ cloud:2, tree:2, water:2 }, goal:{ type:'waterflow', n:1 } },
  { id:'g-3', chapter:'glass', name:'Prism Lights', budget:{ lighthouse:3, tree:2, water:1 }, goal:{ type:'light', n:3 } },

  // ---- ZEN ----
  { id:'z-1', chapter:'zen', name:'Stone Garden', budget:{ rock:4, tree:2 }, goal:{ type:'plants', n:2 } },
  { id:'z-2', chapter:'zen', name:'Koi Pond', budget:{ water:2, rock:2, flower:2 }, goal:{ type:'animals', n:3 } },
  { id:'z-3', chapter:'zen', name:'Lantern Walk', budget:{ lighthouse:4, tree:2, water:1 }, goal:{ type:'light', n:4 } },

  // ---- COSMOS ----
  { id:'c-1', chapter:'cosmos', name:'Star Trees', budget:{ tree:3, lighthouse:2 }, goal:{ type:'plants', n:3 } },
  { id:'c-2', chapter:'cosmos', name:'Nebula Rain', budget:{ cloud:3, lighthouse:2, tree:2 }, goal:{ type:'rain', n:3 } },
  { id:'c-3', chapter:'cosmos', name:'Cosmic Life', budget:{ tree:3, water:1, lighthouse:2, cloud:1 }, goal:{ type:'animals', n:4 } },

  // ---- CLOCKWORK ----
  { id:'k-1', chapter:'clock', name:'Gear Garden', budget:{ tree:3, windmill:1 }, goal:{ type:'plants', n:3 } },
  { id:'k-2', chapter:'clock', name:'Steam Rain', budget:{ cloud:2, windmill:1, water:2 }, goal:{ type:'waterflow', n:1 } },
  { id:'k-3', chapter:'clock', name:'Brass Lanterns', budget:{ lighthouse:3, windmill:1, tree:2 }, goal:{ type:'light', n:3 } },

  // ---- CANDY ----
  { id:'d-1', chapter:'candy', name:'Sweet Bloom', budget:{ flower:4, tree:2 }, goal:{ type:'plants', n:6 } },
  { id:'d-2', chapter:'candy', name:'Sugar Rain', budget:{ cloud:3, flower:3, tree:2 }, goal:{ type:'animals', n:4 } },
  { id:'d-3', chapter:'candy', name:'Glow Cove', budget:{ lighthouse:3, tree:2, water:1, cloud:1 }, goal:{ type:'light', n:3 } },
];

export function getChapter(id){ return CHAPTERS.find(c=>c.id===id); }
export function levelsOf(chapterId){ return LEVELS.filter(l=>l.chapter===chapterId); }
export function nextLevelAfter(id){
  const i = LEVELS.findIndex(l=>l.id===id);
  return (i>=0 && i<LEVELS.length-1) ? LEVELS[i+1] : null;
}
export function levelById(id){ return LEVELS.find(l=>l.id===id); }
