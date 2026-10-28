/* =====================================================================
 * 《大壶街出勤局》经理层 · 周循环骨架 v0.2
 * ---------------------------------------------------------------------
 * 一季 8 周，每周 3 格出勤：
 *   委派任务（联盟派、4 档、C 以上解锁下一档、超时违约）
 *   自选任务栏（会过期、有的要出勤多次）
 *   金币 / 信用 / 口碑
 *   四店维护度（每周维护费、出勤磨损、服务打折）
 *   队伍疲劳与周薪
 * 纯逻辑，不碰界面；可被 node 测试与模拟直接调用。
 * 规则出处：《玩法设计》七、八、九；《数值表》二、三、四、五、七。
 * ===================================================================== */
const Campaign = (() => {
  const D = (typeof DATA !== 'undefined') ? DATA : require('./data.js');
  const C = D.CAMPAIGN;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const randi = (rng, n) => Math.floor(rng() * n);
  const RATING_VALUE = { S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 };

  function defaultStats() {
    return {
      runs: 0, tasksDone: 0, delegationsDone: 0, breached: 0, goldEarned: 0, creditEarned: 0,
      itemsBought: 0, itemsSold: 0, itemUses: 0, growths: 0, recruits: 0, rests: 0, tasksAccepted: 0,
      failures: 0, retreats: 0, aRuns: 0, runsWithItems: 0,
    };
  }
  function defaultCareer() {
    return {
      seasonsPlayed: 0, bestCredit: 0,
      championCount: 0, bestRank: 99,
      runs: 0, tasksDone: 0, delegationsDone: 0,
      goldEarned: 0, creditEarned: 0,
      ratings: { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 },
    };
  }

  function defaultProfile() {
    return {
      career: defaultCareer(),
      unlockedTier: 1,
      story: { unlocked: {}, read: {} },
    };
  }

  /* 跨季持久层：换季只重置赛季字段，profile 整块保留 */
  function profileOf(st) {
    if (!st.profile) {
      st.profile = {
        career: st.career || defaultCareer(),
        unlockedTier: st.unlockedTier || 1,
        story: { unlocked: {}, read: {} },
      };
    }
    const p = st.profile;
    p.career = p.career || defaultCareer();
    p.career.ratings = p.career.ratings || defaultCareer().ratings;
    if (p.career.ratings.F === undefined) p.career.ratings.F = 0;
    p.unlockedTier = p.unlockedTier || 1;
    p.story = p.story || { unlocked: {}, read: {} };
    p.story.unlocked = p.story.unlocked || {};
    p.story.read = p.story.read || {};
    return p;
  }

  /* ---------------- 壶潮季邮袋 ---------------- */
  function storyOf(st) {
    const p = profileOf(st);
    p.story = p.story || { unlocked: {}, read: {} };
    p.story.unlocked = p.story.unlocked || {};
    p.story.read = p.story.read || {};
    return p.story;
  }
  function mailConditionMet(st, mail) {
    const c = mail.condition || {};
    const career = profileOf(st).career || {};
    if (c.kind === 'season') return (career.seasonsPlayed || 0) >= (c.gte || 1);
    if (c.kind === 'tasksAccepted') return (st.stats.tasksAccepted || 0) >= (c.gte || 1);
    if (c.kind === 'rests') return (st.stats.rests || 0) >= (c.gte || 1);
    if (c.kind === 'runs') return (st.stats.runs || 0) >= (c.gte || 1);
    if (c.kind === 'travelerRuns') {
      const t = (st.travelers || []).find(x => x.name === c.name);
      return !!t && (t.runCount || 0) >= (c.gte || 1);
    }
    return false;
  }
  function checkStoryMails(st) {
    const story = storyOf(st);
    const newly = [];
    for (const mail of (D.STORY_MAILS || [])) {
      if (story.unlocked[mail.id]) continue;
      if (!mailConditionMet(st, mail)) continue;
      story.unlocked[mail.id] = true;
      newly.push(mail);
    }
    return newly;
  }
  function storyMailsOf(st) {
    const story = storyOf(st);
    return (D.STORY_MAILS || []).filter(m => story.unlocked[m.id]).map(m => Object.assign({}, m, { read: !!story.read[m.id] }));
  }
  function mailUnreadCount(st) {
    const story = storyOf(st);
    return (D.STORY_MAILS || []).filter(m => story.unlocked[m.id] && !story.read[m.id]).length;
  }
  function markMailRead(st, id) {
    const story = storyOf(st);
    if (!story.unlocked[id]) return false;
    story.read[id] = true;
    return true;
  }

  /* 天气：每周一种，提前一周预报 */
  function weatherById(id) {
    return (D.WEATHERS || []).find(w => w.id === id) || (D.WEATHERS || [])[0] || { id: 'calm', name: '平潮', icon: '🌤', weight: 1, desc: '' };
  }
  function pickWeather(rng) {
    const list = D.WEATHERS || [];
    const total = list.reduce((a, w) => a + (w.weight || 0), 0);
    let x = rng() * total;
    for (const w of list) {
      x -= (w.weight || 0);
      if (x < 0) return w.id;
    }
    return list[0] ? list[0].id : 'calm';
  }
  function weatherInfo(st) {
    const w = weatherById(st.weather);
    return Object.assign({
      startTide: 0, startTime: 0, startCrew: 0,
      tideScale: 1, rewardScale: 1, fatigueExtra: 0,
      candidateBonus: 0, shopClosed: false, shopDiscount: 0, sellBonus: 0, evidenceStart: 0,
    }, w);
  }
  function nextWeatherInfo(st) {
    return weatherById(st.nextWeather);
  }
  function patchClosed(st) {
    // 教学补给周保证开店，避免天气随机数把首次道具教学关掉。
    if (st && st.season === 1 && st.week >= 4 && st.week <= 8) return false;
    return !!weatherInfo(st).shopClosed;
  }

  /* ---------------- 四店等级 / 容量 ---------------- */
  function storeLevel(st, id) {
    return (st.upgrades && st.upgrades[id]) || 0;
  }
  function upgradeEffects(st, id) {
    const levels = (D.STORE_UPGRADES || {})[id] || [];
    return levels.slice(0, storeLevel(st, id));
  }
  function upgradeSum(st, id, key) {
    return upgradeEffects(st, id).reduce((a, e) => a + (e[key] || 0), 0);
  }
  function boardCapOf(st) { return C.boardCap + upgradeSum(st, 'agency', 'boardCap'); }
  function rosterCapOf(st) { return C.rosterCap + upgradeSum(st, 'tavern', 'rosterCap') + (st.season === 1 && st.week === 8 ? 2 : 0); }
  function shopPerWeekOf(st) { return C.shopPerWeek + upgradeSum(st, 'patch', 'shopPerWeek'); }
  function slotsPerWeekOf(st) {
    const seasonOneTutorialSlots = st.season === 1 && st.week <= 2 ? st.week : (st.season === 1 && st.week === 8 ? 4 : C.slotsPerWeek);
    return seasonOneTutorialSlots + upgradeSum(st, 'boat', 'slotsPerWeek');
  }
  function itemsPerRunOf(st) { return C.itemsPerRun + upgradeSum(st, 'boat', 'itemsPerRun'); }
  function runCostOf(st) {
  return Math.max(1, Math.round((C.runCost + upgradeSum(st, 'boat', 'runCost')) * seasonDiffInfo(st).costScale));
}
  function restCostOf(st) {
  return Math.max(1, Math.round(C.restCost * seasonDiffInfo(st).costScale));
}
function trainingCostOf(st) {
  return Math.max(1, Math.round(C.trainingCost * seasonDiffInfo(st).costScale));
}
function taskGoldBonusOf(st) { return upgradeSum(st, 'agency', 'taskGoldBonus'); }
  function recruitDiscountOf(st) { return upgradeSum(st, 'tavern', 'recruitDiscount'); }
  function candidatePrice(st, cand) {
    return Math.max(1, Math.round(cand.price * (1 - recruitDiscountOf(st)) * seasonDiffInfo(st).costScale));
  }
  function shopDiscountOf(st) {
    return Math.min(0.6, (weatherInfo(st).shopDiscount || 0) + upgradeSum(st, 'patch', 'shopDiscount'));
  }
  function sellBonusOf(st) {
    return (weatherInfo(st).sellBonus || 0) + upgradeSum(st, 'patch', 'sellBonus');
  }
  function restRecoverOf(st) {
    return C.restRecover + upgradeSum(st, 'tavern', 'restRecover');
  }
  function retreatCreditOf(st) {
    return C.retreatCreditPenalty + upgradeSum(st, 'agency', 'retreatCredit');
  }
  function breachCreditOf(st) {
    return C.breachCredit + upgradeSum(st, 'agency', 'breachCredit');
  }

  /* ---------------- 店铺升级考核 ---------------- */
  function examCurrent(st, key) {
    if (key === 'credit') return st.credit;
    if (key === 'roster') return st.travelers.length;
    if (key === 'avgFatigue') {
      if (!st.travelers.length) return 0;
      return Math.round(st.travelers.reduce((a, t) => a + t.fatigue, 0) / st.travelers.length);
    }
    if (key === 'trouble') return (st.stats.failures || 0) + (st.stats.retreats || 0);
    return (st.stats && st.stats[key]) || 0;
  }
  function examProgress(st, exam) {
    const reqs = exam.reqs.map(r => {
      const cur = examCurrent(st, r.key);
      const done = r.max ? cur <= r.target : cur >= r.target;
      return Object.assign({}, r, { cur, done });
    });
    return { exam, reqs, done: reqs.every(r => r.done) };
  }
  function storeExamInfo(st, storeId) {
    const list = (D.STORE_EXAMS && D.STORE_EXAMS[storeId]) || [];
    const exam = list.find(e => e.level === storeLevel(st, storeId) + 1);
    if (!exam) return null;
    return Object.assign({ store: storeId, level: exam.level }, examProgress(st, exam));
  }
  function completedExams(st) {
    return Object.keys(D.STORE_EXAMS || {}).map(id => {
      const info = storeExamInfo(st, id);
      return info && info.done ? info : null;
    }).filter(Boolean);
  }

  /* ---------------- 积分赛 / 信用榜 ---------------- */
  function leaderboardOf(st) {
    const rows = [{ id: 'you', name: '出勤局', icon: '🏠', credit: st.credit, you: true }]
      .concat((st.rivals || []).map(r => Object.assign({}, r)));
    rows.sort((a, b) => b.credit - a.credit);
    return rows.map((r, i) => Object.assign({}, r, { rank: i + 1 }));
  }
  function rankOf(st) {
    const board = leaderboardOf(st);
    return (board.find(r => r.you) || { rank: board.length }).rank;
  }
  function rankRewardOf(st) {
    const rank = rankOf(st);
    return (D.RANK_REWARDS || []).find(r => r.rank === rank) || { gold: 0, rep: 0, upgrade: 0, title: '' };
  }
  function offseasonUpgradeMaxOf(st) {
    return C.offseasonUpgradeMax + (rankRewardOf(st).upgrade || 0);
  }
  function isCleared(st) {
    const stores = ['agency', 'tavern', 'patch', 'boat'];
    const allMax = stores.every(id => storeLevel(st, id) >= C.storeMaxLevel);
    return allMax && ((profileOf(st).career && profileOf(st).career.championCount) || 0) >= 1;
  }
  function endingInfo(st) {
    const career = profileOf(st).career || defaultCareer();
    return {
      seasons: career.seasonsPlayed,
      championCount: career.championCount || 0,
      bestRank: career.bestRank === 99 ? null : career.bestRank,
      runs: career.runs,
      goldEarned: career.goldEarned,
      creditEarned: career.creditEarned,
      upgrades: ['agency', 'tavern', 'patch', 'boat'].map(id => ({ id, level: storeLevel(st, id) })),
    };
  }

  /* ---------------- 休赛期：升级 / 训练 ---------------- */
  function upgradeStore(st, storeId) {
    if (!st.ended) return { ok: false, reason: '只有季末休赛期才能升级。' };
    if (!(D.STORE_EXAMS || {})[storeId]) return { ok: false, reason: '没有这家店。' };
    st.upgrades = st.upgrades || { agency: 0, tavern: 0, patch: 0, boat: 0 };
    const lv = storeLevel(st, storeId);
    if (lv >= C.storeMaxLevel) return { ok: false, reason: '这家店已经满级。' };
    if ((st.offseasonUpgrades || 0) >= offseasonUpgradeMaxOf(st)) return { ok: false, reason: `本休赛期最多升 ${offseasonUpgradeMaxOf(st)} 级。` };
    const info = storeExamInfo(st, storeId);
    if (!info || !info.done) return { ok: false, reason: '考核还没达标。' };
    st.upgrades[storeId] = lv + 1;
    st.offseasonUpgrades = (st.offseasonUpgrades || 0) + 1;
    st.cleared = isCleared(st);
    const name = (D.CAMPAIGN.stores.find(s => s.id === storeId) || {}).name || storeId;
    pushLog(st, `休赛期：${name}升到 Lv${lv + 1}（考核通过）`);
    return { ok: true, level: lv + 1, name, cleared: !!st.cleared };
  }
  function trainTraveler(st, travelerId) {
    if (!st.ended) return { ok: false, reason: '只有季末休赛期才能训练。' };
    if ((st.offseasonTraining || 0) >= C.trainingMax) return { ok: false, reason: `本休赛期最多训练 ${C.trainingMax} 次。` };
    const cost = trainingCostOf(st);
    if (st.gold < cost) return { ok: false, reason: `金币不够（要 ${cost}）。` };
    const t = st.travelers.find(x => x.id === travelerId);
    if (!t) return { ok: false, reason: '没有这个人。' };
    st.gold -= cost;
    t.growth += C.trainingGrowth;
    st.offseasonTraining = (st.offseasonTraining || 0) + 1;
    pushLog(st, `休赛期训练「${t.name}」：成长 +${C.trainingGrowth}（−${cost} 金）`);
    return { ok: true, name: t.name, growth: C.trainingGrowth, cost };
  }

  function offseasonGrowth(st, travelerId) {
    if (!st.ended) return { ok: false, reason: '只有季末休赛期才能成长。' };
    const t = st.travelers.find(x => x.id === travelerId);
    if (!t) return { ok: false, reason: '没有这个人。' };
    if (t.traits.length >= 4) return { ok: false, reason: '词条已满（4 个）。' };
    const cost = growthCostFor(t);
    if (t.growth < cost) return { ok: false, reason: `成长点不够（${t.growth}/${cost}）。` };
    const pool = missingTraits(t);
    if (!pool.length) return { ok: false, reason: '没有可加的词条了。' };
    const trait = JSON.parse(JSON.stringify(pool[randi(st.rng, pool.length)]));
    t.growth -= cost;
    t.traits.push(trait);
    t.wage = wageOf(t, st);
    st.offseasonGrowth = (st.offseasonGrowth || 0) + 1;
    st.stats.growths++;
    pushLog(st, `休赛期成长「${t.name}」：习得「${trait.name}」（成长点 −${cost}）`);
    return { ok: true, name: t.name, trait, cost };
  }

  /* 难度递增：每季标准分 +3%、报酬 +5% */

  /* 难度递增：每季标准分 +3%、报酬 +5% */
  function seasonDiffInfo(st) {
    const n = Math.max(0, (st.season || 1) - 1);
    return {
      standardScale: Math.round((1 + C.difficultyPerSeason * n) * 100) / 100,
      rewardScale: Math.round((1 + C.rewardPerSeason * n) * 100) / 100,
      costScale: Math.round((1 + (C.costPerSeason || 0) * n) * 100) / 100,
      rivalWeekly: n * 2,
      coreChance: (st.season || 1) >= 2 && (st.week || 1) >= 2 ? 12 : 0,
    };
  }

  /* ---------------- 新建一季 ---------------- */
  function newSeason(opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const firstSeason = (opts.season || 1) === 1;
    const withStarterTeam = firstSeason || !!opts.starterTeam;
    const starterRecruitIds = ['r_aman', 'r_xiaosuan', 'r_asi', 'r_ahuo', 'r_atu'];
    const st = {
      season: opts.season || 1,
      week: 1,
      gold: C.startGold,
      credit: C.startCredit,
      reputation: C.startReputation,
      profile: defaultProfile(), // 跨季持久层：生涯与委派档位
      slotsLeft: 0, // 按本周的渐进开放规则初始化
      slotProgressionVersion: 1,
      travelers: withStarterTeam
        ? starterRecruitIds.map(id => D.RECRUITS.find(t => t.id === id)).filter(Boolean).map(t => ({
            id: `${t.id}_starter`, templateId: t.id, name: t.name, role: t.role, quote: t.quote,
            wage: 0, raises: 0, fatigue: 0, lastPlayed: 0, growth: 0,
            traits: JSON.parse(JSON.stringify(t.traits)),
          }))
        : [],                 // 后续赛季的队伍由 nextSeason 继承
      tasks: [],            // 自选任务栏
      delegations: [],      // 委派板
      candidates: [],       // 旅人潮候选人
      fixedShown: withStarterTeam ? starterRecruitIds.slice() : [], // 已登场固定角色不重复出现
      pendingRaises: [],    // 待处理的涨薪请求
      pendingTransfers: [], // 待处理的转会（想走）的人
      shop: [],             // 补丁铺本周货架
      inventory: Object.assign({}, C.inventoryStart), // 道具背包
      delegationRatings: [],// 本季完成的委派：{tier, rating}
      restedThisWeek: false,
      weekLog: [],
      history: [],
      stats: defaultStats(),
      fatigueTutorialVersion: 1,
      // 跨季：天气 / 生涯统计 / 四店升级
      weather: pickWeather(rng),
      nextWeather: pickWeather(rng),
      upgrades: { agency: 0, tavern: 0, patch: 0, boat: 0 },
      offseasonUpgrades: 0,
      offseasonTraining: 0,
      offseasonGrowth: 0,
      // 其他战队：积分赛 / 信用榜
      rivals: (D.RIVALS || []).map((r, i) => Object.assign({}, r, {
        credit: 20 + (opts.season || 1) * 8 + randi(rng, 0, 15) + i,
      })),
      nextUid: 1,
      rng,
      ended: false,
    };
    if (firstSeason) {
      // 开局背包清空，第四周从基础货架购买，避免道具教学被预置库存跳过。
      st.inventory = {};
      // 天气第 7 周才教，前六周固定平潮，避免隐藏修正。
      st.weather = 'calm';
      st.nextWeather = 'calm';
    }
    st.slotsLeft = slotsPerWeekOf(st);
    // 第一季第一周用固定的紧急堵口单做入口；其他赛季保留完整开局任务板。
    if (firstSeason) {
      const firstTask = makeSelfTask(st, 'urgent');
      firstTask.evidence = 0;
      firstTask.risk = null;
      st.tasks.push(firstTask);
    }
    else for (let i = 0; i < boardCapOf(st); i++) pushSelfTask(st);
    if (!firstSeason) addDelegation(st);
    restockShop(st);
    generateCandidates(st, true);
    for (const t of st.travelers) t.wage = wageOf(t, st);
    return st;
  }

  /* ---------------- 日志 ---------------- */
  function pushLog(st, text) {
    st.weekLog.push(text);
    st.history.push({ week: st.week, text });
    if (st.history.length > 300) st.history.shift();
  }

  function migrateIntroFatigue(st) {
    if (!st || st.fatigueTutorialVersion === 1) return false;
    if (st.season === 1) {
      const earlyRuns = (st.history || []).filter(h => h.week <= 2 && /^出勤【/.test(h.text || '')).length;
      const completedEarlyWeeks = Math.max(0, Math.min((st.week || 1) - 1, 2));
      const hiddenFatigue = Math.max(0, earlyRuns * C.fatiguePerRun - completedEarlyWeeks * C.weeklyFatigueRecover);
      const starterIds = new Set(['r_aman', 'r_xiaosuan', 'r_asi', 'r_ahuo', 'r_atu']);
      for (const t of (st.travelers || [])) {
        const templateId = t.templateId || String(t.id || '').replace(/_starter$/, '');
        if (starterIds.has(templateId)) t.fatigue = Math.max(0, (t.fatigue || 0) - hiddenFatigue);
      }
    }
    st.fatigueTutorialVersion = 1;
    return true;
  }

  /* ---------------- 任务生成 ---------------- */
  function makeSelfTask(st, typeId) {
    const base = D.TASKS[typeId];
    const runs = base.runs || 1;
    const diff = seasonDiffInfo(st);
    return {
      uid: 't' + (st.nextUid++),
      kind: 'self',
      type: typeId,
      name: base.name,
      desc: base.desc,
      tagline: `${base.weeks} 周 × ${runs} 次`,
      weeks: base.weeks,
      expiresIn: base.weeks,
      runsTotal: runs,
      runsLeft: runs,
      gold: Math.max(1, Math.round(base.gold / runs * diff.rewardScale * (1 + taskGoldBonusOf(st)))),
      credit: Math.round(base.credit / runs * diff.rewardScale),
      evidence: base.evidence,
      standard: Math.round(base.standard * diff.standardScale),
      weights: base.weights,
      weightLabel: base.weightLabel,
      randomWeights: !!base.randomWeights,
      deck: base.deck,
      risk: pickOne(st.rng, D.TASK_RISKS || []),
      color: base.color || '#8a7b5a',
    };
  }

  function makeDelegation(st, tier) {
    const t = C.delegationTiers.find(x => x.tier === tier) || C.delegationTiers[0];
    const diff = seasonDiffInfo(st);
    return {
      uid: 'd' + (st.nextUid++),
      kind: 'delegation',
      tier: t.tier,
      name: t.name,
      desc: t.desc,
      tagline: `${C.delegationWeeks} 周 × 1 次`,
      weeks: C.delegationWeeks,
      expiresIn: C.delegationWeeks,
      runsTotal: 1,
      runsLeft: 1,
      gold: Math.round(t.gold * diff.rewardScale),
      credit: Math.round(t.credit * diff.rewardScale),
      evidence: t.evidence,
      standard: Math.round(t.standard * diff.standardScale),
      weights: C.delegationWeights,
      weightLabel: '综合治潮（时效 15 · 治潮 30 · 损伤 25 · 救援 25）',
      randomWeights: false,
      deck: C.delegationDeck,
      risk: pickOne(st.rng, D.TASK_RISKS || []),
      color: '#6b4a8f',
    };
  }

  function pushSelfTask(st) {
    // 高危核心：第 2 季起才有概率刷新；同一时间只挂 1 张
    const types = Object.keys(D.TASKS).filter(t => t !== 'core');
    let typeId = types[randi(st.rng, types.length)];
    const hasCore = st.tasks.some(t => t.type === 'core');
    const coreRoll = (st.nextUid * 37 + st.week * 11 + (st.season || 1) * 23) % 100;
    if (!hasCore && (st.season || 1) >= 2 && (st.week || 1) >= 2 && coreRoll < 12) typeId = 'core';
    const task = makeSelfTask(st, typeId);
    // 其他战队已接：显示在任务栏，但玩家接不了
    const takeRoll = (st.nextUid * 37 + st.week * 13) % 100;
    if (typeId !== 'core' && st.rivals && st.rivals.length && takeRoll < 25) {
      const r = st.rivals[(st.nextUid + st.week) % st.rivals.length];
      task.takenBy = { id: r.id, name: r.name, icon: r.icon };
    }
    st.tasks.push(task);
  }

  function makeBasicContract(st, offer) {
    const task = makeSelfTask(st, offer.type);
    task.credit = 0;
    task.weeks = offer.weeks;
    task.expiresIn = offer.weeks;
    task.tagline = `${offer.weeks} 周内完成 · ${task.runsTotal} 次出勤`;
    task.desc = offer.desc;
    task.evidence = 0;
    task.risk = null;
    // 自由散单保留随机权重；其他基础单使用各自固定权重。
    task.accepted = false;
    task.basicContract = true;
    delete task.takenBy;
    return task;
  }

  function contractOffersFor(week) {
    if (week === 2) return [
      { type: 'freelance', weeks: 1, desc: '街坊凑钱请人跑一趟，图个吉利。本周结束前办完，报酬只结金币。' },
      { type: 'patrol', weeks: 2, desc: '沿大壶街外环巡一圈，摸摸乱流的脾气。两周内办完，报酬稳定。' },
      { type: 'rescue', weeks: 3, desc: '东街塌了半排房，街坊请人尽快去看看。三周内办完，报酬较高。' },
    ];
    if (week === 3) return [
      { type: 'freelance', weeks: 2, desc: '街坊凑钱请人跑一趟，报酬只结金币。两周内办完。' },
      { type: 'patrol', weeks: 2, desc: '沿大壶街外环巡一圈，摸摸乱流的脾气。两周内办完，报酬稳定。' },
      { type: 'rescue', weeks: 3, desc: '东街塌了半排房，街坊请人尽快去看看。三周内办完，报酬较高。' },
    ];
    const offers = [
      { type: 'freelance', weeks: 2, desc: '替街坊送一封急信。两周内完成，报酬只结金币。' },
      { type: 'patrol', weeks: 2, desc: '巡查外环的潮痕。期限内完成，报酬稳定。' },
      { type: 'rescue', weeks: 3, desc: '去东街看看受困的住户。三周内完成，报酬较高。' },
    ];
    if (week === 8) offers.push({ type: 'freelance', weeks: 2, desc: '最后一周年轻人凑的热闹单，报酬只结金币。' });
    return offers;
  }

  function ensureRivalSteal(st) {
    if (!st || st.season !== 1 || st.week < 7) return false;
    if ((st.tasks || []).some(t => t.takenBy)) return false;
    const pool = (st.tasks || []).filter(t => t.basicContract && !t.accepted && !t.takenBy);
    if (!pool.length || !(st.rivals || []).length) return false;
    const task = pickOne(st.rng, pool);
    const rival = pickOne(st.rng, st.rivals);
    task.takenBy = { id: rival.id, name: rival.name, icon: rival.icon };
    pushLog(st, '「' + task.name + '」被' + rival.name + '接走了');
    return true;
  }

  function ensureSeasonTwoCore(st) {
    if (!st || st.season !== 2 || st.week !== 2 || st.tasks.some(t => t.type === 'core')) return false;
    const task = makeSelfTask(st, 'core');
    const idx = st.tasks.findIndex(t => t.kind === 'self' && !t.accepted && !t.takenBy);
    if (idx >= 0) st.tasks[idx] = task; else st.tasks.push(task);
    pushLog(st, '第二季第二周：高危核心进入任务池');
    return true;
  }

  function initializeContractWeek(st, week) {
    if (!st || st.season !== 1 || st.week !== week || week < 2 || week > 8) return false;
    if (week >= 6) {
      for (const t of (st.tasks || [])) if (!t.risk) t.risk = pickOne(st.rng, D.TASK_RISKS || []);
    }
    if (st[`week${week}BoardVersion`] === 1) return false;
    // 同一套周任务池：保留未过期的委托，按本周模板补到本周上限。
    const target = week === 8 ? 4 : 3;
    if (week === 2) st.tasks = [];
    else st.tasks = (st.tasks || []).filter(t => t.basicContract && t.expiresIn > 0);
    for (const offer of contractOffersFor(week)) {
      if (st.tasks.length >= target) break;
      st.tasks.push(makeBasicContract(st, offer));
    }
    if (week >= 6) {
      for (const t of st.tasks) if (!t.risk) t.risk = pickOne(st.rng, D.TASK_RISKS || []);
    }
    if (week >= 7) ensureRivalSteal(st);
    st[`week${week}BoardVersion`] = 1;
    return true;
  }

  function initializeWeekTwoTasks(st) { return initializeContractWeek(st, 2); }
  function initializeWeekThreeTasks(st) { return initializeContractWeek(st, 3); }
  function initializeIntroContractWeek(st, week) { return initializeContractWeek(st, week); }
  function ensureWeekSixDelegation(st) {
    if (!st || st.season !== 1 || st.week !== 6) return false;
    if (st.weekSixDelegationSeeded === 1) return false;
    if (!st.delegations.length) addDelegation(st);
    st.weekSixDelegationSeeded = 1;
    return true;
  }

  function addDelegation(st) {
    if (st.delegations.length >= C.delegationMax) return null;
    const d = makeDelegation(st, profileOf(st).unlockedTier);
    st.delegations.push(d);
    return d;
  }

  function fillBoard(st) {
    // 溢出保护：任务栏已满（或超过上限）就不再补；未来旅行社升级把上限提到 8/10 时同样适用
    if (st.tasks.length >= boardCapOf(st)) return;
    let added = 0;
    while (st.tasks.length < boardCapOf(st) && added < C.boardPerWeek) {
      pushSelfTask(st);
      added++;
    }
  }

  /* ---------------- 补丁铺：道具商店 / 背包 ---------------- */
  function itemBuyPrice(st, id) {
    return Math.max(1, Math.round(D.ITEMS[id].price * (1 - shopDiscountOf(st)) * seasonDiffInfo(st).costScale));
  }
  function itemSellPrice(st, id) {
    return Math.max(1, Math.round(D.ITEMS[id].price * C.sellRate * (1 + sellBonusOf(st)) * seasonDiffInfo(st).costScale));
  }
  function inventoryCount(st) {
    return Object.values(st.inventory).reduce((a, b) => a + b, 0);
  }
  function pickWeighted(rng, weights) {
    const keys = Object.keys(weights);
    const total = keys.reduce((a, k) => a + weights[k], 0);
    let x = rng() * total;
    for (const k of keys) {
      x -= weights[k];
      if (x < 0) return k;
    }
    return keys[keys.length - 1];
  }
  function restockShop(st) {
    if (st.season === 1 && st.week >= 4 && st.week <= 8) {
      st.shop = (C.tutorialItems || ['medkit', 'talisman', 'tide_bomb'])
        .filter(id => D.ITEMS[id])
        .map(id => ({ id, sold: false }));
      st.tutorialShopVersion = 1;
      return;
    }
    // 补丁铺等级：货架偏向更高级的道具
    const lv = Math.min(2, storeLevel(st, 'patch'));
    const row = (D.ITEM_TIER_WEIGHTS || []).find(r => r.min === lv) || { w: { 普通: 1 } };
    const pool = (D.SHOP_ITEMS || Object.keys(D.ITEMS)).slice();
    const slots = Math.min(shopPerWeekOf(st), pool.length);
    const out = [];
    while (out.length < slots && pool.length) {
      const tier = pickWeighted(st.rng, row.w);
      let cands = pool.filter(id => (D.ITEMS[id].tier || '普通') === tier);
      if (!cands.length) cands = pool;
      const id = cands[randi(st.rng, cands.length)];
      out.push({ id, sold: false });
      pool.splice(pool.indexOf(id), 1);
    }
    st.shop = out;
  }
  function buyItem(st, index) {
    if (patchClosed(st)) return { ok: false, reason: '采风日，补丁铺关门。' };
    const entry = st.shop[index];
    if (!entry || entry.sold) return { ok: false, reason: '这张已经卖掉了。' };
    if (st.season === 1 && st.week >= 4 && st.week <= 8
      && !(C.tutorialItems || []).includes(entry.id)) return { ok: false, reason: '当前教学周只开放基础补给。' };
    const price = itemBuyPrice(st, entry.id);
    if (st.gold < price) return { ok: false, reason: '金币不够。' };
    if (inventoryCount(st) >= C.backpackSlots) return { ok: false, reason: `背包满了（${C.backpackSlots} 格）。` };
    st.gold -= price;
    st.inventory[entry.id] = (st.inventory[entry.id] || 0) + 1;
    entry.sold = true;
    st.stats.itemsBought++;
    pushLog(st, `补丁铺买了「${D.ITEMS[entry.id].name}」：−${price} 金`);
    return { ok: true, price, name: D.ITEMS[entry.id].name };
  }
  function sellItem(st, id) {
    if (patchClosed(st)) return { ok: false, reason: '采风日，补丁铺关门。' };
    if (!st.inventory[id]) return { ok: false, reason: '背包里没有这张。' };
    const price = itemSellPrice(st, id);
    st.inventory[id]--;
    if (!st.inventory[id]) delete st.inventory[id];
    st.gold += price;
    st.stats.itemsSold++;
    pushLog(st, `回收「${D.ITEMS[id].name}」：+${price} 金`);
    return { ok: true, price, name: D.ITEMS[id].name };
  }

  /* ---------------- 酒馆：旅人潮（固定角色 + 随机生成） ---------------- */
  function randInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function pickOne(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  function randomName(rng, used) {
    const N = D.NAME_POOL;
    for (let i = 0; i < 60; i++) {
      const x = rng();
      const pool = x < 0.4 ? N.local : x < 0.7 ? N.foreign : N.codename;
      const name = pickOne(rng, pool);
      if (!used.has(name)) return name;
    }
    return '阿' + Math.floor(rng() * 1000);
  }

  function pickTier(st) {
    let row = D.RECRUIT_GEN.tierByRep[0];
    for (const r of D.RECRUIT_GEN.tierByRep) if (st.reputation >= r.min) row = r;
    // 酒馆等级：概率向熟练 / 尖子倾斜
    const lv = Math.min(2, storeLevel(st, 'tavern'));
    const luck = (D.RECRUIT_GEN.tierLuckByLevel || [])[lv] || { pro: 0, elite: 0 };
    const w = {
      rookie: Math.max(0.02, (row.w.rookie || 0) - luck.pro - luck.elite),
      pro: (row.w.pro || 0) + luck.pro,
      elite: (row.w.elite || 0) + luck.elite,
    };
    const total = w.rookie + w.pro + w.elite;
    let x = st.rng() * total;
    for (const k of ['rookie', 'pro', 'elite']) {
      x -= w[k];
      if (x < 0) return k;
    }
    return 'rookie';
  }

  function makeFixedCandidate(st, tpl) {
    st.fixedShown.push(tpl.id);
    return {
      uid: 'c' + (st.nextUid++),
      templateId: tpl.id,
      name: tpl.name, role: tpl.role, quote: tpl.quote, tier: tpl.tier,
      traits: JSON.parse(JSON.stringify(tpl.traits)),
      price: tpl.price || 0,
      repReq: tpl.repReq || 0,
      expiresIn: tpl.tier === 'legend' ? 4 : tpl.tier === 'elite' ? 3 : C.recruitWeeks,
    };
  }

  /* 专属词条：只属于固定角色，随机旅人永远抽不到 */
  let _exclusiveNames = null;
  function exclusiveTraitNames() {
    if (_exclusiveNames) return _exclusiveNames;
    const set = new Set(D.EXCLUSIVE_TRAITS || []);
    for (const t of (D.TRAVELERS || []).concat(D.RECRUITS || [])) {
      for (const tr of (t.traits || [])) if (tr.exclusive) set.add(tr.name);
    }
    _exclusiveNames = set;
    return set;
  }

  function makeRandomRecruit(st, tier, usedNames) {
    const G = D.RECRUIT_GEN;
    const role = pickOne(st.rng, ['斥候', '搬运', '医士', '镇潮手']);
    const excl = exclusiveTraitNames();
    const pool = shuffle((D.TRAIT_POOL[role] || []).filter(t => !excl.has(t.name)), st.rng);
    const count = tier === 'rookie' ? 1 : tier === 'pro' ? 2 : 3;
    const picked = [];
    let actives = 0;
    for (const t of pool) {
      if (picked.length >= count) break;
      if (t.active) {
        if (actives >= 2) continue; // 最多 2 个主动技
        actives++;
      }
      picked.push(t);
    }
    // 熟练/尖子至少带 1 个被动
    if (tier !== 'rookie' && !picked.some(t => t.passive)) {
      const passive = pool.find(t => t.passive && !picked.includes(t));
      if (passive) picked[picked.length - 1] = passive;
    }
    // 口碑门槛别离当前太远（否则 2 周内根本够不着）
    let repReq = randInt(st.rng, G.rep[tier][0], G.rep[tier][1]);
    if (tier === 'elite') repReq = Math.min(repReq, st.reputation + 10);
    else if (tier === 'pro') repReq = Math.min(repReq, st.reputation + 6);
    return {
      uid: 'c' + (st.nextUid++),
      templateId: 'g' + (st.nextUid++),
      name: randomName(st.rng, usedNames),
      role,
      quote: pickOne(st.rng, D.QUOTE_POOL[role] || ['……']),
      tier,
      traits: JSON.parse(JSON.stringify(picked)),
      price: randInt(st.rng, G.price[tier][0], G.price[tier][1]),
      repReq,
      expiresIn: tier === 'elite' ? 4 : tier === 'pro' ? 3 : C.recruitWeeks,
    };
  }

  function generateCandidates(st, opening) {
    const bonus = weatherInfo(st).candidateBonus || 0;
    const cap = (opening ? D.RECRUIT_GEN.startCandidates : C.recruitMax) + bonus;
    let room = cap - st.candidates.length;
    if (room <= 0) return;
    const usedNames = new Set(st.candidates.map(c => c.name).concat(st.travelers.map(t => t.name)));
    const add = (c) => { if (c) { st.candidates.push(c); usedNames.add(c.name); } };

    if (opening) {
      // 开局：优先展示未入队的固定新人，不足 6 位时用随机新人补满。
      const fixedRookies = D.RECRUITS.filter(r => r.tier === 'rookie' && !st.fixedShown.includes(r.id)).slice(0, 4);
      for (const tpl of fixedRookies) {
        if (room-- <= 0) break;
        add(makeFixedCandidate(st, tpl));
      }
      while (room > 0) { add(makeRandomRecruit(st, 'rookie', usedNames)); room--; }
      return;
    }

    // 每周：1 个固定角色 + 1—2 个随机
    // 固定角色不再按数组顺序排队：从"口碑达标且本季没登场过"的人里随机抽；
    // 独一档（legend，柳如烟）口碑达标就优先出现，保证大后期一定能见到。
    const eligible = D.RECRUITS.filter(r => (r.repReq || 0) <= st.reputation
      && !st.fixedShown.includes(r.id)
      && !st.candidates.some(c => c.templateId === r.id));
    const legend = eligible.find(r => r.tier === 'legend');
    const fixed = legend || (eligible.length ? eligible[Math.floor(st.rng() * eligible.length)] : null);
    if (fixed) { add(makeFixedCandidate(st, fixed)); room--; }
    const n = randInt(st.rng, D.RECRUIT_GEN.weeklyMin, D.RECRUIT_GEN.weeklyMax);
    for (let i = 0; i < n && room > 0; i++) { add(makeRandomRecruit(st, pickTier(st), usedNames)); room--; }
    // 庆典 / 招工类天气：额外多来几位
    for (let i = 0; i < bonus && room > 0; i++) { add(makeRandomRecruit(st, 'rookie', usedNames)); room--; }
  }
  function ensureWeekThreeCandidates(st) {
    if (!st || st.season !== 1 || st.week !== 3 || st.weekThreeCandidateBoardVersion === 1) return false;
    const affordableRookies = () => st.candidates.filter(c => c.tier === 'rookie'
      && st.reputation >= (c.repReq || 0) && st.gold >= candidatePrice(st, c));
    const usedNames = new Set(st.candidates.map(c => c.name).concat(st.travelers.map(t => t.name)));
    let guard = 0;
    while (affordableRookies().length < 2 && guard++ < C.recruitMax * 2) {
      if (st.candidates.length >= C.recruitMax) {
        const removeAt = st.candidates.findIndex(c => c.tier !== 'rookie'
          || st.reputation < (c.repReq || 0) || st.gold < candidatePrice(st, c));
        if (removeAt < 0) break;
        st.candidates.splice(removeAt, 1);
      }
      const rookie = makeRandomRecruit(st, 'rookie', usedNames);
      rookie.repReq = Math.min(rookie.repReq || 0, st.reputation);
      const costScale = Math.max(0.01, seasonDiffInfo(st).costScale);
      rookie.price = Math.min(rookie.price, Math.max(1, Math.floor(st.gold / costScale)));
      rookie.expiresIn = Math.max(2, rookie.expiresIn);
      st.candidates.push(rookie);
      usedNames.add(rookie.name);
    }
    st.weekThreeCandidateBoardVersion = 1;
    return true;
  }

  function recruit(st, uid) {
    const cand = st.candidates.find(c => c.uid === uid);
    if (!cand) return { ok: false, reason: '这个人已经不在了。' };
    if (st.travelers.length >= rosterCapOf(st)) return { ok: false, reason: `队伍满员（${rosterCapOf(st)} 人），先解雇一个。` };
    const price = candidatePrice(st, cand);
    if (st.gold < price) return { ok: false, reason: '金币不够。' };
    if (st.reputation < cand.repReq) return { ok: false, reason: `口碑不够（要 ${cand.repReq}）。` };
    st.gold -= price;
    st.travelers.push({
      id: cand.templateId + '_' + (st.nextUid++),
      templateId: cand.templateId,
      name: cand.name, role: cand.role, quote: cand.quote,
      wage: wageOf({ traits: cand.traits, raises: 0 }, st),
      raises: 0,
      fatigue: 0, lastPlayed: st.week, growth: 0,
      traits: cand.traits,
    });
    st.candidates = st.candidates.filter(c => c.uid !== uid);
    st.stats.recruits++;
    pushLog(st, `招募「${cand.name}」：−${price} 金`);
    return { ok: true, name: cand.name };
  }
  function release(st, travelerId) {
    if (st.travelers.length <= 5) return { ok: false, reason: '至少要留 5 个人能上船。' };
    const t = st.travelers.find(x => x.id === travelerId);
    if (!t) return { ok: false, reason: '没有这个人。' };
    st.travelers = st.travelers.filter(x => x.id !== travelerId);
    st.reputation = Math.max(0, st.reputation - C.releaseReputation);
    pushLog(st, `解雇「${t.name}」：口碑 −${C.releaseReputation}`);
    return { ok: true, name: t.name };
  }

  /* ---------------- v0.4 养成：成长 / 洗练 / 身价 / 涨薪 / 转会 ---------------- */
  const shuffle = (arr, rng) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randi(rng, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // 周薪 = 3 + 词条数 × 2 + 累计涨薪（词条多的人要钱多）
  function wageOf(t, st) {
    const base = 3 + (t.traits ? t.traits.length : 0) * 2 + (t.raises || 0);
    return Math.round(base * (st ? seasonDiffInfo(st).costScale : 1));
  }

  function traitPoolOf(role) {
    const excl = exclusiveTraitNames();
    return ((D.TRAIT_POOL && D.TRAIT_POOL[role]) || []).filter(t => !excl.has(t.name));
  }

  function missingTraits(t) {
    const owned = new Set((t.traits || []).map(x => x.name));
    return traitPoolOf(t.role).filter(p => !owned.has(p.name));
  }

  // 加第 N 个词条要多少成长点：当前 1 词条→9，2→18，3→24
  function growthCostFor(t) {
    const table = C.growthTraitCosts || [0, 9, 18, 24];
    return table[t.traits.length] || 24;
  }

  // 成长：按当前词条数花成长点，加一个随机词条（上限 4）
  function growthTrait(st, travelerId) {
    if (patchClosed(st)) return { ok: false, reason: '采风日，补丁铺关门。' };
    const t = st.travelers.find(x => x.id === travelerId);
    if (!t) return { ok: false, reason: '没有这个人。' };
    if (t.traits.length >= 4) return { ok: false, reason: '词条已满（4 个）。' };
    const cost = growthCostFor(t);
    if (t.growth < cost) return { ok: false, reason: `成长点不够（${t.growth}/${cost}）。` };
    const pool = missingTraits(t);
    if (!pool.length) return { ok: false, reason: '没有可加的词条了。' };
    const trait = JSON.parse(JSON.stringify(pool[randi(st.rng, pool.length)]));
    t.growth -= cost;
    t.traits.push(trait);
    t.wage = wageOf(t, st);
    st.stats.growths++;
    pushLog(st, `「${t.name}」成长：习得「${trait.name}」`);
    return { ok: true, traveler: t, trait, cost };
  }

  // 洗练：给 3 个候选词条（30 金 + 10 成长点，换掉一个旧词条）
  function rerollOptions(st, travelerId) {
    const t = st.travelers.find(x => x.id === travelerId);
    if (!t) return { ok: false, reason: '没有这个人。' };
    const pool = missingTraits(t);
    if (!pool.length) return { ok: false, reason: '没有可换的词条了。' };
    const options = shuffle(pool, st.rng).slice(0, Math.min(3, pool.length));
    return { ok: true, traveler: t, options: JSON.parse(JSON.stringify(options)) };
  }

  function rerollApply(st, travelerId, oldIndex, newTraitName) {
    if (patchClosed(st)) return { ok: false, reason: '采风日，补丁铺关门。' };
    const t = st.travelers.find(x => x.id === travelerId);
    if (!t) return { ok: false, reason: '没有这个人。' };
    if (st.gold < C.rerollCost.gold) return { ok: false, reason: `金币不够（要 ${C.rerollCost.gold}）。` };
    if (t.growth < C.rerollCost.growth) return { ok: false, reason: `成长点不够（要 ${C.rerollCost.growth}）。` };
    if (!t.traits[oldIndex]) return { ok: false, reason: '要换的词条不存在。' };
    const cand = traitPoolOf(t.role).find(p => p.name === newTraitName);
    if (!cand) return { ok: false, reason: '没有这个词条。' };
    if (t.traits.some(x => x.name === cand.name)) return { ok: false, reason: '已经有这个词条了。' };
    const oldName = t.traits[oldIndex].name;
    st.gold -= C.rerollCost.gold;
    t.growth -= C.rerollCost.growth;
    t.traits[oldIndex] = JSON.parse(JSON.stringify(cand));
    t.wage = wageOf(t, st);
    pushLog(st, `「${t.name}」洗练：${oldName} → ${cand.name}（−${C.rerollCost.gold} 金）`);
    return { ok: true, traveler: t, oldName, newName: cand.name };
  }

  // 身价：成长点会折进转会价（老人、多词条的人更值钱）
  function transferValueOf(t) {
    const V = C.transferValue;
    return V.base + (t.traits.length * V.perTrait) + Math.floor(t.growth * V.perGrowth);
  }

  function sellTraveler(st, travelerId) {
    if (st.travelers.length <= 5) return { ok: false, reason: '至少要留 5 个人能上船。' };
    const t = st.travelers.find(x => x.id === travelerId);
    if (!t) return { ok: false, reason: '没有这个人。' };
    const price = transferValueOf(t);
    st.gold += price;
    st.travelers = st.travelers.filter(x => x.id !== travelerId);
    st.pendingRaises = (st.pendingRaises || []).filter(r => r.travelerId !== travelerId);
    st.pendingTransfers = (st.pendingTransfers || []).filter(r => r.travelerId !== travelerId);
    pushLog(st, `转会「${t.name}」：+${price} 金（${t.traits.length} 词条 / ${Math.floor(t.growth)} 成长点）`);
    return { ok: true, name: t.name, gold: price };
  }

  function resolveRaise(st, travelerId, accept) {
    const req = (st.pendingRaises || []).find(r => r.travelerId === travelerId);
    if (!req) return { ok: false, reason: '没有这条涨薪请求。' };
    const t = st.travelers.find(x => x.id === travelerId);
    if (!t) return { ok: false, reason: '这个人已经不在了。' };
    st.pendingRaises = st.pendingRaises.filter(r => r.travelerId !== travelerId);
    if (accept) {
      t.raises = (t.raises || 0) + req.amount;
      t.wage = wageOf(t, st);
      pushLog(st, `答应了「${t.name}」涨薪 +${req.amount} 金/周（现 ${t.wage}）`);
      return { ok: true, raised: req.amount, wage: t.wage };
    }
    t.wantsTransfer = true;
    pushLog(st, `拒绝了「${t.name}」的涨薪请求，他动了转会的心思。`);
    return { ok: true, declined: true };
  }

  function keepTraveler(st, travelerId) {
    const req = (st.pendingTransfers || []).find(r => r.travelerId === travelerId);
    if (!req) return { ok: false, reason: '没有这条转会预警。' };
    const t = st.travelers.find(x => x.id === travelerId);
    if (!t) return { ok: false, reason: '这个人已经不在了。' };
    if (st.gold < C.keepCost.gold) return { ok: false, reason: `挽留要 ${C.keepCost.gold} 金。` };
    if (st.reputation < C.keepCost.reputation) return { ok: false, reason: `口碑不够（要 ${C.keepCost.reputation}）。` };
    st.gold -= C.keepCost.gold;
    st.reputation -= C.keepCost.reputation;
    t.lastPlayed = st.week;
    t.wantsTransfer = false;
    st.pendingTransfers = st.pendingTransfers.filter(r => r.travelerId !== travelerId);
    pushLog(st, `挽留「${t.name}」：−${C.keepCost.gold} 金 −${C.keepCost.reputation} 口碑`);
    return { ok: true, name: t.name };
  }

  function letLeave(st, travelerId) {
    const req = (st.pendingTransfers || []).find(r => r.travelerId === travelerId);
    if (!req) return { ok: false, reason: '没有这条转会预警。' };
    if (st.travelers.length <= 5) return { ok: false, reason: '至少要留 5 个人能上船。' };
    const t = st.travelers.find(x => x.id === travelerId);
    if (!t) return { ok: false, reason: '这个人已经不在了。' };
    st.travelers = st.travelers.filter(x => x.id !== travelerId);
    st.reputation = Math.max(0, st.reputation - 2);
    st.pendingTransfers = st.pendingTransfers.filter(r => r.travelerId !== travelerId);
    st.pendingRaises = (st.pendingRaises || []).filter(r => r.travelerId !== travelerId);
    pushLog(st, `放走了「${t.name}」：口碑 −2`);
    return { ok: true, name: t.name };
  }

  /* ---------------- 旅行社：接单 ---------------- */
  function acceptTask(st, uid) {
    const task = st.tasks.find(t => t.uid === uid);
    if (!task) return { ok: false, reason: '任务栏里没有这张。' };
    if (task.takenBy) return { ok: false, reason: `这单已被「${task.takenBy.name}」接走。` };
    if (task.accepted) return { ok: false, reason: '已经接过了。' };
    if (st.slotsLeft <= 0) return { ok: false, reason: '本周出勤格用完了，先结束本周。' };
    task.accepted = true;
    st.stats.tasksAccepted = (st.stats.tasksAccepted || 0) + 1;
    pushLog(st, `接了任务：${task.name}`);
    return { ok: true, task };
  }

  /* ---------------- 任务权重提示（只给"主攻/次攻"，不给精确百分比） ---------------- */
  function weightHint(task) {
    const dims = D.TASK_DIMS;
    if (task.randomWeights) return '权重随机（看运气）';
    const ws = task.weights || [];
    const order = ws.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w);
    const top = order[0], second = order[1];
    if (!top) return '';
    const close = top.w - second.w <= 3;
    return close
      ? `较均衡：${dims[top.i]} / ${dims[second.i]} 稍重`
      : `主攻 ${dims[top.i]} · 次攻 ${dims[second.i]}`;
  }

  /* ---------------- 情报 ---------------- */
  function intelCost(st, level) {
    if (!level) return { gold: 0, reputation: 0 };
    return { gold: 15, reputation: level >= 2 ? 10 : 0 };
  }

  function intelCostLabel(st, level) {
    const c = intelCost(st, level);
    if (!c.gold && !c.reputation) return '不花钱';
    return (c.gold ? `${c.gold} 金` : '') + (c.reputation ? ` + ${c.reputation} 口碑` : '');
  }

  /* 情报为 0 档（街坊传话）时，选项数值被篡改的概率 */
  function sabotageChance(st) {
    return 0.2;
  }

  /* 付情报钱（出发前调用） */
  function payIntel(st, level) {
    const cost = intelCost(st, level);
    if (st.gold < cost.gold || st.reputation < cost.reputation) {
      return { ok: false, reason: '金币或口碑不够买这条情报。', cost };
    }
    st.gold -= cost.gold;
    st.reputation -= cost.reputation;
    if (level > 0) {
      pushLog(st, `买情报：−${cost.gold} 金${cost.reputation ? ` −${cost.reputation} 口碑` : ''}`);
    }
    return { ok: true, cost };
  }

  /* ---------------- 出勤前：生成这一趟的 cfg ---------------- */
  function buildRunCfg(st, baseCfg, task) {
    const selected = (baseCfg.travelers || [])
      .map(id => st.travelers.find(t => t.id === id))
      .filter(Boolean);
    const onboardingWeek = st.season === 1 && st.week <= 5;
    const fatigueLessonPaused = st.season === 1 && st.week <= 2;
    const avgFatigue = selected.length
      ? selected.reduce((s, t) => s + t.fatigue, 0) / selected.length
      : 0;
    const crewPenalty = fatigueLessonPaused ? 0 : Math.min(C.fatiguePenaltyMax, Math.round(avgFatigue * C.fatiguePenalty));
    // 把这一队人的真实词条（含招募来的、以后养成的）传给引擎
    const travelerDefs = selected.map(t => ({
      // 队员词条从第一周起生效；前两周只固定队伍，不把队员做成白板。
      id: t.id, name: t.name, role: t.role, traits: t.traits,
    }));
    const w = weatherInfo(st);
    return Object.assign({}, baseCfg, {
      intel: baseCfg.intel || 0,
      sabotageChance: onboardingWeek ? 0 : sabotageChance(st),
      crewPenalty,
      startMods: {
    tide: w.startTide + ((task && task.risk && task.risk.mods && task.risk.mods.tide) || 0),
    time: w.startTime + ((task && task.risk && task.risk.mods && task.risk.mods.time) || 0),
    crew: w.startCrew + ((task && task.risk && task.risk.mods && task.risk.mods.crew) || 0),
    load: (task && task.risk && task.risk.mods && task.risk.mods.load) || 0,
  },
      tideScale: w.tideScale,
      startEvidence: w.evidenceStart || 0,
      travelerDefs,
      noIntelCost: true,
    });
  }

  /* 占用一格出勤（在出发时调用） */
  function beginRun(st, task) {
    if (st.slotsLeft <= 0) return { ok: false, reason: '本周出勤格用完了，先结束本周。' };
    st.slotsLeft--;
    st.stats.runs++;
    pushLog(st, `安排出勤：${task.name}`);
    return { ok: true };
  }

  /* ---------------- 出勤后：把结果写回经理层 ---------------- */
  function resolveRun(st, task, result, cfg, usedItems, gainedItems) {
    const out = {
      gold: 0, credit: 0, reputation: 0, cost: runCostOf(st),
      rating: result.rating, status: result.status,
      progress: 'none', fatigue: C.fatiguePerRun + weatherInfo(st).fatigueExtra,
      consumed: [], gained: [], discarded: [],
      notes: [],
    };
    const failed = result.status === 'lost';
    const rejected = result.evidence && result.evidence.state === 'reject';

    // 考核统计
    if (failed) st.stats.failures++;
    if (result.status === 'retreated') st.stats.retreats++;
    if (!failed && (result.rating === 'S' || result.rating === 'A')) st.stats.aRuns++;
    if ((cfg.items || []).length >= 3) st.stats.runsWithItems++;
    st.stats.itemUses += (result.itemsUsed || 0);

    // 出勤的补给/损耗开销（失败也照花）
    st.gold -= runCostOf(st);

    // 用掉的道具从背包扣掉（没用的还能留着下次带）
    for (const id of (usedItems || [])) {
      if (!st.inventory[id]) continue;
      st.inventory[id]--;
      if (!st.inventory[id]) delete st.inventory[id];
      out.consumed.push(D.ITEMS[id].name);
    }

    // 局内捡到、这趟没用掉的道具 → 带回背包（背包满了就丢）
    for (const id of (gainedItems || [])) {
      if (failed) { out.discarded.push(D.ITEMS[id].name); continue; }
      if (inventoryCount(st) >= C.backpackSlots) { out.discarded.push(D.ITEMS[id].name); continue; }
      st.inventory[id] = (st.inventory[id] || 0) + 1;
      out.gained.push(D.ITEMS[id].name);
    }
    if (failed && out.discarded.length) {
      out.notes.push('出勤失败，捡到的东西没带回来。');
    } else if (out.discarded.length) {
      out.notes.push(`背包满了，${out.discarded.join('、')} 没带回来。`);
    } else if (out.gained.length) {
      out.notes.push(`捡到 ${out.gained.join('、')}，已放进背包。`);
    }

    // 第一、二周还没讲疲劳：只记录出场与成长，第三周起才开始累积疲劳。
    for (const id of (cfg.travelers || [])) {
      const t = st.travelers.find(x => x.id === id);
      if (!t) continue;
      if (!(st.season === 1 && st.week <= 2)) {
        t.fatigue = clamp(t.fatigue + C.fatiguePerRun + weatherInfo(st).fatigueExtra, 0, 100);
      }
      t.lastPlayed = st.week;
      t.wantsTransfer = false;
      if (st.pendingTransfers) st.pendingTransfers = st.pendingTransfers.filter(r => r.travelerId !== id);
      t.growth += 3;
      t.runCount = (t.runCount || 0) + 1;
    }

    // 生涯统计：每趟都记
    profileOf(st).career = profileOf(st).career || defaultCareer();
    profileOf(st).career.runs += 1;
    if (!failed && profileOf(st).career.ratings[result.rating] !== undefined) profileOf(st).career.ratings[result.rating] += 1;

    // 报酬：评级越高拿得越多；证据驳回只拿一半（引擎已折算），失败没有
    if (!failed) {
      const mult = C.goldMultByRating[result.rating] || 1;
      const tideReward = weatherInfo(st).rewardScale;
      out.gold = Math.max(0, Math.round((result.gold || 0) * (rejected ? 0.5 : mult) * tideReward));
      st.gold += out.gold;
      st.stats.goldEarned += out.gold;
      profileOf(st).career.goldEarned += out.gold;
      if (!rejected) {
        // 委派 F 不给信用；自选任务按单局评级给
        const passOk = task.kind !== 'delegation' || result.rating !== 'F';
        if (passOk && (result.credit || 0) > 0) {
          out.credit = Math.round(result.credit * tideReward);
          st.credit += out.credit;
          st.stats.creditEarned += out.credit;
          profileOf(st).career.creditEarned += out.credit;
        } else if (!passOk) {
          out.notes.push('委派评级 F：这趟不计信用。');
        }
      }
      out.reputation = Math.round(result.reputation || 0);
      st.reputation += out.reputation;
      // 口碑是"声望进度条"：完成一趟就涨，评级越高涨得越多（撤退/驳回不涨）
      if (!rejected && result.status !== 'retreated') {
        const repGain = C.repPerRun + (C.repByRating[result.rating] || 0) + (task.kind === 'delegation' ? C.repPerDelegation : 0);
        out.reputation += repGain;
        st.reputation += repGain;
        if (repGain) out.notes.push(`口碑 +${repGain}`);
      }
    }

    // 主动撤退：联盟不白认，额外扣信用和金币（「兴趣」可免罚）
    const retreated = result.status === 'retreated';
    if (retreated) {
      if (result.retreatFree) {
        out.notes.push('兴趣：主动撤退免罚。');
      } else {
        const rc = retreatCreditOf(st);
        out.retreatCredit = Math.min(rc, Math.max(0, st.credit || 0));
        out.retreatGold = C.retreatGoldPenalty;
        st.credit = Math.max(0, st.credit - out.retreatCredit);
        st.gold -= C.retreatGoldPenalty;
        out.notes.push(`主动撤退：信用 −${out.retreatCredit}、金币 −${C.retreatGoldPenalty}。`);
      }
    }

    // 任务推进
    if (failed) {
      out.progress = 'failed';
      out.notes.push('出勤失败：这趟没有推进任务，人带伤回来。');
    } else if (rejected) {
      out.progress = 'rejected';
      out.notes.push('证据被驳回：这趟不算出勤，任务没有推进。');
    } else {
      task.runsLeft -= 1;
      if (task.runsLeft <= 0) {
        out.progress = 'completed';
        if (task.kind === 'delegation') {
          st.delegationRatings.push({ tier: task.tier, rating: result.rating });
          st.stats.delegationsDone++;
          profileOf(st).career.delegationsDone++;
          if (result.rating === 'F') {
            out.notes.push('委派评级 F：没过，不解锁下一档（下张同档还能再考）。');
          } else {
            const next = Math.min(C.delegationTiers.length, task.tier + 1);
            if (task.tier === profileOf(st).unlockedTier && next > profileOf(st).unlockedTier) {
              profileOf(st).unlockedTier = next;
              out.notes.push(`委派通过（${result.rating}），解锁 ${next} 档委派。`);
            } else {
              out.notes.push(`委派通过（${result.rating}）。`);
            }
          }
          st.delegations = st.delegations.filter(d => d.uid !== task.uid);
        } else {
          st.stats.tasksDone++;
          profileOf(st).career.tasksDone++;
          st.tasks = st.tasks.filter(t => t.uid !== task.uid);
          out.notes.push('任务完成，从任务栏撤下。');
        }
      } else {
        out.progress = 'partial';
        out.notes.push(`任务推进：还剩 ${task.runsLeft} 次出勤。`);
      }
    }

    pushLog(st, `出勤【${task.name}】：${failed ? '失败' : (rejected ? '证据驳回' : (retreated ? '主动撤退' : `评级 ${result.rating}`))} · +${out.gold} 金 · +${out.credit} 信用${retreated ? ` · 撤退罚 −${out.retreatCredit || 0} 信用 −${out.retreatGold || 0} 金` : ''}`);
    return out;
  }

  /* ---------------- 酒馆休整 ---------------- */
  function rest(st) {
    if (st.restedThisWeek) return { ok: false, reason: '本周已经休整过了。' };
    if (st.gold < restCostOf(st)) return { ok: false, reason: '金币不够休整。' };
    const cost = restCostOf(st);
    st.gold -= cost;
    st.restedThisWeek = true;
    const recover = restRecoverOf(st);
    for (const t of st.travelers) t.fatigue = clamp(t.fatigue - recover, 0, 100);
    st.stats.rests++;
    pushLog(st, `酒馆休整：−${cost} 金，全队疲劳 −${recover}`);
    return { ok: true };
  }

  /* ---------------- 结束本周 ---------------- */
  function endWeek(st) {
    if (st.ended) return { ok: false, reason: '本季已经结束。' };
    const log = st.weekLog.slice();
    st.weekLog = [];

    // 1) 工资
    const wages = st.travelers.reduce((s, t) => s + t.wage, 0);
    st.gold -= wages;
    log.push(`发周薪：−${wages} 金（${st.travelers.length} 人）`);

    // 破产保护：账上亏空 → 信用受损、金币归零
    if (st.gold < 0) {
      st.gold = 0;
      st.credit = Math.max(0, st.credit - breachCreditOf(st));
      log.push(`账上亏空！信用 −${breachCreditOf(st)}，下季得省着点。`);
    }

    // 2) 疲劳自然恢复
    const recover = C.weeklyFatigueRecover;
    for (const t of st.travelers) t.fatigue = clamp(t.fatigue - recover, 0, 100);
    log.push(`全队恢复：疲劳 −${recover}`);

    // 4) 自选任务栏倒计时 / 过期
    const expiredTasks = [];
    for (const t of st.tasks) {
      t.expiresIn -= 1;
      if (t.expiresIn <= 0) expiredTasks.push(t);
    }
    st.tasks = st.tasks.filter(t => t.expiresIn > 0);
    for (const t of expiredTasks) {
      log.push(t.accepted ? `接单过期：${t.name}（白接一张）` : `任务过期：${t.name}`);
    }

    // 5) 委派倒计时 / 违约
    const breached = [];
    const delegationLessonPaused = st.season === 1 && st.week <= 5;
    for (const d of st.delegations) {
      if (!delegationLessonPaused) d.expiresIn -= 1;
      if (d.expiresIn <= 0) breached.push(d);
    }
    if (breached.length) {
      for (const d of breached) {
        st.credit = Math.max(0, st.credit - breachCreditOf(st));
        st.stats.breached++;
        log.push(`委派违约：${d.name}（信用 −${breachCreditOf(st)}）`);
      }
      st.delegations = st.delegations.filter(d => d.expiresIn > 0);
    }

    // 6) 进入下一周
    st.week += 1;
    st.slotsLeft = slotsPerWeekOf(st);
    st.restedThisWeek = false;

    // 其他战队每周涨积分（信用）
    for (const r of (st.rivals || [])) {
      r.credit += randInt(st.rng, 5, 12) + Math.max(0, (st.season || 1) - 1) * 2;
    }

    if (st.week > C.seasonWeeks) {
      st.ended = true;
      // 生涯：赛季收尾在这里结算一次
      profileOf(st).career = profileOf(st).career || defaultCareer();
      profileOf(st).career.seasonsPlayed += 1;
      profileOf(st).career.bestCredit = Math.max(profileOf(st).career.bestCredit, st.credit);
      const rank = rankOf(st);
      profileOf(st).career.bestRank = Math.min(profileOf(st).career.bestRank || 99, rank);
      if (rank === 1) profileOf(st).career.championCount = (profileOf(st).career.championCount || 0) + 1;
      st.cleared = isCleared(st);
      const sum = seasonSummary(st);
      return { ok: true, ended: true, log, summary: sum };
    }

    // 6.1) 天气：上周预报的本周天气生效，再抽下周预报
    st.weather = st.nextWeather || 'calm';
    st.nextWeather = pickWeather(st.rng);
    if (st.season === 1 && st.week <= 6) {
      st.weather = 'calm';
      st.nextWeather = 'calm';
    }
    if (st.season === 1 && st.week === 7) {
      const weatherIds = (D.WEATHERS || []).filter(w => w.id !== 'calm').map(w => w.id);
      st.weather = pickOne(st.rng, weatherIds);
      st.nextWeather = pickWeather(st.rng);
    }
    {
      const wn = weatherInfo(st);
      log.push(`天气转「${wn.name}」${wn.icon}：${wn.desc}`);
    }

    // 教学期只讲招募、轮换和休整；涨薪与转会压力从第六周起再启用。
    if (!(st.season === 1 && st.week <= 8)) {
    // 6.5) 人员管理：涨薪请求 / 转会预警（v0.4）
    // 上周没回的涨薪 → 自动拒绝，他动了转会的心思
    for (const req of (st.pendingRaises || []).slice()) {
      const t = st.travelers.find(x => x.id === req.travelerId);
      if (!t) continue;
      t.wantsTransfer = true;
      log.push(`涨薪请求没回：「${t.name}」动了转会的心思`);
    }
    st.pendingRaises = [];
    // 转会预警倒计时：不处理就自己走
    for (const req of (st.pendingTransfers || [])) {
      req.weeksLeft -= 1;
      if (req.weeksLeft <= 0) {
        const t = st.travelers.find(x => x.id === req.travelerId);
        if (t && st.travelers.length > 5) {
          st.travelers = st.travelers.filter(x => x.id !== t.id);
          st.reputation = Math.max(0, st.reputation - 2);
          log.push(`「${t.name}」转会走了（没处理）：口碑 −2`);
        }
      }
    }
    st.pendingTransfers = (st.pendingTransfers || []).filter(r => r.weeksLeft > 0 && st.travelers.some(t => t.id === r.travelerId));
    // 每 4 周：最多 2 个人要求涨薪（词条越多，要得越多）
    if (st.week % C.raiseEveryWeeks === 0) {
      const askers = st.travelers
        .filter(t => t.traits.length >= 2)
        .sort((a, b) => (b.traits.length - a.traits.length) || (b.growth - a.growth))
        .slice(0, 2);
      for (const t of askers) {
        const amount = t.traits.length * C.raisePerTrait;
        st.pendingRaises.push({ travelerId: t.id, amount });
        log.push(`「${t.name}」要求涨薪：+${amount} 金/周（当前 ${t.wage}）`);
      }
    }
    // 转会预警：连续几周没上场 / 明确想走（同时最多 2 条）
    for (const t of st.travelers) {
      if (st.pendingTransfers.length >= 2) break;
      if (st.pendingTransfers.some(r => r.travelerId === t.id)) continue;
      if (st.travelers.length <= 5) break;
      const idle = t.lastPlayed > 0
        ? (st.week - t.lastPlayed >= C.transferWarningWeeks)
        : (st.week >= C.transferWarningWeeks + 1);
      if (!(t.wantsTransfer || idle)) continue;
      t.wantsTransfer = false;
      st.pendingTransfers.push({ travelerId: t.id, weeksLeft: C.transferPendingWeeks });
      log.push(`「${t.name}」想转会：要么挽留，要么放人（${C.transferPendingWeeks} 周内处理）`);
    }
    }

    // 7) 新的一周：同一套周任务池，按周模板补委托。
    if (st.season === 1 && st.week >= 2 && st.week <= 8) initializeContractWeek(st, st.week);
    else fillBoard(st);
    if (st.season === 1 && st.week === 6) ensureWeekSixDelegation(st);
    if (st.season === 2 && st.week === 2) ensureSeasonTwoCore(st);
    if (!(st.season === 1 && st.week <= 6) && st.week % 2 === 1 && st.delegations.length < C.delegationMax) addDelegation(st);
    // 8) 补丁铺重新上货、酒馆换一批客人
    restockShop(st);
    for (const c of st.candidates) c.expiresIn -= 1;
    st.candidates = st.candidates.filter(c => c.expiresIn > 0);
    generateCandidates(st);
    ensureWeekThreeCandidates(st);
    if (st.season === 1 && st.week <= 8) st.candidates = st.candidates.slice(0, st.week === 8 ? 6 : 4);
    return { ok: true, ended: false, log };
  }

  /* ---------------- 季末评估 ---------------- */
  function seasonSummary(st) {
    const diff = seasonDiffInfo(st);
    const ratingVals = st.delegationRatings.map(r => RATING_VALUE[r.rating] ?? 1);
    const avgRating = ratingVals.length ? ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length : null;
    const examList = Object.keys(D.STORE_EXAMS || {}).map(id => {
      const info = storeExamInfo(st, id);
      return { store: id, info };
    });
    const completed = examList.filter(x => x.info && x.info.done).length;
    const board = leaderboardOf(st);
    const myRank = (board.find(r => r.you) || { rank: 1 }).rank;
    return {
      season: st.season,
      credit: st.credit,
      gold: st.gold,
      tasksDone: st.stats.tasksDone,
      delegationsDone: st.stats.delegationsDone,
      breached: st.stats.breached,
      runs: st.stats.runs,
      unlockedTier: profileOf(st).unlockedTier,
      avgRating,
      exams: examList,
      completedExams: completed,
      rank: myRank,
      leaderboard: board,
      budget: 100 + Math.floor(st.credit / 10),
      weather: weatherInfo(st).name, weatherIcon: weatherInfo(st).icon,
      difficulty: diff.standardScale,
      career: profileOf(st).career || null,
    };
  }

  /* 下一季：保留金币结余 + 预算 + 已解锁档位 + 队伍 + 背包 */
  function nextSeason(st) {
    const summary = seasonSummary(st);
    // 生涯统计：正常流程已在 endWeek 结算；直接调 nextSeason（测试/旧档）时补一次
    profileOf(st).career = profileOf(st).career || defaultCareer();
    if (!st.ended) {
      profileOf(st).career.seasonsPlayed += 1;
      profileOf(st).career.bestCredit = Math.max(profileOf(st).career.bestCredit, st.credit);
    }
    const ns = newSeason({ season: st.season + 1, rng: st.rng });
    const reward = rankRewardOf(st);
    ns.gold = Math.max(0, st.gold) + summary.budget + reward.gold;
    ns.reputation = C.startReputation + Math.floor(st.reputation * C.repCarryRate) + reward.rep;
    ns.credit = Math.floor(st.credit * C.creditCarryRate);
    ns.profile = JSON.parse(JSON.stringify(profileOf(st)));
    ns.lastRank = rankOf(st);
    ns.lastRankTitle = reward.title;
    ns.upgrades = Object.assign({ agency: 0, tavern: 0, patch: 0, boat: 0 }, st.upgrades || {});
    ns.slotsLeft = slotsPerWeekOf(ns);
    ns.tasks = [];
    while (ns.tasks.length < boardCapOf(ns)) pushSelfTask(ns);
    restockShop(ns);
    ns.travelers = st.travelers.map(t => Object.assign({}, t, {
      fatigue: 0, lastPlayed: 0, traits: JSON.parse(JSON.stringify(t.traits)),
      wage: wageOf(t, ns), wantsTransfer: false,
    }));
    ns.inventory = Object.assign({}, st.inventory);
    return { state: ns, summary };
  }

  /* ---------------- 给界面用的小查询 ---------------- */
  function travelerWeeksSincePlay(st, t) {
    return Math.max(0, st.week - (t.lastPlayed || 0));
  }
  function transferWarning(st, t) {
    // 连续 3 周没上场 → 转会预警（文档 9.7）
    if (st.season === 1 && st.week <= 8) return false;
    return t.lastPlayed > 0 ? (st.week - t.lastPlayed >= 3) : (st.week >= 4);
  }

  return {
    newSeason, endWeek, rest, seasonSummary, nextSeason,
    defaultStats, defaultCareer, defaultProfile, profileOf,
    beginRun, resolveRun, buildRunCfg,
    intelCost, intelCostLabel, sabotageChance, payIntel,
    weightHint, seasonDiffInfo, weatherInfo, nextWeatherInfo, weatherById, pickWeather, patchClosed,
    storyOf, checkStoryMails, storyMailsOf, mailUnreadCount, markMailRead,
    storeLevel, boardCapOf, rosterCapOf, shopPerWeekOf, slotsPerWeekOf, itemsPerRunOf, runCostOf, leaderboardOf, rankOf, rankRewardOf, offseasonUpgradeMaxOf, isCleared, endingInfo,
    initializeContractWeek, initializeWeekTwoTasks, initializeWeekThreeTasks, initializeIntroContractWeek, ensureWeekSixDelegation, ensureWeekThreeCandidates, migrateIntroFatigue,
    taskGoldBonusOf, recruitDiscountOf, candidatePrice, shopDiscountOf, sellBonusOf, restCostOf, trainingCostOf, restRecoverOf,
    retreatCreditOf, breachCreditOf, storeExamInfo, completedExams, examProgress, upgradeStore, trainTraveler, offseasonGrowth,
    // 四店系统
    restockShop, buyItem, sellItem, itemBuyPrice, itemSellPrice, inventoryCount,
    generateCandidates, recruit, release, acceptTask,
    // v0.4 养成 / 人员管理
    wageOf, growthTrait, growthCostFor, rerollOptions, rerollApply, transferValueOf, sellTraveler,
    resolveRaise, keepTraveler, letLeave,
    travelerWeeksSincePlay, transferWarning,
    // 给测试用
    _internal: { makeSelfTask, makeDelegation, fillBoard, addDelegation, pushSelfTask, pushLog, RATING_VALUE },
  };
})();

if (typeof module !== 'undefined') module.exports = Campaign;
