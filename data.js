/* =====================================================================
 * 《大壶街出勤局》出勤层原型 v0.1 · 数据表
 * ---------------------------------------------------------------------
 * 数字来源：《数值表初稿》v1.4 /《内容库》v1 /《玩法设计》v2
 * 这里就是"策划表格"。想调数值，直接改本文件（每行都有注释）。
 * 单位：时间/潮位/队伍状态/负载 都是 0—100。
 * ===================================================================== */
const DATA = (() => {

  /* ------------------------------------------------------------------
   * 一、四根仪表
   * ------------------------------------------------------------------ */
  const GAUGES = {
    time: { key: 'time', name: '时间', icon: '⏳', start: 100, min: 0, max: 100, bad: 'low' },
    tide: { key: 'tide', name: '潮位', icon: '🌊', start: 60,  min: 0, max: 100, bad: 'high' },
    crew: { key: 'crew', name: '队伍状态', icon: '💪', start: 100, min: 0, max: 100, bad: 'low' },
    load: { key: 'load', name: '负载', icon: '🎒', start: 0,   min: 0, max: 100, bad: 'high' },
  };

  /* ------------------------------------------------------------------
   * 二、事件牌库（源自《内容库》二、事件牌库 38 张）
   * 字段：cat 类别 / scene 情境 / text 描述
   *      options[].label 选项 / fx 效果 / tags 标签 / note 提示
   *      fx 里正负号即加减：time:-10 表示时间 −10
   * 标签 tags：road 赶路 / govern 治潮 / rescue 救援 / danger 危险 / evidence 留证
   * ------------------------------------------------------------------ */
  const CARDS = [
    /* ---- 路线类 ---- */
    { id: 1, cat: 'route', scene: '三岔路口', text: '三岔路口。左边大路平坦，右边林间小道近。',
      options: [
        { label: '走大路', fx: { time: -10 }, tags: ['road'] },
        { label: '钻小道', fx: {}, tags: ['road'], note: '可能撞上乱流',
          rand: [
            { p: 0.55, fx: { tide: 8 }, text: '小道确实近，就是潮有点顶。' },
            { p: 1, fx: { tide: 8, time: -10 }, text: '小道里撞上乱流，耽误了时间。' },
          ] },
      ] },
    { id: 2, cat: 'route', scene: '断桥', text: '桥塌了，只剩底下一条水沟能过人。',
      options: [
        { label: '绕路', fx: { time: -20 }, tags: ['road'] },
        { label: '硬闯水沟', fx: { time: -10, tide: 6, crew: -15 }, tags: ['road', 'danger'] },
      ] },
    { id: 3, cat: 'route', scene: '浓雾', text: '浓雾笼罩，两步外就看不清路。',
      options: [
        { label: '慢慢探', fx: { time: -15 }, tags: ['road'] },
        { label: '凭感觉冲', fx: {}, tags: ['road', 'danger'], note: '可能迷路',
          rand: [
            { p: 0.6, fx: { tide: 8 }, text: '雾里居然摸对了路。' },
            { p: 1, fx: { tide: 8, time: -15 }, text: '雾里迷了路，绕了好一阵。' },
          ] },
      ] },
    { id: 4, cat: 'route', scene: '断头路', text: '走到断头路，前面是别人的后院。',
      options: [
        { label: '回头', fx: { time: -15 }, tags: ['road'] },
        { label: '翻墙', fx: { time: -10, crew: -10 }, tags: ['road', 'danger'] },
      ] },
    { id: 5, cat: 'route', scene: '街坊的近道', text: '街坊说有近道，但语气有点虚。',
      options: [
        { label: '信他', fx: {}, tags: ['road', 'danger'], note: '情报存疑',
          rand: [
            { p: 0.5, fx: { tide: 8 }, text: '近道是真的，省了事。' },
            { p: 1, fx: { tide: 8, time: -15, crew: -5 }, text: '近道是条死路，还摔了一跤。' },
          ] },
        { label: '不信，走大路', fx: { time: -10 }, tags: ['road'] },
      ] },
    { id: 6, cat: 'route', scene: '笔直长道', text: '一条笔直的长道，望不到头。',
      options: [
        { label: '冲刺', fx: { time: -20, crew: -10 }, tags: ['road', 'danger'] },
        { label: '匀速走', fx: { time: -10 }, tags: ['road'] },
      ] },

    /* ---- 潮位类 ---- */
    { id: 7, cat: 'tide', scene: '潮位在涨', text: '潮位在涨。停下来治潮，还是先赶路？',
      options: [
        { label: '停下来治潮', fx: { time: -20, tide: -20 }, tags: ['govern'] },
        { label: '先赶路', fx: { tide: 8 }, tags: ['road'] },
      ] },
    { id: 8, cat: 'tide', scene: '漩涡', text: '前方一个漩涡在转，水声哗哗的。',
      options: [
        { label: '绕开', fx: { time: -15 }, tags: ['road'] },
        { label: '压制它', fx: { time: -20, tide: -20 }, tags: ['govern'] },
      ] },
    { id: 9, cat: 'tide', scene: '潮眼', text: '潮眼出现，中间空了一块，像只眼睛。',
      options: [
        { label: '观察', fx: { time: -10, tide: -5 }, tags: ['govern'] },
        { label: '冲过去', fx: { tide: 10 }, tags: ['danger'] },
      ] },
    { id: 10, cat: 'tide', scene: '涨潮警报', text: '涨潮警报响彻全街，人人都往高处跑。',
      options: [
        { label: '堵口', fx: { time: -20, tide: -25 }, tags: ['govern'] },
        { label: '赌它不涨', fx: { tide: 10 }, tags: ['danger'] },
      ] },
    { id: 11, cat: 'tide', scene: '潮水反冲', text: '潮水忽然反冲回来，船身一歪。',
      options: [
        { label: '硬抗', fx: { crew: -15 }, tags: ['danger'] },
        { label: '先退', fx: { time: -15 }, tags: ['road'] },
      ] },
    { id: 12, cat: 'tide', scene: '潮水漫街', text: '潮水漫过街面，货摊眼看要被冲走。',
      options: [
        { label: '救物资', fx: { time: -10, load: 20, reputation: 1 }, tags: ['rescue'] },
        { label: '先撤人', fx: { time: -10 }, tags: ['road'] },
      ] },

    /* ---- 救援类 ---- */
    { id: 13, cat: 'rescue', scene: '有人喊救命', text: '有人在水里喊救命。',
      options: [
        { label: '救', fx: { time: -10, load: 20, reputation: 1 }, tags: ['rescue'] },
        { label: '不救', fx: { reputation: -1 }, tags: [] },
      ] },
    { id: 14, cat: 'rescue', scene: '难民挤巷口', text: '一大群难民挤在巷口，看着你。',
      options: [
        { label: '深入带他们出来', fx: { tide: 8, crew: -10, load: 40 }, tags: ['rescue', 'danger'] },
        { label: '量力而行', fx: { time: -10, load: 20 }, tags: ['rescue'] },
      ] },
    { id: 15, cat: 'rescue', scene: '孩子趴漂木', text: '一个孩子趴在漂木上，哭声都哑了。',
      options: [
        { label: '跳下去', fx: { time: -10, crew: -10, load: 30 }, tags: ['rescue', 'danger'] },
        { label: '抛绳子', fx: { time: -15, load: 20 }, tags: ['rescue'] },
      ] },
    { id: 16, cat: 'rescue', scene: '瓦砾下有人', text: '瓦砾下有人敲管子，一下，两下。',
      options: [
        { label: '冒险挖', fx: { tide: 8, load: 30 }, tags: ['rescue', 'danger'] },
        { label: '绕路找工具', fx: { time: -20 }, tags: ['road'] },
      ] },
    { id: 17, cat: 'rescue', scene: '翻船', text: '一艘小船翻在浅滩，船底朝天。',
      options: [
        { label: '打捞', fx: { time: -10, load: 40 }, tags: ['rescue'] },
        { label: '赶路', fx: { time: -10 }, tags: ['road'] },
      ] },
    { id: 18, cat: 'rescue', scene: '屋顶的猫', text: '屋顶上蹲着一只猫，小孩在下面哭着要。',
      options: [
        { label: '救猫', fx: { time: -10, load: 5, reputation: 1 }, tags: ['rescue'] },
        { label: '不管', fx: { reputation: -1 }, tags: [] },
      ] },

    /* ---- 危险类 ---- */
    { id: 19, cat: 'danger', scene: '塌方', text: '前方塌方，路被埋了一半。',
      options: [
        { label: '挖开', fx: { time: -20 }, tags: [] },
        { label: '翻越', fx: { time: -10, crew: -10 }, tags: ['danger'] },
      ] },
    { id: 20, cat: 'danger', scene: '怪物', text: '乱流里浮出一只怪物，眼睛在水面上转。',
      options: [
        { label: '打', fx: { crew: -20, load: 20 }, tags: ['danger'] },
        { label: '跑', fx: { time: -15 }, tags: ['road'] },
      ] },
    { id: 21, cat: 'danger', scene: '街边起火', text: '街边起火了，风还往这边吹。',
      options: [
        { label: '救火', fx: { time: -20, tide: -10 }, tags: ['govern'] },
        { label: '等它烧', fx: { crew: -10 }, tags: [] },
      ] },
    { id: 22, cat: 'danger', scene: '雷暴', text: '雷暴突至，雨点砸在船板上。',
      options: [
        { label: '躲屋檐', fx: { time: -15 }, tags: [] },
        { label: '冲过去', fx: { time: -10, crew: -10 }, tags: ['danger'] },
      ] },
    { id: 23, cat: 'danger', scene: '沼泽', text: '一片沼泽挡在路中间，冒着泡。',
      options: [
        { label: '绕', fx: { time: -20 }, tags: ['road'] },
        { label: '蹚', fx: { time: -10, crew: -15 }, tags: ['danger'] },
      ] },
    { id: 24, cat: 'danger', scene: '悬崖', text: '一道悬崖，下面是翻涌的乱流。',
      options: [
        { label: '绕路', fx: { time: -20 }, tags: ['road'] },
        { label: '攀爬', fx: { time: -10, crew: -15 }, tags: ['danger'] },
      ] },

    /* ---- 证据 / 资源类 ---- */
    { id: 25, cat: 'misc', scene: '奇怪的痕迹', text: '地上有一串奇怪的痕迹，像是被什么拖过。',
      options: [
        { label: '停下来留证', fx: { time: -10, evidence: 1 }, tags: ['evidence'] },
        { label: '走', fx: {}, tags: [] },
      ] },
    { id: 26, cat: 'misc', scene: '可疑现场', text: '一处可疑的现场，绳子和破布散了一地。',
      options: [
        { label: '仔细检查', fx: { time: -10, evidence: 1 }, tags: ['evidence'] },
        { label: '绕开', fx: {}, tags: [] },
      ] },
    { id: 27, cat: 'misc', scene: '半埋的箱子', text: '泥里半埋着一个废弃箱子，挺沉。',
      options: [
        { label: '打捞', fx: { time: -10, load: 20 }, tags: ['rescue'] },
        { label: '走', fx: {}, tags: [] },
      ] },
    { id: 28, cat: 'misc', scene: '流动商人', text: '一个流动商人推着车，车上什么都有。',
      options: [
        { label: '做笔交易', fx: { gold: -20, gainItem: true }, tags: [] },
        { label: '走', fx: {}, tags: [] },
      ] },
    { id: 29, cat: 'misc', scene: '迷路的旅人', text: '一个迷路的旅人蹲在路边，问你往哪走。',
      options: [
        { label: '带他一程', fx: { time: -10, reputation: 1 }, tags: [] },
        { label: '不管', fx: {}, tags: [] },
      ] },

    /* ---- 奇怪类 ---- */
    { id: 30, cat: 'weird', scene: '会说话的壶', text: '路边一只壶在说话，说它知道一条近路。',
      options: [
        { label: '听它说', fx: { time: -10, reveal: 1 }, tags: [] },
        { label: '砸了它', fx: { tide: 8, crew: -5 }, tags: ['danger'] },
      ] },
    { id: 31, cat: 'weird', scene: '自己的倒影', text: '你在水面看见了自己的倒影，它比你镇定。',
      options: [
        { label: '对视一会儿', fx: { time: -15, crew: 10 }, tags: [] },
        { label: '走开', fx: {}, tags: [] },
      ] },
    { id: 32, cat: 'weird', scene: '穿西装的鸡', text: '一只穿西装的鸡从你面前路过，还夹着个公文包。',
      options: [
        { label: '追', fx: { time: -10, load: 10 }, tags: ['rescue'] },
        { label: '不管', fx: {}, tags: [] },
      ] },
    { id: 33, cat: 'weird', scene: '逆流鱼群', text: '一群鱼逆流而上，挤得水面发白。',
      options: [
        { label: '等它们过', fx: { time: -15, tide: -10 }, tags: ['govern'] },
        { label: '抓', fx: { load: 20, crew: -5 }, tags: ['rescue'] },
      ] },
    { id: 34, cat: 'weird', scene: '街坊赌局', text: '街坊们摆了个赌局，押的是骰子。',
      options: [
        { label: '下注', fx: { gold: -20 }, tags: [],
          rand: [{ p: 0.5, fx: { gold: 50 }, text: '赌赢了！骰子开出三个六。' }] },
        { label: '不赌', fx: {}, tags: [] },
      ] },
    { id: 35, cat: 'weird', scene: '没见过的门', text: '街角突然开了一扇没见过的门，门缝里有光。',
      options: [
        { label: '进去', fx: {}, tags: [],
          rand: [{ p: 0.5, fx: { evidence: 1 }, text: '门后堆着一摞出勤凭证。' },
                 { p: 0.5, fx: { crew: -15 }, text: '门后是乱流，被削了一顿。' }] },
        { label: '不进', fx: {}, tags: [] },
      ] },
    { id: 36, cat: 'weird', scene: '未来人', text: '一个自称"未来人"的家伙要给你算命。',
      options: [
        { label: '听', fx: { time: -10 }, tags: [],
          rand: [{ p: 0.5, fx: { tide: -10 }, text: '他说潮会退，果然退了一点。' },
                 { p: 0.5, fx: { tide: 10 }, text: '他说潮会退——潮反而涨了。' }] },
        { label: '不信', fx: {}, tags: [] },
      ] },
    { id: 37, cat: 'weird', scene: '出勤局评优表', text: '地上掉了张"出勤局评优表"，还是空白的。',
      options: [
        { label: '捡起来', fx: { evidence: 1, credit: 5 }, tags: ['evidence'] },
        { label: '踩过去', fx: { reputation: -1 }, tags: [] },
      ] },
    { id: 38, cat: 'weird', scene: '会说话的老鼠', text: '一只会说话的老鼠，要拿它的宝贝跟你换东西。',
      options: [
        { label: '换', fx: { gold: -10, gainItem: true }, tags: [] },
        { label: '不换', fx: {}, tags: [] },
      ] },

    /* ---- 交付 / 卸货类（v0.3 新增：给"超载"一个出口） ---- */
    { id: 39, cat: 'misc', scene: '街坊接应点', text: '潮口边上有个街坊接应点，能先把救到的人转过去。',
      options: [
        { label: '转交', fx: { load: -40, time: -10, reputation: 1 }, tags: ['deliver'] },
        { label: '自己带着', fx: {}, tags: ['deliver'] },
      ] },
    { id: 40, cat: 'misc', scene: '收旧货的商队', text: '一支收旧货的商队愿意接你手上的打捞品。',
      options: [
        { label: '卖给他们', fx: { load: -30, gold: 20 }, tags: ['deliver'] },
        { label: '不卖', fx: {}, tags: ['deliver'] },
      ] },
    { id: 41, cat: 'misc', scene: '压舱的重货', text: '货压得船吃水很深，再装就要出事了。',
      options: [
        { label: '卸下重货', fx: { load: -30, time: -10 }, tags: ['deliver'] },
        { label: '咬牙扛着（队伍状态 −10）', fx: { crew: -10 }, tags: ['deliver'] },
      ] },

    /* ---- 顺路 / 补给类（15 张牌需要一点"回血"，但有代价） ---- */
    { id: 42, cat: 'rest', scene: '顺流而下', text: '潮水正顺，船能借一把力。',
      options: [
        { label: '顺流而下', fx: { time: 15, tide: 6 }, tags: ['rest'] },
        { label: '靠岸慢慢走', fx: { time: -10 }, tags: ['road'] },
      ] },
    { id: 43, cat: 'rest', scene: '路边的茶摊', text: '路边支着个茶摊，老板问要不要歇一会儿。',
      options: [
        { label: '歇一会儿', fx: { time: 20, gold: -10 }, tags: ['rest'] },
        { label: '继续赶路', fx: { time: -15 }, tags: ['road'] },
      ] },
    { id: 44, cat: 'rest', scene: '老街坊带路', text: '一个老街坊说他认识一条近路，要带你们走。',
      options: [
        { label: '跟紧他', fx: { time: 15, crew: -5 }, tags: ['rest'] },
        { label: '自己走', fx: { time: -10 }, tags: ['road'] },
      ] },
    { id: 45, cat: 'rest', scene: '潮头抬船', text: '一个潮头抬过来，正好能推船一段。',
      options: [
        { label: '借势冲', fx: { time: 18, tide: 7 }, tags: ['rest'] },
        { label: '稳着走', fx: { time: -8 }, tags: ['road'] },
      ] },

    /* ---- 潮位类补充（v0.5：给"压潮"更多低成本选项，随机洗进各任务牌堆） ---- */
    { id: 46, cat: 'tide', scene: '退潮口', text: '潮水正从一道旧闸口往外退，还能赶上一小段。',
      options: [
        { label: '等它退', fx: { time: -12, tide: -8 }, tags: ['govern'] },
        { label: '不等了', fx: { tide: 8 }, tags: ['road'] },
      ] },
    { id: 47, cat: 'tide', scene: '老闸门', text: '一道锈死的老闸门，闸后是空出来的潮沟。',
      options: [
        { label: '开闸放水', fx: { time: -15, tide: -10, crew: -5 }, tags: ['govern', 'danger'] },
        { label: '硬顶过去', fx: { time: -5, tide: 7 }, tags: ['road', 'danger'] },
      ] },
    { id: 48, cat: 'tide', scene: '顺水湾', text: '河道拐了个弯，回流把水往低处带。',
      options: [
        { label: '借回流绕', fx: { time: -8, tide: -6 }, tags: ['govern'] },
        { label: '直穿', fx: { time: -10, tide: 5 }, tags: ['road'] },
      ] },
    { id: 49, cat: 'tide', scene: '潮汐石', text: '水里有块老潮汐石，老船工说看见石头就能下锚。',
      options: [
        { label: '看石下锚', fx: { time: -20, tide: -12 }, tags: ['govern'] },
        { label: '不看', fx: { time: -5, tide: 10 }, tags: ['road'] },
      ] },
    { id: 50, cat: 'tide', scene: '岸边沙袋', text: '岸边堆着半塌的沙袋墙，能挡一阵潮。',
      options: [
        { label: '堆沙袋', fx: { time: -12, tide: -8 }, tags: ['govern'] },
        { label: '不管', fx: { tide: 6, crew: -5 }, tags: ['road'] },
      ] },
    { id: 51, cat: 'tide', scene: '老船工的手势', text: '岸上的老船工冲你们比划，指着一个方向。',
      options: [
        { label: '照他指的方向', fx: { time: -12, tide: -10, gold: -10 }, tags: ['govern'] },
        { label: '不信', fx: { time: -5, tide: 8 }, tags: ['road'] },
      ] },

    /* ---- 救援类补充（v0.5：把牌库拉匀，救援/负载的选择更多变） ---- */
    { id: 52, cat: 'rescue', scene: '翻倒的货箱', text: '巷子里一摞货箱翻了，底下好像压着人。',
      options: [
        { label: '抬箱救人', fx: { time: -10, load: 15 }, tags: ['rescue'] },
        { label: '只捞轻的', fx: { load: 6 }, tags: ['rescue'] },
      ] },
    { id: 53, cat: 'rescue', scene: '桥洞下的呼救', text: '桥洞底下传来呼救，水已经漫到膝盖。',
      options: [
        { label: '下桥洞', fx: { time: -15, load: 20, crew: -5 }, tags: ['rescue', 'danger'] },
        { label: '扔绳', fx: { time: -8, load: 10 }, tags: ['rescue'] },
      ] },
    { id: 54, cat: 'rescue', scene: '浮板上的孩子', text: '一个孩子趴在漂来的浮板上，正往下游去。',
      options: [
        { label: '抛绳拉回', fx: { time: -10, load: 15 }, tags: ['rescue'] },
        { label: '用船头顶', fx: { tide: 8, load: 12 }, tags: ['rescue'] },
      ] },
    { id: 55, cat: 'rescue', scene: '塌房里的老两口', text: '半塌的屋子里有老两口，被压在门板后面。',
      options: [
        { label: '挖开', fx: { time: -15, load: 25, crew: -5 }, tags: ['rescue', 'danger'] },
        { label: '先扶出来', fx: { time: -10, load: 15 }, tags: ['rescue'] },
      ] },

    /* ---- 现场 / 杂项补充 ---- */
    { id: 56, cat: 'misc', scene: '迷路的货郎', text: '一个挑担的货郎转晕了，问你们出街怎么走。',
      options: [
        { label: '捎他一段', fx: { time: -10, gold: 10 }, tags: ['misc'] },
        { label: '指个路', fx: { time: -5 }, tags: ['misc'] },
      ] },
    { id: 57, cat: 'misc', scene: '半塌的码头', text: '路边码头的一角塌了，眼看要砸进潮里。',
      options: [
        { label: '顺手加固', fx: { time: -10, crew: -5, reputation: 1 }, tags: ['misc'] },
        { label: '绕开', fx: { time: -5 }, tags: ['misc'] },
      ] },
    { id: 58, cat: 'misc', scene: '收摊的水市', text: '水市的摊主们正抢在涨潮前收摊，忙成一团。',
      options: [
        { label: '帮着收', fx: { time: -10, gold: 15, tide: 5 }, tags: ['misc'] },
        { label: '快走', fx: { time: -5 }, tags: ['misc'] },
      ] },

    /* ---- 路线类补充 ---- */
    { id: 59, cat: 'route', scene: '岔进窄巷', text: '一条窄巷能省半条街，就是窄得只能贴着墙走。',
      options: [
        { label: '抄窄巷', fx: { time: -10, tide: 6 }, tags: ['road'] },
        { label: '走大路', fx: { time: -15 }, tags: ['road'] },
      ] },
    { id: 60, cat: 'route', scene: '石板松动', text: '前头的石板松了，踩上去咯吱作响。',
      options: [
        { label: '小心走', fx: { time: -15 }, tags: ['road'] },
        { label: '大步跑', fx: { time: -8, crew: -10 }, tags: ['road'] },
      ] },

    /* ---- 危险类补充 ---- */
    { id: 61, cat: 'danger', scene: '松动的崖壁', text: '崖壁上的碎石往下掉，贴着走能近一半。',
      options: [
        { label: '贴崖下过', fx: { time: -10, tide: 6 }, tags: ['road', 'danger'] },
        { label: '绕远', fx: { time: -15, crew: -5 }, tags: ['road'] },
      ] },
    { id: 62, cat: 'danger', scene: '烧着的仓库', text: '路边仓库着了火，火光把半条街照得透亮。',
      options: [
        { label: '借火光照路', fx: { time: -10, crew: -10, tide: 5 }, tags: ['danger'] },
        { label: '等火小', fx: { time: -15 }, tags: ['road'] },
      ] },

    /* ---- 顺路 / 补给补充 ---- */
    { id: 63, cat: 'rest', scene: '岸边凉茶', text: '岸边支着凉茶摊，摊主招呼你们歇脚。',
      options: [
        { label: '喝一碗', fx: { time: 12, gold: -10 }, tags: ['rest'] },
        { label: '不喝', fx: { time: -5 }, tags: ['road'] },
      ] },
    { id: 64, cat: 'rest', scene: '顺风的篷布', text: '船尾有张破篷布，挂起来能借一把风。',
      options: [
        { label: '挂篷借风', fx: { time: 15, tide: 6 }, tags: ['rest'] },
        { label: '收篷', fx: { time: -8 }, tags: ['road'] },
      ] },
  ];

  /* ------------------------------------------------------------------
   * 三、任务（任务条来源《数值表》2.1、权重 2.3）
   * weights = [时效, 治潮, 损伤, 救援]（合计 100）
   * deck = 抽牌配比（会按路线微调）
   * standard = 评级基线分（总分 ÷ 标准分 = 评级）
   * ------------------------------------------------------------------ */
  const TASKS = {
    urgent: {
      id: 'urgent', name: '紧急堵口', tagline: '1 周 × 1 次',
      desc: '三号潮口快堵不住了。联盟急报：窗口就一周，只办一次，报酬给得挺高。',
      weights: [40, 45, 8, 7], weightLabel: '重治潮 · 重时效',
      gold: 70, credit: 15, evidence: 1, standard: 70,
      weeks: 1, runs: 1,
      deck: { route: 2, tide: 1, misc: 2, danger: 1, weird: 1, rest: 2 },
      color: '#c0452c',
    },
    patrol: {
      id: 'patrol', name: '常规巡线', tagline: '2 周 × 1 次',
      desc: '沿大壶街外环巡一圈，摸摸乱流的脾气。风险低，信用稳定，适合练手。',
      weights: [10, 30, 25, 35], weightLabel: '均衡：救援与损伤',
      gold: 40, credit: 12, evidence: 1, standard: 75,
      weeks: 2, runs: 1,
      deck: { route: 2, tide: 1, rescue: 2, misc: 2, weird: 1, rest: 2 },
      color: '#2f6f6a',
    },
    rescue: {
      id: 'rescue', name: '救援委托', tagline: '3 周 × 2 次',
      desc: '东街塌了半排房，人在里头。要救人，也要人证——联盟不认没证据的活。',
      weights: [5, 10, 35, 50], weightLabel: '重救人 · 重保人',
      gold: 70, credit: 20, evidence: 2, standard: 80,
      weeks: 3, runs: 2,
      deck: { route: 1, tide: 2, rescue: 4, danger: 2, misc: 1, weird: 1, rest: 2 },
      color: '#7a5c2e',
    },
    freelance: {
      id: 'freelance', name: '自由散单', tagline: '1 周 × 1 次',
      desc: '街坊凑钱请人跑一趟，图个吉利。不算出勤、不给信用，只结金币。',
      weights: [10, 30, 30, 30], weightLabel: '看运气（权重随机）',
      randomWeights: true,
      gold: 60, credit: 0, evidence: 0, standard: 78,
      weeks: 1, runs: 1,
      deck: { route: 2, tide: 1, rescue: 2, misc: 1, weird: 1, rest: 2 },
      color: '#8a7b5a',
    },
    core: {
      id: 'core', name: '高危核心', tagline: '4 周 × 3 次',
      desc: '联盟把最凶的一单压在这里：四周期限、三次下潜、证据要齐。赏金高，但局内涨潮牌明显更多。',
      weights: [10, 45, 20, 25], weightLabel: '重治潮 · 兼顾救人',
      gold: 300, credit: 60, evidence: 2, standard: 110,
      weeks: 4, runs: 3,
      deck: { route: 2, tide: 5, rescue: 3, danger: 3, misc: 2 },
      color: '#8f2f2f',
      core: true,
    },
  };

  /* ------------------------------------------------------------------
   * 四、上船配置：路线 / 负载 / 战术
   * start：起手仪表修正（在初始值上加减）
   * deck：牌堆追加
   * ------------------------------------------------------------------ */
  const ROUTES = {
    big_road: {
      id: 'big_road', name: '大路', desc: '平坦但远。多一张路线牌，起手时间 −10；路线牌时间 −5。',
      start: { time: -10 }, deck: { route: 1 }, summary: '时间↓↓ · 路线牌省时',
    },
    shortcut: {
      id: 'shortcut', name: '近道', desc: '快，但险。多两张危险牌；危险牌时间 −5，顺路接私活金币 +30。',
      start: {}, deck: { danger: 2 }, bonusGold: 30, summary: '危险牌省时 · 金币+30',
    },
    water: {
      id: 'water', name: '水线', desc: '沿潮沟走。起手潮位 −10，多两张潮位牌；治潮牌时间 −5、治潮效果 +20%。',
      start: { tide: -10 }, deck: { tide: 2 }, summary: '潮位↓↓ · 压潮更强',
    },
    wild: {
      id: 'wild', name: '荒线', desc: '少人走的路。起手队伍状态 −10，多一张救援牌；救援牌负载 +8。',
      start: { crew: -10 }, deck: { rescue: 1 }, summary: '状态↓ · 救援牌多',
    },
  };

  const LOADS = {
    light: { id: 'light', name: '轻载', cap: 80, start: { time: 10 }, desc: '跑得快（起手时间 +10），安全负载 80；超过会持续掉状态。', summary: '时间↑ · 安全线 80' },
    mid:   { id: 'mid',   name: '中载', cap: 100, start: {}, desc: '不多不少，安全负载 100。', summary: '均衡 · 安全线 100' },
    heavy: { id: 'heavy', name: '重载', cap: 120, start: { time: -10 }, desc: '扛得多（安全负载 120），但跑得慢（起手时间 −10）。', summary: '时间↓ · 安全线 120' },
  };

  const TACTICS = {
    steady: { id: 'steady', name: '稳线', desc: '治潮类动作额外 −5 潮位；非治潮类动作若花时间，再多花 2 时间。', summary: '潮位↓ · 时间略增' },
    rush:   { id: 'rush',   name: '抢潮', desc: '时间消耗 ×0.8；但潮位上涨 ×1.3。', summary: '时间↓ · 潮位↑' },
    detour: { id: 'detour', name: '绕路', desc: '危险类动作状态损失减半、负载安全线 +10；路线类动作若花时间，再多花 5 时间。', summary: '状态↑ 安全线↑ · 时间↑' },
    smash:  { id: 'smash',  name: '硬闯', desc: '时间消耗 ×0.7；每张牌队伍状态 −1，危险牌再 −4。', summary: '时间↓↓ · 状态↓' },
  };

  /* ------------------------------------------------------------------
   * 四之二、天气（每周一种，提前一周预报）
   * 权重合计 100；没写的字段按 0 / 1 处理。
   * ------------------------------------------------------------------ */
  const WEATHERS = [
    { id: 'calm', name: '平潮', icon: '🌤', weight: 22, desc: '风平浪静，没有额外影响。' },
    { id: 'low', name: '小潮', icon: '🌊', weight: 10, startTide: -6, tideScale: 0.95, rewardScale: 0.9, desc: '起手潮位 −6，潮位上涨 ×0.95，报酬 ×0.90。' },
    { id: 'high', name: '大潮', icon: '🌊', weight: 10, startTide: 6, tideScale: 1.15, rewardScale: 1.15, desc: '起手潮位 +6，潮位上涨 ×1.15，报酬 ×1.15。' },
    { id: 'storm', name: '乱流', icon: '⛈', weight: 5, startTide: 10, tideScale: 1.25, rewardScale: 1.3, desc: '起手潮位 +10，潮位上涨 ×1.25，报酬 ×1.30。' },
    { id: 'fog', name: '浓雾', icon: '🌫', weight: 8, startTime: -10, rewardScale: 1.05, desc: '起手时间 −10，报酬 ×1.05。' },
    { id: 'tailwind', name: '顺风', icon: '🍃', weight: 8, startTime: 10, rewardScale: 0.95, desc: '起手时间 +10，报酬 ×0.95。' },
    { id: 'rain', name: '阴雨', icon: '🌧', weight: 8, fatigueExtra: 5, desc: '每趟出勤，上场的人额外疲劳 +5。' },
    { id: 'festival', name: '庆典', icon: '🎉', weight: 6, rewardScale: 1.2, candidateBonus: 3, desc: '报酬 ×1.20；酒馆本周多来 3 个候选人。' },
    { id: 'sketch', name: '采风日', icon: '🎨', weight: 6, shopClosed: true, desc: '补丁铺关门：不能买 / 卖 / 改造。' },
    { id: 'market', name: '集市日', icon: '🛒', weight: 6, shopDiscount: 0.2, sellBonus: 0.2, startTide: 4, desc: '补丁铺售价 −20%、回收价 +20%；起手潮位 +4。' },
    { id: 'cold', name: '寒潮', icon: '❄️', weight: 6, startCrew: -10, fatigueExtra: 3, rewardScale: 1.1, desc: '起手状态 −10、每趟疲劳 +3，报酬 ×1.10。' },
    { id: 'meteor', name: '流星雨', icon: '🌠', weight: 5, evidenceStart: 1, rewardScale: 1.1, desc: '每趟开局证据 +1，报酬 ×1.10。' },
  ];

  /* ------------------------------------------------------------------
   * 四之三、店铺升级考核（每季重算，季末达标 → 休赛期升级）
   * max: true 表示"不超过"；其余为"至少"。
   * ------------------------------------------------------------------ */
  const STORE_EXAMS = {
    agency: [
      { level: 1, name: '接单考核', reqs: [
        { key: 'runs', label: '出勤', target: 10 },
        { key: 'goldEarned', label: '累计收入', target: 250 },
        { key: 'credit', label: '信用', target: 90 },
        { key: 'breached', label: '违约', target: 1, max: true },
      ] },
      { level: 2, name: '大单考核', reqs: [
        { key: 'runs', label: '出勤', target: 18 },
        { key: 'goldEarned', label: '累计收入', target: 600 },
        { key: 'credit', label: '信用', target: 180 },
        { key: 'breached', label: '违约', target: 0, max: true },
      ] },
    ],
    tavern: [
      { level: 1, name: '人气考核', reqs: [
        { key: 'recruits', label: '招募', target: 5 },
        { key: 'rests', label: '休整', target: 2 },
        { key: 'roster', label: '季末队伍', target: 7 },
        { key: 'avgFatigue', label: '平均疲劳', target: 60, max: true },
      ] },
      { level: 2, name: '班底考核', reqs: [
        { key: 'recruits', label: '招募', target: 8 },
        { key: 'rests', label: '休整', target: 4 },
        { key: 'roster', label: '季末队伍', target: 8 },
        { key: 'avgFatigue', label: '平均疲劳', target: 45, max: true },
      ] },
    ],
    patch: [
      { level: 1, name: '手艺考核', reqs: [
        { key: 'itemsBought', label: '购买道具', target: 6 },
        { key: 'itemUses', label: '使用道具', target: 4 },
        { key: 'growths', label: '加词条', target: 1 },
      ] },
      { level: 2, name: '大师考核', reqs: [
        { key: 'itemsBought', label: '购买道具', target: 10 },
        { key: 'itemUses', label: '使用道具', target: 8 },
        { key: 'growths', label: '加词条', target: 3 },
        { key: 'itemsSold', label: '回收道具', target: 3 },
      ] },
    ],
    boat: [
      { level: 1, name: '航行考核', reqs: [
        { key: 'runs', label: '出勤', target: 12 },
        { key: 'runsWithItems', label: '带道具出勤', target: 5 },
        { key: 'trouble', label: '失败+撤退', target: 2, max: true },
      ] },
      { level: 2, name: '远航考核', reqs: [
        { key: 'runs', label: '出勤', target: 20 },
        { key: 'aRuns', label: 'A 级以上', target: 6 },
        { key: 'runsWithItems', label: '带 3 件道具出勤', target: 8 },
        { key: 'trouble', label: '失败+撤退', target: 0, max: true },
      ] },
    ],
  };

  /* ------------------------------------------------------------------
   * 四之四、店铺升级效果（每级一条，逐级累加）
   * 数值只在这里维护，campaign 里的容量/折扣/惩罚都从这里算。
   * ------------------------------------------------------------------ */
  const STORE_UPGRADES = {
    agency: [
      { boardCap: 2, taskGoldBonus: 0.10, retreatCredit: 2, breachCredit: 5 },
      { boardCap: 2, taskGoldBonus: 0.10, retreatCredit: 3, breachCredit: 5 },
    ],
    tavern: [
      { rosterCap: 1, recruitDiscount: 0.10 },
      { rosterCap: 1, recruitDiscount: 0.10, restRecover: 10 },
    ],
    patch: [
      { shopPerWeek: 2, shopDiscount: 0.10 },
      { shopPerWeek: 2, shopDiscount: 0.10, sellBonus: 0.10 },
    ],
    boat: [
      { itemsPerRun: 1, runCost: -1 },
      { slotsPerWeek: 1 },
    ],
  };

  /* ------------------------------------------------------------------
   * 五、旅人（初期只有 1—2 个词条，靠补丁铺的成长点慢慢加）
   * passive = 被动规则（引擎里实现）
   * active  = 一次性主动技（出勤中可点）
   * ------------------------------------------------------------------ */
  const TRAVELERS = [
    {
      id: 'anchor', name: '阿锚', role: '搬运', quote: '船漏了？我扛。',
      traits: [
        { name: '铁腰', rarity: '精良', passive: 'overloadHalf', desc: '超载时，队伍状态损失减半。' },
      ],
    },
    {
      id: 'fei', name: '阿飞', role: '斥候', quote: '这条路我走过……大概。',
      traits: [
        { name: '快腿', rarity: '普通', passive: 'roadSave', desc: '赶路类动作：时间消耗 −5。' },
        { name: '迷路体质', rarity: '奇怪', passive: 'wander', desc: '奇怪：开局随机 ±20 时间。' },
      ],
    },
    {
      id: 'chaopo', name: '潮婆', role: '镇潮手', quote: '潮来了别跑，先看它脾气。',
      traits: [
        { name: '压潮', rarity: '精良', passive: 'governExtra', desc: '每张治潮牌额外 −5 潮位。' },
        { name: '潮感', rarity: '精良', passive: 'governLow', desc: '潮位低于 40 时，治潮额外 −5。' },
      ],
    },
    {
      id: 'xiaoman', name: '小满', role: '医士', quote: '别逞强，我来。',
      traits: [
        { name: '包扎', rarity: '普通', active: { name: '包扎', desc: '状态 +15', fx: { crew: 15 } }, desc: '一次性：队伍状态 +15。' },
        { name: '铁胃', rarity: '普通', passive: 'emergencyHeal', desc: '状态低于 30 时补回 30；每局最多 1 次。' },
      ],
    },
    {
      id: 'shuanzhu', name: '拴柱', role: '搬运', quote: '多一个人也是救，多一百斤也是扛。',
      traits: [
        { name: '打捞', rarity: '普通', active: { name: '打捞', desc: '负载 +30', fx: { load: 30 } }, desc: '一次性：负载 +30。' },
        { name: '快搬', rarity: '普通', passive: 'fastCarry', desc: '救援类动作：时间消耗 −10。' },
      ],
    },
    {
      id: 'qieqie', name: '怯怯', role: '斥候', quote: '我、我认得路……真的。',
      traits: [
        { name: '识途', rarity: '精良', active: { name: '识途', desc: '接下来 3 张牌显示真实数值', fx: { reveal: 3 } }, desc: '一次性：接下来 3 张牌显示真实数值。' },
      ],
    },
  ];

  /* ------------------------------------------------------------------
   * 五之一、词条池（成长 / 洗练从这里抽；按位置分池）
   * 所有词条都映射到引擎已实现的钩子，保证抽到就能生效。
   * ------------------------------------------------------------------ */
  const TRAIT_POOL = {
    斥候: [
      { name: '快腿', rarity: '普通', passive: 'roadSave', desc: '赶路类动作：时间消耗 −5。' },
      { name: '抄近道', rarity: '普通', active: { name: '抄近道', desc: '时间 +20', fx: { time: 20 } }, desc: '一次性：时间 +20。' },
      { name: '省时', rarity: '精良', active: { name: '省时', desc: '时间 +25', fx: { time: 25 } }, desc: '一次性：时间 +25。' },
      { name: '识途', rarity: '精良', active: { name: '识途', desc: '接下来 3 张牌显示真实数值', fx: { reveal: 3 } }, desc: '一次性：接下来 3 张牌显示真实数值。' },
      { name: '轻装', rarity: '精良', passive: 'lightLoad', desc: '负载超过 80 时，时间消耗 −5。' },
      { name: '留痕', rarity: '精良', active: { name: '留痕', desc: '证据 +1', fx: { evidence: 1 } }, desc: '一次性：证据 +1。' },
      { name: '预判', rarity: '精良', active: { name: '预判', desc: '提前看到接下来 2 张牌的类别', fx: { peek: 2 } }, desc: '一次性：接下来 2 张牌的类别可见（不给数值）。' },
      { name: '拆陷阱', rarity: '精良', passive: 'trapSense', desc: '危险类动作：队伍状态损失 −30%。' },
      { name: '修整', rarity: '普通', active: { name: '修整', desc: '时间 +10、潮位 −10、状态 +10、负载 +10', fx: { time: 10, tide: -10, crew: 10, load: 10 } }, desc: '一次性：四仪表一起调（负载会 +10）。' },
      { name: '突击', rarity: '稀有', active: { name: '突击', desc: '跳过当前这张牌', fx: { skip: 1 } }, desc: '一次性：跳过当前牌，不结算它的选项。' },
      { name: '摸包', rarity: '普通', active: { name: '摸包', desc: '金币 +30，口碑 −2', fx: { gold: 30, reputation: -2 } }, desc: '一次性：顺手摸点外快（金币 +30，口碑 −2）。' },
      { name: '迷路体质', rarity: '奇怪', passive: 'wander', desc: '奇怪：开局随机 ±20 时间。' },
      { name: '胆小鬼', rarity: '奇怪', passive: 'coward', desc: '潮位高于 60 时跑得快（时间 −5）；但治潮效果减半。' },
    ],
    镇潮手: [
      { name: '潮退', rarity: '普通', active: { name: '潮退', desc: '压潮 −10', fx: { tide: -10 } }, desc: '一次性：压潮 −10。' },
      { name: '压潮', rarity: '精良', passive: 'governExtra', desc: '每张治潮牌额外 −5 潮位。' },
      { name: '潮感', rarity: '精良', passive: 'governLow', desc: '潮位低于 40 时，治潮额外 −5。' },
      { name: '封堵', rarity: '精良', active: { name: '封堵', desc: '潮位 −20', fx: { tide: -20 } }, desc: '一次性：潮位 −20。' },
      { name: '抢潮', rarity: '精良', active: { name: '抢潮', desc: '潮位 −15', fx: { tide: -15 } }, desc: '一次性：潮位 −15。' },
      { name: '镇流', rarity: '稀有', active: { name: '镇流', desc: '潮位 −25', fx: { tide: -25 } }, desc: '一次性：潮位 −25。' },
      { name: '轻装', rarity: '普通', passive: 'lightLoad', desc: '负载超过 80 时，时间消耗 −5。' },
    ],
    医士: [
      { name: '包扎', rarity: '普通', active: { name: '包扎', desc: '状态 +15', fx: { crew: 15 } }, desc: '一次性：队伍状态 +15。' },
      { name: '庇护', rarity: '精良', active: { name: '庇护', desc: '状态 +10', fx: { crew: 10 }, uses: 3 }, desc: '每局 3 次：队伍状态 +10。' },
      { name: '铁胃', rarity: '普通', passive: 'emergencyHeal', desc: '状态低于 30 时补回 30；每局最多 1 次。' },
      { name: '分诊', rarity: '精良', passive: 'triage', desc: '负载增加时，队伍状态 +5。' },
      { name: '回春', rarity: '稀有', active: { name: '回春', desc: '3 个选项后回复激活时缺失状态的 60%（最多 40）', delay: 3, healMissing: { pct: 0.6, cap: 40 } }, desc: '主动：3 个选项后，回复激活时缺失状态的 60%（最多 40）。' },
      { name: '激素', rarity: '精良', active: { name: '激素', desc: '获得 20 点临时状态（护盾），持续一个事件', tempCrew: 20 }, desc: '主动：获得 20 点临时状态（护盾），持续一个事件。' },
      { name: '急救', rarity: '精良', active: { name: '急救', desc: '状态 +25', fx: { crew: 25 } }, desc: '一次性：队伍状态 +25。' },
      { name: '越伤越猛', rarity: '奇怪', passive: 'tideBoon', desc: '潮位上涨时，队伍状态 +3。' },
    ],
    搬运: [
      { name: '铁腰', rarity: '精良', passive: 'overloadHalf', desc: '超载时，队伍状态损失减半。' },
      { name: '交货手', rarity: '精良', passive: 'deliverBonus', desc: '交付 / 卸货类动作，额外多减 10 负载。' },
      { name: '打捞', rarity: '普通', active: { name: '打捞', desc: '负载 +30', fx: { load: 30 } }, desc: '一次性：负载 +30。' },
      { name: '快搬', rarity: '普通', passive: 'fastCarry', desc: '救援类动作：时间消耗 −10。' },
      { name: '多捞', rarity: '精良', active: { name: '多捞', desc: '负载 +40', fx: { load: 40 } }, desc: '一次性：负载 +40。' },
      { name: '卸货', rarity: '精良', active: { name: '卸货', desc: '负载 −30', fx: { load: -30 } }, desc: '一次性：负载 −30。' },
      { name: '大力', rarity: '稀有', passive: 'strongBack', desc: '负载上限 +20，且救人时多带 10 负载。' },
    ],
  };

  /* ------------------------------------------------------------------
   * 五之二、旅人潮候选池（酒馆招募；词条都映射到引擎已实现的钩子）
   * tier: rookie 新人（便宜）/ pro 成品（贵）
   * ------------------------------------------------------------------ */
  const RECRUITS = [
    {
      id: 'r_aman', name: '昭缘', role: '搬运', tier: 'rookie', repReq: 0, price: 30, quote: '已深入局就是如此。',
      traits: [
        { name: '打捞', rarity: '普通', active: { name: '打捞', desc: '负载 +30', fx: { load: 30 } }, desc: '一次性：负载 +30。' },
      ],
    },
    {
      id: 'r_xiaosuan', name: '松雪', role: '斥候', tier: 'rookie', repReq: 2, price: 30, quote: '看我干什么？',
      traits: [
        { name: '预判', rarity: '精良', active: { name: '预判', desc: '提前看到接下来 2 张牌的类别', fx: { peek: 2 } }, desc: '一次性：接下来 2 张牌的类别可见（不给数值）。' },
      ],
    },
    {
      id: 'r_asi', name: '奶娃', role: '医士', tier: 'rookie', repReq: 3, price: 30, quote: '呃蛤蛤蛤蛤蛤',
      traits: [
        { name: '包扎', rarity: '普通', active: { name: '包扎', desc: '状态 +15', fx: { crew: 15 } }, desc: '一次性：队伍状态 +15。' },
      ],
    },
    {
      id: 'r_ahuo', name: '大狗', role: '镇潮手', tier: 'rookie', repReq: 4, price: 35, quote: '汪！汪汪！',
      traits: [
        { name: '潮感', rarity: '精良', passive: 'governLow', desc: '潮位低于 40 时，治潮额外 −5。' },
      ],
    },
    {
      id: 'r_atu', name: '小狗', role: '搬运', tier: 'rookie', repReq: 5, price: 40, quote: '嗷！嗷呜嗷呜！',
      traits: [
        { name: '交货手', rarity: '精良', passive: 'deliverBonus', desc: '交付 / 卸货类动作，额外多减 10 负载。' },
      ],
    },
    {
      id: 'r_aya', name: '寓言', role: '镇潮手', tier: 'rookie', repReq: 6, price: 40, quote: '想知道四位店主的故事吗？',
      traits: [
        { name: '潮退', rarity: '普通', active: { name: '潮退', desc: '潮位 −10', fx: { tide: -10 } }, desc: '一次性：潮位 −10。' },
      ],
    },
    {
      id: 'r_laomao', name: 'Yi独角兽', role: '斥候', tier: 'pro', repReq: 8, price: 110, quote: '这对吗？嗯，对的对的。',
      traits: [
        { name: '识途', rarity: '精良', active: { name: '识途', desc: '接下来 3 张牌显示真实数值', fx: { reveal: 3 } }, desc: '一次性：接下来 3 张牌显示真实数值。' },
        { name: '省时', rarity: '普通', active: { name: '省时', desc: '时间 +25', fx: { time: 25 } }, desc: '一次性：时间 +25。' },
      ],
    },
    {
      id: 'r_masheng', name: '柏川', role: '搬运', tier: 'pro', repReq: 10, price: 120, quote: '不要离开我的视线。',
      traits: [
        { name: '铁腰', rarity: '精良', passive: 'overloadHalf', desc: '超载时，队伍状态损失减半。' },
        { name: '快搬', rarity: '普通', passive: 'fastCarry', desc: '救援类动作：时间消耗 −10。' },
      ],
    },
    {
      id: 'r_laozhang', name: '沃克西姆', role: '斥候', tier: 'pro', repReq: 12, price: 130, quote: '我的歌单让恶魔五月哭。',
      traits: [
        { name: '留痕', rarity: '精良', active: { name: '留痕', desc: '证据 +1', fx: { evidence: 1 } }, desc: '一次性：证据 +1。' },
        { name: '快腿', rarity: '普通', passive: 'roadSave', desc: '赶路类动作：时间消耗 −5。' },
      ],
    },
    {
      id: 'r_laocheng', name: '沃玛', role: '医士', tier: 'pro', repReq: 14, price: 140, quote: '我是来找夜鹭的。',
      traits: [
        { name: '庇护', rarity: '精良', active: { name: '庇护', desc: '状态 +10', fx: { crew: 10 }, uses: 3 }, desc: '每局 3 次：队伍状态 +10。' },
        { name: '分诊', rarity: '精良', passive: 'triage', desc: '负载增加时，队伍状态 +5。' },
      ],
    },
    {
      id: 'r_laoyao', name: '艾薇丝', role: '医士', tier: 'elite', repReq: 18, price: 230, quote: '这里的灵魂吐息真是多彩。',
      traits: [
        { name: '分诊', rarity: '精良', passive: 'triage', desc: '负载增加时，队伍状态 +5。' },
        { name: '回春', rarity: '稀有', active: { name: '回春', desc: '3 个选项后回复激活时缺失状态的 60%（最多 40）', delay: 3, healMissing: { pct: 0.6, cap: 40 } }, desc: '主动：3 个选项后，回复激活时缺失状态的 60%（最多 40）。' },
        { name: '铁胃', rarity: '普通', passive: 'emergencyHeal', desc: '状态低于 30 时补回 30；每局最多 1 次。' },
      ],
    },
    {
      id: 'r_tietou', name: '游标卡尺', role: '镇潮手', tier: 'elite', repReq: 20, price: 240, quote: '这对吗？不对不对。',
      traits: [
        { name: '压潮', rarity: '精良', passive: 'governExtra', desc: '每张治潮牌额外 −5 潮位。' },
        { name: '抢潮', rarity: '精良', active: { name: '抢潮', desc: '潮位 −15', fx: { tide: -15 } }, desc: '一次性：潮位 −15。' },
        { name: '轻装', rarity: '普通', passive: 'lightLoad', desc: '负载超过 80 时，时间消耗 −5。' },
      ],
    },
    {
      id: 'r_liuruyan', name: '柳如烟', role: '柳如烟', tier: 'legend', repReq: 40, price: 400, quote: '我不在的时候，这里还挺热闹的嘛。',
      traits: [
        {
          name: '独断', rarity: '传说', exclusive: true,
          active: {
            name: '独断', desc: '把当前选项换成四个固定增益，任选其一（每局 3 次）', uses: 3,
            choices: [
              { label: '＋30 时间', fx: { time: 30 } },
              { label: '＋30 状态', fx: { crew: 30 } },
              { label: '＋30 负重', fx: { load: 30 } },
              { label: '−30 潮位', fx: { tide: -30 } },
            ],
          },
          desc: '每局 3 次：把当前选项换成「+30 时间 / +30 状态 / +30 负重 / −30 潮位」四选一。',
        },
        {
          name: '实力', rarity: '传说', exclusive: true, passive: 'overloadImmune',
          desc: '超载时由她自己背着：不再掉队伍状态（负载上限与结算分数不变）。',
        },
        {
          name: '胎里素宇宙', rarity: '传说', exclusive: true, passive: 'dangerBoost',
          desc: '入队后，危险牌出现概率 +50%。',
        },
        {
          name: '兴趣', rarity: '传说', exclusive: true,
          active: {
            name: '兴趣', desc: '本局牌堆 +2，且主动撤退免罚（每局 3 次）', uses: 3,
            fx: { deckAdd: 2, retreatFree: true },
          },
          desc: '每局 3 次：本局牌堆 +2 张，主动撤退不再受罚。',
        },
      ],
    },
  ];

  /* ------------------------------------------------------------------
   * 五之二、随机旅人（v0.6.3）：名字 / 台词 / 生成参数
   * 固定 12 人保留，随机生成补充；名字中西混合。
   * ------------------------------------------------------------------ */
  const NAME_POOL = {
    // 本地人（老街/码头）：单名，不含固定 12 人
    local: [
      '阿贵', '阿福', '阿顺', '阿平', '阿安', '阿旺', '阿发', '阿来', '阿喜', '阿乐',
      '阿春', '阿秋', '阿冬', '阿夏', '阿明', '阿亮', '阿光', '阿星', '阿月', '阿阳',
      '阿海', '阿河', '阿山', '阿石', '阿木', '阿林', '阿森', '阿水', '阿泉', '阿溪',
      '阿江', '阿湖', '阿港', '阿湾', '阿渡', '阿船', '阿帆', '阿桨', '阿舵', '阿锚',
      '阿绳', '阿网', '阿灯', '阿盐', '阿沙', '阿泥', '阿竹', '阿叶', '阿花', '阿草',
      '阿云', '阿风', '阿雨', '阿雷', '阿火', '阿金', '阿银', '阿铜', '阿铁', '阿钢',
      '老海', '老河', '老山', '老石', '老木', '老林', '老水', '老泉', '老江', '老港',
      '老湾', '老船', '老帆', '老舵', '老锚', '老绳', '老网', '老灯', '老盐', '老沙',
      '老竹', '老叶', '老云', '老风', '老雨', '老雷', '老火', '老金', '老铁', '老铜',
      '小顺', '小安', '小旺', '小来', '小喜', '小乐', '小春', '小秋', '小冬', '小夏',
      '小明', '小亮', '小光', '小星', '小月', '小阳', '小江', '小港', '小湾', '小船',
      '小帆', '小舵', '小锚', '小灯', '小盐', '小竹', '小叶', '小云', '小风',
      '秤砣', '锚链', '船钉', '网眼', '潮生', '水生', '石生', '木生', '阿生',
    ],
    // 外来户（星港移民）：自然音译单名
    foreign: [
      '卢卡', '玛莎', '汤姆', '伊万', '汉斯', '皮特', '杰克', '罗伊', '米娅', '艾拉',
      '诺拉', '奥斯卡', '卡洛斯', '迪克', '山姆', '贝尔', '安娜', '马克', '露西', '亨利',
      '奥托', '莉娜', '维克', '多姆', '艾米', '莱昂', '西奥', '朱莉', '阿德', '柯林',
      '娜塔', '沃夫', '弗兰', '伊莎', '雷欧', '莫妮', '帕克', '萨拉', '托尼', '文森',
      '里奥', '尼可', '伊芙', '莫拉', '塔拉', '赛拉', '洛伦', '恩佐', '薇拉', '阿珂',
      '米勒', '诺亚', '莉亚', '艾伦', '埃文', '奥兰', '贝拉', '布鲁诺', '达里奥', '戴维',
      '蒂娜', '多拉', '费恩', '盖尔', '格温', '哈维', '海伦', '霍克', '吉姆', '乔伊',
      '卡尔', '凯特', '科林', '拉娜', '莱斯', '洛根', '玛尔', '梅森', '米洛', '莫德',
      '纳特', '内森', '帕蒂', '佩德罗', '奇科', '瑞恩', '塞斯', '舒尔', '塔克', '泰德',
      '汤米', '威尔', '维托', '西德', '肖恩', '雅各', '亚瑟', '伊恩', '尤里', '赞恩',
      '佐伊', '阿黛尔', '奥菲', '卡西', '米拉', '努恩',
    ],
    // 代号（物件/符号）：不愿报真名的外来户、雇佣兵
    codename: [
      '蓝宝石', '琥珀', '黑曜', '月光石', '孔雀石', '黄铜', '赤铁', '盐晶', '煤精', '石英',
      '玛瑙', '青金石', '石榴石', '水晶', '云母',
      '木槿', '鸢尾', '芦苇', '艾草', '忍冬', '石楠', '苔藓', '蒲草', '铃兰', '蓟',
      '紫藤', '白芷', '薄荷', '半夏', '当归',
      '罗盘', '铜铃', '纸鸢', '灯芯', '锚链', '齿轮', '沙漏', '钥匙', '秤砣', '针线',
      '铁砧', '铜镜', '陶罐', '皮囊', '绳索',
      '盐霜', '折光', '回声', '暗涌', '雾号', '潮信', '雨脚', '风眼', '冰裂', '灰烬',
      '露水', '虹', '霜降', '惊蛰', '灯火', '帆影', '灯塔', '渡口', '桥影', '墨', '砚', '烛',
    ],
  };
  const QUOTE_POOL = {
    斥候: [
      '这条路我熟。', '我踩过点，跟我走。', '别急，先看风向。', '前面有岔口，我先探。',
      '脚印是新的，有人走过。', '雾里有灯，往那边靠。', '这条水沟能抄过去。', '我数过，三道弯。',
      '盯紧脚下，别踩空。', '风向变了，潮要回头。', '给我半刻钟，我摸清路。', '高处看，别贴墙走。',
    ],
    搬运: [
      '再重也扛得动。', '这船吃水，我熟。', '绑紧点，别半路散了。', '一箱不少，我点数。',
      '腰马合一，起！', '别看我瘦，骨头硬。', '货比人金贵，先保货。', '这趟能多带两成。',
      '搭把手，一起抬。', '我走前面，你们跟。', '绳索给我，我打结。', '压在肩上，稳当。',
    ],
    医士: [
      '先止血，别乱动。', '死不了，包一下。', '撑住，我带了药。', '骨头没断，运气好。',
      '别硬撑，躺平。', '这药苦，管用。', '伤口别沾水。', '我看看脉搏。',
      '还有气，抬走。', '缝两针就好。', '谁也别逞强。', '水烧开，先消毒。',
    ],
    镇潮手: [
      '潮来了别慌。', '先看它脾气。', '水涨不到哪去。', '退潮口在左边。',
      '沙袋不够，用船板。', '这浪头，三息就过。', '听水声，要变。', '压住这口气。',
      '潮眼开了，绕。', '别跟潮较劲。', '我数三下，一起收。', '把缆绳给我。',
    ],
  };
  // 专属词条：只属于某个固定角色，随机旅人永远抽不到（以后新写专属技能也登记到这里）
  const EXCLUSIVE_TRAITS = ['独断', '实力', '胎里素宇宙', '兴趣'];
  const RECRUIT_GEN = {
    startCandidates: 6,      // 开局限亮几个
    weeklyMin: 2,            // 每周至少补几个
    weeklyMax: 3,            // 每周最多补几个
    tierByRep: [
      { min: 0, w: { rookie: 0.75, pro: 0.22, elite: 0.03 } },
      { min: 10, w: { rookie: 0.45, pro: 0.45, elite: 0.10 } },
      { min: 18, w: { rookie: 0.25, pro: 0.45, elite: 0.30 } },
    ],
    // 酒馆等级：把概率从新人挪向熟练 / 尖子
    tierLuckByLevel: [
      { pro: 0, elite: 0 },
      { pro: 0.10, elite: 0.05 },
      { pro: 0.18, elite: 0.12 },
    ],
    price: { rookie: [28, 45], pro: [100, 150], elite: [220, 260] },
    rep: { rookie: [0, 6], pro: [8, 15], elite: [17, 22] },
  };

  /* 任务隐藏风险：只有买情报才看得见；出发时真正生效 */
  const TASK_RISKS = [
    { id: 'headwind', name: '逆风', desc: '起手时间 −20：路上明显更赶。', mods: { time: -20 } },
    { id: 'surge', name: '暗涌', desc: '起手潮位 +20：一开局就接近警戒线。', mods: { tide: 20 } },
    { id: 'sick', name: '带病上船', desc: '起手队伍状态 −20。', mods: { crew: -20 } },
    { id: 'darkcargo', name: '暗货', desc: '起手负载 +30：离超载线更近。', mods: { load: 30 } },
  ];

  /* ------------------------------------------------------------------
   * 六、道具（补丁铺；每趟最多带 3 张。来自《玩法设计》10.5）
   * price 是补丁铺的购买价（会真扣金币）。
   * ------------------------------------------------------------------ */
  const ITEMS = {
    tide_bomb: { id: 'tide_bomb', name: '压潮弹', price: 35, tier: '精良', tag: '强力', desc: '立刻 −15 潮位。', fx: { tide: -15 } },
    medkit:    { id: 'medkit',    name: '急救箱', price: 15, tier: '普通', tag: '普通', desc: '队伍状态 +15。', fx: { crew: 15 } },
    recorder:  { id: 'recorder',  name: '记录仪', price: 15, tier: '普通', tag: '特殊', desc: '证据 +1。', fx: { evidence: 1 } },
    telescope: { id: 'telescope', name: '望远镜', price: 20, tier: '普通', tag: '特殊', desc: '接下来 2 张牌显示真实数值。', fx: { reveal: 2 } },
    talisman:  { id: 'talisman',  name: '顺风符', price: 15, tier: '普通', tag: '普通', desc: '时间 +25。', fx: { time: 25 } },
    patchkit:  { id: 'patchkit',  name: '应急抢修', price: 30, tier: '精良', tag: '强力', desc: '挡下下一张牌的全部负面效果。', fx: { shield: 1 } },
    net:       { id: 'net',       name: '打捞巨网', price: 40, tier: '稀有', tag: '强力', desc: '负载 +40。', fx: { load: 40 } },
    booster:   { id: 'booster',   name: '加速器',   price: 30, tier: '精良', tag: '特殊', desc: '时间 +40，但潮位 +10。', fx: { time: 40, tide: 10 } },
    whistle:   { id: 'whistle',   name: '保命哨',   price: 45, tier: '稀有', tag: '强力', desc: '队伍状态 +30。', fx: { crew: 30 } },
    tidetable: { id: 'tidetable', name: '潮汐表',   price: 25, tier: '精良', tag: '特殊', desc: '接下来 3 张牌显示真实数值。', fx: { reveal: 3 } },
    oldmap:    { id: 'oldmap',    name: '旧航图',   price: 35, tier: '精良', tag: '特殊', desc: '接下来 4 张牌显示真实数值。', fx: { reveal: 4 } },
    rope:      { id: 'rope',      name: '缆绳',     price: 20, tier: '普通', tag: '普通', desc: '负载 +20，时间 −5。', fx: { load: 20, time: -5 } },
    ration:    { id: 'ration',    name: '干粮',     price: 15, tier: '普通', tag: '普通', desc: '时间 +15，队伍状态 +5。', fx: { time: 15, crew: 5 } },
    pump:      { id: 'pump',      name: '抽水泵',   price: 30, tier: '精良', tag: '强力', desc: '潮位 −10，时间 −5。', fx: { tide: -10, time: -5 } },
    lantern:   { id: 'lantern',   name: '风灯',     price: 20, tier: '普通', tag: '特殊', desc: '证据 +1，时间 −5。', fx: { evidence: 1, time: -5 } },
    ledger:    { id: 'ledger',    name: '人情簿',   price: 25, tier: '精良', tag: '特殊', desc: '口碑 +2。', fx: { reputation: 2 } },
  };
  const SHOP_ITEMS = ['tide_bomb', 'medkit', 'recorder', 'telescope', 'tidetable', 'oldmap', 'talisman', 'patchkit', 'net', 'booster', 'whistle', 'rope', 'ration', 'pump', 'lantern', 'ledger'];
  // 补丁铺等级：货架偏向更高级的道具
  const ITEM_TIER_WEIGHTS = [
    { min: 0, w: { 普通: 0.55, 精良: 0.35, 稀有: 0.10 } },
    { min: 1, w: { 普通: 0.40, 精良: 0.42, 稀有: 0.18 } },
    { min: 2, w: { 普通: 0.25, 精良: 0.45, 稀有: 0.30 } },
  ];

  /* ------------------------------------------------------------------
   * 七、情报三档（免费 / 花金币 / 花金币+口碑）
   * 情报差 → 出勤中约 20% 的选项数值是假的，选了才发现
   * ------------------------------------------------------------------ */
  const INTEL = [
    { level: 0, name: '街坊传话（免费）', cost: null, desc: '选项数值看个大概，可能有假；不标注风险。' },
    { level: 1, name: '花 15 金币买准信', cost: { gold: 15 }, desc: '出勤中选项数值可信。' },
    { level: 2, name: '再托 10 口碑的人情', cost: { gold: 15, reputation: 10 }, desc: '数值可信，并提前标出高风险选项。' },
  ];

  /* ------------------------------------------------------------------
   * 八、评级（总分 ÷ 标准分）与信用倍率（数值表 3.1 / 3.2）
   * ------------------------------------------------------------------ */
  const RATING = [
    { key: 'S', min: 1.00, text: '达到标准' },
    { key: 'A', min: 0.90, text: '接近标准' },
    { key: 'B', min: 0.80, text: '表现不错' },
    { key: 'C', min: 0.70, text: '尚可' },
    { key: 'D', min: 0.60, text: '勉强过线' },
    { key: 'F', min: 0.00, text: '未达标' },
  ];
  const RATING_CREDIT = { S: 1.4, A: 1.25, B: 1.1, C: 0.95, D: 0.8, F: 0.6 };

  /* ------------------------------------------------------------------
   * 八之二、其他战队（积分赛 / 信用榜 / 抢单显示）
   * 玩家用信用当积分；其他战队每周自动涨分。
   * ------------------------------------------------------------------ */
  const RIVALS = [
    { id: 'anchor', name: '铁锚帮', icon: '⚓', color: '#4a6fa5' },
    { id: 'gull', name: '海鸥社', icon: '🕊', color: '#6b8e23' },
    { id: 'salted', name: '咸鱼队', icon: '🐟', color: '#c07a4a' },
    { id: 'merchant', name: '潮汐商会', icon: '🏛', color: '#8a6d3b' },
    { id: 'night', name: '夜航团', icon: '🌙', color: '#5b4a8a' },
  ];

  /* 信用赛名次奖励：下季预算 / 初始口碑 / 休赛期额外升级名额 */
  const RANK_REWARDS = [
    { rank: 1, gold: 40, rep: 6, upgrade: 1, title: '信用赛冠军' },
    { rank: 2, gold: 25, rep: 4, upgrade: 0, title: '信用赛亚军' },
    { rank: 3, gold: 15, rep: 2, upgrade: 0, title: '信用赛季军' },
    { rank: 4, gold: 8, rep: 1, upgrade: 0, title: '' },
    { rank: 5, gold: 4, rep: 0, upgrade: 0, title: '' },
    { rank: 6, gold: 0, rep: 0, upgrade: 0, title: '' },
  ];

  /* ------------------------------------------------------------------
   * 八之三、序章（报纸文游，逐句播放）
   * portrait 为 null 表示旁白；对话行按顺序点一下出一句。
   * ------------------------------------------------------------------ */
  const PROLOGUE = {
    scene1: {
      title: '紧急堵口',
      place: '迷途旅行社 · 冷清的下午',
      roleOf: { 老板: '迷途旅行社', 街坊: '大壶街街坊', 旁白: '画外音' },
      lines: [
        { who: '旁白', portrait: null, text: '柜台后，老板正打着瞌睡。门被推开，街坊带着一身潮气闯进来。' },
        { who: '街坊', portrait: '街坊', text: '三号潮口裂开了。' },
        { who: '老板', portrait: '老板', text: '整条堤都裂了？' },
        { who: '街坊', portrait: '街坊', text: '最薄的那一段。水已经进后街了。' },
        { who: '老板', portrait: '老板', text: '联盟的人呢？' },
        { who: '街坊', portrait: '街坊', text: '还在争谁该先派人。' },
        { who: '老板', portrait: '老板', text: '他们什么时候能争完？' },
        { who: '街坊', portrait: '街坊', text: '等水漫过门槛，大概就不争了。' },
        { who: '旁白', portrait: null, text: '老板望向墙上的旧照片。照片里的他年轻得多，身后是一条刚修好的堤岸。' },
        { who: '老板', portrait: '老板', text: '那次堵口，我也是天亮才回来的。' },
        { who: '街坊', portrait: '街坊', text: '你还记得怎么做。' },
        { who: '老板', portrait: '老板', text: '记得。就是这把老骨头不太听使唤了。' },
        { who: '街坊', portrait: '街坊', text: '那就叫上听得使唤的人。' },
        { who: '旁白', portrait: null, text: '窗外传来酒馆的笑声。老板听了片刻，终于站起身。' },
        { who: '老板', portrait: '老板', text: '阿飞他们还在酒馆？' },
        { who: '街坊', portrait: '街坊', text: '我刚从那儿过，灯还亮着。' },
        { who: '旁白', portrait: null, text: '老板披上外套，潮声顺着门缝涌进来。' },
        { who: '老板', portrait: '老板', text: '走吧。先把人叫齐。' },
      ],
    },
    scene2: {
      title: '找人手',
      place: '巡回酒馆 · 人声嘈杂',
      roleOf: { 掌柜: '巡回酒馆', 老板: '迷途旅行社', 阿飞: '老朋友', 潮婆: '老朋友', 旁白: '画外音' },
      lines: [
        { who: '旁白', portrait: null, text: '酒馆里蒸汽、鱼腥味和算盘声混在一起。' },
        { who: '掌柜', portrait: '掌柜', text: '哟，终于想起我了？' },
        { who: '老板', portrait: '老板', text: '三号潮口出事了。我想请几位老朋友帮个忙。' },
        { who: '旁白', portrait: null, text: '阿飞本来已经摸到门边，听见“老朋友”又退了回来。' },
        { who: '阿飞', portrait: '阿飞', text: '我只是回来拿伞。顺路而已。' },
        { who: '潮婆', portrait: '潮婆', text: '你的伞在船上。' },
        { who: '旁白', portrait: null, text: '小满收好药包，阿锚把最后一口汤喝完。没人说要去，几个人却都站了起来。' },
        { who: '老板', portrait: '老板', text: '那就走吧。老规矩，回来再算账。' },
      ],
    },
    scene3: {
      title: '临行之前',
      place: '补丁铺 · 柜台落灰',
      roleOf: { 修理工: '补丁铺', 老板: '迷途旅行社', 旁白: '画外音' },
      lines: [
        { who: '旁白', portrait: null, text: '经过补丁铺时，修理工正蹲在门口补一只漏水的木桶。' },
        { who: '修理工', portrait: '修理工', text: '又要出门？' },
        { who: '老板', portrait: '老板', text: '就去看看，不会太久。' },
        { who: '修理工', portrait: '修理工', text: '你每次都这么说。' },
        { who: '旁白', portrait: null, text: '他没有再问，只把一卷防水布塞进船长怀里。' },
        { who: '修理工', portrait: '修理工', text: '先把船底那道缝堵上。其他的，活着回来再说。' },
      ],
    },
    scene4: {
      title: '出航',
      place: '码头 · 漏勺号',
      roleOf: { 船长: '漏勺号', 老板: '迷途旅行社', 旁白: '画外音' },
      lines: [
        { who: '旁白', portrait: null, text: '码头，漏勺号在浪里晃。' },
        { who: '船长', portrait: '船长', text: '这破船能行！' },
        { who: '旁白', portrait: null, text: '老板看了眼船帮上的洞。' },
        { who: '老板', portrait: '老板', text: '……能行。' },
        { who: '旁白', portrait: null, text: '几个人挤上船。老板站在船头，潮声里传来街坊的呼喊。' },
        { who: '老板', portrait: '老板', text: '到了那边听我指挥。遇上岔路，再一起想办法。' },
        { who: '船长', portrait: '船长', text: '都坐稳了——漏勺号，出发！' },
      ],
    },
    scene6: {
      title: '结盟',
      place: '巡回酒馆 · 入夜',
      roleOf: { 老板: '迷途旅行社', 阿飞: '斥候', 潮婆: '镇潮手', 小满: '医士', 阿锚: '搬运', 旁白: '画外音' },
      lines: [
        { who: '旁白', portrait: null, text: '回到酒馆，五个人带着一身泥坐下来。' },
        { who: '阿飞', portrait: '阿飞', text: '你情报不准。' },
        { who: '潮婆', portrait: '潮婆', text: '你船差点沉了。' },
        { who: '小满', portrait: '小满', text: '你逞什么强。' },
        { who: '阿锚', portrait: '阿锚', text: '下次还去吗？' },
        { who: '老板', portrait: '老板', text: '咱们别各自为战了，组个联合组织。' },
        { who: '旁白', portrait: null, text: '四个人谁都不服谁。' },
        { who: '老板', portrait: '老板', text: '可谁来管这摊子？' },
        { who: '旁白', portrait: null, text: '他们齐刷刷看向门外。' },
        { who: '阿飞', portrait: '阿飞', text: '找个外人吧。最好不怕潮，也不怕我们。' },
      ],
    },
    order: ['scene1', 'scene2', 'scene3', 'scene4', 'scene5', 'scene6'],
  };

  /* 序章教学局：10 张牌，无硬失败、无证据门（cfg.tutorial） */
  const PROLOGUE_TASK = {
    id: 'prologue',
    name: '紧急堵口',
    tagline: '序章 · 教学局',
    standard: 60,
    evidence: 0,
    cardCount: 10,
    deck: { route: 2, tide: 3, rescue: 2, danger: 2, misc: 1 },
    weights: [35, 35, 15, 15],
    color: '#8f2f2f',
  };

  /* ------------------------------------------------------------------
   * 壶潮季邮袋：条件达成后寄到的一封封短信
   * condition.kind: season / tasksAccepted / rests / runs / travelerRuns
   * ------------------------------------------------------------------ */
  const STORY_MAILS = [
    {
      id: 'mail_boss_season1',
      from: '老板',
      title: '第一季的账',
      summary: '第一季结束了。老板没回来，只寄来一封信。',
      condition: { kind: 'season', gte: 1 },
      lines: [
        { who: '老板', text: '听说你们把第一季撑下来了。' },
        { who: '老板', text: '我走的时候，那五个孩子连潮位表都看不懂。现在应该能自己排班了吧。' },
        { who: '老板', text: '别急着把出勤局做大。先把人留住。人散了，牌子再亮也没用。' },
        { who: '旁白', text: '信纸背面还有一行小字：缺钱的话，别来找我。' },
      ],
    },
    {
      id: 'mail_guild_tasks10',
      from: '联盟账房',
      title: '你们被记了一笔',
      summary: '联盟账房第一次主动来信。',
      condition: { kind: 'tasksAccepted', gte: 10 },
      lines: [
        { who: '联盟账房', text: '出勤局，十张单子了。' },
        { who: '联盟账房', text: '按规矩，能稳定接单的队伍可以进联盟的正式名册。' },
        { who: '联盟账房', text: '不过名册上的名字，是要拿去给街坊看的。别写得太大。' },
      ],
    },
    {
      id: 'mail_tavern_rests5',
      from: '酒馆掌柜',
      title: '别把年轻人用坏',
      summary: '掌柜看着你们的人一次次被抬回来，终于写信了。',
      condition: { kind: 'rests', gte: 5 },
      lines: [
        { who: '掌柜', text: '你们出勤局的人，最近来我这儿休整得有点勤。' },
        { who: '掌柜', text: '能跑是好事，但人不是船板，裂了不能拿钉子敲回去。' },
        { who: '掌柜', text: '下回再全员带伤回来，我就把后院的床加价。' },
      ],
    },
    {
      id: 'mail_zhaoyuan_runs3',
      from: '昭缘',
      title: '手上有茧',
      summary: '昭缘在出勤记录背面留了几行字。',
      condition: { kind: 'travelerRuns', name: '昭缘', gte: 3 },
      lines: [
        { who: '昭缘', text: '经理，我手上的茧比刚来的时候厚了。' },
        { who: '昭缘', text: '以前搬货，只知道往肩上放。现在会先看潮位、看时间，再决定先搬哪一箱。' },
        { who: '昭缘', text: '……下次能不能让我挑一次人？我也想试试安排别人。' },
      ],
    },
    {
      id: 'mail_dogs_runs3',
      from: '大狗 / 小狗',
      title: '汪。',
      summary: '一封字迹非常潦草的信。',
      condition: { kind: 'travelerRuns', name: '大狗', gte: 3 },
      lines: [
        { who: '大狗', text: '汪！' },
        { who: '小狗', text: '哥的意思是：我们跑了三趟，没给你丢人。' },
        { who: '大狗', text: '汪汪！' },
        { who: '小狗', text: '他说下次想加薪。' },
      ],
    },
  ];

  /* ------------------------------------------------------------------
   * 九、经理层（周循环骨架 v0.2）
   * 一季 8 周；每周 3 格出勤；开局 0 人自己招；委派 4 档；疲劳/周薪。
   * 数字来源：《数值表初稿》二、三、四、五、七；缺的地方按文档原则补。
   * ------------------------------------------------------------------ */
  const CAMPAIGN = {
    seasonWeeks: 8,          // 一季几周（数值表建议 9—12，原型先用 8 方便验证）
    slotsPerWeek: 3,         // 每周 0—3 格出勤（漏勺号 Lv2 +1）
    itemsPerRun: 3,          // 每趟最多带几件道具（漏勺号 Lv1 +1）
    startGold: 320,          // 开局金币（够买 5 个新人 + 道具/休整）
    startCredit: 0,
    startReputation: 10,
    // 难度递增：每季任务标准分 +3%，报酬 +5%
    difficultyPerSeason: 0.03,
  costPerSeason: 0.02,       // 每季成本膨胀（道具 / 招募 / 休整 / 训练 / 出勤开销）
    rewardPerSeason: 0.05,
    // 口碑：声望进度条（招募只看门槛，不扣口碑）
    repPerRun: 1,            // 每完成一趟 +1
    repByRating: { S: 2, A: 1, B: 0, C: 0, D: 0 }, // 评级额外加
    repPerDelegation: 2,     // 完成委派额外 +2
    repCarryRate: 0.5,
    creditCarryRate: 0.5,   // 信用跨季保留一半
    restCost: 25,            // 酒馆休整一次的花费
    restRecover: 45,         // 酒馆休整恢复多少疲劳
    fatiguePerRun: 30,       // 每次出勤，上场的人疲劳 +30
    fatiguePenalty: 0.5,     // 起手队伍状态惩罚 = 平均疲劳 × 0.5（最多 50）
    fatiguePenaltyMax: 50,
    weeklyFatigueRecover: 12,// 每周自然恢复（v0.6 起不再乘酒馆状态系数）
    boardPerWeek: 3,         // 自选任务栏每周新挂几张（补货）
    boardCap: 4,             // 任务栏最多同时挂几张（旅行社 Lv1 6 / Lv2 8）
  taskIntelCost: 15,       // 旅行社单张任务的情报价：看真实权重 + 隐藏风险
    storeMaxLevel: 2,        // 每家店最高 2 级
    offseasonUpgradeMax: 2,  // 每个休赛期最多升几级
    trainingCost: 40,        // 休赛期训练：金币
    trainingGrowth: 6,       // 休赛期训练：成长点
    trainingMax: 2,          // 每个休赛期最多训练几次
    delegationMax: 2,        // 同时最多几张委派
    delegationWeeks: 3,      // 委派时限（周）
    delegationWeights: [15, 30, 25, 25],
    delegationDeck: { route: 1, tide: 2, rescue: 2, misc: 2, weird: 1, rest: 2 },
    delegationTiers: [
      { tier: 1, name: '一档 · 跑腿委派', gold: 50, credit: 15, standard: 70, evidence: 1, desc: '联盟派的轻松活，适合练手。' },
      { tier: 2, name: '二档 · 常规委派', gold: 75, credit: 22, standard: 73, evidence: 2, desc: '常规委派，跑一趟就算数。' },
      { tier: 3, name: '三档 · 重点委派', gold: 105, credit: 30, standard: 75, evidence: 2, desc: '联盟点名的重点活，评级要求高。' },
      { tier: 4, name: '四档 · 要命委派', gold: 140, credit: 38, standard: 76, evidence: 3, desc: '要命的活。能接就有话说。' },
    ],
      // 四店（只作为界面入口；v0.6 起没有"维护度/服务打折"了）
    stores: [
      { id: 'agency', name: '迷途旅行社', icon: '🧾', use: '情报', desc: '接委派 / 自选任务，出发前买情报。' },
      { id: 'tavern', name: '巡回酒馆', icon: '🍺', use: '恢复', desc: '看队伍疲劳、花钱休整、招募新人。' },
      { id: 'patch', name: '补丁铺', icon: '🔧', use: '道具', desc: '买道具、回收道具、给旅人加词条/洗练。' },
      { id: 'boat', name: '漏勺号', icon: '⛵', use: '船', desc: '安排出勤，挑人、带道具。' },
    ],
    // 违约罚
    breachCredit: 10,
    // 出勤的边际成本与报酬（数值表未定，原型先补——否则"多做"没有代价）
    runCost: 4,             // 每次出勤的补给/损耗开销
    goldMultByRating: { S: 1.25, A: 1.15, B: 1.05, C: 0.9, D: 0.7, F: 0.5 }, // 评级影响报酬
    bankruptCredit: 10,     // 周结时金币为负：信用扣多少
    // 主动撤退的额外代价（挑战舰的账）
    retreatCreditPenalty: 3,   // 撤退出勤扣多少信用
    retreatGoldPenalty: 40,    // 撤退出勤扣多少金币

    // ---- v0.4 养成与人员管理 ----
    growthTraitCosts: [0, 9, 18, 24], // 加第 2/3/4 个词条分别要 9/18/24 成长点（词条越多越贵）
    rerollCost: { gold: 30, growth: 10 }, // 洗练：30 金 + 10 成长点，三选一换词条
    transferValue: { base: 15, perTrait: 10, perGrowth: 5 }, // 身价 = base + 词条数×perTrait + 成长点×perGrowth（新人卖价低于买入价，防套利）
    raiseEveryWeeks: 4,        // 每 4 周有人要求涨薪
    raisePerTrait: 2,          // 涨薪幅度 = 词条数 × 2 金/周（老人要得多、新人少）
    transferWarningWeeks: 3,   // 连续 3 周没上场 → 想转会
    transferPendingWeeks: 2,   // 转会决定最多挂 2 周，不处理就自己走
    keepCost: { gold: 30, reputation: 5 }, // 挽留一个想走的人

    // ---- 四店窗口系统（v0.3）----
    rosterCap: 8,           // 队伍池上限（文档 8—10）
    backpackSlots: 36,      // 背包格数
    inventoryStart: { tide_bomb: 1, medkit: 2, recorder: 1, talisman: 1 }, // 开局道具
    tutorialItems: ['medkit', 'talisman', 'tide_bomb'], // 第一季第四、五周开放的基础仪表道具
    shopPerWeek: 12,        // 补丁铺每周上架几张（v0.6.2 起 12 格）
    sellRate: 0.4,          // 回收价 = 买入价 × 0.4
    recruitMax: 8,          // 酒馆同时最多几个候选人（开局 6 个，之后每周补 2—3 个）
    recruitWeeks: 2,        // 候选人待几周
    releaseReputation: 2,   // 解雇扣的口碑
    // 每个旅人的招募价写在 RECRUITS 里（price / repReq）
  };

  /* ------------------------------------------------------------------
   * 十、文字表
   * ------------------------------------------------------------------ */
  const CAT_NAMES = {
    route: '路线', tide: '潮位', rescue: '救援', danger: '危险', misc: '现场', weird: '奇怪', deliver: '交付', rest: '顺路',
  };

  const EFFECT_NAMES = {
    time: '时间', tide: '潮位', crew: '状态', load: '负载',
    evidence: '证据', gold: '金币', credit: '信用', reputation: '口碑',
  };

  const RATING_FLAVOR = {
    S: '这趟出勤达到委托标准，联盟账房认可了你们的表现。',
    A: '漂亮。离委托标准只差一点，队伍的配合已经有模有样。',
    B: '表现不错。关键选择都照顾到了，继续保持。',
    C: '还算顺利，离委托标准还有一段。',
    D: '勉强过线。复盘一下哪根仪表掉得最多。',
    F: '这趟表现没达到最低要求。看看结算单，找出最拖后腿的部分。',
  };

  /* ------------------------------------------------------------------
   * 九、全局平衡旋钮（v0.3.5）
   * 一局 15 张牌，所以卡片的时间成本整体缩到 0.85 倍才能撑完；
   * 负载幅度缩到 0.75 倍，避免"大开大合、一下超载"。
   * ------------------------------------------------------------------ */
  const BALANCE = {
    defaultCardCount: 15,   // 每局抽多少张牌（任务可以单独覆盖 cardCount）
    cardTimeScale: 0.85,    // 卡片时间消耗倍率（界面显示的就是缩放后的数）
    cardLoadScale: 0.75,    // 卡片负载增减倍率
  };
  // 四根仪表的"权重维度"名字（用于"主攻/次攻"提示，不给精确百分比）
  const TASK_DIMS = ['时效', '治潮', '损伤', '救援'];

  /* 四维统一语言：任务/职业/表盘/结算都用同一套名字和图标 */
  const DIM_ORDER = ['time', 'tide', 'crew', 'load'];
  const DIM_META = {
    time: { key: 'time', name: '时效', gauge: '时间', role: '斥候', icon: '⏳', color: '#c58a3a' },
    tide: { key: 'tide', name: '治潮', gauge: '潮位', role: '镇潮手', icon: '🌊', color: '#3b7d8f' },
    crew: { key: 'crew', name: '损伤', gauge: '队伍状态', role: '医士', icon: '💪', color: '#b3452f' },
    load: { key: 'load', name: '救援', gauge: '负载', role: '搬运', icon: '🎒', color: '#6b4a8f' },
  };

  /* 玩家可见的更新日志：只写能感知到的变化；每次发版在最上面加一条 */
  const CHANGELOG = [
    { version: 'v0.23.0', title: '漏勺号一站式出发', notes: ['取消独立上船准备页；漏勺号主页上半部选 5 人和道具，分隔线下直接选任务出发。'] },
    { version: 'v0.22.1', title: '多趟任务恢复跨周', notes: ['救援/核心等多趟任务不再要求本周凑够全部出勤格；只要本周还有一格就能接，剩下的在时限内跨周完成。'] },
    { version: 'v0.22.0', title: '壶潮季邮袋', notes: ['达成季度、接单、休整或队员出勤条件后，壶潮季会收到一封信；点开是分段对话，读过后标记已读。先放入 5 封示例信。'] },
    { version: 'v0.21.2', title: '移除测试入口', notes: ['删除标题页的「测试：第 8 周」按钮及其测试状态。'] },
    { version: 'v0.21.1', title: '修复玩法说明不弹出', notes: ['重写玩法介绍时漏掉了弹窗外壳，导致点「详情看玩法介绍」没有反应；已补回遮罩和关闭按钮。'] },
    { version: 'v0.21.0', title: '第二季简讯与玩法介绍重写', notes: ['第二季第一周加四店简讯和「详情看玩法介绍」入口；第二周说明高危核心并收尾引导。玩法介绍按当前版本重写。'] },
    { version: 'v0.20.0', title: '第二季全量开放', notes: ['第二季第一周直接开放完整任务池、补丁铺和酒馆；高危核心从第二周起出现。第一季第七周起对手开始抢单；委派区移到基础委托上方。'] },
    { version: 'v0.19.1', title: '休赛期成长不限次数', notes: ['消耗成长点的人物成长不限次数，受成长点和词条上限限制；花金币的训练仍最多 2 次。'] },
    { version: 'v0.19.0', title: '第八周上限与休赛期成长', notes: ['第八周 4 格出勤、4 张基础委托；酒馆队伍上限 +2、候选 6；补丁铺每趟可带 2 件。休赛期开放人物成长，消耗整季成长点加词条。'] },
    { version: 'v0.18.0', title: '第七周：天气与赛季榜', notes: ['第七周开放天气与壶潮季；本周天气不会是平潮，之后随机。教学酒馆、补丁铺和基础委托延续到第八周。'] },
    { version: 'v0.17.1', title: '多趟委托与上周回档', notes: ['周 2—6 的救援委托恢复 2 次出勤；第六周基础委托继续显示任务风向并开放情报；任务卡显示每趟/总报酬。测试用的「上一周」按钮可回到上一周周初。'] },
    { version: 'v0.17.0', title: '第六周：委派与情报', notes: ['第六周开放联盟委派和任务情报；前六周天气固定平潮；路线/载重/战术从玩家界面移除，出勤使用默认配置。'] },
    { version: 'v0.16.19', title: '评级门槛放宽与巡线校准', notes: ['评级调整为 F/D/C/B/A/S 六档，S 从达成标准起评；常规巡线标准分由 78 调至 75。委派只有 F 不通过。'] },
    { version: 'v0.16.18', title: '保留自由散单随机权重', notes: ['自由散单继续按每趟随机权重结算；第五周提示该单权重不固定，并在结算单查看实际分布。'] },
    { version: 'v0.16.17', title: '疲劳从第三周开始累积', notes: ['第一、二周的出勤不再悄悄累积疲劳；旧存档首次载入时会扣回这部分隐性疲劳，第三周教学从更公平的状态开始。'] },
    { version: 'v0.16.16', title: '第四周补给与第五周成绩单引导', notes: ['第四周开放三种基础道具的购买、携带与使用；第五周刊出职业、仪表与评级对照说明。'] },
    { version: 'v0.16.15', title: '修复提前撤退结算页', notes: ['修复主动撤退后结果页引用未定义变量导致的渲染异常；信用罚款按本趟结算后的实际扣除额记录。'] },

    { version: 'v0.16.14', title: '撤退卡住时显示诊断信息', notes: ['撤退按钮会在处理失败时把实际状态或异常显示在弹窗内；Esc 改为优先捕获，便于确认页面是否仍在响应。'] },
    { version: 'v0.16.13', title: '撤退按钮改为直接绑定', notes: ['继续出勤与确认撤退按钮直接绑定处理函数，绕过全局事件分发；打开确认时清除局内教学遮罩，并更新资源版本参数。'] },
    { version: 'v0.16.12', title: '撤退弹窗强制清除教学遮罩', notes: ['打开撤退确认时立即清除局内教学遮罩，并将弹窗置于最高交互层级；本地脚本与样式增加版本参数，避免读取旧缓存。'] },
    { version: 'v0.16.11', title: '修复撤退确认按钮被遮罩拦截', notes: ['弹窗层级调整到教学遮罩之上，并确保序章教学状态不会残留到经理层出勤；撤退提示按当前信用余额显示实际扣除额。'] },
    { version: 'v0.16.10', title: '补充口碑说明', notes: ['悬停顶部口碑数值，可查看获取途径、招募与情报用途、队员挽留消耗及跨季规则。'] },
    { version: 'v0.16.9', title: '酒馆显示全队周薪', notes: ['第三周酒馆队伍摘要将口碑数替换为全队周薪合计。'] },
    { version: 'v0.16.8', title: '提高职业标签对比并恢复成员台词', notes: ['职业标签改为浅纸底深色字，并保留职业色边框，改善识读；第三周及精简版酒馆的已入队队员卡恢复人物台词。'] },
    { version: 'v0.16.7', title: '队员词条从第一周起生效', notes: ['第一、二周固定队伍的词条也会正常影响出勤；上船准备页可查看固定队员的词条与说明。第三周酒馆的现有队员卡片也会显示词条标签，悬停可看效果。'] },
    { version: 'v0.16.6', title: '第三周开放招募与休整', notes: ['第三周开放酒馆招募、队伍轮换和每周一次的全队休整；酒馆候选人沿用随机生成与稀有度机制，并保证至少有两名当前可负担的新手候选人。第三周增加第三格出勤和基础委托，疲劳开始影响出勤，招募队员的词条也会生效；其他经营业务与复杂配置继续封存。'] },
    { version: 'v0.16.5', title: '明确跳过序章后的起点', notes: ['开始新游戏时可跳过剧情序章，直接从第一季第一周开始；第一周的经营与出勤引导仍保留。'] },
    { version: 'v0.16.4', title: '第二周开放基础委托', notes: ['旅行社提供三份单次出勤基础委托，显示不同周限；本周可接单数与两格出勤相同。情报、证据门槛、风险提示和其他店铺继续封存。'] },
    { version: 'v0.16.3', title: '按周逐步开放出勤格', notes: ['第一季第一周开放 1 格、第二周开放 2 格，第三周起恢复每周 3 格；旧存档载入时按当前周数限制剩余出勤格。'] },
    { version: 'v0.16.2', title: '清理旧版经理层教程', notes: ['彻底移除旧经理层信息卡与疲劳提示状态，第二周及后续不再弹出旧教程；序章局内教学保留。'] },
    { version: 'v0.16.1', title: '第一周细节打磨', notes: ['未开放区域改用报纸式封存样式；第一周固定队伍改用 13 名 NPC 中的五名新人；完成首趟后可直接结束第一周；提前撤退改为清晰的确认框。'] },
    { version: 'v0.16.0', title: '第一周经理层重做', notes: ['移除旧的经理层强制教程；第一周由阿锚等五名老队员固定出勤，旅行社只提供一份无证据门槛、无隐藏风险的紧急任务，准备页自动安排队伍并隐藏进阶配置。'] },
    { version: 'v0.15.3', title: '序章聚焦剧情与局内教学', notes: ['序章保留逐句对话、翻页和教学出勤框架；移除经营界面预览与选人/买道具/出发配置，教学局只讲二选一和四根仪表。'] },
    { version: 'v0.15.2', title: '精简版保留小队/背包/准备界面', notes: ['第一周精简版保留完整小队名单、背包道具和出航准备页；只开放选人和选道具，路线/载重/战术、委派、情报、成长、壶潮季用黄灰记号笔盖住。'] },
    { version: 'v0.15.1', title: '精简版保留完整 UI', notes: ['第一周精简版不再删界面：小队、背包、出航准备都完整可见；未开放的委派/情报/路线/战术/成长/壶潮季用黄灰记号笔盖住。'] },
    { version: 'v0.15.0', title: '第一周精简版', notes: ['独立出「第一周精简版」：只开接单、招人、买道具、出发；委派/情报/路线规划/人物成长/壶潮季全部隐藏，出发自动配队。'] },
    { version: 'v0.14.1', title: '发布版与美术目录', notes: ['新增可分享的「大壶街出勤局」文件夹、assets 素材目录，以及美术与分享指南。'] },
    { version: 'v0.14.0', title: '跨季状态拆成 profile', notes: ['信息卡、一次性提示、生涯、委派档位移入 profile，换季整块保留；以后加新状态不会因换季丢失。'] },
    { version: 'v0.13.4', title: '后续赛季不再重复旧信息卡', notes: ['换季只把第一季基础卡标记已看；第二季膨胀卡只在第二季出现。'] },
    { version: 'v0.13.3', title: '第二季不再弹第一季信息卡', notes: ['换季时清掉残留的旧卡片，第二季只保留「第二季变了什么」。'] },
    { version: 'v0.13.2', title: '新赛季不再重复旧信息卡', notes: ['已看过的信息卡记录改为跨季保留。'] },
    { version: 'v0.13.1', title: '休赛期与第二季信息卡', notes: ['第一次进休赛期讲升级/训练；第一次进第二季讲评分、报酬、成本、对手和高危核心膨胀。'] },
    { version: 'v0.13.0', title: '四维教学与信息卡', notes: ['任务/职业/表盘/结算统一成时效-治潮-损伤-救援四维；首次进店用信息卡讲系统。'] },
    { version: 'v0.12.2', title: '教学高亮选择区而不是单按钮', notes: ['接单/招募/买道具/出发改为高亮整块选择区域，文案教怎么比较风向、词条、周薪、道具类型和任务。'] },
    { version: 'v0.12.1', title: '教学不强迫连打三把', notes: ['第一章教学只到第一趟出勤结束；第二趟后若疲劳高，会弹一次酒馆休整提示，不强制操作。'] },
    { version: 'v0.12.0', title: '第一章教学重写', notes: ['删掉旧步骤表/确认推进逻辑，改成独立状态机：动作步骤只认真实操作，信息步骤才用「确认」，高亮目标直接指向页面元素。'] },
    { version: 'v0.11.11', title: '教学只认真实操作', notes: ['动作步骤不再显示「确认」，必须完成高亮操作才推进；只有看一眼的信息步骤才用「确认」结束。'] },
    { version: 'v0.11.10', title: '修复教学高亮定位', notes: ['动态目标返回的选择器没有被解析成页面元素，导致高亮框和弹窗定位失效；现在按“函数→选择器→元素”正确解析。'] },
    { version: 'v0.11.9', title: '教学改为单步确认', notes: ['取消「跳过教学」；改成每步「确认」，只推进当前一步，下一步仍会出现。'] },
    { version: 'v0.11.8', title: '教学高亮改到可点的地方', notes: ['第一次出勤后不再高亮出勤格仪表；有单就高亮「出发」，没单就高亮旅行社/漏勺号页签，不会再卡在没有按钮的位置。'] },
    { version: 'v0.11.7', title: '成本膨胀与完整膨胀表', notes: ['道具/招募/休整/训练/出勤/周薪每季成本 ×1.02；壶潮季页补上成本指数、对手每周涨分、高危核心概率。'] },
    { version: 'v0.11.6', title: '纸幕过渡绑定屏幕切换', notes: ['大地图/局内/结算/休赛期等屏幕切换自动加纸幕，不再每个动作单独写；壶潮季页标出本季评分、报酬和对手起分膨胀。'] },
    { version: 'v0.11.5', title: '第 8 周测试入口', notes: ['标题页新增「测试：第 8 周」，带 800 金、250 信用、6 名旅人、四店考核已达标，可直接测季末结算、休赛期和第二季。'] },
    { version: 'v0.11.4', title: '开始游戏 / 继续游戏', notes: ['标题页改为「开始游戏」「继续游戏」；每次开始游戏都会先问要不要跳过序章与教程；移除旧的自动跳过规则。'] },
    { version: 'v0.11.3', title: '删光存档后重新走序章', notes: ['没有任何存档、也没有序章断点时，按全新玩家处理；不再用旧的“看过序章”标记直接跳过。'] },
    { version: 'v0.11.2', title: '更新日志补齐', notes: ['补齐 v0.10.23—v0.11.1 漏记；新增版本号/日志同步校验，忘记写日志会测试失败。'] },
    { version: 'v0.11.1', title: '教学不再催着结束本周', notes: ['第一次出勤后先高亮本周剩余出勤格，提醒可以继续出航；格子用完或确定不跑，才引导「结束本周」。'] },
    { version: 'v0.11.0', title: '开局入口整合', notes: ['「新的一季」统一入口：没看过序章先进序章；序章每段自动断点，刷新可从当前段继续；序章/教学完成状态独立于存档。'] },
    { version: 'v0.10.31', title: '标题页按钮统一大小', notes: ['「新的一季」「序章 · 开始」改为与「存档管理」同尺寸。'] },
    { version: 'v0.10.30', title: '标题页间距调整', notes: ['第一行按钮收拢居中，和第二行拉开上下间距。'] },
    { version: 'v0.10.29', title: '标题页改两行', notes: ['主操作一行：继续居中、新的一季居左、序章居右；存档/玩法/更新日志收进第二行；移除出勤层练习入口。'] },
    { version: 'v0.10.28', title: '标题页更新日志', notes: ['标题页「玩法说明」旁新增「更新日志」，可随时查看历史版本。'] },
    { version: 'v0.10.27', title: '治潮度改用实际起始潮位', notes: ['治潮度 = 50 + (实际起始潮位 − 最终潮位) × 1.5；天气/风险抬高起始潮位时，得分不会白送。'] },
    { version: 'v0.10.26', title: '任务隐藏风险更明显', notes: ['逆风 −20 时间、暗涌 +20 潮位、带病 −20 状态、暗货 +30 负载；买过情报后局内显示风险标签。'] },
    { version: 'v0.10.25', title: '任务隐藏风险生效', notes: ['每张任务带一种隐藏风险：逆风 / 暗涌 / 带病 / 暗货；买情报才看得到，出发时真正改起手仪表。'] },
    { version: 'v0.10.24', title: '情报标签换行修复', notes: ['「真实权重」「隐藏风险」不再被挤成两行。'] },
    { version: 'v0.10.23', title: '情报按钮位置调整', notes: ['任务卡上的「情报」按钮移到「接单」旁边。'] },
    { version: 'v0.10.22', title: '任务情报与准信降价', notes: ['旅行社任务卡可花 15 金看真实权重 + 隐藏风险；漏勺号准信降到 15 金。'] },
    { version: 'v0.10.19', title: '第一章经理层教学', notes: ['接单 → 招 5 人 → 买 2 件道具 → 出发 → 打完 → 结束本周 → 看壶潮季，六步聚光引导；可跳过。'] },
    { version: 'v0.10.15', title: '局内三步教学', notes: ['出勤前先讲四根仪表，再讲选项，再讲词条/道具；目标区域高亮，外面调暗。'] },
    { version: 'v0.10.13', title: '序章报纸翻页', notes: ['场景切换翻页 + 垫底报纸；句内逐字打字机，标题打完停一下再出正文。'] },
    { version: 'v0.10.0', title: '六段序章', notes: ['旅行社 → 酒馆 → 补丁铺 → 漏勺号 → 教学局 → 结盟；酒馆 6 选 5，补丁铺选 2 件道具。'] },
    { version: 'v0.9.1', title: '通关页', notes: ['四店满级 + 一次信用赛冠军 = 通关；显示生涯统计，可继续经营。'] },
    { version: 'v0.9.0', title: '信用赛名次奖励', notes: ['季末名次给下季预算、初始口碑；冠军多 1 个休赛期升级名额。'] },
    { version: 'v0.8.3', title: '壶潮季与统一叫法', notes: ['赛季 → 壶潮季、战队 → 小队、积分 → 信用；壶潮季成为第五个页面。'] },
    { version: 'v0.8.1', title: '其他小队与信用榜', notes: ['5 支小队每季重新入场；任务栏会出现已被接走的委托；第 2 季起有高危核心。'] },
    { version: 'v0.8.0', title: '四店考核与休赛期', notes: ['每季四店考核；达标后休赛期升级（最多 2 级），可花金币训练旅人。'] },
    { version: 'v0.7.1', title: '每周天气', notes: ['12 种天气 + 一周预报，影响起手仪表、报酬、疲劳、货架等。'] },
    { version: 'v0.6.9', title: '自动存档', notes: ['自动存档 + 3 个手动存档格；局内出勤中途不保存。'] },
    { version: 'v0.6.2', title: '开局自己招人', notes: ['开局 0 人，自己招够 5 人才能上船；招募看口碑门槛。'] },
    { version: 'v0.5', title: '潮位供给与证据', notes: ['潮位/证据成为任务目标；证据不足会扣分或驳回。'] },
    { version: 'v0.4', title: '养成与人员管理', notes: ['旅人词条、成长点、周薪、疲劳、转会/挽留。'] },
    { version: 'v0.3', title: '四店窗口与 15 张牌', notes: ['旅行社/酒馆/补丁铺/漏勺号四店；一局 15 张牌。'] },
    { version: 'v0.2', title: '周循环', notes: ['一季 8 周、每周 3 格出勤；结束本周结算。'] },
    { version: 'v0.1', title: '出勤层', notes: ['四根仪表、二选一卡牌、五项评分。'] },
  ];

  return {
    GAUGES, CARDS, TASKS, ROUTES, LOADS, TACTICS, WEATHERS, STORE_EXAMS, STORE_UPGRADES, TRAVELERS, RECRUITS,
    NAME_POOL, QUOTE_POOL, RECRUIT_GEN, EXCLUSIVE_TRAITS,
    ITEMS, SHOP_ITEMS, ITEM_TIER_WEIGHTS, INTEL, RATING, RATING_CREDIT, RIVALS, RANK_REWARDS, PROLOGUE, PROLOGUE_TASK, STORY_MAILS, TASK_RISKS,
    CAMPAIGN, TASK_DIMS, DIM_META, DIM_ORDER, BALANCE, TRAIT_POOL, CHANGELOG,
    CAT_NAMES, EFFECT_NAMES, RATING_FLAVOR,
  };
})();

if (typeof module !== 'undefined') module.exports = DATA;
