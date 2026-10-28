/* =====================================================================
 * 《大壶街出勤局》四店经营原型 v0.6 · 界面
 * ---------------------------------------------------------------------
 * 四个屏幕：标题 → 任务（旅行社）→ 准备（挑人/道具）→ 出勤 → 结算
 * v0.1 出勤层；v0.2 加了经理层周循环（周报 / 委派 / 四店 / 疲劳 / 季末）
 * ===================================================================== */
const UI = (() => {
  const D = DATA;
  const E = Engine;
  const REPUTATION_TIP = '口碑是街坊声望：局内帮助街坊的选择会增加，冷漠或摸包等选择会减少；每趟正常结算基础 +1，A / S 评级额外 +1 / +2，完成委派额外 +2（撤退或证据驳回不加这部分）。口碑用于满足招募门槛（招募本身不扣），数值越高越容易遇到熟练 / 尖子候选人；二档情报需 10 点，挽留队员需 5 点。解雇或放走队员会 −2，跨季保留一半。';

  /* ---------------- 全局界面状态 ---------------- */
  const S = {
    screen: 'title',      
        // title / prologue / task / prep / run / result / campaign / seasonEnd / offshore / ending
    mode: 'single',      
         // single 出勤层练习 / campaign 经理层一季 / prologue 序章
    prologueScene: 0,
    prologueShown: 1,
    prologueFlip: false,
    typing: null,
    typingTimer: null,
    headlineTimer: null,
    introTimer: null,
    intro: null,
    runTutorial: false,
    sceneCurtain: null,
    liteDone: false,
    coachRaf: null,
    runCoachStep: 0,
    blind: true,      
            
      // 难度：true=标准（只给方向，默认）；false=简单（显示数值）
    taskId: null,
    intel: 0,
    cfg: null,
    run: null,
    result: null,
    // 经理层
    campaign: null,
    campaignTask: null,     // 本次要打的动态任务
    campaignRunCfg: null,   // 本次出勤的 cfg（结算疲劳用）
    campaignReward: null,   // 本次出勤写回经理层的结果
    campaignIntel: 0,      
       // 经理层这趟买的情报档位
    campaignPanel: 'agency', // 当前店铺窗口 agency/tavern/patch/boat
    seasonSummary: null,
    weekReport: null,      
        // 周结算弹窗数据
    reroll: null,      
            
      // 洗练弹窗：{ travelerId, step, options, oldIndex }
    endWeekConfirm: false,
    // 出勤中
    retreatConfirm: false,
    showRules: false,
    showSave: false,
    showChangelog: false,
    showSkipDialog: false,
    animIndex: -1,
    // 渲染时的滚动保持（重渲染不该把人弹回页顶）
    lastScreen: null,
    lastRunIndex: -1,
  };

  const SHORT = {
    time: '时', tide: '潮', crew: '态', load: '载',
    evidence: '证', gold: '金', credit: '信用', reputation: '口碑',
  };
  const LITE_WEEK1 = typeof window !== 'undefined' && !!window.__LITE_WEEK1;
  const GAUGE_ORDER = ['time', 'tide', 'crew', 'load'];
  const DIM_META = D.DIM_META;
  const DIM_ORDER = D.DIM_ORDER;

  function dimForRole(role) {
    return DIM_ORDER.find(k => DIM_META[k].role === role) || null;
  }

  function roleBadgeHTML(role) {
    const k = dimForRole(role);
    const meta = k ? DIM_META[k] : null;
    return `<span class="r-role ${k ? 'role-' + k : ''}" ${meta ? `style="--dim:${meta.color}" title="${meta.name}：${meta.role}"` : ''}>${meta ? meta.icon + ' ' : ''}${role}</span>`;
  }

  function dimChipsHTML(weights) {
    const arr = Array.isArray(weights) ? weights : [];
    if (!arr.length) return '';
    let main = 0, second = 1;
    for (let i = 1; i < 4; i++) if ((arr[i] || 0) > (arr[main] || 0)) main = i;
    for (let i = 0; i < 4; i++) {
      
      if (i !== main && (arr[i] || 0) > (arr[second] || 0)) second = i;
    }
    return `<div class="dim-chips">${DIM_ORDER.map((k, i) => {
      
      const meta = DIM_META[k];
      
      const tag = i === main ? '主攻' : (i === second ? '次攻' : '');
      
      return `<span class="dim-chip ${i === main ? 'is-main' : (i === second ? 'is-second' : '')}" style="--dim:${meta.color}">${meta.icon} ${meta.name}${tag ? `<i>${tag}</i>` : ''}</span>`;
    }).join('')}</div>`;
  }
  const itemLimit = () => (S.mode === 'campaign' && S.campaign)
    ? (isBasicItemWeek(S.campaign) ? (isWeekEightCampaign(S.campaign) ? 2 : 1) : Campaign.itemsPerRunOf(S.campaign))
    : D.CAMPAIGN.itemsPerRun;
  const FX_ORDER = ['time', 'tide', 'crew', 'load', 'evidence', 'gold', 'credit', 'reputation'];

  const $app = () => document.getElementById('app');
  const params = el => (el.dataset.i !== undefined ? parseInt(el.dataset.i, 10) : null);

  /* ---------------- 本地存档 ---------------- */
  const SAVE_PREFIX = 'dahujie_save_v1_';
  const SAVE_SLOTS = ['auto', '1', '2', '3'];
  const SAVE_LABELS = { auto: '自动存档', '1': '存档 1', '2': '存档 2', '3': '存档 3' };
  const PROLOGUE_KEY = 'dahujie_prologue_v1';
  const WEEK_BACK_KEY = 'dahujie_week_back_v1';

  function storageOK() {
    try { return typeof localStorage !== 'undefined' && !!localStorage; } catch (e) { return false; }
  }

  function serializeCampaign(c) {
    const copy = {};
    for (const k of Object.keys(c)) if (k !== 'rng') copy[k] = c[k];
    return JSON.parse(JSON.stringify(copy));
  }

  function readWeekBack() {
    if (!storageOK()) return [];
    try {
      const raw = localStorage.getItem(WEEK_BACK_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function writeWeekBack(list) {
    if (!storageOK()) return;
    try { localStorage.setItem(WEEK_BACK_KEY, JSON.stringify(list.slice(-8))); } catch (e) { /* ignore */ }
  }

  function saveWeekSnapshot(c, onlyMissing) {
    if (!storageOK() || !c) return;
    const item = { season: c.season, week: c.week, at: Date.now(), state: serializeCampaign(c) };
    const old = readWeekBack();
    if (onlyMissing && old.some(x => x.season === item.season && x.week === item.week)) return;
    const list = old.filter(x => !(x.season === item.season && x.week === item.week));
    list.push(item);
    list.sort((a, b) => (a.season - b.season) || (a.week - b.week));
    writeWeekBack(list);
  }

  function writeSave(slot, c) {
    if (!storageOK() || !c) return false;
    try {
      
      const payload = {
      
        v: 1,
      
        savedAt: Date.now(),
      
        season: c.season, week: c.week, ended: !!c.ended,
      
        meta: { gold: c.gold, credit: c.credit, reputation: c.reputation, travelers: c.travelers.length },
      
        state: serializeCampaign(c),
      
      };
      
      localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(payload));
      
      return true;
    } catch (e) { return false; }
  }

  function readSave(slot) {
    if (!storageOK()) return null;
    try {
      
      const raw = localStorage.getItem(SAVE_PREFIX + slot);
      
      if (!raw) return null;
      
      const d = JSON.parse(raw);
      
      return (d && d.state) ? d : null;
    } catch (e) { return null; }
  }

  function deleteSave(slot) {
    if (!storageOK()) return;
    try { localStorage.removeItem(SAVE_PREFIX + slot); } catch (e) { /* ignore */ }
  }

  function savePrologueCheckpoint() {
    if (!storageOK() || S.mode !== 'prologue') return;
    const scene = S.prologueScene === 4 ? 3 : (S.prologueScene || 0);
    try {
      
      localStorage.setItem(PROLOGUE_KEY, JSON.stringify({
      
        v: 1, scene, shown: 1,
      
        savedAt: Date.now(),
      
      }));
    } catch (e) { /* ignore */ }
  }

  function readPrologueCheckpoint() {
    if (!storageOK()) return null;
    try {
      
      const raw = localStorage.getItem(PROLOGUE_KEY);
      
      if (!raw) return null;
      
      const d = JSON.parse(raw);
      
      if (!d || typeof d.scene !== 'number') return null;
      
      const scene = d.scene === 4 ? 3 : Math.max(0, Math.min(5, d.scene));
      
      return { scene };
    } catch (e) { return null; }
  }

  function clearPrologueCheckpoint() {
    if (!storageOK()) return;
    try { localStorage.removeItem(PROLOGUE_KEY); } catch (e) { /* ignore */ }
  }

  function loadSave(slot) {
    const d = readSave(slot);
    if (!d) { showToast('这个存档是空的。', 'warn'); return false; }
    const c = d.state;
    c.rng = Math.random; // 存档不保存函数
    c.fixedShown = c.fixedShown || [];
    c.pendingRaises = c.pendingRaises || [];
    c.pendingTransfers = c.pendingTransfers || [];
    if (c.slotProgressionVersion !== 1) {
      
      const newLimit = Campaign.slotsPerWeekOf(c);
      
      const oldLimit = newLimit + (c.season === 1 && c.week <= 2 ? D.CAMPAIGN.slotsPerWeek - c.week : 0);
      
      const previouslyUsed = Math.max(0, oldLimit - (Number.isFinite(c.slotsLeft) ? c.slotsLeft : oldLimit));
      
      c.slotsLeft = Math.max(0, newLimit - previouslyUsed);
      
      c.slotProgressionVersion = 1;
    } else {
      
      c.slotsLeft = Math.min(
      
        Number.isFinite(c.slotsLeft) ? c.slotsLeft : Campaign.slotsPerWeekOf(c),
      
        Campaign.slotsPerWeekOf(c)
      
      );
    }
    c.profile = c.profile || {
      
      career: c.career || Campaign.defaultCareer(),
      
      unlockedTier: c.unlockedTier || 1,
    };
    const prof = Campaign.profileOf(c);
    delete c.guide; delete c.tips; delete c.career; delete c.unlockedTier;
    delete prof.guide; delete prof.tips;
    if (prof.career.championCount === undefined) prof.career.championCount = 0;
    if (prof.career.bestRank === undefined) prof.career.bestRank = 99;
    c.delegationRatings = c.delegationRatings || [];
    c.stats = c.stats || Campaign.defaultStats();
    for (const k of ['itemsBought', 'itemsSold', 'itemUses', 'growths', 'recruits', 'rests', 'failures', 'retreats', 'aRuns', 'runsWithItems']) {
      
      if (c.stats[k] === undefined) c.stats[k] = 0;
    }
    c.offseasonUpgrades = c.offseasonUpgrades || 0;
    c.offseasonTraining = c.offseasonTraining || 0;
    c.offseasonGrowth = c.offseasonGrowth || 0;
    c.weather = c.weather || 'calm';
    c.nextWeather = c.nextWeather || c.weather;
    if (c.season === 1 && c.week === 7 && c.weather === 'calm') {
      const ids = (D.WEATHERS || []).filter(w => w.id !== 'calm').map(w => w.id);
      c.weather = ids[Math.floor(Math.random() * ids.length)];
    }
    c.upgrades = c.upgrades || { agency: 0, tavern: 0, patch: 0, boat: 0 };
    c.rivals = c.rivals || (D.RIVALS || []).map((r, i) => Object.assign({}, r, { credit: 30 + i * 5 }));
    Campaign.migrateIntroFatigue(c);
    if (c.season === 1 && c.week === 6) {
      Campaign.initializeContractWeek(c, 6);
      Campaign.ensureWeekSixDelegation(c);
      c.candidates = (c.candidates || []).slice(0, 4);
    }
    Campaign.initializeWeekTwoTasks(c);
    Campaign.initializeWeekThreeTasks(c);
    if (c.season === 1 && (c.week === 4 || c.week === 5)) {
      
      Campaign.initializeIntroContractWeek(c, c.week);
      
      if (c.tutorialShopVersion !== 1) Campaign.restockShop(c);
    }
    Campaign.ensureWeekThreeCandidates(c);
    S.runTutorial = false;
    S.runCoachStep = 0;
    S.campaign = c;
    saveWeekSnapshot(c, true);
    S.mode = 'campaign';
    S.campaignTask = null;
    S.campaignRunCfg = null;
    S.campaignReward = null;
    S.weekReport = null;
    S.endWeekConfirm = false;
    S.retreatConfirm = false;
    S.campaignIntel = 0;
    S.campaignPanel = 'agency';
    S.showSave = false;
    S.showRules = false;
    S.showChangelog = false;
    S.showSkipDialog = false;
    if (c.ended) {
      
      S.screen = 'seasonEnd';
      
      S.seasonSummary = Campaign.seasonSummary(c);
    } else {
      
      S.screen = 'campaign';
      
      S.seasonSummary = null;
    }
    render();
    showToast(`已载入「${SAVE_LABELS[slot]}」。`, 'good');
    return true;
  }

  function autosave() {
    if (S.mode === 'campaign' && S.campaign && (S.screen === 'campaign' || S.screen === 'seasonEnd' || S.screen === 'offseason' || S.screen === 'ending')) {
      
      writeSave('auto', S.campaign);
    }
  }

  /* ---------------- 小工具 ---------------- */
  function sgn(v) { return v > 0 ? '+' : '−'; }
  function absNum(v) { return Math.abs(Math.round(v)); }

  function defaultCfg() {
    return {
      
      travelers: D.TRAVELERS.slice(0, 5).map(t => t.id),
      
      route: 'big_road',
      
      load: 'mid',
      
      tactic: 'steady',
      
      items: ['tide_bomb', 'medkit', 'recorder'],
    };
  }

  /* 经理层默认配置：优先挑疲劳最低的 5 个人；道具从背包里挑 3 种 */
  function campaignDefaultCfg() {
    const c = S.campaign;
    const sorted = c.travelers.slice().sort((a, b) => a.fatigue - b.fatigue);
    const owned = Object.keys(c.inventory).filter(id => c.inventory[id] > 0);
    return {
      
      travelers: sorted.slice(0, 5).map(t => t.id),
      
      route: '',
      
      load: '',
      
      tactic: '',
      
      items: isBasicItemWeek(c) ? owned.filter(id => (D.CAMPAIGN.tutorialItems || []).includes(id)).slice(0, 1) : [],
    };
  }

  function isFirstWeekCampaign(c) {
    c = c || S.campaign;
    return !!(c && c.season === 1 && c.week === 1
      
      && c.travelers && c.travelers.length === 5
      
      && c.travelers.some(t => t.templateId === 'r_aman'));
  }

  function isBasicContractWeek(c) {
    c = c || S.campaign;
    return !!(c && c.season === 1 && c.week >= 2 && c.week <= 8);
  }

  function isSecondWeekCampaign(c) {
    c = c || S.campaign;
    return !!(c && c.season === 1 && c.week === 2);
  }

  function isThirdWeekCampaign(c) {
    c = c || S.campaign;
    return !!(c && c.season === 1 && c.week === 3);
  }

  function isWeekSixCampaign(c) {
    c = c || S.campaign;
    return !!(c && c.season === 1 && c.week === 6);
  }

  function isWeekEightCampaign(c) {
    c = c || S.campaign;
    return !!(c && c.season === 1 && c.week === 8);
  }

  function isWeekSevenCampaign(c) {
    c = c || S.campaign;
    return !!(c && c.season === 1 && c.week >= 7);
  }

  function isGuidedPrepWeek(c) {
    c = c || S.campaign;
    return !!(c && c.season === 1 && c.week <= 5);
  }

  function isBasicItemWeek(c) {
    c = c || S.campaign;
    return !!(c && c.season === 1 && c.week >= 4 && c.week <= 8);
  }

  function isRatingLessonWeek(c) {
    c = c || S.campaign;
    return !!(c && c.season === 1 && c.week === 5);
  }

  function isCrewIntroWeek(c) {
    c = c || S.campaign;
    return !!(c && c.season === 1 && c.week >= 3 && c.week <= 8);
  }

  function isCampaignOnboardingWeek(c) {
    c = c || S.campaign;
    return !!(c && c.season === 1 && c.week <= 6);
  }

  function isIntroDispatchWeek(c) {
    c = c || S.campaign;
    return isFirstWeekCampaign(c) || isSecondWeekCampaign(c);
  }

  function newTask() {
    S.mode = 'single';
    const ids = Object.keys(D.TASKS).filter(id => id !== 'core');
    let id = ids[Math.floor(Math.random() * ids.length)];
    if (ids.length > 1) {
      
      let guard = 0;
      
      while (id === S.taskId && guard++ < 10) {
      
        id = ids[Math.floor(Math.random() * ids.length)];
      
      }
    }
    S.taskId = id;
    S.intel = 0;
    S.cfg = defaultCfg();
    S.run = null;
    S.result = null;
    S.screen = 'task';
    render();
  }

  /* ---------------- 经理层流程 ---------------- */
  function startCampaign(seasonState) {
    S.mode = 'campaign';
    S.runTutorial = false;
    S.runCoachStep = 0;
    S.campaign = seasonState || Campaign.newSeason();
    S.cfg = campaignDefaultCfg();
    S.campaignTask = null;
    S.campaignRunCfg = null;
    S.campaignReward = null;
    S.seasonSummary = null;
    S.weekReport = null;
    S.endWeekConfirm = false;
    S.campaignPanel = 'agency';
    S.screen = 'campaign';
    saveWeekSnapshot(S.campaign);
    render();
  }

  function launchCampaignTask(uid) {
    const c = S.campaign;
    if (!c) return;
    if (c.slotsLeft <= 0) { showToast('本周出勤格用完了，先结束本周。', 'warn'); return; }
    const task = c.tasks.concat(c.delegations).find(t => t.uid === uid);
    if (!task) return;
    if (!S.cfg || !Array.isArray(S.cfg.travelers)) S.cfg = campaignDefaultCfg();
    if (S.cfg.travelers.length !== 5) { showToast('先选满 5 个人再出发。', 'warn'); return; }
    S.campaignTask = task;
    S.campaignReward = null;
    S.campaignIntel = 0;
    S.endWeekConfirm = false;
    startCampaignRun();
  }

  function startCampaignRun() {
    const c = S.campaign;
    if (!c || !S.campaignTask) return;
    S.runTutorial = false;
    S.runCoachStep = 0;
    // 背包校验：挑的道具得真的在包里
    for (const id of S.cfg.items) {
      
      if (!(c.inventory[id] > 0)) {
      
        showToast('背包里没有这件道具了，回漏勺号重新挑。', 'warn');
      
        return;
      
      }
    }
    // 买情报（钱从经理层账上扣）
    const pay = Campaign.payIntel(c, S.campaignIntel);
    if (!pay.ok) { showToast(pay.reason, 'warn'); return; }
    const begin = Campaign.beginRun(c, S.campaignTask);
    if (!begin.ok) { showToast(begin.reason, 'warn'); return; }
    const cfg = Campaign.buildRunCfg(c, Object.assign({}, S.cfg, { route: '', load: '', tactic: '', intel: S.campaignIntel }), S.campaignTask);
    S.campaignRunCfg = cfg;
    S.campaignReward = null;
    S.run = E.makeState({ task: S.campaignTask, cfg });
    S.result = null;
    S.retreatConfirm = false;
    S.animIndex = -1;
    S.screen = 'run';
    render();
    for (const l of S.run.startLog) showToast(l.text, l.type === 'warn' ? 'warn' : '');
    if (S.campaignTask && S.campaignTask.intelBought && S.campaignTask.risk) {
      
      showToast(`情报：${S.campaignTask.risk.name}——${S.campaignTask.risk.desc}`, 'warn');
    }
    if (!isGuidedPrepWeek(c) && S.campaignIntel === 0) {
      
      const pct = Math.round(Campaign.sabotageChance(c) * 100);
      
      showToast(`情报是街坊传话的：约 ${pct}% 的选项数字可能是假的。`, 'lie');
    } else if (!isGuidedPrepWeek(c)) {
      
      showToast('买了准信：选项数字可信。', 'good');
    }
  }

  function startRun() {
    if (S.mode === 'campaign') return startCampaignRun();
    const cfg = JSON.parse(JSON.stringify(S.cfg));
    cfg.intel = S.intel;
    S.run = E.makeState({ taskId: S.taskId, cfg });
    S.result = null;
    S.retreatConfirm = false;
    S.animIndex = -1;
    S.screen = 'run';
    render();
    // 起手信息
    for (const l of S.run.startLog) showToast(l.text, l.type === 'warn' ? 'warn' : '');
    if (S.intel === 0 && !S.run.flags.intelTrue) {
      
      showToast('情报是街坊传话的，选项数字可能不准。', 'lie');
    } else if (S.intel >= 1) {
      
      showToast('买了准信：选项数字可信。', 'good');
    }
  }

  /* ---------------- 提示条 ---------------- */
  function showToast(html, type) {
    const wrap = document.getElementById('toast-wrap');
    if (!wrap) return;
    const div = document.createElement('div');
    div.className = 'toast' + (type ? ' ' + type : '');
    div.innerHTML = html;
    wrap.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }
  window.showToast = showToast;

  /* ---------------- 数值显示 ---------------- */
  function chipHTML(key, v, extra) {
    if (!v) return '';
    const cls = [];
    if (key === 'tide' || key === 'load') cls.push(v > 0 ? 'bad' : 'good');
    else if (key === 'credit' || key === 'reputation') cls.push(v > 0 ? 'good' : 'bad');
    else cls.push(v > 0 ? 'good' : 'bad');
    // 负载增加其实是好事（多救人），单独处理
    if (key === 'load') cls[0] = v > 0 ? 'good' : 'bad';
    // 潮位上涨是坏事
    if (key === 'tide') cls[0] = v > 0 ? 'bad' : 'good';
    return `<span class="chip ${cls[0]}${extra || ''}">${SHORT[key]} ${sgn(v)}${absNum(v)}</span>`;
  }

  function chipsOf(fx, opts) {
    opts = opts || {};
    let html = '';
    for (const key of FX_ORDER) {
      
      const v = fx[key];
      
      if (!v) continue;
      
      html += chipHTML(key, v, opts.fake && opts.fakeKey === key ? ' fake' : '');
    }
    return html;
  }

  /* 标准难度（只给方向箭头，不给数值）：箭头数量表示幅度，红=不利 / 绿=有利 */
  const DIR_LABELS = { time: '时间', tide: '潮位', crew: '状态', load: '负载', evidence: '证据', gold: '金币', credit: '信用', reputation: '口碑' };
  function blindChipsOf(fx) {
    let html = '';
    for (const key of FX_ORDER) {
      
      const v = fx[key];
      
      if (!v) continue;
      
      const mag = Math.abs(v);
      
      const arrows = mag >= 10 ? (v > 0 ? '↑↑↑' : '↓↓↓') : mag >= 5 ? (v > 0 ? '↑↑' : '↓↓') : (v > 0 ? '↑' : '↓');
      
      let bad;
      
      if (key === 'time' || key === 'crew') bad = v < 0;      
      // 时间/状态：越多越好
      
      else if (key === 'tide') bad = v > 0;      
            
            
       // 潮位：越高越糟
      
      else if (key === 'load') bad = v < 0;      
            
            
       // 负载：越高救援分越高（减载 = 掉救援分）
      
      else bad = v < 0;      
            
            
            
            
            
         // 证据/金币/信用/口碑：越多越好
      
      html += `<span class="chip dir ${bad ? 'bad' : 'good'}">${DIR_LABELS[key] || key} ${arrows}</span>`;
    }
    return html || '<span class="chip muted">无明显变化</span>';
  }

  function deltaTextOf(effect) {
    const parts = [];
    for (const k of GAUGE_ORDER) {
      
      const v = effect.deltas[k];
      
      if (v) parts.push(`${SHORT[k]}${sgn(v)}${absNum(v)}`);
    }
    if (effect.evidence) parts.push(`证+${effect.evidence}`);
    if (effect.gold) parts.push(`金${sgn(effect.gold)}${absNum(effect.gold)}`);
    if (effect.credit) parts.push(`信用${sgn(effect.credit)}${absNum(effect.credit)}`);
    if (effect.reputation) parts.push(`口碑${sgn(effect.reputation)}${absNum(effect.reputation)}`);
    if (effect.overload) parts.push('超载');
    if (effect.tempAbsorb) parts.push(`护盾 −${effect.tempAbsorb}`);
    if (effect.emergencyHeal) parts.push('铁胃补回');
    if (effect.pendingHeal) parts.push(`回春 +${effect.pendingHeal}`);
    if (effect.tempCrew) parts.push(`临时状态 +${effect.tempCrew}`);
    if (effect.deckAdd) parts.push(`牌堆 +${effect.deckAdd}`);
    if (effect.shielded) parts.push('挡下');
    if (effect.reveal) parts.push('看穿');
    if (effect.gainItem) parts.push('得道具');
    if (effect.peek) parts.push(`预判 ${effect.peek} 张`);
    if (effect.skip) parts.push('跳过本张');
    return parts.join('　') || '—';
  }

  /* =================================================================
   * 一、标题页
   * ================================================================= */
  function renderLiteTitle() {
    return `
    <div class="title-wrap">
      
      <div class="logo-stamp">出勤局</div>
      
      <h1>大壶街出勤局</h1>
      
      <p class="subtitle">第一周精简版</p>
      
      <p class="lead">
      
        这一周只做四件事：<br>
      
        接一张单 · 招 5 个人 · 买 2 件道具 · 出发一次。
      
      </p>
      
      <div class="title-actions title-actions-main">
      
        <div class="ta-center">
      
          <button class="btn primary big title-continue" data-act="lite-start">开始第一周</button>
      
        </div>
      
      </div>
    </div>`;
  }

  function renderLiteDone() {
    return `
    <div class="page">
      
      <header class="page-head"><h2>第一周完成</h2></header>
      
      <p class="lead">
      
        你已经走过：接单 → 招人 → 买道具 → 出勤。<br>
      
        休整、情报、人物成长、壶潮季这些，下一周再慢慢开。
      
      </p>
      
      <div class="title-actions">
      
        <button class="btn primary" data-act="lite-restart">再开一周</button>
      
        <button class="btn" data-act="home">回标题</button>
      
      </div>
    </div>`;
  }

  function renderTitle() {
    if (LITE_WEEK1) return renderLiteTitle();
    const auto = readSave('auto');
    const draft = readPrologueCheckpoint();
    return `
    <div class="title-wrap">
      
      <div class="logo-stamp">出勤局</div>
      
      <h1>大壶街出勤局</h1>
      
      <p class="subtitle">四 店 经 营 · 可 玩 原 型 v0.23.0</p>
      
      <p class="lead">
      
        你是被四家小店雇来的出勤调度员。<br>
      
        第一周，老队员会带你完成一趟紧急出勤。<br>
      
        更多经营业务会随着周次逐步开放。
      
      </p>
      
      <div class="title-actions title-actions-main">
      
        <div class="ta-left">
      
          ${(auto || draft) ? '<button class="btn" data-act="start-game">开始游戏</button>' : ''}
      
        </div>
      
        <div class="ta-center">
      
          ${(auto || draft)
      
            
      ? '<button class="btn primary big title-continue" data-act="continue-game">继续游戏</button>'
      
            
      : '<button class="btn primary big title-continue" data-act="start-game">开始游戏</button>'}
      
        </div>
      
        <div class="ta-right"></div>
      
      </div>
      
      <div class="title-actions title-actions-sub">
      
        <button class="btn" data-act="save-menu">存档管理</button>
      
        <button class="btn" data-act="rules">玩法说明</button>
      
        <button class="btn" data-act="changelog">更新日志</button>
      
      
      </div>
      
      <div class="diff-row">
      
        <span class="diff-label">难度</span>
      
        <button class="diff-btn ${S.blind ? '' : 'active'}" data-act="diff" data-v="standard">简单 · 显示数值</button>
      
        <button class="diff-btn ${S.blind ? 'active' : ''}" data-act="diff" data-v="blind">标准 · 只给方向</button>
      
      </div>
      
      <p class="tiny">标准难度下选项只显示方向（↑/↑↑/↑↑↑，红=不利、绿=有利），买情报或用「望远镜 / 潮汐表 / 旧航图 / 识途」才显示数值。</p>
      
      <p class="tiny">${storageOK()
      
        ? '自动存档：每次回到经理层 / 季末自动保存，关掉浏览器也能接着玩；另有 3 个手动存档格。'
      
        : '当前环境不支持本地存档（localStorage 不可用），关闭页面会丢失进度。'}</p>
      
      <p class="tiny">依据《玩法设计 v2》《数值表初稿 v1.4》《内容库 v1》实现 · 双击 index.html 即可游玩</p>
    </div>`;
  }

  /* =================================================================
   * 序章 · 报纸文游（第 1 段试看）
   * ================================================================= */
  const SCENE_ICONS = {
    toRun: '⛵', toStory: '🍺', toCampaign: '🧾',
    title: '🏠', prologue: '📰', campaign: '🧾', run: '⛵',
    result: '📜', seasonEnd: '📊', offseason: '🛠', ending: '🏆',
  };

  function sceneCurtainHTML() {
    const c = S.sceneCurtain;
    if (!c) return '';
    S.sceneCurtain = null;
    return `<div class="scene-curtain" aria-hidden="true"><div class="sc-icon">${c.icon || '📰'}</div></div>`;
  }

  function startPrologueFresh() {
    stopSceneIntro();
    stopTypewriter();
    stopHeadlineTypewriter();
    S.mode = 'prologue';
    S.screen = 'prologue';
    S.prologueScene = 0;
    S.prologueShown = 1;
    S.prologueFlip = true;
    savePrologueCheckpoint();
    render();
    startSceneIntro();
  }

  function resumePrologue(draft) {
    stopSceneIntro();
    stopTypewriter();
    stopHeadlineTypewriter();
    S.mode = 'prologue';
    S.screen = 'prologue';
    S.prologueScene = draft.scene;
    S.prologueShown = 1;
    S.prologueFlip = true;
    render();
    startSceneIntro();
  }

  function startNewGameWithPrologue() {
    clearPrologueCheckpoint();
    startPrologueFresh();
  }

  function startNewGameSkipping() {
    clearPrologueCheckpoint();
    const c = Campaign.newSeason();
    S.sceneCurtain = { icon: SCENE_ICONS.toCampaign };
    startCampaign(c);
  }

  function startNewGameSeason2() {
    clearPrologueCheckpoint();
    const c = Campaign.newSeason({ season: 2, starterTeam: true });
    S.sceneCurtain = { icon: SCENE_ICONS.toCampaign };
    startCampaign(c);
  }

  function prologueTotalLines() {
    const scene = D.PROLOGUE[D.PROLOGUE.order[S.prologueScene || 0]];
    return scene.lines.length;
  }

  function stopTypewriter() {
    if (S.typingTimer) clearInterval(S.typingTimer);
    S.typingTimer = null;
    if (S.typing && S.typing.el) S.typing.el.classList.remove('typing');
    S.typing = null;
  }

  function completeTypewriter() {
    if (!S.typing) return;
    S.typing.el.textContent = S.typing.full;
    S.typing.el.classList.remove('typing');
    S.typing.done = true;
    if (S.typingTimer) clearInterval(S.typingTimer);
    S.typingTimer = null;
  }

  function startTypewriter(fullOverride) {
    stopTypewriter();
    const p = document.querySelector('.story-line.current p');
    if (!p || typeof p.textContent !== 'string') return;
    const full = typeof fullOverride === 'string' ? fullOverride : p.textContent;
    if (!full) return;
    p.textContent = '';
    p.classList.add('typing');
    S.typing = { el: p, full, done: false, i: 0 };
    S.typingTimer = setInterval(() => {
      
      const t = S.typing;
      
      if (!t) return;
      
      t.i += 1;
      
      t.el.textContent = t.full.slice(0, t.i);
      
      const sl = document.querySelector('.story-lines');
      
      if (sl) sl.scrollTop = sl.scrollHeight || 0;
      
      if (t.i >= t.full.length) {
      
        clearInterval(S.typingTimer);
      
        S.typingTimer = null;
      
        t.done = true;
      
        t.el.classList.remove('typing');
      
      }
    }, 18);
  }

  function stopHeadlineTypewriter() {
    if (S.headlineTimer) clearInterval(S.headlineTimer);
    S.headlineTimer = null;
    const h = document.querySelector('.story-headline');
    if (h) h.classList.remove('typing-title');
  }

  function startHeadlineTypewriter(titleOverride, onDone) {
    stopHeadlineTypewriter();
    const h = document.querySelector('.story-headline');
    if (!h || typeof h.textContent !== 'string') return;
    const full = typeof titleOverride === 'string' ? titleOverride : h.textContent;
    if (!full) return;
    h.textContent = '';
    h.classList.add('typing-title');
    let i = 0;
    S.headlineTimer = setInterval(() => {
      
      i += 1;
      
      h.textContent = full.slice(0, i);
      
      if (i >= full.length) {
      
        clearInterval(S.headlineTimer);
      
        S.headlineTimer = null;
      
        h.classList.remove('typing-title');
      
        if (typeof onDone === 'function') onDone();
      
      }
    }, 120);
  }

  function stopSceneIntro() {
    if (S.introTimer) clearTimeout(S.introTimer);
    S.introTimer = null;
    S.intro = null;
  }

  function finishSceneIntro() {
    if (!S.intro) return;
    const { title, body } = S.intro;
    stopSceneIntro();
    stopHeadlineTypewriter();
    const h = document.querySelector('.story-headline');
    if (h) h.textContent = title;
    startTypewriter(body);
  }

  function startSceneIntro() {
    stopSceneIntro();
    stopTypewriter();
    stopHeadlineTypewriter();
    const h = document.querySelector('.story-headline');
    const p = document.querySelector('.story-line.current p');
    if (!h || !p) return;
    const title = h.textContent;
    const body = p.textContent;
    h.textContent = '';
    p.textContent = '';
    S.intro = { title, body };
    const reduce = typeof window !== 'undefined' && window.matchMedia
      
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 先翻页（0.6s），再打标题，标题打完停一下再出正文；减少动态时直接出
    S.introTimer = setTimeout(() => {
      
      S.introTimer = null;
      
      startHeadlineTypewriter(title, () => {
      
        S.introTimer = setTimeout(() => {
      
          S.introTimer = null;
      
          S.intro = null;
      
          startTypewriter(body);
      
        }, reduce ? 0 : 350);
      
      });
    }, reduce ? 0 : 600);
  }

  function prologueAdvance() {
    if (S.intro) {
      
      finishSceneIntro();
      
      return true;
    }
    if (S.typing && !S.typing.done) {
      
      completeTypewriter();
      
      return true;
    }
    const total = prologueTotalLines();
    if ((S.prologueShown || 1) >= total) return false;
    S.prologueShown = Math.min(total, (S.prologueShown || 1) + 1);
    savePrologueCheckpoint();
    render();
    startTypewriter();
    return true;
  }

  function prologueGo(idx, opts) {
    stopTypewriter();
    S.prologueFlip = idx !== 4 && !(opts && opts.noFlip);
    S.prologueScene = idx;
    S.prologueShown = 1;
    savePrologueCheckpoint();
    S.screen = idx === 4 ? 'run' : 'prologue';
    if (idx === 4) startPrologueRun();
    else { render(); startSceneIntro(); }
  }

  function startPrologueRun() {
    savePrologueCheckpoint();
    stopSceneIntro();
    stopTypewriter();
    stopHeadlineTypewriter();
    const cfg = {
      
      travelerDefs: [{ id: 'boss', name: '老板', role: '旅行社老板', traits: [] }]
      
        .concat(D.TRAVELERS.filter(t => ['anchor', 'fei', 'chaopo', 'xiaoman'].includes(t.id))
      
          .map(t => ({ id: t.id, name: t.name, role: t.role, traits: [] }))),
      
      route: 'big_road',
      
      load: 'mid',
      
      tactic: 'steady',
      
      items: [],
      
      intel: 0,
      
      tutorial: true,
    };
    S.run = E.makeState({ task: D.PROLOGUE_TASK, cfg });
    S.runTutorial = true;
    S.runCoachStep = 0;
    S.sceneCurtain = { icon: SCENE_ICONS.toRun };
    S.result = null;
    S.retreatConfirm = false;
    S.animIndex = -1;
    S.screen = 'run';
    render();
  }

  function renderPrologue() {
    const flip = S.prologueFlip;
    S.prologueFlip = false;
    const keys = D.PROLOGUE.order;
    const idx = Math.min(S.prologueScene || 0, keys.length - 1);
    const scene = D.PROLOGUE[keys[idx]];
    if (!scene) return '';
    const base = scene.lines;
    const lines = base;
    const shown = Math.max(1, Math.min(S.prologueShown || 1, lines.length));
    const visible = lines.slice(0, shown);
    const latest = visible[visible.length - 1];
    const portrait = latest.portrait;
    const role = scene.roleOf[latest.who] || '画外音';
    const done = shown >= lines.length;
    let interaction = '';
    if (done) {
      
      if (idx === 3) {
      
        interaction = `<div class="story-choices"><button class="clipping-choice" data-act="prologue-sail">起航 →</button></div>`;
      
      } else if (idx === 5) {
      
        interaction = `<div class="story-choices"><button class="clipping-choice" data-act="prologue-finish">推门出去 →</button></div>`;
      
      } else {
      
        interaction = `<div class="story-choices"><button class="clipping-choice" data-act="prologue-next-scene">继续 →</button></div>`;
      
      }
    }
    return `
    <div class="story-page-wrap ${flip ? 'flip' : ''}">
    <div class="paper-back"></div>
    <div class="story-page">
      
      <div class="story-masthead">
      
        <span class="story-kicker">大壶街晚报 · 号外</span>
      
        <span class="story-meta">第 ${idx + 1} 段 / 6　<button class="link-btn" data-act="home">回标题</button></span>
      
      </div>
      
      <h1 class="story-headline">${scene.title}</h1>
      
      <div class="story-dateline">${scene.place}</div>
      
      <div class="story-body">
      
        <div class="portrait-block">
      
          <div class="portrait-stamp ${portrait ? '' : 'narrator'}"></div>
      
          <div class="portrait-name">${latest.who}</div>
      
          <div class="portrait-role">${role}</div>
      
        </div>
      
        <div class="story-main">
      
          <div class="story-lines">
      
            
      ${visible.map((l, i) => `
      
            
        <div class="story-line ${i === visible.length - 1 ? 'current' : ''}">
      
            
          <span class="sl-who">${l.who}</span>
      
            
          <p>${l.text}</p>
      
            
        </div>`).join('')}
      
          </div>
      
          ${!done ? `
      
            
      <div class="story-choices">
      
            
        <button class="clipping-choice" data-act="prologue-next">继续 ▸</button>
      
            
        <button class="link-btn" data-act="prologue-skip">跳过本段</button>
      
            
      </div>
      
            
      <p class="story-hint">点页面任意位置放一句（空格 / 回车也行）。</p>` : interaction}
      
        </div>
      
      </div>
      
      <p class="story-foot">序章试玩 · 第 ${idx + 1} / 6 段</p>
    </div>
    </div>`;
  }

  /* =================================================================
   * 二、任务页（旅行社）
   * ================================================================= */
  function renderTask() {
    const task = D.TASKS[S.taskId];
    const meta = [
      
      task.tagline,
      
      task.evidence > 0 ? `证据 ≥ ${task.evidence}` : '无需证据',
      
      task.credit > 0 ? `报酬 ${task.gold} 金 / ${task.credit} 信用` : `报酬 ${task.gold} 金（不计信用）`,
    ];
    return `
    <div class="page">
      
      <div class="page-head">
      
        <button class="link-btn" data-act="home">← 回标题</button>
      
        <h2>迷途旅行社 · 任务栏</h2>
      
        <button class="btn small" data-act="reroll">换一张任务</button>
      
      </div>

      
      <div class="task-sheet">
      
        <div class="pin"></div>
      
        <div class="task-type">${task.name}</div>
      
        <div class="task-meta">${meta.map(m => `<span>${m}</span>`).join('')}</div>
      
        <p class="task-desc">${task.desc}</p>
      
        <div class="weight-banner">任务风向：<b>${Campaign.weightHint(task)}</b><span>${task.weightLabel}</span></div>

      
        <div class="intel-box">
      
          <h4>接单前：买不买更准的情报？（半真半假）</h4>
      
          ${D.INTEL.map(l => `
      
      <div class="intel-option ${S.intel === l.level ? 'selected' : ''}" data-act="intel" data-level="${l.level}">
      
        <span class="dot"></span>
      
        <div class="body">
      
          <div class="name">${l.name}
      
      ${l.cost ? `<span class="cost">${l.cost.gold ? l.cost.gold + ' 金币' : ''}${l.cost.reputation ? ' + ' + l.cost.reputation + ' 口碑' : ''}</span>` : '<span class="cost">不花钱</span>'}
      
          </div>
      
          <div class="desc">${l.desc}</div>
      
        </div>
      
      </div>`).join('')}
      
          <p class="hint" style="font-size:12.5px;color:var(--ink-3);margin:10px 0 0;">
      
      提示：情报差时，出勤中约 20% 的选项数字是假的——选了才发现。这是"老板这张嘴"的代价。
      
          </p>
      
        </div>

      
        <div class="task-actions">
      
          <button class="btn primary big" data-act="to-prep">去准备 →</button>
      
        </div>
      
      </div>
    </div>`;
  }

  /* =================================================================
   * 三、准备页（挑人 / 道具）
   * ================================================================= */
  function prepTravelers() {
    if (S.mode === 'campaign' && S.campaign) return S.campaign.travelers;
    return D.TRAVELERS.map(t => ({
      
      id: t.id, name: t.name, role: t.role, wage: 3 + t.traits.length * 2,
      
      quote: t.quote, traits: t.traits,
    }));
  }

  function travelerHTML(t) {
    const sel = S.cfg.travelers.includes(t.id);
    const camp = S.mode === 'campaign';
    const fixed = camp && isIntroDispatchWeek(S.campaign);
    const warn = camp && Campaign.transferWarning(S.campaign, t);
    return `
      
      <div class="traveler ${sel ? 'selected' : ''} ${fixed ? 'fixed' : ''}" ${fixed ? '' : `data-act="trav" data-id="${t.id}"`}>
      
        <span class="check">✓</span>
      
        <div class="tv-head">
      
          <span class="tv-name">${t.name}</span>
      
          <span class="tv-role">${t.role}</span>
      
          ${fixed ? '' : `<span class="tv-wage">周薪 ${t.wage || (3 + t.traits.length * 2)}</span>`}
      
        </div>
      
        <div class="tv-quote">「${t.quote || ''}」</div>
      
        ${camp && !fixed ? `
      
        <div class="tv-fatigue">
      
          <span class="ft-label">疲劳</span>
      
          <div class="mini-bar"><i class="ft-fill" style="width:${t.fatigue}%"></i></div>
      
          <span class="ft-val">${t.fatigue}</span>
      
          ${warn ? '<span class="warn-text">⚠ 想转会</span>' : ''}
      
        </div>` : ''}
      
        ${(t.traits || []).map(tr => `
      
          <div class="trait ${tr.rarity}">
      
      <span class="t-name">${tr.name}</span><span class="t-rarity">${tr.rarity}</span><br>
      
      ${tr.desc}
      
          </div>`).join('')}
      
      </div>`;
  }

  /* 出勤准备页可选的道具：经理层从背包里拿，练习模式从补丁铺随便挑 */
  function prepItems() {
    if (S.mode === 'campaign' && S.campaign) {
      
      return Object.keys(S.campaign.inventory)
      
        .filter(id => !isBasicItemWeek(S.campaign) || (D.CAMPAIGN.tutorialItems || []).includes(id))
      
        .filter(id => S.campaign.inventory[id] > 0)
      
        .map(id => ({ id, count: S.campaign.inventory[id] }));
    }
    return D.SHOP_ITEMS.map(id => ({ id, count: null }));
  }

  function itemHTML(entry) {
    const it = D.ITEMS[entry.id];
    const sel = S.cfg.items.includes(entry.id);
    return `
      
      <div class="item-card ${sel ? 'selected' : ''}" data-act="item-toggle" data-id="${entry.id}">
      
        <span class="check">✓</span>
      
        <div class="i-head">
      
          <span class="i-name">${it.name}</span>
      
          <span class="i-tag">${it.tag}</span>
      
          <span class="i-price">${entry.count === null ? it.price + ' 金' : '库存 ×' + entry.count}</span>
      
        </div>
      
        <div class="i-desc">${it.desc}</div>
      
      </div>`;
  }

  function renderPrep() {
    const n = S.cfg.travelers.length;
    const m = S.cfg.items.length;
    const camp = S.mode === 'campaign' ? S.campaign : null;
    const task = camp ? S.campaignTask : D.TASKS[S.taskId];
    const backAct = camp ? 'campaign-back' : 'back-task';
    const firstWeek = camp && isIntroDispatchWeek(camp);
    const guidedPrep = camp && isGuidedPrepWeek(camp);
    const basicPrep = camp && camp.season === 1 && camp.week <= 3;
    const intelText = camp ? D.INTEL[S.campaignIntel].name : D.INTEL[S.intel].name;
    const campBrief = camp && task ? (firstWeek ? `
      
      <div class="first-week-prep-note"><b>${isBasicContractWeek(camp) ? '基础委托已选好。' : '老队员已经排好这趟出勤。'}</b><span>五人小队和补给都由他们安排好；这次不用操心其他配置，直接出发即可。</span></div>` : isThirdWeekCampaign(camp) ? `
      
      <div class="first-week-prep-note"><b>挑选本趟出勤的五名队员。</b><span>队员疲劳会影响起手状态；新人从零疲劳开始，系统已优先预选疲劳较低的队员。</span></div>` : isBasicItemWeek(camp) ? `
      
      <div class="first-week-prep-note"><b>${isRatingLessonWeek(camp) ? '看清任务重点，再挑一件补给。' : '挑一件基础补给带上。'}</b><span>道具从背包里选一件带上，用掉后会消失。</span></div>` : guidedPrep ? '' : `
      
      <div class="camp-task-brief">
      
        <span class="ctb-badge" style="background:${task.color || '#6b4a8f'}">${task.kind === 'delegation' ? `委派 ${task.tier} 档` : '自选任务'}</span>
      
        <span>${task.tagline}</span>
      
        <span>还剩 <b>${task.expiresIn}</b> 周</span>
      
        <span>需出勤 ${task.runsTotal} 次${task.runsLeft < task.runsTotal ? `（已推进 ${task.runsTotal - task.runsLeft}）` : ''}</span>
      
        <span>本趟 ${task.gold} 金${task.credit ? ` / ${task.credit} 信用` : ''}</span>
      
        <span>标准分 ${task.standard} · 证据 ≥ ${task.evidence}</span>
      
      </div>
      
      <div class="weight-banner">任务风向：<b>${Campaign.weightHint(task)}</b><span>带人和带道具都按这个方向来</span></div>
      
      ${dimChipsHTML(task.weights)}
      
      <div class="camp-brief-note">
      
        平均疲劳会扣起手队伍状态（最多 −${D.CAMPAIGN.fatiguePenaltyMax}）。
      
      </div>`) : '';

    // 经理层：出发前买情报（钱从经理层账上扣）
    const intelPicker = camp && !guidedPrep ? `
      
      <div class="section-title"><span><span class="num">·</span>情报（旅行社）</span><span class="hint">免费情报有 20% 误报</span></div>
      
      <div class="intel-choice-row">
      
        ${D.INTEL.map(l => {
      
          const cost = Campaign.intelCost(camp, l.level);
      
          const afford = camp.gold >= cost.gold && camp.reputation >= cost.reputation;
      
          const costText = Campaign.intelCostLabel(camp, l.level);
      
          return `
      
          <div class="intel-choice ${S.campaignIntel === l.level ? 'selected' : ''} ${afford ? '' : 'unafford'}" data-act="camp-intel" data-level="${l.level}">
      
      <div class="ic-name">${l.name}</div>
      
      <div class="ic-desc">${l.desc}</div>
      
      <div class="ic-cost">${costText}</div>
      
          </div>`;
      
        }).join('')}
      
      </div>` : '';

    return `
    <div class="page">
      
      <div class="page-head">
      
        <button class="link-btn" data-act="${backAct}">← ${camp ? '回漏勺号' : '回任务条'}</button>
      
        <h2>上船准备</h2>
      
        <span style="font-size:13px;color:var(--ink-3)">${task ? task.name : ''}${LITE_WEEK1 || guidedPrep ? '' : ` · 情报：${intelText}`}</span>
      
      </div>
      
      ${liteLock(campBrief)}
      
      ${liteLock(intelPicker)}

      
      <div class="prep-grid">
      
        <div>
      
          <div class="section-title"><span><span class="num">1</span>${firstWeek ? '本次出勤队伍' : isThirdWeekCampaign(camp) ? '挑 5 人轮换出勤' : '挑 5 个人上船'}</span><span class="hint">已选 ${n} / 5${camp && !firstWeek ? ' · 从队伍里挑' : ''}</span></div>
      
          <div class="traveler-grid">${prepTravelers().length ? prepTravelers().map(travelerHTML).join('') : '<div class="empty-line">队伍里还没人——先去酒馆招够 5 个。</div>'}</div>
      
        </div>

      
      
      </div>

      
      ${basicPrep ? '' : `<div class="section-title"><span><span class="num">5</span>${isBasicItemWeek(camp) ? '基础补给' : '补丁铺'} · 每趟最多带 ${itemLimit()} 张道具</span><span class="hint">已选 ${m} / ${itemLimit()}${camp ? ' · 从背包里带，用掉才消失' : ''}</span></div>
      
      <div class="item-grid">${prepItems().length ? prepItems().map(itemHTML).join('') : `<div class="empty-line">${isBasicItemWeek(camp) ? '背包里没有基础道具，可以先去补丁铺购买。' : '背包里没有道具了，去补丁铺购买。'}</div>`}</div>`}

      
      <div class="launch-bar">
      
        <span class="launch-hint">
      
          ${firstWeek ? '老队员已经就位。' : isThirdWeekCampaign(camp) ? '新人可以参与轮换。' : n !== 5 ? '还差 ' + (5 - n) + ' 个人。' : '队伍齐了。'}
      
          ${m === 0 && !basicPrep ? '（不带道具也能出发，但出勤中会更难）' : ''}
      
          ${camp ? `　本周还剩 ${camp.slotsLeft} 格出勤。` : ''}
      
        </span>
      
        <button class="btn primary big" data-act="launch" ${n !== 5 ? 'disabled' : ''}>出发 →</button>
      
      </div>
    </div>`;
  }

  /* =================================================================
   * 四、出勤页
   * ================================================================= */
  function gaugeHTML(key) {
    const st = S.run;
    const def = D.GAUGES[key];
    const g = st.gauges[key];
    const cap = key === 'load' ? st.cap : 100;
    const pct = Math.max(0, Math.min(100, Math.round(g / cap * 100)));
    let warn = false;
    if (key === 'time' && g <= 25) warn = true;
    if (key === 'tide' && g >= 80) warn = true;
    if (key === 'crew' && g <= 30) warn = true;
    if (key === 'load' && st.overloaded) warn = true;
    return `
      
      <div class="gauge ${warn ? 'warn' : ''}" data-k="${key}" data-dim="${key}" title="${DIM_META[key].name} · ${DIM_META[key].role}">
      
        <span class="g-icon">${def.icon}</span>
      
        <span class="g-name">${def.name}</span>
      
        <div class="g-bar"><div class="g-fill" style="width:${pct}%"></div></div>
      
        <span class="g-val">${key === 'load' ? g + '/' + cap : (key === 'crew' && st.tempCrew ? g + ' + ' + st.tempCrew + ' 盾' : g)}</span>
      
      </div>`;
  }

  function optionsHTML(opts) {
    const st = S.run;
    return opts.map((o, i) => {
      
      let chips;
      
      if (o.rand) {
      
        // 概率事件：不提前显示数值，选完才揭晓
      
        chips = '<span class="chip muted">结果不确定 · 选后揭晓</span>';
      
      } else if (S.blind && !o.honest) {
      
        // 标准难度：只给方向，不给数值（买情报 / 望远镜 / 识途 可看真数）
      
        chips = blindChipsOf(o.shown);
      
        for (const r of o.risks) chips += `<span class="chip risk">⚠ ${r}</span>`;
      
      } else {
      
        chips = chipsOf(o.shown, { fake: !!o.fake, fakeKey: o.fake ? o.fake.key : null });
      
        for (const r of o.risks) chips += `<span class="chip risk">⚠ ${r}</span>`;
      
        // 超载预警：再装就超过安全负载了
      
        const gain = o.shown.load || 0;
      
        if (gain > 0 && st.gauges.load + gain > st.cap) {
      
          chips += '<span class="chip risk">⚠ 会超载</span>';
      
        }
      
        if (st.overloaded && gain < 0) {
      
          chips += '<span class="chip good">卸货，停止掉状态</span>';
      
        }
      
      }
      
      const evGain = o.shown.evidence || 0;
      
      const evEnough = evGain > 0 && st.task && st.evidence >= st.task.evidence;
      
      return `
      
        <button class="option" data-act="choose" data-i="${i}">
      
          <span class="key">${i === 0 ? 'A / ←' : 'B / →'}</span>
      
          <span class="o-label">${o.label}</span>
      
          ${o.note ? `<span class="o-note">（${o.note}）</span>` : ''}
      
          ${evEnough ? '<span class="o-note ev-enough">（证据已够 · 再留会溢出）</span>' : ''}
      
          <span class="chips">${chips || '<span class="chip muted">无直接变化</span>'}</span>
      
        </button>`;
    }).join('');
  }

  function consumablesHTML() {
    const st = S.run;
    let actives = st.actives.map((a, i) => {
      
      const left = a.left === undefined ? (a.used ? 0 : 1) : a.left;
      
      return `
      
      <button class="consumable active-skill ${left <= 0 ? 'used' : ''}" data-act="active" data-i="${i}" ${left <= 0 ? 'disabled' : ''}>
      
        <div class="cv-name">${a.name}${a.uses > 1 ? `<span class="cv-uses">×${left}</span>` : ''}</div>
      
        <div class="cv-desc">${a.desc}</div>
      
        <div class="cv-from">${a.traveler} 的词条</div>
      
      </button>`;
    }).join('');

    let items = st.items.map((it, i) => {
      
      const def = D.ITEMS[it.id];
      
      return `
      
      <button class="consumable ${it.used ? 'used' : ''}" data-act="use-item" data-i="${i}" ${it.used ? 'disabled' : ''}>
      
        <div class="cv-name">${def.name}</div>
      
        <div class="cv-desc">${def.desc}</div>
      
      </button>`;
    }).join('');

    if (!actives) actives = '<span class="consumable empty">本队没有主动词条</span>';
    if (!items) items = '<span class="consumable empty">没带道具</span>';

    return `
      
      <div class="dock">
      
        <div class="dock-group">
      
          <span class="dock-label">词条</span>${actives}
      
        </div>
      
        <div class="dock-group">
      
          <span class="dock-label">道具</span>${items}
      
        </div>
      
      </div>`;
  }

  function endCardHTML() {
    const st = S.run;
    let title = '到达目标', sub = '正在回联盟报账……', cls = 'good';
    if (st.status === 'lost') { title = '出勤失败'; sub = st.failReason; cls = 'bad'; }
    if (st.status === 'retreated') { title = '主动撤退'; sub = '带着已经救到的东西收工。'; cls = ''; }
    return `
      
      <div class="table-area">
      
        <div class="event-card" data-cat="misc">
      
          <div class="card-top"><span class="card-cat">出勤结束</span><span class="card-scene">${title}</span></div>
      
          <p class="card-text">${sub}</p>
      
          <div style="text-align:right"><button class="btn primary" data-act="show-result">看结算 →</button></div>
      
        </div>
      
      </div>`;
  }

  const RUN_COACH_STEPS = [
    {
      
      target: '.options',
      
      title: '每张牌二选一',
      
      text: '事件会给出两种做法。先看它们会带来什么变化，再选你愿意承担的代价。',
    },
    {
      
      target: '.gauges',
      
      title: '留意四根仪表',
      
      text: '时间耗尽、潮位涨满或队伍状态归零都会让出勤失败。负载能换来救援成绩，但超过安全线会持续损伤队伍。',
    },
  ];

  function coachLayerHTML(steps, step, opts) {
    opts = opts || {};
    const i = Math.max(0, Math.min(step || 0, steps.length - 1));
    const d = steps[i];
    const action = opts.action
      
      ? `<button class="btn small primary" data-act="${opts.action}">${opts.label || '下一步 →'}</button>` : '';
    const skip = (opts.skip && d.manual)
      
      ? `<button class="link-btn" data-act="${opts.skip}">${opts.skipLabel || '确认'}</button>` : '';
    const wait = (!d.manual && !opts.action) ? '<span class="coach-wait">完成高亮操作后自动继续</span>' : '';
    const stepLabel = opts.hideStep ? '' : `<div class="cp-step">第 ${i + 1} / ${steps.length} 步</div>`;
    return `
      
      <div class="coach-layer ${opts.className || ''}" data-coach-step="${i}">
      
        <div class="coach-hole" data-coach-hole></div>
      
        <div class="coach-pop" data-coach-pop>
      
          ${stepLabel}
      
          <h4>${d.title}</h4>
      
          <p>${d.text}</p>
      
          ${action}${skip}${wait}
      
        </div>
      
      </div>`;
  }

  function positionCoachLayer(selector, opts) {
    opts = opts || {};
    const layer = document.querySelector('.coach-layer');
    if (!layer) return;
    let target = selector;
    if (typeof target === 'function') target = target();
    if (typeof target === 'string') target = document.querySelector(target);
    if (!target || typeof target.getBoundingClientRect !== 'function') target = null;
    const hole = layer.querySelector('[data-coach-hole]');
    const pop = layer.querySelector('[data-coach-pop]');
    if (!hole || !pop) return;
    if (!target) {
      
      hole.style.display = 'none';
      
      pop.style.left = '50%';
      
      pop.style.top = '20%';
      
      pop.style.transform = 'translateX(-50%)';
      
      return;
    }
    hole.style.display = '';
    pop.style.transform = '';
    if (opts.scroll && typeof window !== 'undefined') {
      
      const r0 = target.getBoundingClientRect();
      
      const center = window.scrollY + r0.top + r0.height / 2;
      
      window.scrollTo(0, Math.max(0, center - window.innerHeight / 2));
    }
    const r = target.getBoundingClientRect();
    const pad = 8;
    hole.style.left = (r.left - pad) + 'px';
    hole.style.top = (r.top - pad) + 'px';
    hole.style.width = (r.width + pad * 2) + 'px';
    hole.style.height = (r.height + pad * 2) + 'px';

    const popW = 320;
    const popH = pop.offsetHeight || 150;
    const left = Math.max(16, Math.min(window.innerWidth - popW - 16, r.left));
    let top = r.bottom + 14;
    if (top + popH > window.innerHeight - 16) top = Math.max(16, r.top - popH - 14);
    top = Math.max(16, Math.min(window.innerHeight - popH - 16, top));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function stopCoachTracking() {
    if (S.coachRaf && typeof window !== 'undefined' && window.cancelAnimationFrame) {
      
      window.cancelAnimationFrame(S.coachRaf);
    }
    S.coachRaf = null;
  }

  function trackCoach(selector, opts) {
    opts = opts || {};
    stopCoachTracking();
    positionCoachLayer(selector, opts);
    if (typeof window === 'undefined' || !window.requestAnimationFrame) return;
    const tick = () => {
      
      if (!document.querySelector('.coach-layer')) { stopCoachTracking(); return; }
      
      positionCoachLayer(selector, { scroll: false });
      
      S.coachRaf = window.requestAnimationFrame(tick);
    };
    S.coachRaf = window.requestAnimationFrame(tick);
  }

  function runTutorialHTML() {
    const i = S.runCoachStep || 0;
    return coachLayerHTML(RUN_COACH_STEPS, i, {
      
      action: 'run-tutorial-next',
      
      label: i < RUN_COACH_STEPS.length - 1 ? '下一步 →' : '开始出勤',
    });
  }

  function positionRunCoach() {
    const d = RUN_COACH_STEPS[S.runCoachStep || 0];
    if (d) trackCoach(d.target);
  }

  function runCoachHTML() {
    if (S.mode !== 'prologue' || S.runTutorial) return '';
    return `<div class="run-coach">
      
      <span><b>⏳ 时间</b>归零失败</span>
      
      <span><b>🌊 潮位</b>越低越好</span>
      
      <span><b>💪 状态</b>归零失败</span>
      
      <span><b>🎒 负载</b>别超安全线</span>
      
      <span class="rc-tip">下方词条 / 道具点一下就用</span>
    </div>`;
  }

  function renderRun() {
    const st = S.run;
    if (!st) { S.screen = 'title'; return renderTitle(); }
    const card = E.currentCard(st);
    if (!card) return runShell('', '');
    const animate = S.animIndex !== st.index;
    S.animIndex = st.index;
    const opts = E.displayOptions(st);
    const task = st.task;
    const intelName = st.intel === 0 ? '街坊传话' : (st.intel === 1 ? '准信' : '准信 + 风险标注');
    const enough = st.evidence >= task.evidence;

    // 「预判」：接下来被看穿的牌，显示类别（不给数值）
    const peekNames = [];
    for (let k = 1; k <= 3; k++) {
      
      const pc = st.deck[st.index + k];
      
      if (pc && st.peeked && st.peeked[st.index + k]) peekNames.push(D.CAT_NAMES[pc.cat] || '未知');
    }
    const peekLine = peekNames.length
      
      ? `<div class="peek-line">🧭 预判：接下来 ${peekNames.map(n => `「${n}」`).join(' · ')}</div>`
      
      : '';

    const hud = `
      
      <header class="hud">
      
        <div class="hud-left">
      
          <div class="hud-task">${task.name}</div>
      
          <div class="hud-sub">第 ${st.index + 1} / ${st.deck.length} 张 · 情报：${intelName} · <b>${S.blind ? '标准' : '简单'}</b></div>
      
          <div class="hud-weights">风向：<b>${Campaign.weightHint(task)}</b></div>
      
        </div>
      
        <div class="gauges">${GAUGE_ORDER.map(gaugeHTML).join('')}</div>
      
        <div class="hud-right">
      
          ${st.overloaded ? '<span class="evidence-pill miss" title="超过安全负载，每张牌都会掉队伍状态">⚠ 超载</span>' : ''}
      
          ${S.mode === 'campaign' && S.campaignTask && S.campaignTask.intelBought && S.campaignTask.risk
      
            
      ? `<span class="evidence-pill risk" title="${S.campaignTask.risk.desc}">⚠ ${S.campaignTask.risk.name}</span>`
      
            
      : ''}
      
          <span class="evidence-pill ${task.evidence === 0 ? '' : (enough ? 'ok' : 'miss')}">
      
      ${task.evidence === 0 ? '本趟无需证据' : `证据 ${st.evidence} / ${task.evidence}`}
      
          </span>
      
          <button class="link-btn" data-act="rules" title="玩法说明">?</button>
      
          <button class="btn small ghost" data-act="retreat">提前撤退</button>
      
        </div>
      
      </header>`;

    const cardHTML = `
      
      <div class="table-area">
      
        <div class="event-card ${animate ? 'animate' : ''}" data-cat="${card.cat}">
      
          <div class="card-top">
      
      <span class="card-cat">${D.CAT_NAMES[card.cat] || ''}</span>
      
      <span class="card-scene">${card.scene}</span>
      
          </div>
      
          <p class="card-text">${card.text}</p>
      
          <div class="options">${optionsHTML(opts)}</div>
      
          <div class="card-foot">
      
      <span>牌 ${st.index + 1} / ${st.deck.length} · 负载上限 ${st.cap}</span>
      
      <span>按 ← / → 或 A / D 选择</span>
      
          </div>
      
        </div>
      
      </div>`;

    return runShell(runCoachHTML() + hud + peekLine + cardHTML, consumablesHTML());
  }

  function runShell(main, dock) {
    const st = S.run;
    if (st && st.status !== 'running') {
      
      return `<div class="run-screen"><div class="run-screens active">${endCardHTML()}</div></div>`;
    }
    const tutorial = S.mode === 'prologue' && S.runTutorial ? runTutorialHTML() : '';
    return `<div class="run-screen"><div class="run-screens active">${main}${dock}${tutorial}</div></div>`;
  }

  /* =================================================================
   * 五、经理层：四店窗口
   * ================================================================= */
  function weightHintOf(task) { return Campaign.weightHint(task); }

  function navHTML() {
    const c = S.campaign;
    const tabs = [
      
      { id: 'agency', icon: '🧾', name: '迷途旅行社', sub: '任务 · 委派 · 情报' },
      
      { id: 'tavern', icon: '🍺', name: '巡回酒馆', sub: '队伍 · 疲劳 · 招人' },
      
      { id: 'patch', icon: '🔧', name: '补丁铺', sub: '道具 · 背包 · 回收' },
      
      { id: 'boat', icon: '⛵', name: '漏勺号', sub: '接单 · 出勤 · 上船' },
      
      { id: 'season', icon: '🌊', name: '壶潮季', sub: '天气 · 考核 · 信用榜' },
    ];
    const firstWeek = isFirstWeekCampaign(c);
    const basicContractWeek = isBasicContractWeek(c);
    const visibleTabs = LITE_WEEK1
      
      ? tabs.map(t => Object.assign({}, t, {
      
          sub: ({ agency: '接任务', tavern: '招人', patch: '买道具', boat: '出勤' })[t.id] || t.sub,
      
          locked: t.id === 'season',
      
        }))
      
      : (firstWeek || basicContractWeek)
      
        ? tabs.map(t => Object.assign({}, t, {
      
            
      locked: isWeekSevenCampaign(c)
        ? false
        : isBasicItemWeek(c)
        ? !['agency', 'tavern', 'patch', 'boat'].includes(t.id)
        : isThirdWeekCampaign(c)
      
            
          ? !['agency', 'tavern', 'boat'].includes(t.id)
      
            
          : !['agency', 'boat'].includes(t.id),
      
            
      sub: t.id === 'agency' && basicContractWeek ? '基础委托 · 截止时间'
      
            
        : t.id === 'tavern' && isCrewIntroWeek(c) ? '招募 · 轮换 · 休整'
      
            
        : t.id === 'patch' && isBasicItemWeek(c) ? '基础道具 · 背包'
      
            
        : t.id === 'season' && Campaign.mailUnreadCount(c) ? `${t.sub} · ${Campaign.mailUnreadCount(c)} 封新信`
        : isWeekSevenCampaign(c) ? t.sub
        : ['agency', 'boat'].includes(t.id) ? t.sub : '后续周次开放',
      
          }))
      
        : tabs;
    return `<nav class="store-nav">${visibleTabs.map(t => `
      
      <button class="store-tab ${S.campaignPanel === t.id ? 'active' : ''} ${t.locked ? 'locked' : ''}" ${t.locked ? '' : `data-act="panel" data-panel="${t.id}"`}>
      
        <span class="st-icon">${t.icon}</span>
      
        <span class="st-info"><b>${t.name}</b><i>${t.sub}</i></span>
      
      </button>`).join('')}</nav>`;
  }

  function firstWeekBriefHTML() {
    if (!isFirstWeekCampaign()) return '';
    const names = S.campaign.travelers.map(t => t.name).join('、');
    const taskDone = !S.campaign.tasks.some(t => t.type === 'urgent');
    if (taskDone) return `<section class="first-week-complete">
      
      <div class="fwb-kicker">壶潮季 · 第一周简讯</div>
      
      <h3>第一趟出勤已经结束</h3>
      
      <p>${names}已经办完了本周的紧急差事。点击下方按钮结束第一周，查看周报并进入下一周。</p>
      
      <button class="btn primary" data-act="end-week">结束第一周 →</button>
    </section>`;
    return `<section class="first-week-brief">
      
      <div class="fwb-kicker">壶潮季 · 第一周简讯</div>
      
      <p>联盟急报：三号潮口出现裂缝。五位固定旅人——${names}——已经备好出发。先在旅行社接下差事，再到漏勺号完成第一趟出勤；其他经营业务会在后续周次逐步开放。</p>
    </section>`;
  }

  function secondWeekBriefHTML() {
    if (!isSecondWeekCampaign()) return '';
    const c = S.campaign;
    const initialSlots = Campaign.slotsPerWeekOf(c);
    const followUp = c.slotsLeft === 0
      
      ? '本周两格出勤已用完，可以结束第二周。'
      
      : c.slotsLeft < initialSlots
      
        ? '第一趟已经返航；完成或接下另一份委托，再安排第二趟。'
      
        : '先比较委托的报酬和截止时间，再挑选本周要办的单子。';
    return `<section class="first-week-brief basic-contract-brief">
      
      <div class="fwb-kicker">壶潮季 · 第二周简讯</div>
      
      <h3>本周有两格出勤，委托由你挑</h3>
      
      <p>旅行社刊出三份基础委托。先看截止时间，再挑最多两单；期限按周计算，周末会过期。${followUp}情报和其他经营业务稍后开放。</p>
    </section>`;
  }

  function thirdWeekBriefHTML() {
    if (!isThirdWeekCampaign()) return '';
    return `<section class="first-week-brief basic-contract-brief">
      
      <div class="fwb-kicker">壶潮季 · 第三周简讯</div>
      
      <h3>差事变多了，队伍也要轮换</h3>
      
      <p>本周拥有三格出勤，并且人员每次出勤都会积累疲劳值。试着在酒馆招募新人轮换或者休整来缓解疲劳吧。</p>
    </section>`;
  }

  function fourthWeekBriefHTML() {
    if (!isBasicItemWeek() || isRatingLessonWeek() || isWeekSixCampaign() || isWeekSevenCampaign()) return '';
    return `<section class="first-week-brief basic-contract-brief">
      
      <div class="fwb-kicker">壶潮季 · 第四周简讯</div>
      
      <h3>补丁铺送来第一批实用道具</h3>
      
      <p>本周可在补丁铺购买基础补给，并在漏勺号出发时带一件。每件道具会直接改变对应仪表；带上船后，出勤中找到合适时机再用。其他改造和高级道具暂不开放。</p>
    </section>`;
  }

  function fifthWeekBriefHTML() {
    if (!isRatingLessonWeek()) return '';
    const links = DIM_ORDER.map(k => {
      
      const m = DIM_META[k];
      
      return `<span class="dim-chip" style="--dim:${m.color}">${m.icon} ${m.role} → ${m.gauge}</span>`;
    }).join('');
    return `<section class="first-week-brief basic-contract-brief rating-lesson-brief">
      
      <div class="fwb-kicker">壶潮季 · 第五周成绩单</div>
      
      <h3>评级看的是整趟表现，不是职业标签</h3>
      
      <p>委托卡上的“主攻 / 次攻”指出本单更看重哪些仪表。结算时，四项表现按权重合成总分，再与本单标准分比较；队员的职业提示其词条方向，真正影响仪表的是队员词条和你的出勤选择。</p>
      
      <div class="dim-chips rating-role-map">${links}</div>
      
      <details class="rating-thresholds"><summary>展开查看评级门槛</summary><p>总分 ÷ 标准分：S ≥ 100% · A ≥ 90% · B ≥ 80% · C ≥ 70% · D ≥ 60% · F ＜ 60%。结算单会列出每项得分、权重和加权结果。</p></details>
    </section>`;
  }

  function weekSixBriefHTML() {
    if (!isWeekSixCampaign()) return '';
    return `<section class="first-week-brief basic-contract-brief week-six-brief">
      
      <div class="fwb-kicker">壶潮季 · 第六周简讯</div>
      
      <h3>本周开放：委派与情报</h3>
      
      <div class="week-six-steps">
      
        <p><b>1 · 委派</b>：联盟派下来的义务单，有截止时间。评级 D 以上通过；F 不给信用，也不解锁下一档。</p>
      
        <p><b>2 · 情报</b>：任务卡上的「情报 15 金」，或漏勺号里的情报；买完能看到这单的真实权重，以及出发时生效的隐藏风险。</p>
      
      </div>
    </section>`;
  }

  function weekSevenBriefHTML() {
    const c = S.campaign;
    if (!c || c.season !== 1 || c.week !== 7) return '';
    const now = Campaign.weatherInfo(c);
    const next = Campaign.nextWeatherInfo(c);
    return `<section class="first-week-brief basic-contract-brief week-seven-brief">
      <div class="fwb-kicker">壶潮季 · 第七周简讯</div>
      <h3>天气开始生效，赛季也进入最后两周</h3>
      <p>本周天气：<b>${now.icon} ${now.name}</b>。下周预报：<b>${next.icon} ${next.name}</b>。天气会改变起手仪表、报酬、疲劳或店铺。</p>
      <p>壶潮季页已开放：看本周/下周天气、四店考核进度和信用榜名次。出勤前先看天气，再决定这趟怎么跑。</p>
      <p>信用榜上的对手也开始接单：被抢走的委托不能接，看到合适的先下手。</p>
    </section>`;
  }

  function weekEightBriefHTML() {
    if (!isWeekEightCampaign()) return '';
    return `<section class="first-week-brief basic-contract-brief week-eight-brief">
      <div class="fwb-kicker">壶潮季 · 第八周简讯</div>
      <h3>最后一周，能上的都上</h3>
      <p>本周有 <b>4 格出勤</b>，基础委托也补到 4 张。酒馆队伍上限临时 +2、候选上限 6 个；补丁铺每趟可以带 2 件。</p>
      <p>这些只是最后一周的上限提升。结束本周就进季末结算，升级和人物成长都在休赛期处理。</p>
    </section>`;
  }

  function season2WeekOneBriefHTML() {
    const c = S.campaign;
    if (!c || c.season !== 2 || c.week !== 1) return '';
    return `<section class="first-week-brief s2-welcome">
      <div class="fwb-kicker">第二季 · 第一周</div>
      <h3>四家店全部开门<button class="s2-help-link" data-act="rules">详情看玩法介绍</button></h3>
      <div class="s2-store-briefs">
        <div class="s2-store-brief"><b>🧾 迷途旅行社</b><span>完整任务池开放：任务会挂满、会过期、会补货；救援和核心都要跑多趟。</span></div>
        <div class="s2-store-brief"><b>🍺 巡回酒馆</b><span>完整候选池和人员管理：涨薪、挽留、放人、转会都开始了。</span></div>
        <div class="s2-store-brief"><b>🔧 补丁铺</b><span>12 格货架、高级道具、回收，以及赛季内成长和洗练。</span></div>
        <div class="s2-store-brief"><b>⛵ 漏勺号</b><span>已接任务和委派都在这里出发；挑 5 个人、带好道具，剩下的交给局内。</span></div>
      </div>
    </section>`;
  }

  function season2WeekTwoBriefHTML() {
    const c = S.campaign;
    if (!c || c.season !== 2 || c.week !== 2) return '';
    return `<section class="first-week-brief s2-final-brief">
      <div class="fwb-kicker">第二季 · 第二周</div>
      <h3>高危核心进入任务池</h3>
      <p>本周起会出现高危核心：3 次出勤、4 周时限、报酬和信用都高。不强制接，量力而行。</p>
      <p class="s2-guide-end">引导到这里就结束了。之后怎么接单、怎么养人、怎么冲榜，都交给你。祝你玩得愉快。</p>
    </section>`;
  }

  function firstWeekTaskCardHTML(task, context) {
    const accepted = !!task.accepted;
    const button = context === 'agency'
      
      ? (accepted ? '<span class="tag-soft">已接</span>' : `<button class="btn small primary" data-act="accept-task" data-uid="${task.uid}">接下差事</button>`)
      
      : (accepted ? `<button class="btn small primary" data-act="boat-launch" data-uid="${task.uid}" ${S.campaign.slotsLeft <= 0 ? 'disabled' : ''}>出发 →</button>` : '<span class="tag-soft">先去旅行社接下差事</span>');
    return `<article class="first-week-task">
      
      <div class="fwt-kicker">联盟急报 · 本周出勤</div>
      
      <h3>${task.name}</h3>
      
      <p>${task.desc}</p>
      
      <div class="fwt-foot"><span>完成后报酬：${task.gold} 金</span>${button}</div>
    </article>`;
  }

  function taskRiskText(task) {
    if (task.risk) return `${task.risk.name}：${task.risk.desc}`;
    return '没有额外隐藏风险。';
  }

  function taskIntelBlockHTML(task) {
    if (!task.intelBought) return '';
    const w = task.weights || [40, 45, 8, 7];
    const names = DIM_ORDER.map(k => DIM_META[k].name);
    const total = w.reduce((a, b) => a + b, 0) || 1;
    const weights = w.map((v, i) => `${names[i]} ${Math.round(v / total * 100)}%`).join(' · ');
    return `<div class="ct-intel">
      
      <div><b>真实权重</b><span>${weights}</span></div>
      
      <div><b>隐藏风险</b><span>${taskRiskText(task)}</span></div>
    </div>`;
  }

  function basicContractTaskCardHTML(task, context) {
    const c = S.campaign;
    const deadline = task.expiresIn <= 1 ? '本周截止' : `还剩 ${task.expiresIn} 周`;
    const accepted = !!task.accepted;
    const taken = !!task.takenBy;
  const runs = task.runsTotal || 1;
  const runsLeft = task.runsLeft || runs;
    const windOpen = c.season === 1 && c.week >= 5;
    const intelOpen = c.season === 1 && c.week >= 6;
    let action;
    if (context === 'agency') {
      
      action = taken
        ? `<span class="tag-soft taken-tag">已被 ${task.takenBy.icon || ''}${task.takenBy.name} 接取</span>`
        : accepted
        ? '<button class="link-btn" data-act="panel" data-panel="boat">已接 · 去漏勺号出发 →</button>'
        : `<button class="btn small primary" data-act="accept-task" data-uid="${task.uid}" ${c.slotsLeft <= 0 ? 'disabled' : ''}>接下这单</button>`;
    } else {
      
      action = `<button class="btn small primary" data-act="boat-launch" data-uid="${task.uid}" ${c.slotsLeft <= 0 ? 'disabled' : ''}>出发 −1 格</button>`;
    }
    let intelBtn = '';
    if (context === 'agency' && !taken) {
      if (task.intelBought) intelBtn = '<span class="tag-soft">情报已买</span>';
      else if (intelOpen) {
        const cost = D.CAMPAIGN.taskIntelCost || 15;
        intelBtn = `<button class="btn small" data-act="buy-task-intel" data-uid="${task.uid}" ${c.gold < cost ? 'disabled' : ''}>情报 ${cost} 金</button>`;
      }
    }
    return `<article class="camp-task basic-contract ${accepted ? 'is-accepted' : ''} ${taken ? 'is-taken' : ''}" style="--task-color:${task.color || '#6b4a8f'}">
      
      <div class="ct-head"><span class="ct-kind">基础委托</span><span class="ct-deadline ${task.expiresIn <= 1 ? 'urgent' : ''}">${deadline}</span></div>
      
      <div class="ct-name">${task.name}</div>
      
      <div class="ct-desc">${task.desc}</div>
      
      <div class="ct-meta">需出勤 ${runs} 次${accepted && runsLeft < runs ? `（还剩 ${runsLeft} 次）` : ''}</div>
      
      ${windOpen ? `<div class="weight-banner">本单考察方向</div>${task.randomWeights ? '<div class="mini-note">自由散单每趟随机决定权重；出勤结算单会列出本趟的实际权重。</div>' : dimChipsHTML(task.weights)}` : ''}
      ${intelOpen ? taskIntelBlockHTML(task) : ''}
      
      <div class="ct-foot"><span class="ct-reward">每趟 ${task.gold} 金${runs > 1 ? ` · 共 ${task.gold * runs} 金` : ''}${task.credit ? ` · ${task.credit} 信用` : ''}</span><span class="ct-actions">${intelBtn}${action}</span></div>
    </article>`;
  }

  function taskCardHTML(task, context) {
    if (LITE_WEEK1) return liteTaskCardHTML(task, context);
    const c = S.campaign;
    if (isBasicContractWeek(c) && task.kind !== 'delegation') return basicContractTaskCardHTML(task, context);
    const isDelegation = task.kind === 'delegation';
    const taken = !!task.takenBy;
    let btn = '';
    let intelBtn = '';
    if (context === 'agency') {
      
      if (task.intelBought) {
      
        intelBtn = '<span class="tag-soft">情报已买</span>';
      
      } else if (!taken) {
      
        const cost = D.CAMPAIGN.taskIntelCost || 15;
      
        intelBtn = `<button class="btn small" data-act="buy-task-intel" data-uid="${task.uid}" ${c.gold < cost ? 'disabled' : ''}>情报 ${cost} 金</button>`;
      
      }
      
      if (isDelegation) {
      
        btn = '<span class="tag-soft">这是义务 · 去漏勺号出勤</span>';
      
      } else if (taken) {
      
        btn = `<span class="tag-soft taken-tag">已被 ${task.takenBy.icon || ''}${task.takenBy.name} 接取</span>`;
      
      } else if (task.accepted) {
      
        btn = '<span class="tag-soft">已接 · 去漏勺号</span>';
      
      } else {
      
        btn = `<button class="btn small" data-act="accept-task" data-uid="${task.uid}">接单</button>`;
      
      }
    } else {
      
      btn = `<button class="btn small primary" data-act="boat-launch" data-uid="${task.uid}" ${c.slotsLeft <= 0 ? 'disabled' : ''}>出发 −1 格</button>`;
    }
    return `
      
      <div class="camp-task ${isDelegation ? 'is-delegation' : 'is-self'} ${taken ? 'is-taken' : ''} ${task.type === 'core' ? 'is-core' : ''}" style="--task-color:${task.color || '#6b4a8f'}">
      
        <div class="ct-head">
      
          <span class="ct-kind">${isDelegation ? `委派 · ${task.tier} 档` : (task.type === 'core' ? '高危核心' : '自选任务')}</span>
      
          <span class="ct-deadline ${task.expiresIn <= 1 ? 'urgent' : ''}">还剩 ${task.expiresIn} 周</span>
      
        </div>
      
        <div class="ct-name">${task.name}</div>
      
        <div class="ct-meta">${task.tagline}　·　需出勤 ${task.runsTotal} 次${task.runsTotal > 1 ? `（还剩 ${task.runsLeft} 次）` : ''}　·　证据 ≥ ${task.evidence}</div>
      
        <div class="weight-banner">任务风向：<b>${weightHintOf(task)}</b></div>
      
        ${dimChipsHTML(task.weights)}
      
        ${taskIntelBlockHTML(task)}
      
        <div class="ct-desc">${task.desc}</div>
      
        <div class="ct-foot">
      
          <span class="ct-reward">+${task.gold} 金${task.credit ? ` / +${task.credit} 信用` : ''}　·　标准分 ${task.standard}</span>
      
          <span class="ct-actions">${intelBtn}${btn}</span>
      
        </div>
      
      </div>`;
  }

  /* 词条小标签 + 悬浮说明（酒馆 / 补丁铺 / 候选人都用这一套） */
  function traitChipHTML(tr) {
    const desc = tr.desc || (tr.active && tr.active.desc) || '';
    return `<span class="mini-trait ${tr.rarity}">${tr.name}<span class="trait-tip"><b>${tr.name}</b><i>${tr.rarity}</i><em>${desc}</em></span></span>`;
  }

  function rosterCardHTML(t) {
    const c = S.campaign;
    const warn = Campaign.transferWarning(c, t);
    const value = Campaign.transferValueOf(t);
    const full = c.travelers.length <= 5;
    return `
      
      <div class="roster-card ${warn ? 'warn' : ''}">
      
        <div class="rc-head">
      
          <b>${t.name}</b>${roleBadgeHTML(t.role)}
      
          <span class="rc-wage">${t.wage} 金/周${t.raises ? `（含涨薪 ${t.raises}）` : ''}</span>
      
        </div>
      
        <div class="rc-quote">「${t.quote || '……'}」</div>
      
        <div class="rc-fatigue">
      
          <span>疲劳 ${t.fatigue}</span>
      
          <div class="fatigue-bar"><i style="width:${t.fatigue}%"></i></div>
      
        </div>
      
        <div class="rc-stat-line">
      
          <span>词条 ${t.traits.length}/4</span>
      
          <span>成长点 ${t.growth}</span>
      
          <span>身价 <b>${value}</b> 金</span>
      
        </div>
      
        <div class="rc-traits">${t.traits.map(tr => traitChipHTML(tr)).join('')}</div>
      
        <div class="rc-foot">
      
          <span class="rc-note">${warn ? '<span class="warn-text">⚠ 连续没上场，想转会</span>' : `上次上场：第 ${t.lastPlayed || '—'} 周`}</span>
      
          <span class="rc-actions">
      
            
      <button class="link-btn" data-act="sell-traveler" data-id="${t.id}" ${full ? 'disabled' : ''}>转会 +${value} 金</button>
      
            
      <button class="link-btn" data-act="release" data-id="${t.id}" ${full ? 'disabled' : ''}>放走</button>
      
          </span>
      
        </div>
      
      </div>`;
  }

  function candCardHTML(cand) {
    if (LITE_WEEK1) return liteCandCardHTML(cand);
    const c = S.campaign;
    const price = Campaign.candidatePrice(c, cand);
    const full = c.travelers.length >= Campaign.rosterCapOf(c);
    const repOk = c.reputation >= (cand.repReq || 0);
    const canPay = c.gold >= price && repOk;
    const tierLabel = cand.tier === 'legend' ? '独一档' : cand.tier === 'elite' ? '尖子' : cand.tier === 'pro' ? '熟练' : '新人';
    return `
      
      <div class="cand-card ${cand.tier}">
      
        <div class="cc-head">
      
          <b>${cand.name}</b>${roleBadgeHTML(cand.role)}
      
          <span class="cc-tier">${tierLabel}</span>
      
        </div>
      
        <div class="cc-quote">「${cand.quote}」</div>
      
        <div class="rc-traits">${cand.traits.map(tr => traitChipHTML(tr)).join('')}</div>
      
        <div class="cc-foot">
      
          <span>${price} 金 · 需口碑 ≥ ${cand.repReq || 0} · 周薪 ${3 + cand.traits.length * 2}</span>
      
          <button class="btn small primary" data-act="recruit" data-uid="${cand.uid}" ${(full || !canPay) ? 'disabled' : ''}>招募</button>
      
        </div>
      
        ${full ? '<div class="mini-note">队伍满了，先在后院解雇一个。</div>'
      
          : (!repOk ? `<div class="mini-note">口碑还差 ${(cand.repReq || 0) - c.reputation}：多跑几趟帮人的活。</div>` : '')}
      
      </div>`;
  }

  function shopCardHTML(entry, index) {
    const c = S.campaign;
    const it = D.ITEMS[entry.id];
    const price = Campaign.itemBuyPrice(c, entry.id);
    const full = Campaign.inventoryCount(c) >= D.CAMPAIGN.backpackSlots;
    const sold = entry.sold;
    return `
      
      <div class="shop-card item-tier-${it.tier || '普通'} ${sold ? 'sold' : ''}">
      
        <div class="sc-head"><b>${it.name}</b><span class="i-tag">${it.tier || '普通'} · ${it.tag}</span><span class="sc-price">${price} 金</span></div>
      
        <div class="sc-desc">${it.desc}</div>
      
        <button class="btn small ${sold ? '' : 'primary'}" data-act="buy-item" data-i="${index}" ${(sold || full || c.gold < price) ? 'disabled' : ''}>${sold ? '已售罄' : '买'}</button>
      
      </div>`;
  }

  function invCardHTML(id) {
    const c = S.campaign;
    const it = D.ITEMS[id];
    const n = c.inventory[id];
    return `
      
      <div class="inv-card item-tier-${it.tier || '普通'}">
      
        <div class="sc-head"><b>${it.name}</b><span class="inv-count">×${n}</span></div>
      
        <div class="sc-desc">${it.desc}</div>
      
        <button class="btn small" data-act="sell-item" data-id="${id}">回收 +${Campaign.itemSellPrice(c, id)} 金</button>
      
      </div>`;
  }

  /* ---------------- 四个店铺面板 ---------------- */
  function examBannerHTML(id) {
    const c = S.campaign;
    const info = Campaign.storeExamInfo(c, id);
    if (!info) return '<div class="exam-card done"><div class="exam-head"><b>升级考核</b><span>本店已满级</span></div></div>';
    const doneCount = info.reqs.filter(r => r.done).length;
    const rows = info.reqs.map(r => {
      
      const pct = r.max
      
        ? Math.max(0, Math.min(100, (1 - r.cur / Math.max(1, r.target)) * 100))
      
        : Math.min(100, (r.cur / Math.max(1, r.target)) * 100);
      
      return `<div class="exam-req">
      
        <span>${r.label}</span>
      
        <div class="exam-bar"><i class="${r.done ? 'done' : ''}" style="width:${pct}%"></i></div>
      
        <b>${r.cur}/${r.target}${r.max ? '（上限）' : ''}</b>
      
      </div>`;
    }).join('');
    return `<div class="exam-card ${info.done ? 'done' : ''}">
      
      <div class="exam-head"><b>升级考核 · ${info.exam.name}</b><span>${doneCount}/${info.reqs.length}${info.done ? ' ✔ 已达标' : ''}</span></div>
      
      ${rows}
      
      <div class="exam-foot">${info.done ? '季末达标，休赛期可以升级。' : '季末结算时检查，每季重新累计。'}</div>
    </div>`;
  }

  function liteLock(html) {
    if (!LITE_WEEK1) return html;
    return `<div class="locked-block"><div class="locked-inner">${html}</div><div class="lock-mask"></div></div>`;
  }

  function liteTaskCardHTML(task, context) {
    const c = S.campaign;
    const accepted = !!task.accepted;
    const canGo = accepted && task.runsLeft > 0 && c.travelers.length >= 5 && c.slotsLeft > 0;
    let btn = '';
    if (context === 'agency') {
      
      btn = accepted
      
        ? '<span class="tag-soft">已接</span>'
      
        : `<button class="btn small primary" data-act="accept-task" data-uid="${task.uid}">接单</button>`;
    } else {
      
      btn = `<button class="btn small primary" data-act="boat-launch" data-uid="${task.uid}" ${canGo ? '' : 'disabled'}>出发 −1 格</button>`;
    }
    return `<div class="camp-task">
      
      <div class="ct-head"><b>${task.name}</b><span class="tag-soft">${task.tagline || ''}</span></div>
      
      ${liteLock(`<div class="weight-banner">任务风向：<b>${Campaign.weightHint(task)}</b></div>${dimChipsHTML(task.weights)}<div class="ct-meta">还剩 ${task.expiresIn} 周 · 证据 ≥ ${task.evidence} · 标准分 ${task.standard}</div>`)}
      
      <div class="ct-desc">${task.desc}</div>
      
      <div class="ct-foot"><span class="ct-reward">+${task.gold} 金</span>${btn}</div>
    </div>`;
  }

  function liteCandCardHTML(cand) {
    const c = S.campaign;
    const price = Campaign.candidatePrice(c, cand);
    const can = c.gold >= price && c.reputation >= (cand.repReq || 0) && c.travelers.length < Campaign.rosterCapOf(c);
    return `<div class="cand-card">
      
      <div class="cc-head"><b>${cand.name}</b>${roleBadgeHTML(cand.role)}</div>
      
      <div class="cc-price">${price} 金${cand.repReq ? ` · 口碑 ${cand.repReq}` : ''}</div>
      
      <button class="btn small primary" data-act="recruit" data-uid="${cand.uid}" ${can ? '' : 'disabled'}>招募</button>
    </div>`;
  }

  function liteAgencyPanel() {
    const c = S.campaign;
    return `<div class="task-board">
      
      <div class="section-title"><span>联盟委派</span><span class="hint">义务</span></div>
      
      ${liteLock(c.delegations.length ? c.delegations.map(t => liteTaskCardHTML(t, 'agency')).join('') : '<div class="empty-line">暂无委派</div>')}
      
      <div class="section-title"><span>本周可接的任务</span><span class="hint">先接一张，再去酒馆招人</span></div>
      
      ${c.tasks.length ? c.tasks.map(t => liteTaskCardHTML(t, 'agency')).join('') : '<div class="empty-line">本周没有任务。</div>'}
    </div>`;
  }

  function liteRosterCardHTML(t) {
    return `<div class="roster-card">
      
      <div class="rc-head"><b>${t.name}</b>${roleBadgeHTML(t.role)}</div>
      
      <div class="rc-quote">「${t.quote || '……'}」</div>
      
      <div class="rc-wage">${t.wage} 金/周 · 疲劳 ${t.fatigue}</div>
      
      <div class="rc-traits">${t.traits.map(tr => traitChipHTML(tr)).join('')}</div>
    </div>`;
  }

  function liteTavernPanel() {
    const c = S.campaign;
    const avgFat = Math.round(c.travelers.reduce((a, t) => a + t.fatigue, 0) / Math.max(1, c.travelers.length));
    return `<div class="task-board">
      
      <div class="panel-top">
      
        <div class="section-title" style="margin-top:0"><span>队伍 ${c.travelers.length} / ${Campaign.rosterCapOf(c)}</span><span class="hint">平均疲劳 ${avgFat}</span></div>
      
        <button class="btn small" data-act="rest" ${(c.restedThisWeek || c.gold < Campaign.restCostOf(c)) ? 'disabled' : ''}>休整（${Campaign.restCostOf(c)} 金）</button>
      
      </div>
      
      <div class="section-title"><span>我的小队</span><span class="hint">疲劳高会掉状态</span></div>
      
      <div class="roster-grid">${c.travelers.length ? c.travelers.map(liteRosterCardHTML).join('') : '<div class="empty-line">还没有人，先招 5 个。</div>'}</div>
      
      <div class="section-title"><span>可招募的人</span><span class="hint">金币购买 · 口碑达到门槛才能招</span></div>
      
      ${c.candidates.length ? `<div class="cand-grid">${c.candidates.map(candCardHTML).join('')}</div>` : '<div class="empty-line">这周没人来。</div>'}
    </div>`;
  }

  function liteGrowthRows(c) {
    return c.travelers.map(t => `<div class="growth-row">
      
      <span class="gr-name">${t.name}<i>${t.role}</i></span>
      
      <span class="gr-traits">${t.traits.map(tr => traitChipHTML(tr)).join('')}</span>
      
      <span class="gr-growth">成长点 <b>${t.growth}</b></span>
      
      <span class="gr-actions"><button class="btn small" disabled>加词条</button><button class="btn small" disabled>洗练</button></span>
    </div>`).join('');
  }

  function litePatchPanel() {
    const c = S.campaign;
    if (Campaign.patchClosed(c)) return '<div class="empty-line">今天补丁铺关门，下周再来。</div>';
    const ids = Object.keys(c.inventory).filter(id => c.inventory[id] > 0);
    return `<div class="task-board">
      
      <div class="section-title"><span>背包 ${ids.length} 种 / ${D.CAMPAIGN.backpackSlots} 格</span><span class="hint">出勤时带上</span></div>
      
      <div class="inv-grid">${ids.length ? ids.map(id => {
      
        const it = D.ITEMS[id] || {};
      
        return `<div class="inv-card"><div class="sc-head"><b>${it.name || id}</b><span class="inv-count">×${c.inventory[id]}</span></div><div class="sc-desc">${it.desc || ''}</div></div>`;
      
      }).join('') : '<div class="empty-line">背包空了，先买两张。</div>'}</div>
      
      <div class="section-title"><span>本周货架</span><span class="hint">买 2 件道具，出勤时能救命</span></div>
      
      <div class="shop-grid">${c.shop.map(shopCardHTML).join('')}</div>
      
      <div class="section-title"><span>旅人改造</span><span class="hint">成长 · 洗练</span></div>
      
      ${liteLock(`<div class="growth-list">${liteGrowthRows(c)}</div>`)}
    </div>`;
  }

  function liteBoatPanel() {
    const c = S.campaign;
    const accepted = c.tasks.filter(t => t.accepted);
    return `<div class="task-board">
      
      <div class="section-title"><span>今天出哪趟</span><span class="hint">出勤格 ${c.slotsLeft} / ${Campaign.slotsPerWeekOf(c)}</span></div>
      
      ${c.travelers.length < 5 ? `<div class="empty-line">还差 ${5 - c.travelers.length} 人才能上船，先去酒馆招人。</div>` : ''}
      
      ${accepted.length ? accepted.map(t => liteTaskCardHTML(t, 'boat')).join('') : '<div class="empty-line">还没接单。先去旅行社接一张。</div>'}
    </div>`;
  }

  function liteCampaignPage() {
    const c = S.campaign;
    const slotDots = Array.from({ length: Campaign.slotsPerWeekOf(c) }, (_, i) => `<span class="slot ${i < c.slotsLeft ? 'on' : ''}"></span>`).join('');
    return `<div class="page campaign-page">
      
      <header class="camp-head">
      
        <div class="camp-head-left">
      
          <div class="camp-week">第一周</div>
      
          <div class="camp-slots">出勤格 ${slotDots} <span class="slot-text">${c.slotsLeft} / ${Campaign.slotsPerWeekOf(c)}</span></div>
      
        </div>
      
        <div class="camp-res">
      
          <span class="res-chip"><i>金</i>${c.gold}</span>
      
          ${liteLock(`<span class="res-chip"><i>信用</i>${c.credit}</span><span class="res-chip"><i>口碑</i>${c.reputation}</span><span class="res-chip"><i>${Campaign.weatherInfo(c).icon} ${Campaign.weatherInfo(c).name}</i></span><span class="res-chip"><i>信用</i>第 ${Campaign.rankOf(c)}</span>`)}
      
        </div>
      
        <div class="camp-head-actions">
      
          <button class="btn small" data-act="end-week">结束本周</button>
      
        </div>
      
      </header>
      
      ${navHTML()}
      
      <div class="camp-panel">${panelFor(S.campaignPanel)}</div>
    </div>`;
  }

  function agencyPanel() {
    if (LITE_WEEK1) return liteAgencyPanel();
    const c = S.campaign;
    if (isFirstWeekCampaign(c)) {
      
      const task = c.tasks.find(t => t.type === 'urgent') || c.tasks[0];
      
      return `<div class="task-board first-week-board">
      
        <div class="section-title"><span>本周只办一件事</span><span class="hint">接下紧急堵口单</span></div>
      
        ${task ? firstWeekTaskCardHTML(task, 'agency') : '<div class="empty-line">这趟差事已结束。去漏勺号查看队伍。</div>'}
      
      </div>`;
    }
    if (isBasicContractWeek(c)) {
      
      const accepted = c.tasks.filter(t => t.accepted).length;
      
      return `<div class="task-board basic-contract-board">
      
        ${c.delegations.length ? `<div class="section-title"><span>联盟委派</span><span class="hint">义务 · 3 周内完成</span></div>${c.delegations.map(t => taskCardHTML(t, 'agency')).join('')}` : ''}
        <div class="section-title"><span>本周基础委托</span><span class="hint">已接 ${accepted} / ${c.slotsLeft} 格</span></div>
      
        <p class="mini-note">每单按卡片上的次数出勤；标着「本周截止」的委托若没在周末前完成，就会从任务栏撤下。</p>
      
        ${c.tasks.length ? c.tasks.map(t => taskCardHTML(t, 'agency')).join('') : '<div class="empty-line">本周委托已办完或过期。可以结束本周。</div>'}
      
      </div>`;
    }
    const accepted = c.tasks.filter(t => t.accepted).length;
    return `
      
      <div class="task-board">
      
      <div class="section-title"><span>联盟委派（超时会违约）</span><span class="hint">已解锁 ${Campaign.profileOf(c).unlockedTier} 档 · 义务</span></div>
      
      ${c.delegations.length ? c.delegations.map(t => taskCardHTML(t, 'agency')).join('') : '<div class="empty-line">暂无委派（联盟隔周派一张）</div>'}

      
      <div class="section-title"><span>自选任务栏（会过期）</span><span class="hint">已接 ${accepted} 张 · 最多挂 ${Campaign.boardCapOf(c)} 张</span></div>
      
      ${c.tasks.length ? c.tasks.map(t => taskCardHTML(t, 'agency')).join('') : '<div class="empty-line">任务栏空了，等下周刷新。</div>'}
      
      <div class="mini-note">任务条上只给"主攻/次攻"风向，精确权重不公开（玩法设计 6.8）。接了单之后去漏勺号安排出勤。</div>
      
      </div>`;
  }

  function tavernPanel() {
    if (LITE_WEEK1) return liteTavernPanel();
    const c = S.campaign;
    if (isCrewIntroWeek(c)) return thirdWeekTavernPanel();
    const wx = Campaign.weatherInfo(c);
    const avgFat = Math.round(c.travelers.reduce((a, t) => a + t.fatigue, 0) / Math.max(1, c.travelers.length));
    const wages = c.travelers.reduce((a, t) => a + t.wage, 0);
    const raiseCards = (c.pendingRaises || []).map(r => {
      
      const t = c.travelers.find(x => x.id === r.travelerId);
      
      if (!t) return '';
      
      return `
      
        <div class="pending-card raise">
      
          <b>${t.name}</b> 要求涨薪 <b>+${r.amount} 金/周</b>
      
          <span class="pc-note">${t.traits.length} 个词条 · 现在 ${t.wage} 金/周（词条越多要得越多）</span>
      
          <span class="pc-actions">
      
            
      <button class="btn small primary" data-act="accept-raise" data-id="${t.id}">答应</button>
      
            
      <button class="btn small" data-act="decline-raise" data-id="${t.id}">拒绝（他会想走）</button>
      
          </span>
      
        </div>`;
    }).join('');
    const transferCards = (c.pendingTransfers || []).map(r => {
      
      const t = c.travelers.find(x => x.id === r.travelerId);
      
      if (!t) return '';
      
      return `
      
        <div class="pending-card transfer">
      
          <b>${t.name}</b> 想转会 <span class="pc-note">（${r.weeksLeft} 周内不处理就自己走）</span>
      
          <span class="pc-actions">
      
            
      <button class="btn small primary" data-act="keep-traveler" data-id="${t.id}">挽留（${D.CAMPAIGN.keepCost.gold} 金 + ${D.CAMPAIGN.keepCost.reputation} 口碑）</button>
      
            
      <button class="btn small" data-act="let-leave" data-id="${t.id}">放人</button>
      
          </span>
      
        </div>`;
    }).join('');
    const pendingHTML = (raiseCards || transferCards)
      
      ? `<div class="pending-block">${raiseCards}${transferCards}</div>` : '';
    return `
      
      <div class="panel-top">
      
        <div class="section-title" style="margin-top:0"><span>队伍 ${c.travelers.length} / ${Campaign.rosterCapOf(c)}</span><span class="hint">口碑 ${c.reputation} · 平均疲劳 ${avgFat} · 周薪共 ${wages} 金/周</span></div>
      
        <button class="btn small" data-act="rest" ${(c.restedThisWeek || c.gold < Campaign.restCostOf(c)) ? 'disabled' : ''}>酒馆休整（${Campaign.restCostOf(c)} 金，全队疲劳 −${Campaign.restRecoverOf(c)}）</button>
      
      </div>
      
      ${pendingHTML}
      
      ${c.travelers.length < 5 ? '<div class="empty-line">还差 ' + (5 - c.travelers.length) + ' 人才能出勤——先招够 5 个。</div>' : ''}
      
      <div class="roster-grid">${c.travelers.map(rosterCardHTML).join('')}</div>

      
      <div class="section-title"><span>旅人潮 · 酒馆里的生面孔</span><span class="hint">${wx.candidateBonus ? `庆典：本周多 ${wx.candidateBonus} 位 · ` : ''}每人只待 ${D.CAMPAIGN.recruitWeeks} 周 · 金币购买 · 口碑达到门槛才能招</span></div>
      
      ${c.candidates.length
      
        ? `<div class="cand-grid">${c.candidates.map(candCardHTML).join('')}</div>`
      
        : '<div class="empty-line">这周没什么生面孔（酒馆状态越好、来的人越多）。</div>'}
      
      <div class="mini-note">周薪 = 3 + 词条数 × 2 + 累计涨薪。连续 ${D.CAMPAIGN.transferWarningWeeks} 周没上场会想转会；放着不管会自己走。想腾位置又不想掉口碑，可以"转会"换钱（成长点越高越值钱）。</div>`;
  }

  function thirdWeekRosterCardHTML(t) {
    return `<article class="roster-card">
      
      <div class="rc-head"><b>${t.name}</b>${roleBadgeHTML(t.role)}<span class="rc-wage">${t.wage} 金/周</span></div>
      
      <div class="rc-quote">「${t.quote || '……'}」</div>
      
      <div class="rc-fatigue"><span>疲劳 ${t.fatigue}</span><div class="fatigue-bar"><i style="width:${t.fatigue}%"></i></div></div>
      
      <div class="rc-traits">${(t.traits || []).length ? t.traits.map(tr => traitChipHTML(tr)).join('') : '<span class="mini-note">暂无词条</span>'}</div>
    </article>`;
  }

  function thirdWeekTavernPanel() {
    const c = S.campaign;
    const avgFat = Math.round(c.travelers.reduce((a, t) => a + t.fatigue, 0) / Math.max(1, c.travelers.length));
    const totalWages = c.travelers.reduce((a, t) => a + t.wage, 0);
    return `<div class="task-board third-week-tavern">
      
      <div class="panel-top">
      
        <div class="section-title" style="margin-top:0"><span>队伍 ${c.travelers.length} / ${Campaign.rosterCapOf(c)}</span><span class="hint">平均疲劳 ${avgFat} · 全队周薪 ${totalWages} 金</span></div>
      
        <button class="btn small" data-act="rest" ${(c.restedThisWeek || c.gold < Campaign.restCostOf(c)) ? 'disabled' : ''}>休整一次（${Campaign.restCostOf(c)} 金，疲劳 −${Campaign.restRecoverOf(c)}）</button>
      
      </div>
      
      <div class="section-title"><span>现有队员</span><span class="hint">出勤准备会优先预选疲劳较低的五人</span></div>
      
      <div class="roster-grid">${c.travelers.map(thirdWeekRosterCardHTML).join('')}</div>
      
      <div class="section-title"><span>旅人潮 · 本周候选人</span><span class="hint">招募新人可以轮换队伍；新人疲劳为 0</span></div>
      
      <div class="mini-note">当前口碑 ${c.reputation}。候选人的招募价格、周薪、口碑要求与稀有度会显示在卡片上。</div>
      
      ${c.candidates.length ? `<div class="cand-grid">${c.candidates.map(candCardHTML).join('')}</div>` : '<div class="empty-line">这周没有候选人。</div>'}
    </div>`;
  }

  function patchPanel() {
    if (LITE_WEEK1) return litePatchPanel();
    const c = S.campaign;
    if (isBasicItemWeek(c)) {
      
      const ids = Object.keys(c.inventory).filter(id => c.inventory[id] > 0 && (D.CAMPAIGN.tutorialItems || []).includes(id));
      
      const shop = c.shop.filter(entry => (D.CAMPAIGN.tutorialItems || []).includes(entry.id));
      
      return `<div class="task-board tutorial-patch-panel">
      
        <div class="section-title"><span>基础补给 · 背包</span><span class="hint">每趟最多携带 ${itemLimit()} 件</span></div>
      
        <div class="inv-grid">${ids.length ? ids.map(id => {
      
          const it = D.ITEMS[id];
      
          return `<div class="inv-card item-tier-${it.tier || '普通'}"><div class="sc-head"><b>${it.name}</b><span class="inv-count">×${c.inventory[id]}</span></div><div class="sc-desc">${it.desc}</div></div>`;
      
        }).join('') : '<div class="empty-line">背包里还没有基础道具。</div>'}</div>
      
        <div class="section-title"><span>本周货架</span><span class="hint">固定三种补给，方便比较效果</span></div>
      
        <div class="shop-grid">${shop.map(shopCardHTML).join('')}</div>
      
        <p class="mini-note">道具买下后进入背包；上船前选一件，出勤中使用后才会消耗。改造、洗练与回收会在后续周次开放。</p>
      
      </div>`;
    }
    if (Campaign.patchClosed(c)) {
      
      return `<div class="empty-line">🎨 采风日，补丁铺关门。今天不能买 / 卖 / 改造，下周再来。</div>`;
    }
    const count = Campaign.inventoryCount(c);
    const sellRate = Math.round(D.CAMPAIGN.sellRate * (1 + Campaign.sellBonusOf(c)) * 100);
    const ids = Object.keys(c.inventory);
    const growRows = c.travelers.map(t => {
      
      const cost = Campaign.growthCostFor(t);
      
      const maxed = t.traits.length >= 4;
      
      const canGrow = !maxed && t.growth >= cost;
      
      const canReroll = c.gold >= D.CAMPAIGN.rerollCost.gold && t.growth >= D.CAMPAIGN.rerollCost.growth;
      
      return `
      
      <div class="growth-row">
      
        <span class="gr-name">${t.name}<i>${t.role}</i></span>
      
        <span class="gr-traits">${t.traits.map(tr => traitChipHTML(tr)).join('')}</span>
      
        <span class="gr-growth">成长点 <b>${t.growth}</b></span>
      
        <span class="gr-actions">
      
          <button class="btn small" data-act="growth" data-id="${t.id}" ${canGrow ? '' : 'disabled'}>${maxed ? '词条已满' : `加词条（${cost} 点）`}</button>
      
          <button class="btn small" data-act="reroll-start" data-id="${t.id}" ${canReroll ? '' : 'disabled'}>洗练（${D.CAMPAIGN.rerollCost.gold} 金 + ${D.CAMPAIGN.rerollCost.growth} 点）</button>
      
        </span>
      
      </div>`;
    }).join('');
    return `
      
      <div class="section-title"><span>背包</span><span class="hint">${count} / ${D.CAMPAIGN.backpackSlots} 格 · 本周回收价 ${sellRate}%</span></div>
      
      <div class="inv-grid">${ids.length ? ids.map(invCardHTML).join('') : '<div class="empty-line">背包空了，先买两张。</div>'}</div>

      
      <div class="section-title"><span>本周货架</span><span class="hint">每周重新上货（每张 1 份）</span></div>
      
      <div class="shop-grid">${c.shop.map(shopCardHTML).join('')}</div>

      
      <div class="section-title"><span>旅人改造</span><span class="hint">成长点 = 每次出勤 +3 · 词条上限 4</span></div>
      
      <div class="growth-list">${growRows}</div>
      
      <div class="mini-note">道具是消耗品：出勤里用掉就从背包消失，没用的还能留着下次带。<b>加词条</b>花成长点；<b>洗练</b>花金币+成长点，从三个候选里换掉一个旧词条（换掉的词条不会回来）。</div>`;
  }

  function boatSetupHTML(c) {
    if (!S.cfg || !Array.isArray(S.cfg.travelers)) S.cfg = campaignDefaultCfg();
    const n = S.cfg.travelers.length;
    const showItems = c.season > 1 || c.week >= 4;
    const travelers = prepTravelers();
    const items = showItems ? prepItems() : [];
    return `<div class="boat-setup">
      <div class="section-title"><span><span class="num">1</span>挑 5 个人上船</span><span class="hint">已选 ${n} / 5</span></div>
      <div class="traveler-grid">${travelers.length ? travelers.map(travelerHTML).join('') : '<div class="empty-line">队伍里还没人——先去酒馆招够 5 个。</div>'}</div>
      ${showItems ? `<div class="section-title"><span><span class="num">2</span>带道具</span><span class="hint">已选 ${S.cfg.items.length} / ${itemLimit()}</span></div><div class="item-grid">${items.length ? items.map(itemHTML).join('') : '<div class="empty-line">背包里没有可用道具。</div>'}</div>` : ''}
      <div class="boat-divider"></div>
    </div>`;
  }

  function boatPanel() {
    if (LITE_WEEK1) return liteBoatPanel();
    const c = S.campaign;
    if (isFirstWeekCampaign(c)) {
      
      const task = c.tasks.find(t => t.type === 'urgent') || c.tasks[0];
      
      return `<div class="task-board first-week-board">
        ${boatSetupHTML(c)}
      
        <div class="section-title"><span>老队员已经备好船</span><span class="hint">${c.slotsLeft} 格出勤</span></div>
      
        ${task ? firstWeekTaskCardHTML(task, 'boat') : '<div class="empty-line">这趟差事已结束。第一周的出勤完成了。</div>'}
      
        <p class="mini-note">本次由 ${c.travelers.map(t => t.name).join('、')} 出勤，队伍和补给都已安排好。</p>
      
      </div>`;
    }
    if (isBasicContractWeek(c)) {
      
      const accepted = c.tasks.filter(t => t.accepted).concat(c.delegations || []);
      
      return `<div class="task-board basic-contract-board">
        ${boatSetupHTML(c)}
      
        <div class="section-title"><span>本周已接委托</span><span class="hint">还可出勤 ${c.slotsLeft} 次</span></div>
      
        ${accepted.length ? accepted.map(t => taskCardHTML(t, 'boat')).join('') : '<div class="empty-line">还没有已接委托。<button class="link-btn" data-act="panel" data-panel="agency">去旅行社挑一份 →</button></div>'}
      
        <p class="mini-note">上方选好 5 个人和补给后，直接点出发。每次出发消耗 1 格出勤。</p>
      
      </div>`;
    }
    const accepted = c.tasks.filter(t => t.accepted);
    const all = c.delegations.concat(accepted);
    return `
      
      <div class="task-board">
      ${boatSetupHTML(c)}
      
      <div class="section-title"><span>今天出哪趟</span><span class="hint">出勤格 ${c.slotsLeft} / ${Campaign.slotsPerWeekOf(c)}${c.travelers.length < 5 ? ` · 还差 ${5 - c.travelers.length} 人` : ''}</span></div>
      
      ${c.travelers.length < 5 ? `<div class="empty-line">队伍只有 ${c.travelers.length} 人，还差 ${5 - c.travelers.length} 个才能上船——先去酒馆招人。</div>` : ''}
      
      ${all.length ? all.map(t => taskCardHTML(t, 'boat')).join('') : '<div class="empty-line">船上没活。先去旅行社接单，或者去酒馆 / 补丁铺补给。</div>'}
      
      <div class="mini-note">上方挑 5 个人和最多 ${itemLimit()} 张道具；选好后点任务下方的出发。</div>
      
      </div>`;
  }

  function panelFor(id) {
    if (LITE_WEEK1) return id === 'tavern' ? tavernPanel() : id === 'patch' ? patchPanel() : id === 'boat' ? boatPanel() : agencyPanel();
    if (id === 'tavern') return tavernPanel();
    if (id === 'patch') return patchPanel();
    if (id === 'boat') return boatPanel();
    if (id === 'season') return seasonPanel();
    return agencyPanel();
  }

  function renderCampaign() {
    if (LITE_WEEK1) return liteCampaignPage();
    const c = S.campaign;
    if (!c) { S.screen = 'title'; return renderTitle(); }
    if (isWeekSixCampaign(c)) Campaign.ensureWeekSixDelegation(c);
    const newMails = Campaign.checkStoryMails(c);
    if (newMails.length) showToast(`壶潮季收到 ${newMails.length} 封新信。`, 'good');
    const weekLeft = D.CAMPAIGN.seasonWeeks - c.week + 1;
    const slots = [];
    for (let i = 0; i < Campaign.slotsPerWeekOf(c); i++) {
      
      slots.push(`<span class="slot ${i < c.slotsLeft ? 'on' : ''}"></span>`);
    }
    const log = c.weekLog.slice(-7);
    const firstWeek = isFirstWeekCampaign(c);
    const introDispatchWeek = isCampaignOnboardingWeek(c);
    let store = D.CAMPAIGN.stores.find(s => s.id === S.campaignPanel)
      
      || (S.campaignPanel === 'season' ? { icon: '🌊', name: '壶潮季', desc: '天气、升级考核与信用榜' } : D.CAMPAIGN.stores[0]);
    if (firstWeek && S.campaignPanel === 'agency') store = { icon: '🧾', name: '迷途旅行社', desc: '接下联盟急报，安排第一趟出勤。' };
    if (firstWeek && S.campaignPanel === 'boat') store = { icon: '⛵', name: '漏勺号', desc: '老队员已备好船，出发完成本周差事。' };
    if (isBasicContractWeek(c) && S.campaignPanel === 'agency') store = { icon: '🧾', name: '迷途旅行社', desc: '比较基础委托的报酬与截止时间，再决定接哪几单。' };
    if (isBasicContractWeek(c) && S.campaignPanel === 'boat') store = { icon: '⛵', name: '漏勺号', desc: isThirdWeekCampaign(c) ? '从已接委托中出发；本周可以自己安排轮换队员。' : '确认已接委托，使用默认配置安排出勤。' };
    if (isCrewIntroWeek(c) && S.campaignPanel === 'tavern') store = { icon: '🍺', name: '巡回酒馆', desc: '招募新人轮换队伍，或花钱休整恢复疲劳。' };
    if (isBasicItemWeek(c) && S.campaignPanel === 'patch') store = { icon: '🔧', name: '补丁铺', desc: '购买基础补给；每趟出勤可带一件。' };
    const wx = Campaign.weatherInfo(c);
    const rank = (Campaign.leaderboardOf(c).find(r => r.you) || { rank: 1 }).rank;
    return `
    <div class="page campaign-page">
      
      <header class="camp-head">
      
        <div class="camp-head-left">
      
          <div class="camp-week">第 ${c.season} 季 · 第 ${c.week} / ${D.CAMPAIGN.seasonWeeks} 周 <span class="week-left">（还剩 ${weekLeft} 周）</span></div>
      
          <div class="camp-slots">出勤格 ${slots.join('')} <span class="slot-text">${c.slotsLeft} / ${Campaign.slotsPerWeekOf(c)}</span></div>
      
        </div>
      
        <div class="camp-res">
      
          <span class="res-chip tip" data-tip="金币：出勤报酬和局内外快都会记在这里。"><i>金</i>${c.gold}</span>
      
          ${c.season === 1 && c.week >= 3 && isCampaignOnboardingWeek(c) ? `<span class="res-chip tip" data-tip="${REPUTATION_TIP}"><i>口碑</i>${c.reputation}</span>` : ''}
      
          ${introDispatchWeek ? '' : `
      
          <span class="res-chip tip" data-tip="信用：联盟对你的评价。按单局评级给（S 1.40 / A 1.25 / B 1.10 / C 0.95 / D 0.80 / F 0.60）；委派 F 不给信用，违约 / 破产 / 撤退会扣。季末信用决定下季预算（100 + 信用/10），店铺升级靠考核。"><i>信用</i>${c.credit}</span>
      
          <span class="res-chip tip" data-tip="${REPUTATION_TIP}"><i>口碑</i>${c.reputation}</span>
      
          <button class="res-chip tip" data-act="panel" data-panel="season" data-tip="本周天气「${wx.name}」：${wx.desc} 点开壶潮季页看下周预报。"><i>${wx.icon} ${wx.name}</i></button>
      
          <button class="res-chip tip" data-act="panel" data-panel="season" data-tip="信用赛：信用即排名分，点开看完整信用榜。"><i>信用</i>第 ${rank}</button>`}
      
        </div>
      
        <div class="camp-head-actions">
      
          ${c.week > 1 ? '<button class="link-btn" data-act="rewind-week" title="测试：回到上一周开始">↩ 上一周</button>' : ''}
          <button class="link-btn" data-act="save-menu">存档</button>
      
          <button class="link-btn" data-act="rules">玩法</button>
      
          <button class="btn small" data-act="home">回标题</button>
      
          <button class="btn primary" data-act="end-week">${firstWeek && !c.tasks.some(t => t.type === 'urgent') ? '结束第一周 →' : isSecondWeekCampaign(c) && c.slotsLeft <= 0 ? '结束第二周 →' : isThirdWeekCampaign(c) && c.slotsLeft <= 0 ? '结束第三周 →' : S.endWeekConfirm ? '再点一次确认结束' : '结束本周'}</button>
      
        </div>
      
      </header>

      
      ${navHTML()}
      
      ${firstWeekBriefHTML()}
      
      ${secondWeekBriefHTML()}
      
      ${thirdWeekBriefHTML()}
      
      ${fourthWeekBriefHTML()}
      
      ${fifthWeekBriefHTML()}
      ${weekSixBriefHTML()}
      ${weekSevenBriefHTML()}
      ${weekEightBriefHTML()}
      ${season2WeekOneBriefHTML()}
      ${season2WeekTwoBriefHTML()}
      
      <div class="panel-hint"><b>${store.icon} ${store.name}</b> <span class="ph-desc">${store.desc}</span></div>
      
      <div class="camp-panel">${panelFor(S.campaignPanel)}</div>

      
      ${log.length ? `<div class="camp-log"><div class="camp-log-title">本周记录</div>${log.map(l => `<div class="log-line">· ${l}</div>`).join('')}</div>` : ''}
    </div>`;
  }

  /* =================================================================
   * 六、季末评估
   * ================================================================= */
  function renderSeasonEnd() {
    const c = S.campaign;
    const sum = S.seasonSummary || Campaign.seasonSummary(c);
    const reward = Campaign.rankRewardOf(c);
    const upMax = Campaign.offseasonUpgradeMaxOf(c);
    const examRows = (sum.exams || []).map(x => {
      
      const st = D.CAMPAIGN.stores.find(s => s.id === x.store) || { name: x.store, icon: '' };
      
      if (!x.info) return `<tr><td class="dim">${st.icon} ${st.name}</td><td class="num">已满级</td><td class="num">—</td></tr>`;
      
      const info = x.info;
      
      const reqText = info.reqs.map(r => `${r.label} ${r.cur}/${r.target}`).join(' · ');
      
      return `<tr><td class="dim">${st.icon} ${st.name}</td><td class="num">${info.exam.name}${info.done ? ' ✔' : ''}</td><td class="num" style="text-align:left;font-size:12px">${reqText}</td></tr>`;
    }).join('');
    return `
    <div class="result-wrap season-wrap">
      
      <div class="result-grade-text">季 末 结 算</div>
      
      <div class="result-grade-text">${sum.season} 季 · 账房算账</div>
      
      <h2 class="result-title">第 ${sum.season} 季结束</h2>
      
      <table class="score-table">
      
        <thead><tr><th>项目</th><th>结果</th></tr></thead>
      
        <tbody>
      
          <tr><td class="dim">信用</td><td class="num">${sum.credit}</td></tr>
      
          <tr><td class="dim">金币结余</td><td class="num">${sum.gold}</td></tr>
      
          <tr><td class="dim">完成委派</td><td class="num">${sum.delegationsDone}</td></tr>
      
          <tr><td class="dim">完成自选</td><td class="num">${sum.tasksDone}</td></tr>
      
          <tr><td class="dim">出勤次数</td><td class="num">${sum.runs}</td></tr>
      
          <tr><td class="dim">本季难度</td><td class="num">标准分 ×${sum.difficulty}</td></tr>
      
          <tr><td class="dim">委派违约</td><td class="num">${sum.breached}</td></tr>
      
          <tr><td class="dim">委派评级均值</td><td class="num">${sum.avgRating !== null && sum.avgRating !== undefined ? sum.avgRating.toFixed(1) + ' / 5' : '无'}</td></tr>
      
          <tr><td class="dim">已解锁委派档位</td><td class="num">${sum.unlockedTier} 档</td></tr>
      
          <tr><td class="dim">信用赛排名</td><td class="num">第 ${sum.rank} / ${(sum.leaderboard || []).length} 名</td></tr>
      
          <tr><td class="dim">名次奖励</td><td class="num">+${reward.gold} 金 / +${reward.rep} 口碑</td></tr>
      
          <tr><td class="dim">下季升级名额</td><td class="num">${upMax} 级</td></tr>
      
          <tr><td class="dim">信用赛称号</td><td class="num">${reward.title || '—'}</td></tr>
      
          <tr class="total-row"><td class="dim">下季预算（含名次）</td><td class="num">+${sum.budget + reward.gold} 金</td></tr>
      
        </tbody>
      
      </table>

      
      <h3 class="section-title" style="margin-top:18px">信用赛 · 最终排名</h3>
      
      <table class="score-table leaderboard">
      
        <thead><tr><th>名次</th><th>小队</th><th>信用</th></tr></thead>
      
        <tbody>${(sum.leaderboard || []).map(r => `<tr class="${r.you ? 'me' : ''}"><td class="num">${r.rank}</td><td>${r.icon || ''} ${r.name}${r.you ? '（我们）' : ''}</td><td class="num">${r.credit}</td></tr>`).join('')}</tbody>
      
      </table>

      
      <h3 class="section-title" style="margin-top:18px">本季升级考核（达标 ${sum.completedExams || 0} 项）</h3>
      
      <table class="score-table">
      
        <thead><tr><th>店铺</th><th>考核</th><th>进度</th></tr></thead>
      
        <tbody>${examRows || '<tr><td colspan="3" class="dim">本轮没有可考核的店铺。</td></tr>'}</tbody>
      
      </table>

      
      ${sum.career ? `
      
      <h3 class="section-title" style="margin-top:18px">生涯</h3>
      
      <table class="score-table">
      
        <thead><tr><th>生涯</th><th>累计</th></tr></thead>
      
        <tbody>
      
          <tr><td class="dim">已完成壶潮季</td><td class="num">${sum.career.seasonsPlayed}</td></tr>
      
          <tr><td class="dim">总出勤</td><td class="num">${sum.career.runs}</td></tr>
      
          <tr><td class="dim">完成自选 / 委派</td><td class="num">${sum.career.tasksDone} / ${sum.career.delegationsDone}</td></tr>
      
          <tr><td class="dim">累计金币 / 信用</td><td class="num">${sum.career.goldEarned} / ${sum.career.creditEarned}</td></tr>
      
          <tr><td class="dim">单局评级 S/A/B/C/D/F</td><td class="num">${sum.career.ratings.S} / ${sum.career.ratings.A} / ${sum.career.ratings.B} / ${sum.career.ratings.C} / ${sum.career.ratings.D} / ${sum.career.ratings.F || 0}</td></tr>
      
          <tr><td class="dim">信用赛冠军 / 最佳名次</td><td class="num">${sum.career.championCount || 0} 次 / ${sum.career.bestRank && sum.career.bestRank !== 99 ? '第 ' + sum.career.bestRank + ' 名' : '—'}</td></tr>
      
          <tr><td class="dim">最高信用</td><td class="num">${sum.career.bestCredit}</td></tr>
      
        </tbody>
      
      </table>` : ''}
      
      <p class="result-flavor">下季保留金币结余、队伍、背包和店铺等级；信用跨季保留一半；考核每季重新累计，委派评级重新开始。</p>
      
      <div class="result-actions">
      
        ${Campaign.isCleared(c) ? '<button class="btn" data-act="ending">查看通关</button>' : ''}
      
        <button class="btn primary big" data-act="to-offseason">进入休赛期</button>
      
        <button class="btn ghost" data-act="home">回标题</button>
      
      </div>
    </div>`;
  }

  /* =================================================================
   * 通关页
   * ================================================================= */
  function renderEnding() {
    const c = S.campaign;
    if (!c) { S.screen = 'title'; return renderTitle(); }
    const info = Campaign.endingInfo(c);
    const storeRows = info.upgrades.map(u => {
      
      const st = D.CAMPAIGN.stores.find(s => s.id === u.id) || { name: u.id, icon: '' };
      
      return `<tr><td class="dim">${st.icon} ${st.name}</td><td class="num">Lv${u.level} / ${D.CAMPAIGN.storeMaxLevel}</td></tr>`;
    }).join('');
    return `
    <div class="ending-wrap">
      
      <div class="ending-kicker">大 壶 街 出 勤 局 · 终 局</div>
      
      <h1 class="ending-title">壶潮季 · 通关</h1>
      
      <p class="ending-sub">四店满级，信用赛冠军。这条街，已经按你的规矩转了。</p>
      
      <div class="ending-rule"></div>
      
      <table class="score-table ending-table">
      
        <tbody>
      
          <tr><td class="dim">完成壶潮季</td><td class="num">${info.seasons}</td></tr>
      
          <tr><td class="dim">信用赛冠军</td><td class="num">${info.championCount} 次</td></tr>
      
          <tr><td class="dim">最佳名次</td><td class="num">${info.bestRank ? '第 ' + info.bestRank + ' 名' : '—'}</td></tr>
      
          <tr><td class="dim">总出勤</td><td class="num">${info.runs}</td></tr>
      
          <tr><td class="dim">累计金币 / 信用</td><td class="num">${info.goldEarned} / ${info.creditEarned}</td></tr>
      
          ${storeRows}
      
        </tbody>
      
      </table>
      
      <div class="ending-actions">
      
        <button class="btn primary big" data-act="ending-continue">继续经营</button>
      
        <button class="btn ghost" data-act="home">回标题</button>
      
      </div>
      
      <p class="ending-note">通关后可以继续玩：店铺保持满级，信用赛每季重开。</p>
    </div>`;
  }

  /* =================================================================
   * 休赛期：店铺升级 + 训练
   * ================================================================= */
  function storeEffectText(id, nextLevel) {
    if (id === 'agency') return nextLevel === 1 ? '任务栏 4→6 · 任务金币 +10%' : '任务栏 6→8 · 任务金币 +20% · 撤退/违约/破产信用罚加重';
    if (id === 'tavern') return nextLevel === 1 ? '队伍 8→9 · 招募 −10% · 旅人潮高星概率 ↑' : '队伍 9→10 · 招募 −20% · 休整恢复 +10 · 高星概率 ↑↑';
    if (id === 'patch') return nextLevel === 1 ? '货架 12→14 · 售价 −10% · 高级货概率 ↑' : '货架 14→16（全道具）· 售价 −20% · 回收 +10%';
    if (id === 'boat') return nextLevel === 1 ? '每趟道具 3→4 · 出勤开销 4→3' : '每周出勤格 3→4';
    return '';
  }

  function renderOffseason() {
    const c = S.campaign;
    if (!c) { S.screen = 'title'; return renderTitle(); }
    const usedUp = c.offseasonUpgrades || 0;
    const usedTrain = c.offseasonTraining || 0;
    const upMax = Campaign.offseasonUpgradeMaxOf(c);
    const rank = Campaign.rankOf(c);
    const rankReward = Campaign.rankRewardOf(c);
    const storeCards = D.CAMPAIGN.stores.map(s => {
      
      const lv = Campaign.storeLevel(c, s.id);
      
      const info = Campaign.storeExamInfo(c, s.id);
      
      const maxed = lv >= D.CAMPAIGN.storeMaxLevel;
      
      const done = !!(info && info.done);
      
      const canUp = done && !maxed && usedUp < upMax;
      
      const reqText = info ? info.reqs.map(r => `${r.label} ${r.cur}/${r.target}${r.done ? '✔' : ''}`).join(' · ') : '已满级';
      
      return `
      
      <div class="store-up-card ${done ? 'done' : ''}">
      
        <div class="sc-head"><b>${s.icon || ''} ${s.name}</b><span class="i-tag">Lv${lv}</span></div>
      
        <div class="sc-desc">${maxed ? '已满级' : `下一级：${storeEffectText(s.id, lv + 1)}`}</div>
      
        <div class="up-exam"><b>${info ? info.exam.name : '—'}</b>${info ? (done ? ' ✔ 达标' : ' 未达标') : ''}<br><span>${reqText}</span></div>
      
        <button class="btn small ${canUp ? 'primary' : ''}" data-act="upgrade-store" data-store="${s.id}" ${canUp ? '' : 'disabled'}>${maxed ? '已满级' : (done ? '升级' : '考核未达标')}</button>
      
      </div>`;
    }).join('');
    const trainRows = c.travelers.map(t => `
      
      <div class="growth-row">
      
        <span class="gr-name">${t.name}<i>${t.role}</i></span>
      
        <span class="gr-traits">${t.traits.map(tr => traitChipHTML(tr)).join('')}</span>
      
        <span class="gr-growth">成长点 <b>${t.growth}</b></span>
      
        <span class="gr-actions"><button class="btn small" data-act="train-traveler" data-id="${t.id}" ${(usedTrain < D.CAMPAIGN.trainingMax && c.gold >= Campaign.trainingCostOf(c)) ? '' : 'disabled'}>训练（${Campaign.trainingCostOf(c)} 金 +${D.CAMPAIGN.trainingGrowth}）</button></span>
      
      </div>`).join('');
    const growRows = c.travelers.map(t => {
      const cost = Campaign.growthCostFor(t);
      const maxed = t.traits.length >= 4;
      const canGrow = !maxed && t.growth >= cost;
      return `<div class="growth-row">
        <span class="gr-name">${t.name}<i>${t.role}</i></span>
        <span class="gr-traits">${t.traits.map(tr => traitChipHTML(tr)).join('')}</span>
        <span class="gr-growth">成长点 <b>${t.growth}</b> · 加词条要 ${cost}</span>
        <span class="gr-actions"><button class="btn small" data-act="offseason-growth" data-id="${t.id}" ${canGrow ? '' : 'disabled'}>${maxed ? '词条已满' : (t.growth < cost ? '成长点不够' : '加词条')}</button></span>
      </div>`;
    }).join('');
    return `
    <div class="page offseason-page">
      
      <header class="camp-head">
      
        <div class="camp-head-left">
      
          <div class="camp-week">休赛期 · 上季信用赛第 ${rank} 名${rankReward.title ? ` · ${rankReward.title}` : ''}</div>
      
          <div class="camp-slots">升级 ${usedUp} / ${upMax}　训练 ${usedTrain} / ${D.CAMPAIGN.trainingMax}　金币 ${c.gold}</div>
      
        </div>
      
        <div class="camp-head-actions">
      
          <button class="btn primary" data-act="next-season">开始下一季</button>
      
        </div>
      
      </header>
      
      <div class="section-title"><span>四店升级</span><span class="hint">本季考核达标才能升级，本休赛期最多 ${upMax} 级</span></div>
      
      <div class="shop-grid">${storeCards}</div>
      
      <div class="section-title" style="margin-top:18px"><span>训练</span><span class="hint">${Campaign.trainingCostOf(c)} 金 → ${D.CAMPAIGN.trainingGrowth} 成长点，本休赛期最多 ${D.CAMPAIGN.trainingMax} 次</span></div>
      
      <div class="growth-list">${trainRows || '<div class="empty-line">队里没人，先去酒馆招人。</div>'}</div>
      
      <div class="section-title" style="margin-top:18px"><span>人物成长</span><span class="hint">花本季积累的成长点加词条，不限次数；受成长点和词条上限限制</span></div>
      
      <div class="growth-list">${growRows || '<div class="empty-line">队里没人。</div>'}</div>
      
      <p class="mini-note">成长用的是整季出勤攒下的成长点；加词条会重算周薪，下一季生效。</p>
      <p class="mini-note">休整：全队疲劳清零、周薪按新词条重算；开始下一季后生效。未用完的升级/训练次数不会保留。</p>
    </div>`;
  }

  /* =================================================================
   * 壶潮季页：天气 / 考核 / 信用榜
   * ================================================================= */
  function storyMailHTML() {
    const mail = (D.STORY_MAILS || []).find(m => m.id === S.storyMail);
    if (!mail) return '';
    const lines = mail.lines || [];
    const idx = Math.max(0, Math.min(S.storyMailLine || 0, lines.length - 1));
    const visible = lines.slice(0, idx + 1);
    const last = idx >= lines.length - 1;
    return `<div class="modal-mask" data-act="close-mail">
      <div class="modal story-mail-modal" data-act="stop">
        <button class="close-x" data-act="close-mail">✕</button>
        <div class="story-mail-head"><span>✉</span><div><b>${mail.title}</b><i>来自：${mail.from}</i></div></div>
        <div class="story-mail-lines">
          ${visible.map((l, i) => `<div class="story-mail-line ${i === idx ? 'current' : ''}"><b>${l.who}</b><p>${l.text}</p></div>`).join('')}
        </div>
        <div class="story-mail-actions">
          <button class="btn primary" data-act="story-mail-next">${last ? '收起信' : '继续'}</button>
        </div>
      </div>
    </div>`;
  }

  function seasonPanel() {
    const c = S.campaign;
    if (!c) return '';
    const w = Campaign.weatherInfo(c);
    const n = Campaign.nextWeatherInfo(c);
    const d = Campaign.seasonDiffInfo(c);
    const board = Campaign.leaderboardOf(c);
    const rows = board.map(r => `
      
      <tr class="${r.you ? 'me' : ''}">
      
        <td class="num">${r.rank}</td>
      
        <td>${r.icon || ''} ${r.name}${r.you ? '（我们）' : ''}</td>
      
        <td class="num">${r.credit}</td>
      
      </tr>`).join('');
    const exams = D.CAMPAIGN.stores.map(s => examBannerHTML(s.id)).join('');
  const mails = Campaign.storyMailsOf(c);
  const mailCards = mails.length ? mails.map(m => `<button class="mail-card ${m.read ? '' : 'unread'}" data-act="open-mail" data-id="${m.id}"><span class="mail-seal">✉</span><span class="mail-info"><b>${m.title}</b><i>${m.from}${m.read ? '' : ' · 未读'}</i></span></button>`).join('') : '<p class="mini-note">邮袋还是空的。达成条件后，会有一封信寄到这里。</p>';
    return `
      
      <div class="season-paper">
      
        <div class="paper-masthead">
      
          <div>
      
            
      <div class="paper-kicker">大壶街 · 壶潮季</div>
      
            
      <div class="paper-title">第 ${c.season} 季 · 第 ${c.week} 周</div>
      
          </div>
      
          <div class="paper-sub">本周 ${w.icon} ${w.name}　下周 ${n.icon} ${n.name}</div>
      
        </div>
      
        <div class="paper-grid">
      
          <div class="paper-main">
      
            
      <div class="paper-weather">
      
            
        <div class="pw-icon">${w.icon}</div>
      
            
        <div>
      
            
          <div class="pw-name">${w.name}</div>
      
            
          <div class="pw-desc">${w.desc}</div>
      
            
        </div>
      
            
      </div>
      
            
      <div class="paper-forecast"><b>下周预报</b>　${n.icon} ${n.name}：${n.desc}</div>
      
            
      <div class="paper-diff">难度：任务标准分 ×${d.standardScale} · 报酬 ×${d.rewardScale}　|　天气每周更换，只影响本周</div>
      
            
      <div class="paper-inflation">
      
            
        <b>第 ${c.season} 季 · 本季膨胀</b>
      
            
        <span>评分标准 ×${d.standardScale}</span>
      
            
        <span>任务报酬 ×${d.rewardScale}</span>
      
            
        <span>信用赛对手起分 +${(c.season - 1) * 8}</span>
      
            
        <span>成本指数 ×${d.costScale}</span>
      
            
        <span>对手每周涨分 +${d.rivalWeekly}</span>
      
            
        <span>高危核心 ${d.coreChance ? d.coreChance + '%' : '未开放'}</span>
      
            
      </div>
      
            
      <div class="paper-section-title">升级考核</div>
      
            
      <div class="paper-exams">${exams}</div>
      
          </div>
      
          <div class="paper-side">
      
            
      <div class="paper-section-title">信用榜 · 信用赛</div>
      
            
      <table class="score-table leaderboard">
      
            
        <thead><tr><th>名次</th><th>小队</th><th>信用</th></tr></thead>
      
            
        <tbody>${rows}</tbody>
      
            
      </table>
      
            
      <p class="mini-note">信用即排名分；名次决定下季预算、初始口碑，冠军还多 1 个休赛期升级名额。</p>
      <div class="paper-section-title">邮袋</div>
      <div class="mail-list">${mailCards}</div>
      
          </div>
      
        </div>
      
      </div>`;
  }

  /* =================================================================
   * 存档弹窗
   * ================================================================= */
  function saveModalHTML() {
    const rows = SAVE_SLOTS.map(slot => {
      
      const d = readSave(slot);
      
      const m = (d && d.meta) || {};
      
      const canSave = slot !== 'auto' && !!S.campaign;
      
      return `<div class="save-row">
      
        <div class="save-info">
      
          <b>${SAVE_LABELS[slot]}</b>
      
          <span>${d ? `第 ${d.season} 季 · 第 ${d.week} 周 · ${m.gold ?? '?'} 金 · 口碑 ${m.reputation ?? '?'} · ${m.travelers ?? '?'} 人` : '空'}</span>
      
          ${d ? `<i>${new Date(d.savedAt).toLocaleString()}</i>` : ''}
      
        </div>
      
        <div class="save-actions">
      
          ${d ? `<button class="btn small" data-act="load-slot" data-slot="${slot}">载入</button>` : ''}
      
          ${canSave ? `<button class="btn small primary" data-act="save-slot" data-slot="${slot}">保存到此格</button>` : ''}
      
          ${d ? `<button class="link-btn" data-act="del-slot" data-slot="${slot}">删除</button>` : ''}
      
        </div>
      
      </div>`;
    }).join('');
    return `
    <div class="modal-mask" data-act="close-save">
      
      <div class="modal save-modal" data-act="stop">
      
        <button class="close-x" data-act="close-save">✕</button>
      
        <h3>存档</h3>
      
        <p class="wr-sub">自动存档会在每次回到经理层 / 季末更新；1—3 是手动存档格。</p>
      
        ${storageOK() ? rows : '<p class="warn-text">当前环境不支持 localStorage，无法存档。</p>'}
      
      </div>
    </div>`;
  }

  /* =================================================================
   * 七、结算页
   * ================================================================= */
  function scoreRow(name, gaugeName, formula, score, weight, dimKey) {
    const meta = DIM_META[dimKey];
    return `<tr ${meta ? `data-dim="${dimKey}"` : ''}>
      
      <td class="dim">${meta ? meta.icon + ' ' : ''}${name}${meta ? `<i class="dim-role">${meta.role}</i>` : ''}</td>
      
      <td class="muted">${gaugeName}</td>
      
      <td class="muted" style="text-align:left;font-size:12px">${formula}</td>
      
      <td class="num">${score}</td>
      
      <td class="num">${weight}%</td>
      
      <td class="num">${(score * weight / 100).toFixed(1)}</td>
    </tr>`;
  }

  function renderPrologueResult(r) {
    const title = r.status === 'retreated'
      
      ? '带着队伍撤回来了'
      
      : r.status === 'lost'
      
        ? '这趟没能完成'
      
        : '赶上了潮口';
    const stamp = r.status === 'retreated' ? '撤退' : (r.status === 'lost' ? '未成' : '归航');
    const flavor = r.status === 'retreated'
      
      ? '该停手时撤回来，也是一种选择。'
      
      : r.status === 'lost'
      
        ? '这趟教学出勤到此为止。回头看看哪些选择把队伍推到了边缘。'
      
        : '你们把街坊托付的事办完了。刚才每次选择，都在改变这趟出勤的处境。';
    return `
      
      <div class="result-wrap prologue-result">
      
        <div class="result-grade-text">第一次出勤</div>
      
        <div class="result-stamp">${stamp}</div>
      
        <div class="result-grade-text">${r.task.name}</div>
      
        <h2 class="result-title">${title}</h2>
      
        <p class="result-flavor">${flavor}</p>
      
        <div class="result-actions">
      
          <button class="btn primary big" data-act="prologue-after-run">回酒馆 →</button>
      
          <button class="btn ghost" data-act="home">回标题</button>
      
        </div>
      
      </div>`;
  }

  function renderResult() {
    const r = S.result;
    if (!r) { S.screen = 'title'; return renderTitle(); }
    if (S.mode === 'prologue') return renderPrologueResult(r);
    const task = r.task;
    const w = r.weights;
    const award = S.mode === 'campaign' ? S.campaignReward : null;
    const retreatCreditLoss = award ? (award.retreatCredit || 0) : 0;
    const dims = [
      
      ['时效', '时间', `剩余 ${r.gauges.time} / 100`, r.scores.time, w[0], 'time'],
      
      ['治潮度', '潮位', `50 + (${r.startTide === undefined ? 60 : r.startTide} − 潮位) × 1.5`, r.scores.govern, w[1], 'tide'],
      
      ['损伤控制', '队伍状态', `剩余 ${r.gauges.crew}`, r.scores.crew, w[2], 'crew'],
      
      ['救援 / 保全', '负载', `最终 ${r.gauges.load}（100 封顶）`, r.scores.rescue, w[3], 'load'],
    ];

    let statusTitle = '到达目标';
    let flavor = r.quotes[r.rating];
    if (r.status === 'lost') { statusTitle = '出勤失败'; flavor = r.failReason + '带伤回经理层——失败不重来。'; }
    if (r.status === 'retreated') {
      
      statusTitle = '主动撤退';
      
      flavor = S.mode === 'campaign'
      
        ? (r.retreatFree
      
          ? '带着已经救到的东西走了。「兴趣」兜底：这趟撤退免罚。'
      
          : `带着已经救到的东西走了。联盟要记账：额外扣 ${retreatCreditLoss} 信用 + ${D.CAMPAIGN.retreatGoldPenalty} 金币。`)
      
        : '带着已经救到的东西走了。少拿分，但保住了人。';
    }

    const grade = D.RATING.find(x => x.key === r.rating) || D.RATING[D.RATING.length - 1];

    // 证据门文字
    let evHTML;
    if (task.evidence === 0) {
      
      evHTML = `<div class="evidence-box ok">本趟不需要证据，四项评分直接算数。</div>`;
    } else if (r.evidence.state === 'ok') {
      
      evHTML = `<div class="evidence-box ok">证据 <b>${r.evidence.got} / ${r.evidence.req}</b> → 通过。前四项照常算分。</div>`;
    } else if (r.evidence.state === 'discount') {
      
      evHTML = `<div class="evidence-box bad">证据 <b>${r.evidence.got} / ${r.evidence.req}</b> → 差 1 点，联盟只认 <b>70%</b>（总分 ×0.7）。</div>`;
    } else {
      
      evHTML = `<div class="evidence-box bad">证据 <b>${r.evidence.got} / ${r.evidence.req}</b> → 差太多，判定"<b>这趟不算出勤</b>"，分数作废、信用不给、金币减半。</div>`;
    }

    // 超载记录：超过安全负载后每张牌额外掉的状态
    const over = r.history.reduce((acc, h) => {
      
      if (h.effect && h.effect.overloadTick) {
      
        acc.cards += 1;
      
        acc.crew += (h.effect.overloadPenalty || 0);
      
      }
      
      return acc;
    }, { cards: 0, crew: 0 });
    const overloadHTML = over.cards
      
      ? `<div class="evidence-box bad">本趟有 <b>${over.cards}</b> 张牌处于超载，额外掉了 <b>${over.crew}</b> 点队伍状态（工具故障）。下次可以考虑带轻/中载、或者用交付/卸货牌减载。</div>`
      
      : '';

    // 总分说明
    let totalLine;
    if (r.status === 'lost') {
      
      totalLine = `<div class="total-line">出勤失败，本趟不结算分数</div>`;
    } else if (r.evidence.state === 'reject') {
      
      totalLine = `<div class="total-line">加权原始分 ${r.raw.toFixed(1)} → 证据驳回 → <b>总分 0</b></div>`;
    } else if (r.evidence.state === 'discount') {
      
      totalLine = `<div class="total-line">加权原始分 ${r.raw.toFixed(1)} × 0.7 → <b>总分 ${r.total.toFixed(1)}</b><span style="font-size:12px;color:var(--ink-3)">（标准分 ${task.standard}，达成率 ${(r.ratio * 100).toFixed(0)}%）</span></div>`;
    } else {
      
      totalLine = `<div class="total-line">加权原始分 ${r.raw.toFixed(1)} → <b>总分 ${r.total.toFixed(1)}</b><span style="font-size:12px;color:var(--ink-3)">（标准分 ${task.standard}，达成率 ${(r.ratio * 100).toFixed(0)}%）</span></div>`;
    }

    // 报酬（经理层用写回周循环的真实数值）
    let rewardLine;
    if (award) {
      
      const parts = [`金币 <span>+${award.gold}</span>`];
      
      if (award.credit) parts.push(`信用 <span>+${award.credit}</span>`);
      
      if (award.reputation) parts.push(`口碑 <span>${sgn(award.reputation)}${absNum(award.reputation)}</span>`);
      
      rewardLine = `<div class="reward-line">${parts.join('　')}</div>`;
    } else if (r.status === 'lost') {
      
      rewardLine = `<div class="reward-line">本趟没有报酬。人带伤、道具用光、口碑受影响。</div>`;
    } else {
      
      const parts = [`金币 <span>+${r.gold}</span>`];
      
      if (r.credit) parts.push(`信用 <span>+${r.credit}</span>`);
      
      if (r.reputation) parts.push(`口碑 <span>${sgn(r.reputation)}${absNum(r.reputation)}</span>`);
      
      rewardLine = `<div class="reward-line">${parts.join('　')}${r.intelCost ? `<span style="font-size:12px;color:var(--ink-3)">（已扣情报费 ${r.intelCost} 金）</span>` : ''}</div>`;
    }

    // 经理层结算小票
    const awardBox = award ? `
      
      <div class="campaign-award">
      
        <div class="ca-title">写回周报</div>
      
        <div class="ca-row">出勤开销：<b>−${award.cost} 金</b></div>
      
        <div class="ca-row">上场的人疲劳 +${award.fatigue}；${award.notes.length ? award.notes.join('　') : ''}</div>
      
        ${award.retreatCredit ? `<div class="ca-row warn-row">主动撤退罚款：<b>信用 −${award.retreatCredit} · 金币 −${award.retreatGold}</b></div>` : ''}
      
        ${award.consumed && award.consumed.length ? `<div class="ca-row">用掉道具：<b>${award.consumed.join('　')}</b>（从背包扣除）</div>` : ''}
      
        ${award.gained && award.gained.length ? `<div class="ca-row good">捡到道具：<b>${award.gained.join('　')}</b>（已放进背包）</div>` : ''}
      
        ${award.discarded && award.discarded.length ? `<div class="ca-row warn-row">没带回来：<b>${award.discarded.join('　')}</b>（${award.status === 'lost' ? '出勤失败' : '背包满了'}）</div>` : ''}
      
        ${award.progress === 'completed' ? '<div class="ca-row good">任务完成 ✔</div>' : ''}
      
        ${award.progress === 'partial' ? '<div class="ca-row">任务继续（还差出勤次数）</div>' : ''}
      
        ${award.progress === 'rejected' ? '<div class="ca-row warn-row">证据驳回：任务没有推进，金币减半</div>' : ''}
      
        ${award.progress === 'failed' ? '<div class="ca-row warn-row">出勤失败：任务没有推进，开销白花</div>' : ''}
      
      </div>` : '';

    // 练习模式：局内捡到的道具不保存，提示一下
    const singleGained = (S.mode !== 'campaign' && S.run && S.run.items)
      
      ? S.run.items.filter(it => it.gained && !it.used)
      
      : [];
    const gainedNote = singleGained.length
      
      ? `<div class="mini-note" style="margin:-6px 0 18px">本局捡到 <b>${singleGained.map(it => D.ITEMS[it.id].name).join('、')}</b>——练习模式不保存道具；在经理层里，局内捡到的道具会放进背包。</div>`
      
      : '';

    // 复盘
    const replayRows = r.history.map((h, i) => {
      
      const lie = h.intelLie
      
        ? ' <span class="lie">· 情报误报（确实 ' + h.intelLie.map(x => `${SHORT[x.key]}${sgn(x.real)}${absNum(x.real)}`).join(' ') + '，情报说 ' + h.intelLie.map(x => `${SHORT[x.key]}${sgn(x.shown)}${absNum(x.shown)}`).join(' ') + '）</span>'
      
        : '';
      
      const ev = h.events.length ? `<div style="font-size:11.5px;color:var(--ink-3)">${h.events.join(' / ')}</div>` : '';
      
      return `<tr>
      
        <td>${i + 1}</td>
      
        <td>${h.scene}</td>
      
        <td>${h.optLabel}${lie}</td>
      
        <td class="mono">${deltaTextOf(h.effect)}${ev}</td>
      
      </tr>`;
    }).join('');

    return `
    <div class="result-wrap">
      
      <div class="result-grade-text">出 勤 评 级</div>
      
      <div class="result-stamp">${r.rating}</div>
      
      <div class="result-grade-text">${grade.text} · ${task.name}</div>
      
      <h2 class="result-title">${statusTitle}</h2>
      
      <p class="result-flavor">${flavor}</p>

      
      <table class="score-table result-dims">
      
        <thead>
      
          <tr><th>评分项</th><th>看哪根仪表</th><th>换算</th><th>得分</th><th>权重</th><th>加权</th></tr>
      
        </thead>
      
        <tbody>
      
          ${dims.map(d => scoreRow(d[0], d[1], d[2], d[3], d[4], d[5])).join('')}
      
          <tr class="total-row">
      
      <td class="dim" colspan="3">加权合计</td>
      
      <td class="num" colspan="2"></td>
      
      <td class="num">${r.raw.toFixed(1)}</td>
      
          </tr>
      
        </tbody>
      
      </table>

      
      ${evHTML}
      
      ${overloadHTML}
      
      ${totalLine}
      
      ${rewardLine}
      
      ${awardBox}
      
      ${gainedNote}

      
      <details class="replay">
      
        <summary>复盘：这趟都翻到了什么（给策划看）</summary>
      
        <table>
      
          <thead><tr><th>#</th><th>情境</th><th>选择</th><th>实际结算</th></tr></thead>
      
          <tbody>${replayRows || '<tr><td colspan="4">没有记录</td></tr>'}</tbody>
      
        </table>
      
      </details>

      
      <div class="result-actions">
      
        ${S.mode === 'prologue'
      
          ? `<button class="btn primary big" data-act="prologue-after-run">回酒馆 →</button>
      
       <button class="btn ghost" data-act="home">回标题</button>`
      
          : S.mode === 'campaign'
      
          ? `<button class="btn primary big" data-act="campaign-back">回周报 →</button>
      
       <button class="btn ghost" data-act="home">回标题</button>`
      
          : `<button class="btn primary big" data-act="again">再来一局</button>
      
       <button class="btn" data-act="new-task">换个任务</button>
      
       <button class="btn ghost" data-act="home">回标题</button>`}
      
      </div>
    </div>`;
  }

  /* =================================================================
   * 六、规则弹窗
   * ================================================================= */
  function startDialogHTML() {
    const hasProgress = !!(readSave('auto') || readPrologueCheckpoint());
    return `
      
      <div class="modal-mask" data-act="close-start-dialog">
      
        <div class="modal start-dialog" data-act="stop">
      
          <button class="close-x" data-act="close-start-dialog">✕</button>
      
          <h3>开始游戏</h3>
  
  <p class="start-dialog-lead">从哪里开始？</p>
  
  <div class="start-choice-note">
    <p><b>从序章开始</b>：先看六段报纸剧情，再打一趟 10 张牌的教学出勤，结束后进入第一季。</p>
    <p><b>从第一季开始</b>：跳过剧情，从第一周固定队伍、紧急委托和逐周引导开始。</p>
    <p><b>从第二季开始</b>：跳过整个第一季，直接进入完全体经营；完整任务池、补丁铺、酒馆全开，带一支起始队伍，没有第一季引导。</p>
  </div>
  
  ${hasProgress ? '<p class="mini-note warn-text">开始新游戏会覆盖当前自动存档与序章断点。</p>' : ''}
  
  <div class="start-dialog-actions">
    <button class="btn primary big" data-act="start-with-prologue">从序章开始</button>
    <button class="btn" data-act="skip-prologue">从第一季开始</button>
    <button class="btn" data-act="start-season2">从第二季开始</button>
    <button class="link-btn" data-act="close-start-dialog">再想想</button>
  </div>
      
        </div>
      
      </div>`;
  }

  function changelogHTML() {
    const list = (D.CHANGELOG || []).map(e => `
      
      <div class="cl-entry">
      
        <div class="cl-head"><b>${e.version}</b><span>${e.title}</span></div>
      
        <ul>${(e.notes || []).map(n => `<li>${n}</li>`).join('')}</ul>
      
      </div>`).join('');
    return `
      
      <div class="modal-mask" data-act="close-changelog">
      
        <div class="modal changelog-modal" data-act="stop">
      
          <button class="close-x" data-act="close-changelog">✕</button>
      
          <h3>更新日志</h3>
      
          <div class="changelog-list">${list || '<div class="empty-line">还没有记录。</div>'}</div>
      
        </div>
      
      </div>`;
  }

  function rulesHTML() {
    return `
    <div class="modal-mask" data-act="close-rules">
      <div class="modal" data-act="stop">
        <button class="close-x" data-act="close-rules">✕</button>
<h3>怎么玩：一局出勤</h3>

<p>你带 5 个人出勤。一张牌、两个选项，选左或选右；选项会拨动四根仪表。普通出勤固定 15 张牌，序章教学局 10 张。</p>

<h4>四根仪表</h4>

<table class="mini-table">
  <tr><th>仪表</th><th>初始</th><th>见底 / 爆掉</th><th>对应评分</th></tr>
  <tr><td>⏳ 时间</td><td>100</td><td>到 0 = 超时失败</td><td>时效</td></tr>
  <tr><td>🌊 潮位</td><td>60</td><td>到 100 = 被乱流吞</td><td>治潮度</td></tr>
  <tr><td>💪 队伍状态</td><td>100</td><td>到 0 = 队伍崩溃</td><td>损伤控制</td></tr>
  <tr><td>🎒 负载</td><td>0 / 安全线 100</td><td>超过 100 = 超载，每张牌持续掉队伍状态</td><td>救援 / 保全</td></tr>
</table>

<h4>评分与评级</h4>

<ul>
  <li>时效 = 剩余时间；损伤 = 剩余队伍状态；救援 = 最终负载；治潮度 = 50 +（起始潮位 − 最终潮位）× 1.5。</li>
  <li>四项按任务权重加权成总分，再除以任务标准分。S ≥ 100%、A ≥ 90%、B ≥ 80%、C ≥ 70%、D ≥ 60%、F &lt; 60%。</li>
  <li>证据：差 1 点总分 ×0.7；差 2 点以上这趟不算，信用作废、金币减半。任务卡会写需要多少证据。</li>
  <li>超载：负载超过安全线后，每张牌持续掉队伍状态；交付 / 卸货牌能减负载，但救援分会掉。</li>
</ul>

<h4>一周怎么过</h4>

<ul>
  <li>出勤格：第一季第 1 周 1 格，第 2 周 2 格，第 3—7 周 3 格，第 8 周 4 格；第二季恢复每周 3 格。</li>
  <li>点「结束本周」先看周结算单：周薪、恢复、任务过期、委派、疲劳变化都在里面，确认后才进下一周。</li>
  <li>每季 8 周；第 8 周结束进季末结算，再进休赛期升级 / 训练，然后下一季。</li>
</ul>

<h4>四家店</h4>

<ul>
  <li><b>🧾 迷途旅行社</b>：接联盟委派和自选任务。第一季第 2—8 周是基础委托；第二季第一周起恢复完整任务池。委派从第一季第 6 周开放，3 周时限、1 次出勤，只有 F 不算过。任务情报也在第 6 周开放：15 金看真实权重和隐藏风险。</li>
  <li><b>🍺 巡回酒馆</b>：第一季第 3 周开放招募、轮换和休整；第二季开放完整候选池、涨薪、挽留、放人和主动转会。第一季第 8 周队伍上限临时 +2、候选上限 6。</li>
  <li><b>🔧 补丁铺</b>：第一季第 4 周开放基础补给，第 8 周每趟可带 2 件；第二季恢复完整 12 格货架、高级道具、回收、赛季内成长和洗练。</li>
  <li><b>⛵ 漏勺号</b>：已接的任务和委派都在这里出发。出发前挑 5 个人、带好道具；路线 / 载重 / 战术已经移除，不再让玩家选择。</li>
</ul>

<h4>人、钱、名声</h4>

<ul>
  <li><b>疲劳</b>：上场的人疲劳 +30；平均疲劳高会扣起手队伍状态（最多 −50）。每周自然恢复 12，酒馆可花 25 金休整。</li>
  <li><b>周薪</b>：每人 3 + 词条数 × 2 + 累计涨薪。每 4 周最多 2 个老人要求涨薪；拒绝会让他想转会。</li>
  <li><b>转会</b>：连续 3 周没上场（或拒绝涨薪）的人会想转会，2 周不处理就自己走（口碑 −2）。可以挽留（花钱 + 口碑）、放人，或主动出售换金币。身价 = 15 + 词条 ×10 + 成长点 ×5。</li>
  <li><b>金币</b>：报酬、外快、商店、招募、情报、休整、周薪、挽留、撤退罚款都从这出。季末结余带下一季。</li>
  <li><b>信用</b>：按单局评级给；委派 F 不给，违约、破产、撤退会扣。季末信用决定下季预算（100 + 信用/10），店铺升级看考核。</li>
  <li><b>口碑</b>：招募门槛，也是街头名声。帮助街坊、完成出勤会涨；放走 / 转会、挽留、二档情报会扣；跨季保留一半。</li>
  <li><b>成长点</b>：每次出勤上场的人 +3。补丁铺里花成长点加词条（第 2 / 3 / 4 个词条分别 9 / 18 / 24 点，上限 4 个）；洗练花金币 + 成长点，从三个候选里换掉一个旧词条。休赛期人物成长不限次数，只看成长点和词条上限；花金币的训练仍最多 2 次。</li>
</ul>

<h4>天气、对手与核心</h4>

<ul>
  <li><b>天气</b>：第一季第 7 周开放。本周天气生效，下周预报可看；会影响起手仪表、报酬、疲劳、店铺或候选。第七周开场不会是平潮，之后随机。</li>
  <li><b>壶潮季</b>：第一季第 7 周开放，看本周 / 下周天气、四店考核和信用榜名次。季末名次决定下季预算、初始口碑和升级名额。</li>
  <li><b>邮袋</b>：达成接单次数、休整次数、队员出勤次数或过完一季后，壶潮季会收到一封信；点开可以读一段对话。</li>
  <li><b>对手抢单</b>：第一季第 7 周起，基础委托里会有一张被其他队伍接走；第二季完整任务池里也会出现「已被某某接取」，不能接。</li>
  <li><b>高危核心</b>：第二季第二周进入任务池：3 次出勤、4 周时限、报酬和信用都高。不强制接，量力而行。</li>
</ul>

<h4>第一季教学节奏</h4>

<p>第 1 周固定五人 + 紧急堵口；第 2 周基础委托；第 3 周酒馆 / 疲劳；第 4 周基础补给；第 5 周任务风向和评级；第 6 周委派 + 情报；第 7 周天气 + 壶潮季 + 对手抢单；第 8 周四格出勤 + 上限提升，结束后进休赛期。第二季第一周起，完整任务池、补丁铺和酒馆全部开放。</p>

<h4>序章</h4>

<p>序章是六段报纸剧情：老板召集老朋友、漏勺号出航、打一趟 10 张牌的教学局。教学局固定队伍、固定配置，不要求证据，不用道具、主动词条或情报；结算只做剧情结果。看完序章进入第一季第一周；也可以跳过序章，直接保留第一周的经营与出勤引导。</p>

<h4>操作与难度</h4>

<p><span class="kbd">←</span> / <span class="kbd">A</span> / <span class="kbd">1</span> 选左；<span class="kbd">→</span> / <span class="kbd">D</span> / <span class="kbd">2</span> 选右。标题页可切标准 / 简单难度；标准难度默认只给方向，买情报或用识途类词条才看具体数值。</p>

<h4>当前原型做到哪</h4>

<p>已做：序章、第一季 1—8 周教学、第二季完整任务池 / 补丁铺 / 酒馆、委派与情报、天气与壶潮季、对手抢单、高危核心、疲劳 / 周薪 / 涨薪 / 转会、成长与洗练、季末考核 / 休赛期 / 下季继承。后续内容会继续在这个原型上补。</p>
      </div>
    </div>
    `;
  }

  function render() {
    // 先记住当前滚动位置：点选项卡 / 买东西只是重画，不该把人弹回页顶
    const prevScreen = S.lastScreen;
    const scrollY = window.scrollY || 0;
    const prevTa = document.querySelector('.table-area');
    const taScroll = prevTa ? prevTa.scrollTop : 0;
    const runIndex = S.run ? S.run.index : -1;

    // 屏幕切换统一加纸幕；标题→序章仍走报纸翻页
    if (S.screen !== prevScreen && prevScreen !== null && S.screen !== 'title'
      
      && !(prevScreen === 'title' && S.screen === 'prologue') && !S.sceneCurtain) {
      
      S.sceneCurtain = { icon: SCENE_ICONS[S.screen] || '📰' };
    }


    let html = '';
    if (S.screen === 'title') html = renderTitle();
    else if (LITE_WEEK1 && S.liteDone) html = renderLiteDone();
    else if (S.screen === 'prologue') html = renderPrologue();
    else if (S.screen === 'task') html = renderTask();
    else if (S.screen === 'prep') html = renderPrep();
    else if (S.screen === 'run') html = renderRun();
    else if (S.screen === 'result') html = renderResult();
    else if (S.screen === 'campaign') html = renderCampaign();
    else if (S.screen === 'seasonEnd') html = renderSeasonEnd();
    else if (S.screen === 'offseason') html = renderOffseason();
    else if (S.screen === 'ending') html = renderEnding();
    html += S.showRules ? rulesHTML() : '';
  html += S.storyMail ? storyMailHTML() : '';
    html += S.showChangelog ? changelogHTML() : '';
    html += S.showSkipDialog ? startDialogHTML() : '';
    html += S.showSave ? saveModalHTML() : '';
    html += weekReportHTML();
    html += retreatModalHTML();
    html += rerollModalHTML();
    if (S.sceneCurtain) html += sceneCurtainHTML();
    $app().innerHTML = html;
    // 撤退确认直接绑定到弹窗按钮，避免依赖全局 data-act 冒泡链。
    const retreatContinueButton = $app().querySelector('.retreat-modal [data-act="cancel-retreat"]');
    if (retreatContinueButton) retreatContinueButton.addEventListener('click', (e) => {
      
      e.preventDefault();
      
      e.stopImmediatePropagation();
      
      try {
      
        S.retreatConfirm = false;
      
        render();
      
      } catch (error) {
      
        S.retreatConfirm = true;
      
        showRetreatActionError('继续出勤时', error);
      
      }
    });
    const retreatConfirmButton = $app().querySelector('.retreat-modal [data-act="confirm-retreat"]');
    if (retreatConfirmButton) retreatConfirmButton.addEventListener('click', (e) => {
      
      e.preventDefault();
      
      e.stopImmediatePropagation();
      
      try {
      
        onRetreat();
      
        if (S.retreatConfirm) {
      
          const status = S.run ? S.run.status : '无出勤状态';
      
          showRetreatActionError(`按钮已响应，但撤退未完成（局内状态：${status}）`, null);
      
        }
      
      } catch (error) {
      
        showRetreatActionError('撤退结算时', error);
      
      }
    });
    S.lastScreen = S.screen;
    // 序章逐句：新句子进来自动滚到底，别让玩家以为没下文
    {
      
      const sl = document.querySelector('.story-lines');
      
      if (sl) sl.scrollTop = sl.scrollHeight || 0;
    }
    stopCoachTracking();
    if (S.screen === 'run' && S.mode === 'prologue' && S.runTutorial) positionRunCoach();
    autosave();

    const ta = document.querySelector('.table-area');
    if (prevScreen !== S.screen) {
      
      // 切屏幕才回顶
      
      window.scrollTo(0, 0);
      
      if (ta) ta.scrollTop = 0;
    } else {
      
      // 同一屏重画：保持滚动位置（出勤里换了一张牌才把牌区拉回顶部）
      
      window.scrollTo(0, scrollY);
      
      if (ta) ta.scrollTop = (S.screen === 'run' && S.lastRunIndex !== runIndex) ? 0 : taScroll;
    }
    S.lastRunIndex = runIndex;
  }

  /* =================================================================
   * 动作
   * ================================================================= */
  /* 一局结束：算结算 + （经理层）写回周循环，保证只写一次 */
  function finalizeRun() {
    const st = S.run;
    if (!st) return;
    if (!S.result) S.result = E.result(st);
    if (S.mode === 'campaign' && S.campaignTask && !S.campaignReward) {
      
      const usedItems = (st.items || []).filter(it => it.used).map(it => it.id);
      
      const gainedItems = (st.items || []).filter(it => it.gained && !it.used).map(it => it.id);
      
      S.campaignReward = Campaign.resolveRun(
      
        S.campaign, S.campaignTask, S.result, S.campaignRunCfg || st.cfg, usedItems, gainedItems
      
      );
      
      S.campaignTask = null;
      
      S.campaignRunCfg = null;
    }
  }

  function onChoose(i) {
    const st = S.run;
    if (!st || st.status !== 'running') return;
    S.retreatConfirm = false;
    const res = E.choose(st, i);
    if (!res) return;
    render();
    reportChoice(res);
    if (st.status !== 'running') {
      
      const endedRun = st;
      
      finalizeRun();
      
      setTimeout(() => {
      
        if (S.screen === 'run' && S.run === endedRun) { S.screen = 'result'; render(); }
      
      }, 900);
    }
  }

  function reportChoice(res) {
    // 主要变化
    const parts = [];
    for (const k of GAUGE_ORDER) {
      
      const v = res.effect.deltas[k];
      
      if (v) parts.push(`${SHORT[k]}${sgn(v)}${absNum(v)}`);
    }
    if (res.effect.evidence) parts.push(`证据 +${res.effect.evidence}`);
    if (res.effect.gold) parts.push(`金币${sgn(res.effect.gold)}${absNum(res.effect.gold)}`);
    let html = parts.length ? parts.join('　') : '这步没有拨动仪表。';
    showToast(html);

    if (res.effect.overloadTick) {
      
      showToast(`超载！工具故障：队伍状态 −${res.effect.overloadPenalty || 5}。<br><span class="t-small">只要还超着，每张牌都会掉状态——找交付/卸货牌减载。</span>`, 'warn');
    } else if (res.effect.overload) {
      
      showToast('超载了：负载超过安全线，下一张牌开始会持续掉队伍状态。', 'warn');
    }
    if (res.effect.shielded) showToast('应急抢修挡下了这步的坏消息。', 'good');
    if (res.effect.gainItem) showToast(`顺手得了一件道具：${res.effect.gainItem.name}。`, 'good');
    if (res.effect.reveal) showToast('看见了接下来一张牌的底。', 'good');
    for (const e of res.events) showToast(e);

    // 情报误报
    if (res.intelLie) {
      
      const lines = res.intelLie.map(x =>
      
        `${SHORT[x.key]}实际 <b>${sgn(x.real)}${absNum(x.real)}</b>（情报说 ${sgn(x.shown)}${absNum(x.shown)}）`
      
      );
      
      showToast('<span class="t-small">情报有误！</span><br>' + lines.join('　'), 'lie');
    }

    if (S.run.status === 'lost') {
      
      showToast('💀 ' + S.run.failReason, 'warn');
    } else if (S.run.status === 'reached') {
      
      showToast('✔ 到达目标，出勤结束。', 'good');
    }
  }

  function onRetreat() {
    const st = S.run;
    if (!st || st.status !== 'running') return;
    if (!E.retreat(st)) return;
    S.retreatConfirm = false;
    S.result = E.result(st);
    finalizeRun();
    S.screen = 'result';
    render();
  }

  function showRetreatActionError(phase, error) {
    const message = error && error.message ? error.message : '程序没有完成这一步。';
    const box = $app().querySelector('.retreat-action-status');
    if (box) {
      
      box.textContent = `${phase}：${message}`;
      
      box.hidden = false;
    }
    if (error) console.error('[retreat]', phase, error);
  }

  function retreatModalHTML() {
    if (!S.retreatConfirm || S.screen !== 'run' || !S.run || S.run.status !== 'running') return '';
    const free = !!(S.run.flags && S.run.flags.retreatFree);
    const creditLoss = S.mode === 'campaign' && S.campaign
      
      ? Math.min(Campaign.retreatCreditOf(S.campaign), Math.max(0, S.campaign.credit || 0))
      
      : 0;
    const cost = S.mode === 'campaign' && !free
      
      ? `经理层会额外扣 ${D.CAMPAIGN.retreatGoldPenalty} 金币${creditLoss ? ` 和 ${creditLoss} 信用` : '；当前没有可扣的信用'}。`
      
      : free ? '本局有免罚效果，不会扣撤退罚款。' : '这会提前结束当前出勤。';
    return `<div class="modal-mask retreat-mask" data-act="cancel-retreat">
      
      <div class="modal retreat-modal" data-act="stop">
      
        <div class="paper-kicker">出勤中止确认</div>
      
        <h3>现在提前撤退？</h3>
      
        <p>队伍会带着已经救到的东西离开，当前任务按撤退结果结算。</p>
      
        <p class="retreat-cost">${cost}</p>
      
        <p class="retreat-action-status" role="alert" hidden></p>
      
        <div class="result-actions">
      
          <button type="button" class="btn" data-act="cancel-retreat">继续出勤</button>
      
          <button type="button" class="btn primary" data-act="confirm-retreat">确认撤退</button>
      
        </div>
      
      </div>
    </div>`;
  }

  function useItemAt(i) {
    const st = S.run;
    if (!st) return;
    const res = E.useItem(st, i);
    if (!res) return;
    render();
    showToast(`用了「${res.name}」：${deltaTextOf(res.effect)}`, 'good');
    if (res.effect.overload) showToast('这件道具把负载顶过了安全线：下一张牌开始持续掉状态。', 'warn');
    if (st.status === 'lost') showToast('💀 ' + st.failReason, 'warn');
  }

  function useActiveAt(i) {
    const st = S.run;
    if (!st) return;
    const res = E.useActive(st, i);
    if (!res) return;
    render();
    if (res.choices) showToast(`「${res.name}」：从四个增益里选一个`, 'good');
    else if (res.effect && res.effect.deckAdd) showToast(`「${res.name}」：牌堆 +${res.effect.deckAdd}${res.effect.retreatFree ? '，本局撤退免罚' : ''}`, 'good');
    else showToast(`「${res.name}」发动：${deltaTextOf(res.effect || {})}`, 'good');
    if (st.status === 'lost') showToast('💀 ' + st.failReason, 'warn');
  }

  /* ---------------- 经理层动作 ---------------- */
  function campaignSnapshot(c) {
    const avgFat = Math.round(c.travelers.reduce((a, t) => a + t.fatigue, 0) / Math.max(1, c.travelers.length));
    return {
      
      gold: c.gold, credit: c.credit, reputation: c.reputation,
      
      avgFat,
    };
  }

  function weekReportHTML() {
    const r = S.weekReport;
    if (!r) return '';
    const rows = [
      
      ['金币', r.before.gold, r.after.gold],
      
      ['信用', r.before.credit, r.after.credit],
      
      ['口碑', r.before.reputation, r.after.reputation],
      
      ['队伍平均疲劳', r.before.avgFat, r.after.avgFat],
    ];
    return `
    <div class="modal-mask" data-act="week-continue">
      
      <div class="modal week-report" data-act="stop">
      
        <h3>第 ${r.weekNumber} 周结算</h3>
      
        <p class="wr-sub">先看清楚这一周钱花在哪，再进下一周。</p>
      
        <div class="wr-grid">
      
          ${rows.map(([name, a, b]) => {
      
      const d = b - a;
      
      const cls = d > 0 ? 'good' : d < 0 ? 'bad' : '';
      
      const sign = d > 0 ? '+' : '';
      
      return `<div class="wr-item"><span>${name}</span><b>${a} → ${b}</b><i class="${cls}">${sign}${d}</i></div>`;
      
          }).join('')}
      
        </div>
      
        <h4>这一周发生了什么</h4>
      
        <ul class="wr-log">${r.log.length ? r.log.map(l => `<li>${l}</li>`).join('') : '<li>平平淡淡的一周。</li>'}</ul>
      
        <p class="mini-note">下一周：出勤格回满 ${Campaign.slotsPerWeekOf(S.campaign)} 格、补丁铺重新上货、酒馆换一批客人、任务栏补新单。</p>
      
        <div class="result-actions">
      
          <button class="btn primary big" data-act="week-continue">进入第 ${r.nextWeek} 周 →</button>
      
        </div>
      
      </div>
    </div>`;
  }

  function rerollModalHTML() {
    const r = S.reroll;
    if (!r) return '';
    const c = S.campaign;
    const t = c && c.travelers.find(x => x.id === r.travelerId);
    if (!t) { S.reroll = null; return ''; }
    if (r.step === 'pickOld') {
      
      return `
      
      <div class="modal-mask" data-act="reroll-cancel">
      
        <div class="modal reroll-modal" data-act="stop">
      
          <h3>洗练 · ${t.name}</h3>
      
          <p class="wr-sub">先选一个要换掉的词条（换掉后不会回来）。花费：${D.CAMPAIGN.rerollCost.gold} 金 + ${D.CAMPAIGN.rerollCost.growth} 成长点</p>
      
          <div class="reroll-old-row">
      
            
      ${t.traits.map((tr, i) => `<button class="btn small" data-act="reroll-old" data-i="${i}">${tr.name} <i style="opacity:.6">${tr.rarity}</i></button>`).join('')}
      
          </div>
      
          <div class="result-actions"><button class="btn" data-act="reroll-cancel">取消</button></div>
      
        </div>
      
      </div>`;
    }
    return `
    <div class="modal-mask" data-act="reroll-cancel">
      
      <div class="modal reroll-modal" data-act="stop">
      
        <h3>洗练 · ${t.name}</h3>
      
        <p class="wr-sub">要换掉「${t.traits[r.oldIndex] ? t.traits[r.oldIndex].name : '?'}」，从这三个里挑一个新词条：</p>
      
        <div class="reroll-new-grid">
      
          ${r.options.map((tr, i) => `
      
          <div class="reroll-card ${tr.rarity}" data-act="reroll-new" data-i="${i}">
      
            
      <div class="rn-name">${tr.name}<i>${tr.rarity}</i></div>
      
            
      <div class="rn-desc">${tr.desc}</div>
      
          </div>`).join('')}
      
        </div>
      
        <div class="result-actions"><button class="btn" data-act="reroll-cancel">再想想</button></div>
      
      </div>
    </div>`;
  }

  function endWeekNow() {
    const c = S.campaign;
    if (!c) return;
    // 出勤格没用完时先确认一次，防止误点
    if (c.slotsLeft > 0 && !S.endWeekConfirm) {
      
      S.endWeekConfirm = true;
      
      render();
      
      showToast(`还有 ${c.slotsLeft} 格出勤没用。再点一次"确认结束"就进下周。`, 'warn');
      
      return;
    }
    S.endWeekConfirm = false;
    const endedWeek = c.week;
    const before = campaignSnapshot(c);
    const res = Campaign.endWeek(c);
    if (!res.ok) { showToast(res.reason, 'warn'); return; }
    if (!res.ended) saveWeekSnapshot(c);
    if (res.ended) {
      
      S.weekReport = null;
      
      S.seasonSummary = res.summary;
      
      S.screen = 'seasonEnd';
    } else {
      
      S.weekReport = {
      
        weekNumber: endedWeek,
      
        log: res.log,
      
        before,
      
        after: campaignSnapshot(c),
      
        nextWeek: c.week,
      
      };
      
      S.screen = 'campaign';
    }
    render();
  }

  function rewindWeek() {
    const c = S.campaign;
    if (!c || c.week <= 1) { showToast('已经是本季第一周。', 'warn'); return; }
    const target = readWeekBack()
      .filter(x => x.season === c.season && x.week === c.week - 1)
      .sort((a, b) => b.at - a.at)[0];
    if (!target) { showToast('没有上一周的周初快照。', 'warn'); return; }
    const state = JSON.parse(JSON.stringify(target.state));
    state.rng = Math.random;
    S.campaign = state;
    S.mode = 'campaign';
    S.campaignTask = null;
    S.campaignRunCfg = null;
    S.campaignReward = null;
    S.campaignIntel = 0;
    S.seasonSummary = null;
    S.weekReport = null;
    S.endWeekConfirm = false;
    S.campaignPanel = 'agency';
    S.screen = 'campaign';
    S.cfg = campaignDefaultCfg();
    writeSave('auto', state);
    render();
    showToast('测试：已回到第 ' + state.week + ' 周开始。', 'good');
  }

  function restNow() {
    const c = S.campaign;
    if (!c) return;
    const res = Campaign.rest(c);
    if (!res.ok) { showToast(res.reason, 'warn'); return; }
    render();
    showToast(`酒馆休整：全队疲劳 −${Campaign.restRecoverOf(c)}。`, 'good');
  }

  function nextSeasonNow() {
    const c = S.campaign;
    if (!c) return;
    const res = Campaign.nextSeason(c);
    S.campaign = res.state;
    saveWeekSnapshot(S.campaign);
    S.seasonSummary = null;
    S.weekReport = null;
    S.campaignTask = null;
    S.campaignReward = null;
    S.liteDone = false;
    S.screen = 'campaign';
    render();
    showToast(`第 ${res.state.season} 季开始：预算 +${res.summary.budget} 金。`, 'good');
  }

  /* =================================================================
   * 事件绑定
   * ================================================================= */
  // 序章：点页面任意位置也能继续（按钮/选项除外）
  document.addEventListener('click', (e) => {
    if (S.screen !== 'prologue' || S.mode !== 'prologue') return;
    if (e.target.closest('[data-act]')) return;
    prologueAdvance();
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'stop') return;

    switch (act) {
      
      case 'home':
      
        stopSceneIntro();
      
        stopTypewriter();
      
        stopHeadlineTypewriter();
      
        autosave();
      
        S.screen = 'title'; S.showRules = false; S.showChangelog = false; S.showSkipDialog = false; S.showSave = false; S.endWeekConfirm = false; S.weekReport = null; render(); break;
      
      case 'run-tutorial-next':
      
        if ((S.runCoachStep || 0) >= RUN_COACH_STEPS.length - 1) {
      
          S.runTutorial = false;
      
          S.runCoachStep = 0;
      
        } else {
      
          S.runCoachStep = (S.runCoachStep || 0) + 1;
      
        }
      
        render(); break;
      
      case 'run-tutorial-close':
      
        S.runTutorial = false; S.runCoachStep = 0; render(); break;
      
      case 'save-menu':
      
        S.showSave = true; render(); break;
      
      case 'close-save':
      
        S.showSave = false; render(); break;
      
      case 'save-slot': {
      
        const slot = el.dataset.slot;
      
        if (writeSave(slot, S.campaign)) {
      
          showToast(`已保存到「${SAVE_LABELS[slot]}」。`, 'good');
      
        } else {
      
          showToast('存档失败（浏览器不允许本地存储）。', 'warn');
      
        }
      
        render(); break;
      
      }
      
      case 'load-slot':
      
        loadSave(el.dataset.slot); break;
      
      case 'del-slot':
      
        deleteSave(el.dataset.slot);
      
        showToast(`已删除「${SAVE_LABELS[el.dataset.slot]}」。`, 'warn');
      
        render(); break;
      
      case 'diff':
      
        S.blind = el.dataset.v === 'blind'; render(); break;
      
      case 'week-continue':
      
        S.weekReport = null; render(); break;
      
      case 'lite-start':
      
      case 'lite-restart': {
      
        const c = Campaign.newSeason();
      
        S.liteDone = false;
      
        startCampaign(c);
      
        break;
      
      }
      
      case 'start-game':
      
        S.showSkipDialog = true;
      
        render(); break;
      
      case 'close-start-dialog':
      
        S.showSkipDialog = false;
      
        render(); break;
      
      case 'start-with-prologue':
      
        S.showSkipDialog = false;
      
        startNewGameWithPrologue(); break;
      
      case 'skip-prologue':
      
        S.showSkipDialog = false;
      
        startNewGameSkipping(); break;
      
      case 'start-season2':
      
        S.showSkipDialog = false;
      
        startNewGameSeason2(); break;
      
      case 'continue-game': {
      
        const d = readPrologueCheckpoint();
      
        if (d) { resumePrologue(d); break; }
      
        if (!loadSave('auto')) showToast('没有可继续的进度。', 'warn');
      
        break;
      
      }
      
      case 'prologue-next':
      
        prologueAdvance(); break;
      
      case 'prologue-skip':
      
        stopSceneIntro();
      
        stopTypewriter();
      
        S.prologueShown = 999;
      
        savePrologueCheckpoint();
      
        render(); break;
      
      case 'prologue-next-scene':
      
        prologueGo((S.prologueScene || 0) + 1); break;
      
      case 'prologue-sail':
      
        prologueGo(4); break;
      
      case 'prologue-finish': {
      
        const c = Campaign.newSeason();
      
        clearPrologueCheckpoint();
      
        S.sceneCurtain = { icon: SCENE_ICONS.toCampaign };
      
        startCampaign(c);
      
        break;
      
      }
      
      case 'prologue-after-run':
      
        S.sceneCurtain = { icon: SCENE_ICONS.toStory };
      
        prologueGo(5, { noFlip: true }); break;
      
      case 'campaign-assign':
      
        launchCampaignTask(el.dataset.uid); break;
      
      case 'boat-launch':
      
        launchCampaignTask(el.dataset.uid); break;
      
      case 'panel':
      
        {
      
          const panel = el.dataset.panel || 'agency';
      
          const allowedPanels = isBasicItemWeek(S.campaign)
      
            
      ? ['agency', 'tavern', 'patch', 'boat']
      
            
      : isThirdWeekCampaign(S.campaign)
      
            
        ? ['agency', 'tavern', 'boat']
      
            
        : ['agency', 'boat'];
      
          if (isCampaignOnboardingWeek(S.campaign) && !allowedPanels.includes(panel)) {
      
            
      showToast('这项业务会在后续周次开放。', 'warn'); break;
      
          }
      
          S.campaignPanel = panel; render(); break;
      
        }
      
      case 'buy-task-intel': {
      
        const c = S.campaign;
      
        const task = c && c.tasks.concat(c.delegations).find(t => t.uid === el.dataset.uid);
      
        const cost = D.CAMPAIGN.taskIntelCost || 15;
      
        if (!task || task.intelBought) break;
      
        if (c.gold < cost) { showToast(`买情报要 ${cost} 金，钱不够。`, 'warn'); break; }
      
        c.gold -= cost;
      
        task.intelBought = true;
      
        render();
      
        showToast(`买到了「${task.name}」的底细：真实权重和隐藏风险已标出。`, 'good');
      
        break;
      
      }
      
      case 'accept-task': {
      
        const r = Campaign.acceptTask(S.campaign, el.dataset.uid);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        render(); showToast(`接了「${r.task.name}」，去漏勺号安排出勤。`, 'good'); break;
      
      }
      
      case 'recruit': {
      
        const r = Campaign.recruit(S.campaign, el.dataset.uid);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        render(); showToast(`「${r.name}」入队了。`, 'good'); break;
      
      }
      
      case 'release': {
      
        const r = Campaign.release(S.campaign, el.dataset.id);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        render(); showToast(`放走了「${r.name}」，口碑掉了。`, 'warn'); break;
      
      }
      
      case 'sell-traveler': {
      
        const r = Campaign.sellTraveler(S.campaign, el.dataset.id);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        render(); showToast(`「${r.name}」转会出去：+${r.gold} 金。`, 'good'); break;
      
      }
      
      case 'growth': {
      
        const r = Campaign.growthTrait(S.campaign, el.dataset.id);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        render(); showToast(`「${r.traveler.name}」习得词条「${r.trait.name}」！`, 'good'); break;
      
      }
      
      case 'reroll-start': {
      
        const r = Campaign.rerollOptions(S.campaign, el.dataset.id);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        S.reroll = { travelerId: el.dataset.id, step: 'pickOld', options: r.options, oldIndex: -1 };
      
        render(); break;
      
      }
      
      case 'reroll-old':
      
        if (S.reroll) { S.reroll.oldIndex = parseInt(el.dataset.i, 10); S.reroll.step = 'pickNew'; render(); }
      
        break;
      
      case 'reroll-new': {
      
        if (!S.reroll) break;
      
        const opt = S.reroll.options[parseInt(el.dataset.i, 10)];
      
        const r = Campaign.rerollApply(S.campaign, S.reroll.travelerId, S.reroll.oldIndex, opt.name);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        S.reroll = null;
      
        render(); showToast(`洗练成功：${r.oldName} → ${r.newName}。`, 'good'); break;
      
      }
      
      case 'reroll-cancel':
      
        S.reroll = null; render(); break;
      
      case 'accept-raise': {
      
        const r = Campaign.resolveRaise(S.campaign, el.dataset.id, true);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        render(); showToast(`答应了涨薪 +${r.raised} 金/周（现 ${r.wage}）。`, 'warn'); break;
      
      }
      
      case 'decline-raise': {
      
        const r = Campaign.resolveRaise(S.campaign, el.dataset.id, false);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        render(); showToast('拒绝了涨薪，他动了转会的心思。', 'warn'); break;
      
      }
      
      case 'keep-traveler': {
      
        const r = Campaign.keepTraveler(S.campaign, el.dataset.id);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        render(); showToast(`挽留了「${r.name}」。`, 'good'); break;
      
      }
      
      case 'let-leave': {
      
        const r = Campaign.letLeave(S.campaign, el.dataset.id);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        render(); showToast(`「${r.name}」走了。`, 'warn'); break;
      
      }
      
      case 'buy-item': {
      
        const r = Campaign.buyItem(S.campaign, parseInt(el.dataset.i, 10));
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        render(); showToast(`买下「${r.name}」：−${r.price} 金。`, 'good'); break;
      
      }
      
      case 'sell-item': {
      
        const r = Campaign.sellItem(S.campaign, el.dataset.id);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        render(); showToast(`回收「${r.name}」：+${r.price} 金。`, 'good'); break;
      
      }
      
      case 'campaign-back':
      
        S.screen = 'campaign'; S.campaignTask = null; S.campaignRunCfg = null; S.campaignReward = null;
      
        S.campaignPanel = 'boat'; S.endWeekConfirm = false; render(); break;
      
      case 'rest':
      
        restNow(); break;
      
      case 'end-week':
      
        if (LITE_WEEK1) { S.liteDone = true; render(); break; }
      
        endWeekNow(); break;
      
      case 'rewind-week':
      
        rewindWeek(); break;
      
      case 'to-offseason':
      
        if (S.campaign) {
      
          S.seasonSummary = Campaign.seasonSummary(S.campaign);
      
          S.screen = 'offseason';
      
          render();
      
        }
      
        break;
      
      case 'upgrade-store': {
      
        const r = Campaign.upgradeStore(S.campaign, el.dataset.store);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        if (r.cleared) {
      
          S.screen = 'ending';
      
          render();
      
          showToast(`${r.name} 升到 Lv${r.level} · 四店满级，通关！`, 'good');
      
          break;
      
        }
      
        render();
      
        showToast(`${r.name} 升到 Lv${r.level}。`, 'good');
      
        break;
      
      }
      
      case 'ending':
      
        S.screen = 'ending';
      
        render();
      
        break;
      
      case 'ending-continue':
      
        S.screen = (S.campaign && S.campaign.ended) ? 'offseason' : 'campaign';
      
        render();
      
        break;
      
      case 'train-traveler': {
      
        const r = Campaign.trainTraveler(S.campaign, el.dataset.id);
      
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
      
        render();
      
        showToast(`「${r.name}」成长 +${r.growth}。`, 'good');
      
        break;
      
      }
      case 'offseason-growth': {
        const r = Campaign.offseasonGrowth(S.campaign, el.dataset.id);
        if (!r.ok) { showToast(r.reason, 'warn'); break; }
        render();
        showToast(`「${r.name}」习得「${r.trait.name}」。`, 'good');
        break;
      }
      
      case 'next-season':
      
        nextSeasonNow(); break;
      
      case 'rules':
      
        S.showRules = true; render(); break;
      
      case 'close-rules':
      
        S.showRules = false; render(); break;
      
      case 'open-mail': {
        S.storyMail = el.dataset.id;
        S.storyMailLine = 0;
        if (S.campaign) Campaign.markMailRead(S.campaign, S.storyMail);
        render(); break;
      }
      case 'story-mail-next': {
        const mail = (D.STORY_MAILS || []).find(m => m.id === S.storyMail);
        const total = mail && mail.lines ? mail.lines.length : 0;
        if (!mail || (S.storyMailLine || 0) >= total - 1) { S.storyMail = null; S.storyMailLine = 0; }
        else S.storyMailLine = (S.storyMailLine || 0) + 1;
        render(); break;
      }
      case 'close-mail':
        S.storyMail = null; S.storyMailLine = 0; render(); break;
      
      case 'changelog':
      
        S.showChangelog = true; render(); break;
      
      case 'close-changelog':
      
        S.showChangelog = false; render(); break;
      
      case 'new-task':
      
        newTask(); break;
      
      case 'reroll':
      
        newTask(); break;
      
      case 'intel':
      
        S.intel = parseInt(el.dataset.level, 10); render(); break;
      
      case 'camp-intel':
      
        if (isGuidedPrepWeek(S.campaign)) { showToast('情报业务会在后续周次开放。', 'warn'); break; }
      
        S.campaignIntel = parseInt(el.dataset.level, 10); render(); break;
      
      case 'to-prep':
      
        S.screen = 'prep'; render(); break;
      
      case 'back-task':
      
        S.screen = 'task'; render(); break;
      
      case 'trav': {
      
        const id = el.dataset.id;
      
        const idx = S.cfg.travelers.indexOf(id);
      
        if (idx >= 0) S.cfg.travelers.splice(idx, 1);
      
        else if (S.cfg.travelers.length < 5) S.cfg.travelers.push(id);
      
        else showToast('最多只能带 5 个人上船，先卸一个。', 'warn');
      
        render(); break;
      
      }
      
      case 'item-toggle': {
      
        const id = el.dataset.id;
      
        if (S.mode === 'campaign' && isCampaignOnboardingWeek(S.campaign)
      
          && (!isBasicItemWeek(S.campaign) || !(D.CAMPAIGN.tutorialItems || []).includes(id))) {
      
          showToast('当前教学周只开放基础道具。', 'warn'); break;
      
        }
      
        const idx = S.cfg.items.indexOf(id);
      
        if (idx >= 0) S.cfg.items.splice(idx, 1);
      
        else if (S.cfg.items.length < itemLimit()) S.cfg.items.push(id);
      
        else showToast(`每趟最多带 ${itemLimit()} 张道具。`, 'warn');
      
        render(); break;
      
      }
      
      case 'launch':
      
        if (S.cfg.travelers.length === 5) startRun();
      
        break;
      
      case 'choose':
      
        onChoose(params(el)); break;
      
      case 'use-item':
      
        useItemAt(params(el)); break;
      
      case 'active':
      
        useActiveAt(params(el)); break;
      
      case 'retreat':
      
        if (S.run && S.run.status === 'running') {
      
          S.runTutorial = false;
      
          S.runCoachStep = 0;
      
          stopCoachTracking();
      
          S.retreatConfirm = true;
      
          render();
      
        }
      
        break;
      
      case 'cancel-retreat':
      
        S.retreatConfirm = false; render(); break;
      
      case 'confirm-retreat':
      
        onRetreat(); break;
      
      case 'show-result':
      
        finalizeRun();
      
        S.screen = 'result'; render(); break;
      
      case 'again':
      
        startRun(); break;
      
      default:
      
        break;
    }
  });

  /* 键盘：A / D、← / →、1 / 2 */
  // 撤退弹窗优先在 window 捕获阶段响应 Escape，避免焦点落在按钮或子元素时漏掉。
  window.addEventListener('keydown', (e) => {
    if (!S.retreatConfirm || !(e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27)) return;
    e.preventDefault();
    e.stopPropagation();
    S.retreatConfirm = false;
    try {
      
      render();
    } catch (error) {
      
      S.retreatConfirm = true;
      
      showRetreatActionError('关闭撤退弹窗时', error);
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (S.showRules) {
      
      if (e.key === 'Escape') { S.showRules = false; render(); }
      
      return;
    }
    if (S.screen === 'prologue' && S.mode === 'prologue') {
      
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      
        e.preventDefault();
      
        prologueAdvance();
      
      }
      
      return;
    }
    if (S.screen !== 'run' || !S.run || S.run.status !== 'running') return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a' || k === '1') { e.preventDefault(); onChoose(0); }
    if (k === 'arrowright' || k === 'd' || k === '2') { e.preventDefault(); onChoose(1); }
    if (k === 'escape') { S.showRules = true; render(); }
  });

  /* 启动 */
  document.addEventListener('DOMContentLoaded', () => {
    const wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
    render();

    // 开发用：地址栏加 #dev-task / #dev-prep / #dev-run / #dev-result / #dev-campaign / #dev-season-end
    // 可以直接跳到对应界面（自测、截图用），正常游玩用不到。
    const dev = (location.hash || '').replace('#', '');
    if (dev === 'dev-task') {
      
      S.taskId = 'urgent'; S.intel = 0; S.cfg = defaultCfg(); S.screen = 'task'; render();
    } else if (dev === 'dev-prep') {
      
      S.taskId = 'urgent'; S.intel = 0; S.cfg = defaultCfg(); S.screen = 'prep'; render();
    } else if (dev === 'dev-run' || dev === 'dev-result') {
      
      S.taskId = 'urgent'; S.intel = 1; S.cfg = defaultCfg();
      
      startRun();
      
      if (dev === 'dev-result') {
      
        let guard = 0;
      
        while (S.run.status === 'running' && guard++ < 40) {
      
          const opts = Engine.displayOptions(S.run);
      
          Engine.choose(S.run, Math.floor(Math.random() * opts.length));
      
        }
      
        S.result = Engine.result(S.run);
      
        S.screen = 'result';
      
        render();
      
      }
    } else if (dev === 'dev-campaign') {
      
      startCampaign();
    } else if (dev === 'dev-week6') {
      startCampaign();
      for (let i = 0; i < 5; i++) Campaign.endWeek(S.campaign);
      S.campaignPanel = 'agency';
      render();
    } else if (dev === 'dev-mail') {
  startCampaign(Campaign.newSeason({ season: 2, starterTeam: true }));
  S.campaign.stats.tasksAccepted = 10;
  Campaign.checkStoryMails(S.campaign);
  S.campaignPanel = 'season';
  S.storyMail = 'mail_guild_tasks10';
  S.storyMailLine = 0;
  render();
  } else if (dev === 'dev-week8') {
  startCampaign();
  for (let i = 0; i < 7; i++) Campaign.endWeek(S.campaign);
  S.campaignPanel = 'agency';
  render();
  } else if (dev === 'dev-week7') {
  startCampaign();
  for (let i = 0; i < 6; i++) Campaign.endWeek(S.campaign);
  S.campaignPanel = 'season';
  render();
  } else if (dev === 'dev-season2') {
  startCampaign(Campaign.newSeason({ season: 2, starterTeam: true }));
  S.campaignPanel = 'agency';
  render();
  } else if (dev === 'dev-season2-w2') {
  startCampaign(Campaign.newSeason({ season: 2, starterTeam: true }));
  Campaign.endWeek(S.campaign);
  S.campaignPanel = 'agency';
  render();
  } else if (dev === 'dev-season-end') {
      
      startCampaign();
      
      for (let i = 0; i < D.CAMPAIGN.seasonWeeks; i++) Campaign.endWeek(S.campaign);
      
      S.seasonSummary = Campaign.seasonSummary(S.campaign);
      
      S.screen = 'seasonEnd';
      
      render();
    }
  });

  return { render };
})();
