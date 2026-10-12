// ui.js — DOM UI management
import { CHAPTERS, LEVELS, levelsOf, getChapter } from './levels.js';
import { KIND_ICON } from './objects.js';
import { get, isUnlocked, totalCompleted } from './storage.js';

export class UI {
  constructor(){
    this.els = {};
    ['loading','menu','levels','hud','pause','result','settings','tutorial'].forEach(id=>{
      this.els[id] = document.getElementById(id);
    });
    this.els.loadingFill = document.getElementById('loading-fill');
    this.els.loadingTip = document.getElementById('loading-tip');
    this.els.tray = document.getElementById('tray');
    this.els.goalText = document.getElementById('goal-text');
    this.els.goalFill = document.getElementById('goal-fill');
    this.els.goalCounts = document.getElementById('goal-counts');
    this.els.hudHint = document.getElementById('hud-hint');
    this.els.chapters = document.getElementById('chapters');
    this.els.menuProgress = document.getElementById('menu-progress');
    this.els.resultStars = document.getElementById('result-stars');
    this.els.resultTitle = document.getElementById('result-title');
    this.els.resultSub = document.getElementById('result-sub');
    this.els.rewardRow = document.getElementById('reward-row');
    this.els.tutEmoji = document.getElementById('tut-emoji');
    this.els.tutTitle = document.getElementById('tut-title');
    this.els.tutBody = document.getElementById('tut-body');

    this.onTrayPick = null;       // (kind)
    this.onRotateLeft = null; this.onRotateRight = null;
    this.onReset = null; this.onMenu = null;
    this.onResume = null; this.onRestart = null; this.onExit = null;
    this.onResultReplay = null; this.onResultNext = null; this.onResultMenu = null;
    this.onDayNight = null;
    this.onPlay = null; this.onFreeBuild = null; this.onSettings = null;
    this.onLevelPick = null; this.onFreeChapterPick = null;
    this.onTutOk = null; this.onSettingsClose = null;
  }

  showScreen(name){
    Object.values(this.els).forEach(el => { if(el && el.classList && el.classList.contains('screen')) el.classList.remove('active'); });
    if(this.els[name]) this.els[name].classList.add('active');
  }

  hideLoading(){ this.els.loading.classList.remove('active'); }

  setLoadingProgress(p, tip){
    this.els.loadingFill.style.width = (p*100).toFixed(1) + '%';
    if(tip) this.els.loadingTip.textContent = tip;
  }

  bind(){
    // menu buttons
    document.getElementById('btn-play').addEventListener('click', () => this.onPlay && this.onPlay());
    document.getElementById('btn-free').addEventListener('click', () => this.onFreeBuild && this.onFreeBuild());
    document.getElementById('btn-settings').addEventListener('click', () => { this.onSettings && this.onSettings(); });
    document.getElementById('btn-settings-close').addEventListener('click', () => this.onSettingsClose && this.onSettingsClose());
    // levels back
    document.getElementById('levels-back').addEventListener('click', () => this.onExit && this.onExit());
    // hud buttons
    document.getElementById('btn-menu').addEventListener('click', () => this.onMenu && this.onMenu());
    document.getElementById('btn-daynight').addEventListener('click', () => this.onDayNight && this.onDayNight());
    document.getElementById('btn-reset').addEventListener('click', () => this.onReset && this.onReset());
    document.getElementById('btn-rotate-left').addEventListener('click', () => this.onRotateLeft && this.onRotateLeft());
    document.getElementById('btn-rotate-right').addEventListener('click', () => this.onRotateRight && this.onRotateRight());
    // pause
    document.getElementById('btn-resume').addEventListener('click', () => this.onResume && this.onResume());
    document.getElementById('btn-restart').addEventListener('click', () => this.onRestart && this.onRestart());
    document.getElementById('btn-exit').addEventListener('click', () => this.onExit && this.onExit());
    // result
    document.getElementById('btn-result-replay').addEventListener('click', () => this.onResultReplay && this.onResultReplay());
    document.getElementById('btn-result-next').addEventListener('click', () => this.onResultNext && this.onResultNext());
    document.getElementById('btn-result-menu').addEventListener('click', () => this.onResultMenu && this.onResultMenu());
    // tutorial
    document.getElementById('tut-ok').addEventListener('click', () => this.onTutOk && this.onTutOk());
    // settings
    const setMusic = document.getElementById('set-music');
    const setSfx = document.getElementById('set-sfx');
    const s = get().settings;
    setMusic.checked = s.music; setSfx.checked = s.sfx;
    setMusic.addEventListener('change', () => this._setSetting('music', setMusic.checked));
    setSfx.addEventListener('change', () => this._setSetting('sfx', setSfx.checked));
    document.querySelectorAll('#set-quality button').forEach(b=>{
      b.addEventListener('click', () => {
        document.querySelectorAll('#set-quality button').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        this._setSetting('quality', b.dataset.q);
      });
    });
    if(s.quality){
      document.querySelectorAll('#set-quality button').forEach(b=>{
        b.classList.toggle('active', b.dataset.q === s.quality);
      });
    }
  }

