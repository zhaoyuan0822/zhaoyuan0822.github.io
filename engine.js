/* =====================================================================
 * 《大壶街出勤局》出勤层引擎 v0.2（供单局与经理层共用）
 * ---------------------------------------------------------------------
 * 纯逻辑，不碰 DOM。浏览器里由 index.html 加载；
 * node 里也可以 require（跑平衡模拟用）。
 * 规则出处：《玩法设计》6.6—6.11、《数值表初稿》一、三。
 * ===================================================================== */
const Engine = (() => {
  const D = (typeof DATA !== 'undefined') ? DATA : require('./data.js');

  /* ---------------- 小工具 ---------------- */
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const randInt = (rng, n) => Math.floor(rng() * n);

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(rng, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* 把 fx 合并进目标对象（数值相加） */
  function mergeFx(target, extra) {
    if (!extra) return target;
    for (const k of Object.keys(extra)) {
      if (k === 'gainItem' || k === 'shield') target[k] = (target[k] || 0) + extra[k];
      else target[k] = (target[k] || 0) + (extra[k] || 0);
    }
    return target;
  }

  /* ---------------- 权重 ---------------- */
  function buildWeights(task, rng) {
    if (!task.randomWeights) return task.weights.slice();
    // 自由散单：时效压到 0—20，其余三项随机分剩下的
    const time = Math.round(rng() * 20);
    let rest = 100 - time;
    const raw = [1 + rng(), 1 + rng(), 1 + rng()];
    const sum = raw[0] + raw[1] + raw[2];
    const w = raw.map(x => Math.round(x / sum * rest));
    const diff = 100 - time - w[0] - w[1] - w[2];
    w[0] += diff;
    return [time, w[0], w[1], w[2]];
  }

  /* ---------------- 抽牌 ---------------- */
  function poolOf(cat) {
    return D.CARDS.filter(c => c.cat === cat);
  }

  // 一张牌上是否存在"留证"选项
  function hasEvidenceOption(card) {
    return card.options.some(o => o.fx && o.fx.evidence);
  }

  // 把牌堆配比按比例放大/缩放到指定张数（每类至少 1 张）
  function scalePlanCounts(plan, target) {
    const keys = Object.keys(plan).filter(k => plan[k] > 0);
    const sum = keys.reduce((a, k) => a + plan[k], 0);
    if (!sum || target <= 0) return plan;
    if (sum === target) return plan;
    const out = {};
    let used = 0;
    for (const k of keys) {
      out[k] = Math.max(1, Math.floor(plan[k] / sum * target));
      used += out[k];
    }
    let i = 0;
    while (used < target && keys.length) {
      out[keys[i % keys.length]]++;
      used++;
      i++;
    }
    // 超出时从最大的类里削
    let guard = 0;
    while (used > target && guard++ < 100) {
      let big = keys[0];
      for (const k of keys) if ((out[k] || 0) > (out[big] || 0)) big = k;
      if (out[big] > 1) { out[big]--; used--; }
      else break;
    }
    return out;
  }

  // 卡片的全局数值缩放（15 张牌 → 时间成本要缩；负载幅度缩小平滑）
  function scaleCardFx(fxIn) {
    const B = D.BALANCE || { cardTimeScale: 1, cardLoadScale: 1 };
    const fx = Object.assign({}, fxIn);
    if (fx.time) {
      const scaled = Math.round(fx.time * (B.cardTimeScale || 1));
      fx.time = scaled === 0 ? (fx.time > 0 ? 1 : -1) : scaled;
    }
    if (fx.load) {
      const scaled = Math.round(fx.load * (B.cardLoadScale || 1));
      fx.load = scaled === 0 ? (fx.load > 0 ? 1 : -1) : scaled;
    }
    return fx;
  }

  function buildDeck(task, route, rng) {
    let plan = Object.assign({}, task.deck);
    for (const [cat, n] of Object.entries(route.deck || {})) {
      plan[cat] = Math.max(0, (plan[cat] || 0) + n);
    }
    // 按任务目标张数缩放配比（默认 15 张；近道等路线可以少抽几张）
    const baseCards = task.cardCount || (D.BALANCE && D.BALANCE.defaultCardCount) || 0;
    const targetCards = baseCards ? Math.max(6, baseCards + (route.cardCountMod || 0)) : 0;
    if (targetCards) plan = scalePlanCounts(plan, targetCards);
    const deck = [];
    for (const [cat, n] of Object.entries(plan)) {
      const pool = shuffle(poolOf(cat), rng);
      for (let i = 0; i < n; i++) deck.push(pool[i % pool.length]);
    }

    // 证据保证：任务要几点证据，就保证牌堆里有几张"留证牌"
    // （v0.5 起 +2 源都改成 +1，所以要求 3 点需要 3 张不同的留证牌）
    const req = task.evidence || 0;
    if (req > 0) {
      const needCards = Math.min(3, Math.max(1, req));
      const evPool = shuffle(D.CARDS.filter(hasEvidenceOption), rng);
      // 从"最不心疼"的类别开始替换：奇怪 > 现场(杂) > 危险 > 路线
      const catOrder = ['weird', 'misc', 'danger', 'route'];
      let ei = 0;
      while (deck.filter(hasEvidenceOption).length < needCards && ei < evPool.length) {
        const card = evPool[ei++];
        if (deck.some(c => c.id === card.id && c.cat === card.cat)) continue;
        let done = false;
        for (const cat of catOrder) {
          const idxs = deck
            .map((c, i) => (c.cat === cat && !hasEvidenceOption(c)) ? i : -1)
            .filter(i => i >= 0);
          if (idxs.length) {
            deck[idxs[idxs.length - 1]] = card;
            done = true;
            break;
          }
        }
        if (!done) break;
      }
    }

    // 洗牌
    let out = shuffle(deck, rng);

    // 证据牌别全挤在最后两张（防止"没得选"）
    if (req > 0) {
      for (let i = 0; i < out.length; i++) {
        if (hasEvidenceOption(out[i]) && i >= out.length - 2) {
          const early = randInt(rng, Math.max(1, out.length - 3));
          if (!hasEvidenceOption(out[early])) [out[i], out[early]] = [out[early], out[i]];
        }
      }
    }
    return out;
  }

  /* ---------------- 起手 ---------------- */
  function makeState(opts) {
    // 任务可以直接传对象（经理层动态生成的委派/自选任务），也可以传 DATA.TASKS 的 id
    const task = opts.task || D.TASKS[opts.taskId];
    if (!task) throw new Error('未知任务：' + opts.taskId);
    const cfg = opts.cfg;
    const rng = opts.rng || Math.random;
    const route = D.ROUTES[cfg.route] || { name: '默认', deck: {}, start: {} };
    const loadCfg = D.LOADS[cfg.load] || { name: '中载', cap: 100, start: {} };
    // 旅人可以直接传定义（经理层：招募/养成的旅人词条可能和初始表不一样），
    // 也可以传 id 去 DATA.TRAVELERS 里查（出勤层练习）。
    const travelers = (cfg.travelerDefs && cfg.travelerDefs.length)
      ? cfg.travelerDefs.map(d => ({ id: d.id, name: d.name, role: d.role, traits: d.traits || [] }))
      : (cfg.travelers || [])
        .map(id => D.TRAVELERS.find(t => t.id === id))
        .filter(Boolean);

    const state = {
      taskId: task.id,
      task,
      rng,
      cfg,
      intel: cfg.intel || 0,
      itemScale: cfg.itemScale || 1,
      tideScale: cfg.tideScale || 1,
      routeId: cfg.route,
      loadId: cfg.load,
      tacticId: cfg.tactic,
      weights: buildWeights(task, rng),
      deck: buildDeck(task, route, rng),
      gauges: { time: 100, tide: 60, crew: 100, load: 0 },
      cap: loadCfg.cap,
      evidence: cfg.startEvidence || 0,
      gold: 0,
      credit: 0,
      reputation: 0,
      index: 0,
      status: 'running',     // running / reached / retreated / lost
      failReason: '',
      items: (cfg.items || []).map(id => ({ id, used: false })),
      actives: [],
      flags: {},
      shield: 0,
      tempCrew: 0,          // 临时状态（护盾）：外挂在队伍状态上，优先吸收状态损失
      tempCrewEvents: 0,    // 护盾还剩几个事件
      pendingHeal: null,    // 回春：延迟回复 { left, amount }
      emergencyHeals: 0,    // 铁胃：本局已触发次数
      overloaded: false,
      override: null,        // 主动技替换当前牌的选项
      revealed: {},
      peeked: {},
      sabotage: {},
      startLog: [],
      history: [],
    };

    // 旅人词条：被动进 flags，主动进 actives
    for (const t of travelers) {
      for (const tr of t.traits) {
        if (tr.passive) state.flags[tr.passive] = true;
        if (tr.active) state.actives.push({
          ...tr.active,
          traveler: t.name,
          used: false,
          uses: tr.active.uses || 1,
          left: tr.active.uses || 1,
        });
      }
    }
    state.travelers = travelers.map(t => ({ id: t.id, name: t.name, role: t.role }));

    // 「胎里素宇宙」：入队后危险牌出现概率 +50%（保持牌堆张数不变，替换非危险牌）
    if (state.flags.dangerBoost) {
      const dangerPool = D.CARDS.filter(c => c.cat === 'danger');
      const nAdd = Math.round(state.deck.filter(c => c.cat === 'danger').length * 0.5);
      let added = 0;
      for (let i = 0; i < nAdd && dangerPool.length; i++) {
        const idx = state.deck.findIndex(c => c.cat !== 'danger'
          && !c.options.some(o => o.fx && o.fx.evidence));
        if (idx < 0) break;
        state.deck[idx] = dangerPool[Math.floor(rng() * dangerPool.length)];
        added++;
      }
      state.startLog.push({ text: `胎里素宇宙：危险牌 +${added} 张。`, type: 'warn' });
    }

    // 起手修正：路线 + 负载 + 经理层附加（船况 / 疲劳）——同一项要相加，不能互相覆盖
    const start = {};
    for (const src of [route.start || {}, loadCfg.start || {}, cfg.startMods || {}]) {
      for (const k of Object.keys(src)) start[k] = (start[k] || 0) + src[k];
    }
    if (route.bonusGold) {
      state.gold += route.bonusGold;
      state.startLog.push({ text: `近道顺路接私活：金币 +${route.bonusGold}。`, type: 'info' });
    }
    if (state.flags.strongBack) state.cap += 20;
    if (cfg.tactic === 'detour') state.cap += 10; // 绕路：多走的路顺便多带
    if (state.flags.wander) {
      const w = rng() < 0.5 ? -20 : 20;
      start.time = (start.time || 0) + w;
      state.startLog.push({ text: `迷路体质发作：开局时间 ${w > 0 ? '+' : ''}${w}。`, type: 'warn' });
    }
    if (cfg.crewPenalty) {
      start.crew = (start.crew || 0) - cfg.crewPenalty;
      state.startLog.push({ text: `队伍疲劳：起手队伍状态 −${cfg.crewPenalty}。`, type: 'warn' });
    }
    if (cfg.startMods && cfg.startMods.time) {
      state.startLog.push({ text: `漏勺号船况：起手时间 ${cfg.startMods.time > 0 ? '+' : ''}${cfg.startMods.time}。`, type: 'warn' });
    }
    state.gauges.time = clamp(100 + (start.time || 0), 0, 100);
    state.gauges.tide = clamp(60 + (start.tide || 0), 0, 100);
    state.gauges.crew = clamp(100 + (start.crew || 0), 0, 100);
    state.gauges.load = clamp(start.load || 0, 0, 100);
    state.startTide = state.gauges.tide;
    state.startLog.push({
      text: '起手：队伍已就位。',
      type: 'info',
    });
    return state;
  }

  /* ---------------- 情报篡改（半真半假） ---------------- */
  function ensureSabotage(state) {
    const i = state.index;
    if (state.sabotage[i]) return;
    const card = state.deck[i];
    // 误报概率：默认 20%；经理层会让旅行社状态影响它（cfg.sabotageChance）
    const lieChance = (state.cfg && state.cfg.sabotageChance != null)
      ? state.cfg.sabotageChance : 0.2;
    const arr = card.options.map(opt => {
      if (state.intel >= 1 || state.flags.intelTrue) return null;
      if (opt.rand) return null;                       // 随机牌本来就没准数
      const scaled = scaleCardFx(opt.fx || {});        // 按显示用的缩放后数值判断
      const keys = ['time', 'tide', 'crew', 'load']
        .filter(k => Math.abs(scaled[k] || 0) >= 5);
      if (!keys.length || state.rng() > lieChance) return null;
      const k = keys[randInt(state.rng, keys.length)];
      const v = scaled[k];
      let fake = Math.round(v * (0.3 + state.rng() * 0.4));
      if (fake === v) fake = v > 0 ? v - 6 : v + 6;
      return { key: k, fake };
    });
    state.sabotage[i] = arr;
  }

  /* ---------------- 词条被动 / 战术 ---------------- */
  function travelerMods(state, fx, tags) {
    const f = Object.assign({}, fx);
    const g = state.gauges;
    if (state.flags.roadSave && tags.includes('road') && (f.time || 0) < 0) f.time += 5;
    if (state.flags.governExtra && tags.includes('govern') && (f.tide || 0) < 0) f.tide -= 5;
    if (state.flags.governLow && tags.includes('govern') && g.tide < 40 && (f.tide || 0) < 0) f.tide -= 5;
    // 「越伤越猛」：潮位上涨时，队伍状态 +3
    if (state.flags.tideBoon && (f.tide || 0) > 0) f.crew = (f.crew || 0) + 3;
    if (state.flags.triage && (f.load || 0) > 0) f.crew = (f.crew || 0) + 5;
    if (state.flags.fastCarry && tags.includes('rescue') && (f.time || 0) < 0) f.time += 10;
    if (state.flags.lightLoad && g.load > 80 && (f.time || 0) < 0) f.time += 5;
    // 「交货手」：交付 / 卸货类动作多减 10 负载
    if (state.flags.deliverBonus && tags.includes('deliver') && (f.load || 0) < 0) f.load -= 10;
    // 「拆陷阱」：危险类动作的队伍状态损失 −30%
    if (state.flags.trapSense && tags.includes('danger') && (f.crew || 0) < 0) {
      f.crew = Math.round(f.crew * 0.7);
    }
    if (state.flags.coward) {
      if (g.tide > 60 && (f.time || 0) < 0) f.time += 5;
      if (tags.includes('govern') && (f.tide || 0) < 0) f.tide = Math.round(f.tide / 2);
    }
    return f;
  }

  /* ---------------- 路线地形规则（v0.6） ---------------- */
  function routeMods(state, fx, tags) {
    const f = Object.assign({}, fx);
    const r = state.routeId;
    // 大路：官道好走，路线牌省 5 时间
    if (r === 'big_road' && tags.includes('road') && (f.time || 0) < 0) f.time += 5;
    // 近道：抄近道，危险牌省 5 时间
    if (r === 'shortcut' && tags.includes('danger') && (f.time || 0) < 0) f.time += 5;
    // 水线：熟悉水路，压潮 +30%，治潮牌省 10 时间
    if (r === 'water' && tags.includes('govern')) {
      if ((f.tide || 0) < 0) f.tide = Math.round(f.tide * 1.3);
      if ((f.time || 0) < 0) f.time += 10;
    }
    // 荒线：能多带，救援牌负载 +8
    if (r === 'wild' && tags.includes('rescue') && (f.load || 0) > 0) f.load += 8;
    return f;
  }

  function tacticMods(state, fx, tags) {
    const f = Object.assign({}, fx);
    const t = state.tacticId;
    if (t === 'steady') {
      if (tags.includes('govern')) {
        if ((f.tide || 0) < 0) f.tide -= 5;
      } else if ((f.time || 0) < 0) {
        f.time -= 2; // 非治潮牌多花 2 时间
      }
    } else if (t === 'rush') {
      if ((f.time || 0) < 0) f.time = -Math.round(-f.time * 0.8);
      if ((f.tide || 0) > 0) f.tide = Math.round(f.tide * 1.3);
    } else if (t === 'detour') {
      if (tags.includes('danger') && (f.crew || 0) < 0) f.crew = -Math.round(-f.crew * 0.5);
      if (tags.includes('road') && (f.time || 0) < 0) f.time -= 5;
    } else if (t === 'smash') {
      if ((f.time || 0) < 0) f.time = -Math.round(-f.time * 0.7);
      f.crew = (f.crew || 0) - 1;
      if (tags.includes('danger')) f.crew = (f.crew || 0) - 4;
    }
    return f;
  }

  function previewFx(state, card, opt) {
    let fx = scaleCardFx(opt.fx || {});
    fx = travelerMods(state, fx, opt.tags || []);
    fx = routeMods(state, fx, opt.tags || []);
    fx = tacticMods(state, fx, opt.tags || []);
    return fx;
  }

  /* ---------------- 结算一组效果 ---------------- */
  function applyFx(state, fxIn, tags) {
    const g = state.gauges;
    const fx = Object.assign({}, fxIn);
    const effect = {
      deltas: {}, evidence: 0, gold: 0, credit: 0, reputation: 0,
      overload: false, overloadTick: false, shielded: false, reveal: 0, shield: 0, gainItem: null, tempAbsorb: 0,
    };

    // 应急抢修：挡下一次"坏消息"（扣时间 / 涨潮 / 掉状态）
    // 注意：不挡负潮位、不挡卸货——那些是对玩家有利的变化
    const harmful = [];
    if ((fx.time || 0) < 0) harmful.push('time');
    if ((fx.tide || 0) > 0) harmful.push('tide');
    if ((fx.crew || 0) < 0) harmful.push('crew');
    if (state.shield > 0 && harmful.length) {
      for (const k of harmful) fx[k] = 0;
      state.shield -= 1;
      effect.shielded = true;
    }

    // 临时状态（激素）：优先吸收队伍状态损失；不参与状态上限与评分
    if ((fx.crew || 0) < 0 && state.tempCrew > 0) {
      const absorb = Math.min(state.tempCrew, -fx.crew);
      state.tempCrew -= absorb;
      fx.crew += absorb;
      effect.tempAbsorb = absorb;
      if (!fx.crew) delete fx.crew;
    }

    // 潮水季节指标：本季潮位上涨更快
    if ((fx.tide || 0) > 0) fx.tide = Math.max(1, Math.round(fx.tide * (state.tideScale || 1)));

    // 负载：装到超过"安全上限"（载重决定）就会进入超载，触发工具故障
    if ((fx.load || 0) > 0) {
      let gain = fx.load;
      if (state.flags.strongBack && tags.includes('rescue')) gain += 10;
      fx.load = Math.max(0, gain);
      if (g.load + fx.load > state.cap) effect.overload = true;
    }

    // 仪表
    for (const k of ['time', 'tide', 'crew']) {
      const v = fx[k] || 0;
      if (!v) continue;
      const nv = clamp(g[k] + v, 0, 100);
      effect.deltas[k] = nv - g[k];
      g[k] = nv;
    }
    if (fx.load) {
      const nv = clamp(g.load + (fx.load || 0), 0, 100);
      effect.deltas.load = nv - g.load;
      g.load = nv;
    }
    // 超载状态：装过安全线就进入，卸到线下才解除
    if (effect.overload) state.overloaded = true;
    if (g.load < state.cap) state.overloaded = false;

    // 其他数值
    if (fx.evidence) {
      effect.evidence = Math.max(0, Math.round(fx.evidence));
      state.evidence += effect.evidence;
    }
    if (fx.gold) { effect.gold = Math.round(fx.gold); state.gold += effect.gold; }
    if (fx.credit) { effect.credit = Math.round(fx.credit); state.credit += effect.credit; }
    if (fx.reputation) { effect.reputation = Math.round(fx.reputation); state.reputation += effect.reputation; }
    if (fx.reveal) {
      // 「看穿」：当前这张 + 接下来 N−1 张都显示真实数值
      const n = Math.max(1, Math.round(fx.reveal));
      effect.reveal = n;
      for (let k = 0; k < n; k++) {
        const idx = state.index + k;
        if (idx < state.deck.length) state.revealed[idx] = true;
      }
    }
    if (fx.shield) { effect.shield = Math.round(fx.shield); state.shield += effect.shield; }

    if (fx.peek) {
      // 「预判」：提前看到接下来 N 张牌的类别
      const n = Math.max(1, Math.round(fx.peek));
      effect.peek = n;
      for (let k = 1; k <= n; k++) {
        const idx = state.index + k;
        if (idx < state.deck.length) state.peeked[idx] = true;
      }
    }

    if (fx.gainItem) {
      const keys = Object.keys(D.ITEMS);
      const id = keys[randInt(state.rng, keys.length)];
      // gained = 局内捡到的（不是出发时带的），出勤结束后可以带回经理层背包
      state.items.push({ id, used: false, gained: true });
      effect.gainItem = D.ITEMS[id];
    }
    return effect;
  }

  /* ---------------- 结束判定 ---------------- */
  function checkEnd(state) {
    if (state.status !== 'running') return;
    // 序章教学局：不判负，仪表见底时锁在 1 / 99，先把一趟跑完
    if (state.cfg && state.cfg.tutorial) {
      state.gauges.time = Math.max(1, state.gauges.time);
      state.gauges.crew = Math.max(1, state.gauges.crew);
      state.gauges.tide = Math.min(99, state.gauges.tide);
      return;
    }
    if (state.gauges.tide >= 100) {
      state.status = 'lost';
      state.failReason = '潮位涨满——被乱流吞了。';
    } else if (state.gauges.time <= 0) {
      state.status = 'lost';
      state.failReason = '时间耗尽——超时，出勤终止。';
    } else if (state.gauges.crew <= 0) {
      state.status = 'lost';
      state.failReason = '队伍状态崩了——重伤撤场。';
    }
  }

  /* ---------------- 当前牌与展示数据 ---------------- */
  function currentCard(state) {
    return state.deck[state.index] || null;
  }

  function displayOptions(state) {
    const card = currentCard(state);
    if (!card) return [];
    // 「独断」：选项被替换成 4 个技能选项
    if (state.override && state.override.index === state.index) {
      return state.override.options.map(o => ({
        label: o.label, note: o.note,
        shown: Object.assign({}, o.fx), real: Object.assign({}, o.fx),
        fake: null, risks: [], honest: true, tags: [], rand: false,
      }));
    }
    ensureSabotage(state);
    const revealed = !!state.revealed[state.index];
    const honest = state.intel >= 1 || state.flags.intelTrue || revealed;
    const sab = state.sabotage[state.index] || [];

    return card.options.map((opt, i) => {
      const real = previewFx(state, card, opt);
      const shown = Object.assign({}, real);
      let fake = null;
      if (!honest && sab[i]) {
        shown[sab[i].key] = sab[i].fake;
        fake = sab[i];
      }
      // 风险提示（情报 2 档 / 识途 / 望远镜）
      const risks = [];
      if (state.intel >= 2 || state.flags.intelTrue || revealed) {
        if ((real.tide || 0) >= 10) risks.push('潮位大涨');
        if ((real.crew || 0) <= -10) risks.push('伤人不轻');
        if ((real.time || 0) <= -20) risks.push('很花时间');
      }
      return {
        label: opt.label, note: opt.note,
        shown, real, fake, risks, honest,
        tags: opt.tags || [], rand: !!opt.rand,
      };
    });
  }

  /* ---------------- 做出选择 ---------------- */
  /* ---------------- 护盾 / 保底 / 延迟回血 ---------------- */
  function overloadTick(state, effect) {
    if (!state.overloaded || state.flags.overloadImmune) return;
    const pen = state.flags.overloadHalf ? 2 : 5;
    const absorb = Math.min(state.tempCrew || 0, pen);
    if (absorb) {
      state.tempCrew -= absorb;
      effect.tempAbsorb = (effect.tempAbsorb || 0) + absorb;
    }
    const actualPen = pen - absorb;
    const crewBefore = state.gauges.crew;
    state.gauges.crew = clamp(state.gauges.crew - actualPen, 0, 100);
    const actual = state.gauges.crew - crewBefore;
    effect.deltas.crew = (effect.deltas.crew || 0) + actual;
    effect.overload = true;
    effect.overloadTick = true;
    effect.overloadPenalty = -actual;
  }

  function postResolve(state, effect) {
    // 铁胃：状态低于 30 时补回 30，每局 1 次
    if (state.flags.emergencyHeal && state.gauges.crew < 30 && (state.emergencyHeals || 0) < 1) {
      const before = state.gauges.crew;
      state.gauges.crew = 30;
      state.emergencyHeals = (state.emergencyHeals || 0) + 1;
      effect.deltas.crew = (effect.deltas.crew || 0) + (30 - before);
      effect.emergencyHeal = true;
    }
    // 回春：延迟回血
    if (state.pendingHeal) {
      state.pendingHeal.left -= 1;
      if (state.pendingHeal.left <= 0) {
        const amount = state.pendingHeal.amount;
        const before = state.gauges.crew;
        state.gauges.crew = clamp(state.gauges.crew + amount, 0, 100);
        const actual = state.gauges.crew - before;
        effect.deltas.crew = (effect.deltas.crew || 0) + actual;
        effect.pendingHeal = actual;
        state.pendingHeal = null;
      }
    }
    // 临时状态：持续一个事件，到点清空
    if (state.tempCrewEvents > 0) {
      state.tempCrewEvents -= 1;
      if (state.tempCrewEvents <= 0) state.tempCrew = 0;
    }
  }

  function choose(state, optIdx) {
    if (state.status !== 'running') return null;
    const card = currentCard(state);
    if (!card) return null;
    // 「独断」：从 4 个技能选项里选一个，直接结算并推进
    if (state.override && state.override.index === state.index) {
      const o = state.override.options[optIdx];
      if (!o) return null;
      const before = Object.assign({}, state.gauges);
      const effect = applyFx(state, Object.assign({}, o.fx || {}), []);
      overloadTick(state, effect);
      postResolve(state, effect);
      const after = Object.assign({}, state.gauges);
      state.history.push({
        cardId: card.id, scene: card.scene, cat: card.cat,
        optLabel: o.label, optIdx, before, after, effect, events: ['独断：改选'], intelLie: null,
      });
      state.override = null;
      checkEnd(state);
      if (state.status === 'running') {
        state.index++;
        if (state.index >= state.deck.length) state.status = 'reached';
      }
      return { events: ['独断：改选'], effect, intelLie: null, before, after, status: state.status };
    }
    const opt = card.options[optIdx];
    if (!opt) return null;

    // 选之前把"情报说法"记下来（用于事后对比）
    const shown = displayOptions(state)[optIdx];

    let fx = Object.assign({}, opt.fx || {});
    const events = [];
    if (opt.rand) {
      for (const b of opt.rand) {
        if (state.rng() < b.p) {
          mergeFx(fx, b.fx);
          if (b.text) events.push(b.text);
          break;
        }
      }
    }
    fx = scaleCardFx(fx);
    fx = travelerMods(state, fx, opt.tags || []);
    fx = routeMods(state, fx, opt.tags || []);
    fx = tacticMods(state, fx, opt.tags || []);

    const before = Object.assign({}, state.gauges);
    const effect = applyFx(state, fx, opt.tags || []);

    // 超载：只要还在超载状态，每张牌都会"工具故障"——队伍状态持续掉（「实力」免疫 / 护盾先吃）
    overloadTick(state, effect);
    postResolve(state, effect);
    const after = Object.assign({}, state.gauges);

    // 情报误报对比
    let intelLie = null;
    if (shown && shown.fake) {
      const diffs = [];
      for (const k of ['time', 'tide', 'crew', 'load']) {
        const realV = (shown.real[k] || 0);
        const shownV = (shown.shown[k] || 0);
        if (realV !== shownV) diffs.push({ key: k, shown: shownV, real: realV });
      }
      if (diffs.length) intelLie = diffs;
    }

    state.history.push({
      cardId: card.id, scene: card.scene, cat: card.cat,
      optLabel: opt.label, optIdx, before, after, effect, events, intelLie,
    });

    checkEnd(state);
    if (state.status === 'running') {
      state.index++;
      if (state.index >= state.deck.length) state.status = 'reached';
    }
    return { events, effect, intelLie, before, after, status: state.status };
  }

  /* ---------------- 使用道具 / 主动词条 ---------------- */
  function useItem(state, idx) {
    const it = state.items[idx];
    if (!it || it.used || state.status !== 'running') return null;
    const def = D.ITEMS[it.id];
    it.used = true;
    // 补丁铺状态差 → 道具效果打折（服务打折）
    const fx = Object.assign({}, def.fx);
    const scale = state.itemScale || 1;
    if (scale !== 1) {
      for (const k of ['time', 'tide', 'crew', 'load']) {
        if (fx[k]) fx[k] = Math.round(fx[k] * scale);
      }
    }
    const effect = applyFx(state, fx, []);
    checkEnd(state);
    return { effect, name: def.name, status: state.status, scaled: scale !== 1 };
  }

  function useActive(state, idx) {
    const a = state.actives[idx];
    if (!a || a.used || state.status !== 'running') return null;
    if (a.left > 0) a.left--;
    a.used = a.left <= 0;

    // 「独断」：把当前牌的选项替换成 4 个技能选项
    if (a.choices) {
      state.override = { index: state.index, options: a.choices, name: a.name };
      return { choices: true, name: a.name, left: a.left, status: state.status };
    }

    // 「激素」：获得临时状态（护盾），持续一个事件
    if (a.tempCrew) {
      state.tempCrew = Math.max(state.tempCrew || 0, Math.round(a.tempCrew));
      state.tempCrewEvents = 1;
      return { effect: { tempCrew: state.tempCrew }, name: a.name, left: a.left, status: state.status };
    }

    // 「回春」：记录缺失状态，delay 个选项后回复
    if (a.healMissing) {
      const missing = Math.max(0, 100 - state.gauges.crew);
      const amount = Math.min(a.healMissing.cap || 999, Math.round(missing * (a.healMissing.pct || 0.6)));
      state.pendingHeal = { left: a.delay || 1, amount };
      return { effect: { healQueued: amount, delay: a.delay || 1 }, name: a.name, left: a.left, status: state.status };
    }

    // 「突击」：跳过当前这张牌（不结算任何选项）
    if (a.fx && a.fx.skip) {
      const card = currentCard(state);
      const before = Object.assign({}, state.gauges);
      state.history.push({
        cardId: card ? card.id : null, scene: card ? card.scene : '突击',
        cat: card ? card.cat : 'misc', optLabel: '突击（跳过本张）', optIdx: -1,
        before, after: Object.assign({}, state.gauges),
        effect: { skip: true }, events: ['突击：跳过这张牌'], intelLie: null,
      });
      state.index++;
      if (state.index >= state.deck.length) state.status = 'reached';
      return { effect: { skip: true }, name: a.name, left: a.left, status: state.status };
    }

    // 「兴趣」：本局牌堆 +2、撤退免罚
    if (a.fx && a.fx.deckAdd) {
      const add = Math.max(1, Math.round(a.fx.deckAdd));
      for (let i = 0; i < add; i++) {
        const card = D.CARDS[Math.floor(state.rng() * D.CARDS.length)];
        const span = Math.max(1, state.deck.length - state.index);
        const pos = Math.min(state.deck.length, state.index + 1 + Math.floor(state.rng() * span));
        state.deck.splice(pos, 0, card);
      }
      if (a.fx.retreatFree) state.flags.retreatFree = true;
      return {
        effect: { deckAdd: add, retreatFree: !!a.fx.retreatFree },
        name: a.name, left: a.left, status: state.status,
      };
    }

    // 「卸货」类主动技算作交付动作，能吃到「交货手」的加成
    const tags = (a.fx && a.fx.load < 0) ? ['deliver'] : [];
    const effect = applyFx(state, Object.assign({}, a.fx), tags);
    checkEnd(state);
    return { effect, name: a.name, left: a.left, status: state.status };
  }

  function retreat(state) {
    if (state.status !== 'running') return false;
    state.status = 'retreated';
    return true;
  }

  /* ---------------- 结算 ---------------- */
  function ratingOf(ratio) {
    for (const r of D.RATING) if (ratio >= r.min) return r.key;
    return 'D';
  }

  function result(state) {
    const g = state.gauges;
    const task = state.task;

    // 五项评分
    const scores = {
      time: Math.round(g.time),
      govern: clamp(Math.round(50 + ((state.startTide === undefined ? 60 : state.startTide) - g.tide) * 1.5), 0, 100),
      crew: Math.round(g.crew),
      rescue: Math.min(100, Math.round(g.load)),
    };

    // 权重加权
    const w = state.weights;
    const raw = (scores.time * w[0] + scores.govern * w[1] + scores.crew * w[2] + scores.rescue * w[3]) / 100;

    // 证据门
    const req = task.evidence || 0;
    let evidenceState = 'ok';
    let penalty = 1;
    if (req > 0) {
      const short = req - state.evidence;
      if (short === 1) { evidenceState = 'discount'; penalty = 0.7; }
      else if (short >= 2) { evidenceState = 'reject'; penalty = 0; }
    }

    const failed = state.status === 'lost';
    let total = Math.round(raw * penalty * 100) / 100;
    if (evidenceState === 'reject') total = 0;
    if (failed) total = 0;

    const ratio = failed ? 0 : total / task.standard;
    const rating = failed ? 'F' : ratingOf(ratio);

    // 报酬：金币 + 信用（信用按评级系数）· 扣情报钱
    // 经理层里情报来自四店状态，不再单收费（cfg.noIntelCost）
    const intelCost = (state.cfg && state.cfg.noIntelCost) ? 0 : (state.intel >= 1 ? 25 : 0);
    const goldMult = evidenceState === 'reject' ? 0.5 : 1;
    let gold = 0;
    if (!failed) {
      gold = Math.max(0, Math.round((task.gold + state.gold) * goldMult - intelCost));
    }
    let credit = 0;
    if (!failed && evidenceState !== 'reject' && task.credit > 0) {
      credit = Math.round(task.credit * D.RATING_CREDIT[rating] + state.credit);
    }
    const reputation = state.reputation - (state.intel >= 2 ? 10 : 0);

    return {
      status: state.status,
      failReason: state.failReason,
      scores, weights: w, raw: Math.round(raw * 100) / 100, startTide: state.startTide === undefined ? 60 : state.startTide,
      evidence: { got: state.evidence, req, state: evidenceState },
      penalty, total, ratio, rating,
      gold, credit, reputation, intelCost,
    itemsUsed: (state.items || []).filter(i => i.used).length,
      retreatFree: !!(state.flags && state.flags.retreatFree),
      task, history: state.history, gauges: Object.assign({}, g),
      deck: state.deck.map(c => ({ id: c.id, scene: c.scene, cat: c.cat })),
      quotes: {
        S: D.RATING_FLAVOR.S, A: D.RATING_FLAVOR.A, B: D.RATING_FLAVOR.B,
        C: D.RATING_FLAVOR.C, D: D.RATING_FLAVOR.D, F: D.RATING_FLAVOR.F,
      },
      travelerNames: state.travelers.map(t => t.name),
    };
  }

  return {
    makeState, currentCard, displayOptions, choose, useItem, useActive, retreat, result,
    previewFx, checkEnd, _internal: { buildWeights, buildDeck, shuffle, travelerMods, routeMods, tacticMods, applyFx },
  };
})();

if (typeof module !== 'undefined') module.exports = Engine;