  _setSetting(k,v){
    import('./storage.js').then(m => {
      m.setSetting(k,v);
      if(k==='quality') document.dispatchEvent(new CustomEvent('quality-change', { detail:v }));
    });
  }

  refreshMenuProgress(totalLevels){
    const done = totalCompleted();
    this.els.menuProgress.textContent = `${done} / ${totalLevels} worlds grown`;
  }

  renderLevelSelect(freeBuild){
    const root = this.els.chapters;
    root.innerHTML = '';
    CHAPTERS.forEach(ch => {
      const wrap = document.createElement('div');
      wrap.className = 'chapter';
      const head = document.createElement('div');
      head.className = 'chapter-head';
      const nm = document.createElement('div');
      nm.innerHTML = `<div class="chapter-name">${ch.name}</div><div class="chapter-theme">${ch.theme}</div>`;
      head.appendChild(nm);
      wrap.appendChild(head);
      const grid = document.createElement('div');
      grid.className = 'chapter-levels';

      const list = freeBuild ? [ { id: ch.id+'-free', name:'FREE', chapter:ch.id, free:true } ] : levelsOf(ch.id);
      list.forEach(lv => {
        const cell = document.createElement('div');
        cell.className = 'level-cell';
        const unlocked = freeBuild ? true : isUnlocked(lv.id);
        if(!unlocked) cell.classList.add('locked');
        const data = get().completed[lv.id];
        if(data) cell.classList.add('done');
        const stars = data ? data.stars : 0;
        let starHtml = '';
        for(let i=0;i<3;i++) starHtml += `<span class="${i<stars?'on':''}"></span>`;
        cell.innerHTML = `<div class="lvl-num">${lv.free?'★':(lv.id.split('-')[1])}</div><div class="lvl-stars">${starHtml}</div>`;
        if(freeBuild){
          cell.addEventListener('click', () => this.onFreeChapterPick && this.onFreeChapterPick(ch));
        } else if(unlocked){
          cell.addEventListener('click', () => this.onLevelPick && this.onLevelPick(lv));
        }
        grid.appendChild(cell);
      });
      wrap.appendChild(grid);
      root.appendChild(wrap);
    });
  }

  setGoal(text){
    this.els.goalText.textContent = text;
  }

  setGoalProgress(p, counts){
    this.els.goalFill.style.width = Math.min(100, p*100) + '%';
    this.els.goalCounts.innerHTML = counts || '';
  }

  showHint(text){
    this.els.hudHint.textContent = text;
    this.els.hudHint.classList.add('show');
  }
  hideHint(){
    this.els.hudHint.classList.remove('show');
  }

  renderTray(budget, used, activeKind){
    const root = this.els.tray;
    root.innerHTML = '';
    const kinds = Object.keys(budget);
    kinds.forEach(kind => {
      const max = budget[kind];
      const remaining = max - (used[kind] || 0);
      const item = document.createElement('div');
      item.className = 'tray-item' + (remaining<=0 ? ' disabled' : '') + (activeKind===kind ? ' active' : '');
      item.innerHTML = `
        <div class="tray-icon" style="color:${KIND_ICON[kind] ? '#fff' : '#888'}">${KIND_ICON[kind] || ''}</div>
        <div class="tray-name">${kind.toUpperCase()}</div>
        <div class="tray-count ${remaining<=0?'zero':''}">${remaining}</div>`;
      if(remaining > 0){
        item.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.onTrayPick && this.onTrayPick(kind);
        });
      }
      root.appendChild(item);
    });
  }

  showTutorial(emoji, title, body){
    this.els.tutEmoji.textContent = emoji;
    this.els.tutTitle.textContent = title;
    this.els.tutBody.textContent = body;
    this.els.tutorial.classList.add('active');
  }
  hideTutorial(){
    this.els.tutorial.classList.remove('active');
  }

  showResult(stars, title, sub, rewards, hasNext){
    this.els.resultStars.innerHTML = '';
    for(let i=0;i<3;i++){
      const s = document.createElement('span');
      s.className = i<stars ? 'on' : '';
      s.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="currentColor"/></svg>';
      this.els.resultStars.appendChild(s);
    }
    this.els.resultTitle.textContent = title;
    this.els.resultSub.textContent = sub || '';
    this.els.rewardRow.innerHTML = '';
    (rewards || []).forEach(r => {
      const c = document.createElement('div');
      c.className = 'reward-chip';
      c.textContent = r;
      this.els.rewardRow.appendChild(c);
    });
    const next = document.getElementById('btn-result-next');
    next.style.display = hasNext ? '' : 'none';
    this.els.result.classList.add('active');
  }
  hideResult(){ this.els.result.classList.remove('active'); }
  showPause(){ this.els.pause.classList.add('active'); }
  hidePause(){ this.els.pause.classList.remove('active'); }
  showSettings(){ this.els.settings.classList.add('active'); }
  hideSettings(){ this.els.settings.classList.remove('active'); }
}
