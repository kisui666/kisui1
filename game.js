/* ============================================================
 * 星际肉鸽战机 (Roguelike Shooter)
 * 纯 Canvas + JS,无依赖
 * ------------------------------------------------------------
 * 代码分区目录(按出现顺序,各分区以 【N】 横幅标记):
 *   【0】基础环境:file:// 检测、画布、屏幕震动、UI 引用、工具函数
 *   【1】数据持久化:剧情进度 Progress(CRC16 校验)、角色局外数据
 *        HeroGameData(localStorage "gameData_{heroId}":计数器/难度解锁)
 *   【2】游戏配置与状态:State 状态机、英雄/天赋/敌人/Boss 配置、
 *        难度系数 DIFFICULTY、波次配置 WAVES_PER_CYCLE/BOSS_WAVE_KEYS
 *   【3】实体系统:玩家、敌机生成 spawnEnemy、Boss 生成 makeBoss、
 *        BossAPI 标准技能接口、掉落物
 *   【4】波次系统:startWave、Wave HUD、波次推进与通关判定
 *   【5】经济与商店:金币结算 settleWaveRewards、商店 offerShop/购买、
 *        Boss 倒计时 startBossCountdown、通关 triggerVictory、
 *        结算面板 showOverPanel
 *   【6】局外成长:角色计数器动画 bumpHeroCounter、难度选择面板、
 *        元天赋占位面板 openMetaTalentPanel
 *   【7】战斗循环:update 主流程(连击/波次结束/Boss AI)、
 *        render 绘制、击杀/受击、升级面板 offerUpgrades
 *   【8】界面与启动:菜单/英雄选择/模式切换、按钮绑定、startGame、
 *        主循环 loop、异常安全网
 * 注意:为兼容 file:// 直接打开,采用单文件 IIFE 而非 ES6 模块;
 *       代码风格遵循根目录 .eslintrc.json(browser 环境)。
 * ============================================================ */

(() => {
"use strict";

// ===== file:// 协议检测:Chrome/Edge 下 file:// 会阻止图片/音频等本地资源加载 =====
if (location.protocol === "file:") {
    const warn = document.createElement("div");
    warn.style.cssText = [
        "position:fixed", "top:0", "left:0", "right:0", "z-index:99999",
        "background:linear-gradient(135deg,#ff6b35,#ff3b6b)", "color:#fff",
        "padding:12px 20px", "font-size:13px", "font-family:'Microsoft YaHei',sans-serif",
        "text-align:center", "box-shadow:0 4px 20px rgba(0,0,0,.3)",
        "cursor:pointer", "user-select:none", "line-height:1.6",
    ].join(";");
    warn.innerHTML = [
        "⚠ 检测到你用 <b>file://</b> 协议打开了页面",
        "Chrome/Edge 出于安全策略会禁止加载本地图片、音频和子资源,",
        "导致英雄头像不显示、音效不响或画面空白。",
        "<br>请改用 <b>本地服务器</b> 方式访问:在游戏目录执行 <code>python -m http.server 8765</code>,",
        "然后浏览器打开 <code>http://127.0.0.1:8765/games/roguelike-shooter/index.html</code>",
        "<span style='margin-left:14px;font-size:11.5px;opacity:.85'>(点击关闭此提示,游戏仍可能出现图片缺失)</span>",
    ].join("");
    warn.onclick = () => warn.remove();
    document.body.appendChild(warn);
}

// ===== 画布与上下文 =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;   // 480
const H = canvas.height;  // 720

// ===== 屏幕震动(Boss 劈砍等重打击特效使用) =====
const screenShake = { t: 0, mag: 0, dx: 0, dy: 0 };

// ===== UI 元素 =====
const ui = {
    wave: document.getElementById("waveVal"),
    score: document.getElementById("scoreVal"),
    best: document.getElementById("bestVal"),
    hpFill: document.getElementById("hpFill"),
    hpNum: document.getElementById("hpNum"),
    xpFill: document.getElementById("xpFill"),
    xpNum: document.getElementById("xpNum"),
    statusList: document.getElementById("statusList"),
    startPanel: document.getElementById("startPanel"),
    modePanel: document.getElementById("modePanel"),
    heroPanel: document.getElementById("heroPanel"),
    upgradePanel: document.getElementById("upgradePanel"),
    upgradeWave: document.getElementById("upgradeWave"),
    upgradeList: document.getElementById("upgradeList"),
    pausePanel: document.getElementById("pausePanel"),
    overPanel: document.getElementById("overPanel"),
    overWave: document.getElementById("overWave"),
    overScore: document.getElementById("overScore"),
    overBest: document.getElementById("overBest"),
    newBest: document.getElementById("newBest"),
    // ===== 天赋面板(v20:时间触发天赋已移除;talentPanel DOM 已从页面移除,引用保留以兼容隐藏逻辑) =====
    talentPanel: document.getElementById("talentPanel"),
    // ===== 剧情预言(缇宝) =====
    prophecyPanel: document.getElementById("prophecyPanel"),
    prophecyConfirmBtn: document.getElementById("prophecyConfirmBtn"),
    // ===== 随机事件系统 =====
    eventPanel: document.getElementById("eventPanel"),
    eventIcon: document.getElementById("eventIcon"),
    eventName: document.getElementById("eventName"),
    eventDesc: document.getElementById("eventDesc"),
    eventOptions: document.getElementById("eventOptions"),
    eventConfirmBtn: document.getElementById("eventConfirmBtn"),
    // ===== 英雄状态面板 =====
    heroStatusPanel: document.getElementById("heroStatusPanel"),
    heroStatusCount: document.getElementById("heroStatusCount"),
    heroStatusList: document.getElementById("heroStatusList"),
    heroStatusEmpty: document.getElementById("heroStatusEmpty"),
    heroStatusTabUpgradeCount: document.getElementById("tabCountUpgrade"),
    heroStatusTabTalentCount: document.getElementById("tabCountTalent"),
    // ===== v12:金币 / 波次HUD / Boss倒计时 / 计数器 =====
    coinVal: document.getElementById("coinVal"),
    waveTimerHud: document.getElementById("waveTimerHud"), // v22: 60秒波次倒计时
    bossCountdownOverlay: document.getElementById("bossCountdownOverlay"),
    bossCountdownNum: document.getElementById("bossCountdownNum"),
    counterAnim: document.getElementById("counterAnim"),
    counterAnimStrip: document.getElementById("counterAnimStrip"),
    // ===== v12:商店 =====
    shopPanel: document.getElementById("shopPanel"),
    shopList: document.getElementById("shopList"),
    shopCoins: document.getElementById("shopCoins"),
    shopCloseBtn: document.getElementById("shopCloseBtn"),
    shopRefreshBtn: document.getElementById("shopRefreshBtn"),
    shopRefreshCost: document.getElementById("shopRefreshCost"),
    // ===== v12:通关弹窗 =====
    victoryPanel: document.getElementById("victoryPanel"),
    victoryCycle: document.getElementById("victoryCycle"),
    victoryContinueBtn: document.getElementById("victoryContinueBtn"),
    victoryEndBtn: document.getElementById("victoryEndBtn"),
    // ===== v12:难度选择 / 元天赋 =====
    difficultyPanel: document.getElementById("difficultyPanel"),
    difficultyList: document.getElementById("difficultyList"),
    difficultyBackBtn: document.getElementById("difficultyBackBtn"),
    metaTalentBtn: document.getElementById("metaTalentBtn"),
    metaTalentPanel: document.getElementById("metaTalentPanel"),
    metaTalentList: document.getElementById("metaTalentList"),
    metaTalentCloseBtn: document.getElementById("metaTalentCloseBtn"),
    // ===== v12:结算统计 =====
    overTitle: document.getElementById("overTitle"),
    overKills: document.getElementById("overKills"),
    overCombo: document.getElementById("overCombo"),
    overHp: document.getElementById("overHp"),
    overBackMenuLink: document.getElementById("overBackMenuLink"),
};

// 随机事件:确认按钮点击后应用选择并恢复游戏
if (ui.eventConfirmBtn) {
    ui.eventConfirmBtn.addEventListener("click", confirmEventChoice);
}

// ===== 状态 =====
// v12: 新增 SHOP(波次商店) / VICTORY(20波通关弹窗)
// TALENT 枚举保留(兼容存档/测试引用),但不再有代码路径进入该状态
const State = { MENU: 0, PLAYING: 1, UPGRADE: 2, PAUSED: 3, OVER: 4, TALENT: 5, EVENT: 6, SHOP: 7, VICTORY: 8 };
let state = State.MENU;

// ===== Boss 贴图 =====
const BOSS_ASSET_PATH = "assets/boss/蛮神，疯王，纷争的化身.png";
const bossSpriteImage = new Image();
bossSpriteImage.src = BOSS_ASSET_PATH;
bossSpriteImage.onerror = () => {
    bossSpriteImage.src = "";
};

// ===== 工具函数 =====
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const choice = arr => arr[randi(0, arr.length - 1)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
};
const TAU = Math.PI * 2;

// ===== 输入 =====
const keys = {};
window.addEventListener("keydown", e => {
    keys[e.key.toLowerCase()] = true;
    keys[e.code] = true;
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        if (state === State.PLAYING) pause();
        else if (state === State.PAUSED) resume();
    }
    if (e.key === "m" || e.key === "M") {
        toggleMuteBtn();
    }
    // ===== 终极技能:Q 键手动释放 =====
    if ((e.key === "q" || e.key === "Q") && state === State.PLAYING) {
        const ok = tryReleaseUltimate();
        if (!ok && player.ultConfig && player.ultimateCooldown > 0) {
            spawnFloatText(player.x, player.y - 30, "冷却中 " + player.ultimateCooldown.toFixed(1) + "s", "#94a3b8");
        } else if (!ok && player.ultConfig && !player.ultimateReady) {
            const pct = Math.round(player.charge / player.ultConfig.chargeThreshold * 100);
            spawnFloatText(player.x, player.y - 30, "充能 " + pct + "%", "#94a3b8");
        }
    }
    // T 键切换自动/手动模式
    if ((e.key === "t" || e.key === "T") && state === State.PLAYING) {
        player.autoMode = !player.autoMode;
        spawnFloatText(player.x, player.y - 30, player.autoMode ? "自动释放" : "手动释放 (Q)", "#00e5ff");
        // 同步 UI 按钮
        const btn = document.getElementById("ultModeBtn");
        if (btn) {
            btn.textContent = player.autoMode ? "自动" : "手动(Q)";
            btn.classList.toggle("manual", !player.autoMode);
        }
    }
    // ===== 缇宝小技能:E 键手动释放 =====
    if ((e.key === "e" || e.key === "E") && state === State.PLAYING && player.heroId === "cannon") {
        const ok = tryActivateCannonMiniSkill();
        if (!ok && player.cannonMiniCooldown > 0) {
            spawnFloatText(player.x, player.y - 30, "小技能冷却 " + player.cannonMiniCooldown.toFixed(1) + "s", "#94a3b8");
        } else if (!ok && player.cannonMiniActive) {
            spawnFloatText(player.x, player.y - 30, "强化中 " + player.cannonMiniTimer.toFixed(1) + "s", "#94a3b8");
        }
    }
    // R 键切换缇宝小技能自动/手动模式
    if ((e.key === "r" || e.key === "R") && state === State.PLAYING && player.heroId === "cannon") {
        player.cannonMiniAutoMode = !player.cannonMiniAutoMode;
        spawnFloatText(player.x, player.y - 30, player.cannonMiniAutoMode ? "小技能自动" : "小技能手动(E)", "#ff6b35");
        const btn = document.getElementById("cannonMiniModeBtn");
        if (btn) {
            btn.textContent = player.cannonMiniAutoMode ? "自动" : "手动(E)";
            btn.classList.toggle("manual", !player.cannonMiniAutoMode);
        }
    }
    // 阻止方向键滚屏
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) {
        e.preventDefault();
    }
});
window.addEventListener("keyup", e => {
    keys[e.key.toLowerCase()] = false;
    keys[e.code] = false;
});

// ===== 音频管理 =====
const audio = {
    bgm: new Audio("audio/致世界.mp3"),
    sfxKill: new Audio("audio/boom.mp3"),

    muted: false,// 静音状态
    volume: 0.35,// 音量 0~1
    reviveBgmOn: false,// 缇安复活 BGM 是否已切换（明天你好.mp3）

    init() {
        // 从 localStorage 读取音量
        const savedVol = localStorage.getItem("rls_volume");
        if (savedVol !== null) {
            this.volume = parseInt(savedVol, 10) / 100;
        }
        this.bgm.loop = true;// 循环播放
        this.applyBgmVolume();// 设置音量
        this.bgm.preload = "auto";// 预加载音频
        this.sfxKill.volume = 0.45 * this.volume;
    },

    // 统一计算并应用 BGM 音量（静音 / 基础音量）
    applyBgmVolume() {
        this.bgm.volume = this.muted ? 0 : Math.min(1, this.volume);
    },

    playKillSound() {
        if (this.muted) return;// 如果静音,不播放音效
        const sound = this.sfxKill.cloneNode();
        sound.volume = 0.45 * this.volume;
        sound.currentTime = 0;// 从头播放
        sound.play().catch(() => {});// 播放失败时忽略错误,避免阻塞
    },

    setVolume(v) {
        // v: 0~100(滑块值),转换为 0~1
        this.volume = v / 100;
        this.applyBgmVolume();
        localStorage.setItem("rls_volume", String(v));
    },
    getVolume() {
        return Math.round(this.volume * 100);
    },
    playBgm() {
        if (this.reviveBgmOn) {
            // 新对局恢复默认 BGM
            this.reviveBgmOn = false;
            this.bgm.src = "audio/致世界.mp3";
        }
        if (this.muted) return;
        this.bgm.currentTime = 0;
        this.bgm.play().catch(() => {});
    },
    // 切换 BGM 为缇安复活曲目（明天你好.mp3）
    playReviveBgm() {
        if (this.reviveBgmOn) return; // 已切换则不重复进度
        this.reviveBgmOn = true;
        this.bgm.src = "audio/明天你好.mp3";
        this.bgm.loop = true;
        this.applyBgmVolume();
        this.bgm.play().catch(() => {});
    },
    stopBgm() {
        this.bgm.pause();
        this.bgm.currentTime = 0;
    },
    pauseBgm() { this.bgm.pause(); },
    resumeBgm() {
        if (this.muted) return;
        this.bgm.play().catch(() => {});
    },
    toggleMute() {
        this.muted = !this.muted;
        if (this.muted) {
            this.bgm.volume = 0;
            this.bgm.pause();
        } else {
            this.applyBgmVolume();
            if (state === State.PLAYING) {
                this.bgm.play().catch(() => {});
            }
        }
        return this.muted;
    },
};
audio.init();
// 暴露到 window 以便调试与自动化测试
window.__audio = audio;

// ===== 玩家 =====
const player = {
    x: W / 2, y: H - 90,
    r: 14,                  // 碰撞半径
    speed: 4,
    // 基础属性(可被升级修改)
    damage: 10,
    fireRate: 6,            // 每秒射击次数
    bulletSpeed: 9,
    bulletR: 4,
    multishot: 1,           // 同时发射子弹数
    spread: 0.12,            // 子弹夹角(弧度)
    pierce: 0,              // 穿透次数
    homing: 0,              // 制导强度 0-1
    critChance: 0.05,
    critMult: 2,
    lifesteal: 0,
    explodeOnKill: false,
    xpBonus: 1,
    maxHp: 100,
    hp: 100,
    shield: 0,              // 护盾层数(可挡 N 次伤害)
    finalDmgMult: 1,
    // 运行时
    fireCd: 0,
    invul: 0,               // 无敌帧
    thrust: 0,              // 引擎动画
    // ===== 终极技能系统 =====
    charge: 0,                  // 当前充能值
    ultimateReady: false,        // 充能完成标记
    ultimateCooldown: 0,        // 冷却剩余时间(秒)
    ultimateActive: null,       // 当前生效中的终极技能对象
    ultimateActiveTimer: 0,      // 生效中技能的剩余时间(秒)
    autoMode: true,             // true=自动释放,false=手动(Q键)
    autoReleaseTimer: 0,        // 自动模式达到阈值后的延迟计时(0.5s)
    heroId: null,                // 当前选择英雄 id
    // 终极技能配置缓存(从 HEROES 复制)
    ultConfig: null,
    // 角色专属资源(临时状态)
    bleedStacks: {},             // { enemyId: bleedStacks } 流血效果
    markStacks: {},              // { enemyId: markStacks } 印记层数
    hitCount: 0,                 // 攻击命中计数(刻律德拉用)
    gold: 0,                     // 攒钱者金币
    firstUpgradeSeen: {},         // { heroId: true } 记录每个英雄是否已触发过首次强制升级
    chargeRefreshEnabled: false,  // 缇宝专属：是否启用每 60s 自动补满终结技
    chargeRefreshCooldown: 0,     // 距离下次自动补满的剩余时间(秒)
};

// ===== 实体集合 =====
let bullets = [];      // 玩家子弹
let enemies = [];
let eBullets = [];     // 敌人子弹
let particles = [];
let pickups = [];      // 经验/血包等
let floatTexts = [];
let bossAreaWarnings = [];

// ===== 游戏数据 =====
let wave = 1;
let score = 0;
let xp = 0;
let xpNeed = 3;
let level = 1;
let waveTimer = 0;          // 当前波次计时
let spawnQueue = [];        // 待生成敌人
let spawnCd = 0;
let waveActive = false;
let waveBreak = 0;          // 波间间隔
let bossAlive = false;
// ===== v22:60秒计时波次系统 =====
const WAVE_DURATION_SEC = 60;  // 每波固定时长(秒)
let waveTimerSec = 0;          // 本波剩余时间(秒)
let waveTopUpCd = 0;           // 补充出怪冷却(帧):初始队列耗尽后持续补怪
let waveSpawnTypes = ["grunt"]; // 本波可生成的敌人类型(含补充出怪)
// ===== v23:动态出怪(自适应) =====
const ENEMY_FIELD_CAP = 26;    // 场上存活怪物上限(防性能问题/难度异常)
let killRateRecent = 0;        // 近期击杀效率(衰减计数,半衰期3秒):杀得越快补怪越快
let bestScore = parseInt(localStorage.getItem("rls_best") || "0", 10);
let pendingUpgradePicks = 0; // 剩余奖励升级次数（0 = 正常3选1）
let pendingLevelUps = 0;     // v20:波内积压的升级选择次数(升级不再打断战斗,清场后统一结算)
// ===== v12:商店经济 / 结算统计 / 难度 / 波次流程 =====
let coins = 0;                 // 本局金币(每局重置,不跨局)
let difficulty = 1;            // 本局难度 1~5
let killCount = 0;             // 本局击杀数
let maxCombo = 0;              // 本局最高连击
let comboCount = 0;            // 当前连击数
let comboTimer = 0;            // 连击剩余窗口(秒,3 秒内连续击杀维持连击)
let waveDurationSec = 0;       // 本波已用时(秒)
let waveSettled = false;       // 本波是否已结算(货币+商店)
let cycleClearedOnce = false;  // 本局是否已通关过一轮(影响 Wave HUD 显示)
let runEndedFromVictory = false; // 本局是否经"结束游戏"按钮结束(区分计数器触发路径)
let bossCountdownTimer = 0;    // Boss 出场倒计时剩余(秒,>0 时显示遮罩)
let bossCountdownCb = null;    // 倒计时结束回调(开始 Boss 波)
let counterAnimating = false;  // 计数器动画播放锁(动画期间新触发直接丢弃)
// ===== 随机事件系统 =====
// 当前波次的敌人修正器（由事件选项设置，startWave 时应用并重置）
let currentWaveMods = { countMult: 1, hpMult: 1, speedMult: 1 }; 

ui.best.textContent = bestScore;
if (ui.coinVal) ui.coinVal.textContent = "🪙0";

// ============================================================
// 子弹
// ============================================================
function spawnPlayerBullets() {
    // 缇宁「原厂设计图」：以后获得的追踪能力自动转化为伤害（每0.01=1%）
    if (player.cannonNoHoming && player.homing > 0) {
        player.finalDmgMult *= (1 + player.homing);
        player.homing = 0;
    }
    // 遐蝶专属：镰刀近战普攻（消耗自身生命充能终结技）
    if (player.heroId === "scatter") {
        spawnScytheSlash(Math.random() <= player.critChance);
        return;
    }

    const n = player.multishot;//发射子弹数量
    const baseAngle = -Math.PI / 2; // 向上
    for (let i = 0; i < n; i++) {
        let angle = baseAngle;
        if (n > 1) {
            angle += (i - (n - 1) / 2) * player.spread;//计算每个子弹的角度,使其在中心向上发射,并根据spread调整角度
        }
        const isCrit = Math.random() <= player.critChance;//判断是否暴击,随机数小于等于暴击率则暴击
        let dmg = player.damage * (isCrit ? player.critMult : 1);
        // 缇宝专属:火箭发射器,伤害为最大生命值的30%
        if (player.heroId === "cannon") {
            dmg = player.maxHp * 0.30 * (isCrit ? player.critMult : 1);
            // 云朵安抚弹：伤害降低（事件减伤）
            dmg *= player.cannonOrbitDmgMult;
        }
        // 再续神话叠层增伤:每次施放终结技 +4%,最多 15 层(60%)
        if (player.cannonUltDmgBuffEnabled) {
            dmg *= (1 + player.cannonUltDmgStacks * 0.04);
        }
        dmg *= player.finalDmgMult;
        // 云朵安抚弹：轨道弹模式，多发时均匀分布在轨道上
        const isOrbit = player.cannonOrbitMode;
        const orbitAngle = isOrbit ? (i / n) * TAU + Math.random() * 0.2 : 0;
        // 生成子弹对象,并加入 bullets 数组
        bullets.push({
            x: player.x, y: player.y - 10,              //子弹初始位置
            vx: Math.cos(angle) * player.bulletSpeed,   //子弹速度
            vy: Math.sin(angle) * player.bulletSpeed,   //子弹速度
            r: player.bulletR,                          //子弹半径
            dmg, isCrit,                                //伤害,是否暴击
            pierce: player.pierce,                      //穿透次数
            hit: new Set(),                             // 已命中的敌人 id
            homing: player.homing,                      //制导强度
            life: isOrbit ? 360 : 120,                  //子弹寿命,轨道弹延长以维持环绕
            isRocket: false,                            //是否为火箭弹,缇宝专属
            rocketTargetId: null,                       //火箭发射器专用,指向的敌人id
            // 云朵安抚弹轨道参数
            orbit: isOrbit,
            orbitAngle: orbitAngle,
            orbitRadius: 78,                           //环绕半径
            orbitSpeed: 0.055,                          //角速度(弧度/帧),约1.9秒一周
        });
    }
}

// 遐蝶：镰刀近战普攻
// 伤害 = 自身最大生命值 5%；每次挥砍消耗自身 1% 最大生命值（消耗量充能终结技）
// 巨龙终结技持续期间伤害翻倍
function spawnScytheSlash(isCrit) {
    const range = player.range || 60;   // 攻击半径（英雄配置 base.range）
    // 挥砍消耗自身 1% 最大生命值（保留至少 1 点，不会自伤致死）
    const cost = Math.max(1, Math.round(player.maxHp * 0.01));
    player.hp = Math.max(1, player.hp - cost);
    spawnFloatText(player.x, player.y - 24, "-" + cost, "#f87171");
    // 遐蝶终结技：以「累计失去的生命」充能，阈值为当前最大生命值的 30%
    chargeScatterUlt(cost);

    let dmg = player.maxHp * 0.05;
    // 巨龙终结技期间：普攻伤害翻倍
    if (player.ultimateActive && player.ultimateActive.type === "dragon") dmg *= 2;
    dmg = Math.round(dmg * (isCrit ? player.critMult : 1) * player.finalDmgMult);

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (Math.hypot(e.x - player.x, e.y - player.y) > range + e.r) continue;
        // Boss 用 lifeHp，普通敌人用 hp（与子弹伤害一致）
        if (e.type === "boss") e.lifeHp -= dmg;
        else e.hp -= dmg;
        e.flash = 6;
        spawnFloatText(e.x, e.y - e.r, dmg, isCrit ? "#fbbf24" : "#fff");
        spawnExplosion(e.x, e.y, "#a78bfa", 5, 0.5);
        if (e.type === "boss" ? (e.lifeHp <= 0) : (e.hp <= 0)) killEnemy(i);
    }
    // 新月形挥砍特效
    particles.push({
        x: player.x, y: player.y,
        vx: 0, vy: 0,
        r: range * 0.55,
        grow: 1.8,                    // 弧线向外扩散
        rot: rand(-0.5, 0.5),         // 随机朝向
        vrot: rand(-0.12, 0.12),      // 轻微旋转
        life: 14, maxLife: 14,
        color: "#c4b5fd",
        type: "slash",
    });
}

// 遐蝶终结技充能：普攻/受伤损失的生命都会累计，失去 30% 最大生命值即就绪
function chargeScatterUlt(lostHp) {
    if (!player.ultConfig) return;
    player.ultConfig.chargeThreshold = Math.round(player.maxHp * 0.30); // 阈值随当前最大生命值同步
    addCharge(lostHp);
}

//通用的火箭发射器
function spawnRocketShot(target, dmgOverride = null, opts = {}) {
    if (!target) return;//判断有无敌人
    if (!dmgOverride && (!player.ultimateActive || player.ultimateActive.type !== "rocket")) return;//如果天赋触发或者有终极技能并且终极技能是火箭类型,则发射火箭
    const angle = Math.atan2(target.y - player.y, target.x - player.x);
    const speed = opts.speed ?? 7.5;
    const ratio = opts.ratio ?? (player.ultimateActive && player.ultimateActive.type === "rocket" ? 0.20 : 0.10);
    let damage = dmgOverride ?? (player.maxHp * ratio);
    damage *= player.finalDmgMult;
    bullets.push({
        x: player.x,
        y: player.y - 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: opts.r ?? 9,
        dmg: damage,
        isCrit: false,
        pierce: 0,
        hit: new Set(),
        homing: opts.homing ?? 0.8,
        life: opts.life ?? 160,
        isRocket: true,
        rocketTargetId: target.id,
        color: opts.color ?? "#ff6b35",
    });
}

// ============================================================
// 敌人类型定义
// ============================================================
const ENEMY_TYPES = {
    grunt: {
        r: 13, hp: 20, speed: 1.4, score: 10, xp: 1, color: "#f87171",
        coinMin: 1, coinMax: 2, // v23:金币掉落区间(击杀后随机取整)
        shape: "tri", behavior: "straight",
    },
    zigzag: {
        r: 12, hp: 25, speed: 1.6, score: 15, xp: 1, color: "#fbbf24",
        coinMin: 1, coinMax: 3, // v23
        shape: "diamond", behavior: "zigzag",
    },
    shooter: {
        r: 14, hp: 35, speed: 1.0, score: 20, xp: 2, color: "#c084fc",
        coinMin: 2, coinMax: 4, // v23
        shape: "hex", behavior: "shooter",
    },
    tank: {
        r: 20, hp: 80, speed: 0.8, score: 30, xp: 3, color: "#60a5fa",
        coinMin: 3, coinMax: 6, // v23
        shape: "square", behavior: "straight",
    },
    swarmer: {
        r: 9, hp: 12, speed: 2.2, score: 8, xp: 1, color: "#34d399",
        coinMin: 1, coinMax: 2, // v23
        shape: "tri", behavior: "swarm",
    },
};

// boss 用专门结构
const BOSS_TYPES = {
    nikador: {
        name: "蛮神，疯王，纷争的化身",
        r: 42,
        hp: 1000,
        speed: 0.7,
        color: "#ff3da6",
        reward: 250,//击败奖励
        pattern: "nikador",//行为模式
        image: "assets/boss/蛮神，疯王，纷争的化身.png",
    },
    magma: {
        name: "熔岩巨兽",
        r: 48,
        hp: 900,
        speed: 0.8,
        color: "#f97316",
        reward: 400,
        pattern: "magma",
    },
    // ===== v12: 20波周期 Boss 编排占位实现 =====
    // 未完成专属AI的 Boss 统一复用 Nikador 技能模组(pattern:"nikador"),
    // 通过 color 色相蒙版 + 头顶名牌区分外观;待专属技能实现后仅需替换 pattern 与更新函数
    pollux: {
        name: "Pollux", r: 40, hp: 1100, speed: 0.75, color: "#818cf8",
        reward: 450, pattern: "nikador",
    },
    crow: {
        name: "Crow of Solar Thunder", r: 40, hp: 1150, speed: 0.8, color: "#facc15",
        reward: 450, pattern: "nikador",
    },
    firestealer: {
        name: "Firestealer Walker", r: 42, hp: 1400, speed: 0.7, color: "#fb7185",
        reward: 520, pattern: "nikador",
    },
    adjudicator: {
        name: "Form of Adjudicated Oblivion", r: 44, hp: 1450, speed: 0.65, color: "#a3e635",
        reward: 520, pattern: "nikador",
    },
    zandar: {
        name: "Zandar", r: 46, hp: 1800, speed: 0.6, color: "#22d3ee",
        reward: 650, pattern: "nikador",
    },
    ironcurtain: {
        name: "Iron Curtain", r: 48, hp: 2000, speed: 0.55, color: "#94a3b8",
        reward: 700, pattern: "nikador",
    },
};

function makeBoss(lvl, key = "nikador") {
    const t = BOSS_TYPES[key] || BOSS_TYPES.nikador;
    // v12: 难度系统影响 Boss 生命(HP ×(1+15%×(难度-1)))
    const bossHp = Math.round((t.hp + lvl * 220) * getDifficultyMult().hp);
    return {
        type: "boss",
        bossKey: key,
        id: Math.random(),
        x: W / 2,
        y: -60,
        r: t.r,
        maxHp: bossHp,
        hp: bossHp,
        speed: t.speed * getDifficultyMult().spd,
        score: 200 + lvl * 60,
        xp: 12 + lvl * 3,
        coinMin: 10 + lvl * 2, coinMax: 18 + lvl * 3, // v23:Boss金币掉落(随等级成长)
        color: t.color,
        shape: "boss",
        behavior: "boss",
        phase: 0,
        shootTimer: 0,
        movePhase: 0,
        moveTimer: 0,
        targetX: W / 2,
        targetY: 100,
        entering: true,
        lvl,
        name: t.name,
        image: t.image || BOSS_ASSET_PATH,

        //------nikador 专属状态------
        nikadorPhase: 0,//第一阶段
        lives: 3,
        currentLife: 1,
        lifeHp: bossHp,
        maxLifeHp: bossHp,
        isInvincible: true,   // v12: 出场(entering)期间无敌,入场完毕解除
        invincibleTimer: 0,
    };
}

let enemyIdCounter = 0;
function spawnEnemy(typeKey, x, y) {
    const t = ENEMY_TYPES[typeKey];
    if (!t) return;
    const waveScale = 1 + (wave - 1) * 0.12;
    const diff = getDifficultyMult(); // v12: 难度缩放
    const enemyHp = Math.max(1, Math.round(t.hp * waveScale * (currentWaveMods.hpMult || 1) * diff.hp));
    enemies.push({
        type: typeKey,
        id: ++enemyIdCounter,
        x: x ?? rand(30, W - 30),
        y: y ?? -t.r,
        r: t.r,
        maxHp: enemyHp,
        hp: enemyHp,
        speed: t.speed * (1 + (wave - 1) * 0.02) * (currentWaveMods.speedMult || 1) * diff.spd,
        score: t.score, xp: t.xp, color: t.color,
        shape: t.shape, behavior: t.behavior,
        coinMin: t.coinMin, coinMax: t.coinMax, // v23:金币掉落区间(随模板携带)
        // 运行时
        t: 0,
        shootCd: rand(60, 120),
        flash: 0,
        angle: rand(0, TAU),
    });
}

// ============================================================
// 【2】波次系统 —— 20 波为一轮通关周期,清完第 20 波判定通关,循环推进
// ============================================================
const WAVES_PER_CYCLE = 20;

// Boss 波次固定编排:键 = 轮内波次(1~20);值 = 该波 Boss 生成器(返回 bossKey 数组)
//   5  → Nikador(固定)
//   12 → Pollux / Crow of Solar Thunder(随机)
//   15 → Firestealer Walker / Form of Adjudicated Oblivion(随机)
//   20 → Zandar / Iron Curtain(随机,轮次最终 Boss)
const BOSS_WAVE_KEYS = {
    5:  () => ["nikador"],
    12: () => [choice(["pollux", "crow"])],
    15: () => [choice(["firestealer", "adjudicator"])],
    20: () => [choice(["zandar", "ironcurtain"])],
};

// 轮内波次(1~20)
function waveInCycle(n = wave) { return ((n - 1) % WAVES_PER_CYCLE) + 1; }
// 轮次(0 起)
function cycleIndex(n = wave) { return Math.floor((n - 1) / WAVES_PER_CYCLE); }
// 该波是否为 Boss 波
function isBossWave(n = wave) { return !!BOSS_WAVE_KEYS[waveInCycle(n)]; }

function startWave(n) {
    //海绵王
    if (player._spongeKingActive && n > 1) {
        player._spongeKingCount++;
        if (player._spongeKingCount <= 4) {
            player.hp *= 0.2;
            player.maxHp *= 1.1;
            spawnFloatText(player.x, player.y - 30,
                `海绵王 (${player._spongeKingCount}/4)`, "#fbbf24");
            if (player._spongeKingCount >= 4) {
                player._spongeKingActive = false;
                spawnFloatText(player.x, player.y - 50, "海绵王已破碎!", "#94a3b8");
            }
        }
    }
    //虚构机兵
    if (player._fictionalMechaActive && n > 1) {
        const heal = Math.round(player.maxHp * 0.20);
        player.hp = clamp(player.hp + heal, 0, player.maxHp);
        spawnFloatText(player.x, player.y - 30, `虚构机兵 +${heal} HP`, "#4ade80");
    }
    //再续神话:进入新一波时重置叠加层数
    if (player.cannonUltDmgBuffEnabled && player.cannonUltDmgStacks > 0) {
        player.cannonUltDmgStacks = 0;
        spawnFloatText(player.x, player.y - 30, "再续神话 层数已重置", "#ff3da6");
    }
    wave = n;
    waveDurationSec = 0; // v12: 本波用时(货币时间奖励用)
    ui.wave.textContent = wave;
    waveActive = true;
    waveBreak = 0;
    waveSettled = false; // v12: 本波是否已完成结算(货币+商店)
    spawnQueue = [];
    bossAlive = false;

    // 应用事件系统设置的"下一波"修正器，并重置为默认
    currentWaveMods = player._eventNextWaveMods || { countMult: 1, hpMult: 1, speedMult: 1 };
    player._eventNextWaveMods = null;

    const win = waveInCycle(n);
    const cyc = cycleIndex(n);
    const bossGen = BOSS_WAVE_KEYS[win];
    // v22: 60 秒计时波 —— 每波固定 60 秒,倒计时结束自动回收/清场/进商店
    waveTimerSec = WAVE_DURATION_SEC;
    waveTopUpCd = 60;
    if (bossGen) {
        // Boss 波:按编排生成 Boss(占位 Boss 复用 Nikador 技能模组)
        const bossLvl = cyc * 4 + Math.floor(win / 5);
        bossGen().forEach(key => enemies.push(makeBoss(bossLvl, key)));
        bossAlive = true;
        waveSpawnTypes = ["swarmer"];
        // boss 波伴随少量小怪(随轮次递增)
        const minions = Math.max(1, Math.round((2 + cyc * 2 + Math.floor(win / 5)) * currentWaveMods.countMult));
        for (let i = 0; i < minions; i++) {
            spawnQueue.push({ type: "swarmer", delay: 60 * i + 90 });
        }
    } else {
        // v22: 出怪数量逐波递增(基础量翻倍),生成间隔缩短 → 单位时间出怪密度提升
        let base = 8 + Math.floor(win * 2.2) + cyc * 10;
        base = Math.max(1, Math.round(base * currentWaveMods.countMult)); // 事件修正敌人数
        const types = ["grunt"];
        if (win >= 2) types.push("zigzag");
        if (win >= 3) types.push("shooter");
        if (win >= 4) types.push("tank");
        if (win >= 2) types.push("swarmer");
        waveSpawnTypes = types;

        // 生成间隔随波次收紧:第1波≈1.9秒/只,第10波≈1.4秒/只,第20波+≈0.8秒/只(下限0.55秒)
        const gap = Math.max(33, Math.round(115 - win * 4 - cyc * 10));
        for (let i = 0; i < base; i++) {
            spawnQueue.push({
                type: choice(types),
                delay: 30 + i * (gap + Math.round(rand(-10, 10))),
            });
        }
    }
    spawnCd = 0;

    // 随机事件判定：每波生成时 10% 概率弹出问答事件（暂停游戏）
    tryTriggerRandomEvent(n);
}

function waveCleared() {
    // 所有敌人清空且无待生成
    return enemies.length === 0 && spawnQueue.length === 0 && !bossAlive;
}

// ============================================================
// v22: 60秒计时波次结束处理
// ============================================================
// 倒计时归零:自动回收拾取物 → 无掉落清场 → (20波通关 | 短暂过渡后进商店/升级)
function endWaveByTimer() {
    waveActive = false;
    collectAllPickups();
    clearEnemiesNoDrops();
    if (wave % WAVES_PER_CYCLE === 0) {
        // 第 20/40/60…波计时结束:立即通关判定(不进商店)
        triggerVictory();
        return;
    }
    waveBreak = 45; // 约0.75秒过渡后结算货币并打开商店(与原清场流程同链路)
}

// 自动回收场上所有拾取物(经验球/金币/血包):走正常 collectPickup 结算(升级进入 pendingLevelUps 队列)
function collectAllPickups() {
    if (pickups.length === 0) return;
    let xpCount = 0, healCount = 0, coinSum = 0;
    for (const p of pickups) {
        if (p.type === "xp") xpCount++;
        else if (p.type === "coin") coinSum += p.value;
        else healCount++;
        collectPickup(p);
    }
    pickups.length = 0;
    spawnFloatText(player.x, player.y - 50,
        `自动回收:${xpCount ? `经验×${xpCount} ` : ""}${coinSum ? `金币+${coinSum} ` : ""}${healCount ? `血包×${healCount}` : ""}`, "#7dd3fc");
}

// 无掉落清场:清除所有存活敌人/待生成队列/敌弹,不触发任何掉落、经验与连击结算
function clearEnemiesNoDrops() {
    for (const e of enemies) {
        spawnExplosion(e.x, e.y, e.color, 8, 1);
    }
    enemies.length = 0;
    spawnQueue.length = 0;
    eBullets.length = 0;
    bossAreaWarnings.length = 0;
    bossAlive = false;
}

// ============================================================
// 【3】难度系统 —— 难度 1~5 影响怪物生命/伤害/移速;通关当前难度解锁下一难度
// ============================================================
const DIFFICULTY_MAX = 5;
const DIFFICULTY_NAMES = ["", "简单", "普通", "困难", "噩梦", "地狱"];

// 难度修正:HP +15%/级,敌方伤害 +10%/级,移速 +8%/级(难度 1 = 原始基准)
function getDifficultyMult() {
    const d = clamp(difficulty || 1, 1, DIFFICULTY_MAX);
    return {
        hp: 1 + 0.15 * (d - 1),
        dmg: 1 + 0.10 * (d - 1),
        spd: 1 + 0.08 * (d - 1),
    };
}

// ============================================================
// 【4】商店与经济系统 —— 每波清场结算货币 → 波次商店(商品复用天赋池)
// ============================================================
const SHOP_BASE_PRICE = { common: 30, rare: 60, epic: 100, legendary: 180, exclusive: 120 };

// 商品价格:基础价 ×(1 + 3%×波次),封顶 3 倍(价格随波次上浮)
function shopItemPrice(t) {
    const base = SHOP_BASE_PRICE[t.rarity] || 30;
    return Math.min(Math.round(base * (1 + 0.03 * wave)), base * 3);
}

// 波次货币结算:
//   基础 = 波次 × 10 ×(1 + 20%×(难度-1))
//   生命奖励系数 = 10% + 20%×剩余生命比(满血 +30%,残血 +10%)
//   时间奖励系数 = 10s 内通关 +20%,线性衰减,60s 及以上 +5%
function settleWaveRewards() {
    const base = wave * 10 * (1 + 0.2 * (difficulty - 1));
    const hpRatio = player.maxHp > 0 ? clamp(player.hp / player.maxHp, 0, 1) : 0;
    const hpBonus = 0.10 + 0.20 * hpRatio;
    const timeBonus = clamp(0.20 - (Math.max(0, waveDurationSec - 10) / 50) * 0.15, 0.05, 0.20);
    const reward = Math.round(base * (1 + hpBonus + timeBonus));
    coins += reward;
    if (ui.coinVal) ui.coinVal.textContent = "🪙" + coins;
    spawnFloatText(player.x, player.y - 40, "+" + reward + " 金币", "#ffd700");
    playCoinFloat(reward);
}

// 金币飞行动画:画布中央上浮至顶栏金币位置
function playCoinFloat(amount) {
    const wrap = document.querySelector(".canvas-wrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "coin-float";
    el.textContent = "+" + amount + " 🪙";
    el.style.left = "50%";
    el.style.top = "38%";
    wrap.appendChild(el);
    requestAnimationFrame(() => {
        el.style.transform = "translate(150px, -260px) scale(0.8)";
        el.style.opacity = "0";
    });
    setTimeout(() => el.remove(), 950);
}

// ===== v21 商店:固定3商品 + 购买不补货 + 手动刷新(阶梯费用 1/2/3...) =====
let shopOffers = [];       // 当前货架上的 3 件商品(天赋对象)
let shopRefreshCost = 1;   // 下一次刷新的费用(每次开店重置为 1,刷新后 +1)
const SHOP_OFFER_COUNT = 3;

// 打开波次商店(暂停游戏):重置刷新费用并抽取 3 件商品
function offerShop() {
    if (state === State.OVER || state === State.VICTORY) return;
    state = State.SHOP;
    audio.pauseBgm();
    shopRefreshCost = 1;
    rollShopOffers();
    renderShopOffers(); // 抽取后必须渲染,否则货架为空
    if (ui.shopCoins) ui.shopCoins.textContent = coins;
    if (ui.shopPanel) ui.shopPanel.hidden = false;
    updateShopRefreshBtn();
}

// 构建可上架商品池(复用天赋池:通用 + 当前英雄专属,经过可购买/叠加规则过滤)
function buildShopPool() {
    const heroPool = TALENTS_HERO_EXCLUSIVE[player.heroId] || [];
    return [...TALENTS_GENERAL, ...heroPool].filter(t => {
        if (!canPickTalent(t)) return false;
        if (!t.stackable && hasTalent(t.id)) return false;
        return true;
    });
}

// 随机抽取 3 件商品上架(刷新时尽量避开当前货架;池子太小则允许保留)
function rollShopOffers() {
    const fullPool = buildShopPool();
    let pool = fullPool.filter(t => !shopOffers.some(o => o.id === t.id));
    if (pool.length < SHOP_OFFER_COUNT) pool = fullPool; // 排除后不足3件,回退全池
    // 洗牌后取前 3
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    shopOffers = pool.slice(0, SHOP_OFFER_COUNT);
}

// 渲染当前货架(仅渲染 shopOffers,购买不重掷)
function renderShopOffers() {
    if (!ui.shopList) return;
    ui.shopList.innerHTML = "";
    if (shopOffers.length === 0) {
        ui.shopList.innerHTML = '<div class="talent-card" style="text-align:center;opacity:.7">商品已售罄,离开商店继续战斗</div>';
        return;
    }
    const rarityCn = { common: "普通", rare: "稀有", epic: "史诗", legendary: "传说", exclusive: "专属" };
    shopOffers.forEach(t => {
        const price = shopItemPrice(t);
        const owned = getTalentPickCount(t.id);
        const card = document.createElement("div");
        card.className = `talent-card rarity-${t.rarity} shop-card` + (owned ? " shop-owned" : "");
        card.innerHTML = `
            <div class="talent-head">
                <div class="talent-icon">${t.icon || "⭐"}</div>
                <div class="talent-meta">
                    <div class="talent-name">
                        <span>${t.name}</span>
                        <span class="talent-rarity">${rarityCn[t.rarity] || "普通"}</span>
                    </div>
                    <div class="talent-type">${t.type || "通用"} · ${t.stackable ? "可叠加" : "唯一"}${owned ? ` · <span class="shop-purchased-tag">已购 ×${owned}</span>` : ""}</div>
                </div>
            </div>
            <div class="talent-desc">${t.desc}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
                <span class="shop-item-price">🪙 ${price}</span>
                <button class="shop-item-buy" ${coins < price ? "disabled" : ""}>${coins < price ? "金币不足" : "购买"}</button>
            </div>`;
        card.querySelector(".shop-item-buy").onclick = (ev) => {
            ev.stopPropagation();
            buyShopItem(t, price);
        };
        ui.shopList.appendChild(card);
    });
}

// 刷新按钮状态:显示下一次刷新费用,金币不足时禁用
function updateShopRefreshBtn() {
    if (ui.shopRefreshCost) ui.shopRefreshCost.textContent = shopRefreshCost;
    if (ui.shopRefreshBtn) ui.shopRefreshBtn.disabled = coins < shopRefreshCost;
}

// 手动刷新货架:扣阶梯费用 → 重掷 3 件商品(费用 1→2→3... 递增)
function refreshShopOffers() {
    if (coins < shopRefreshCost) {
        spawnFloatText(player.x, player.y - 60, "金币不足!", "#f87171");
        return;
    }
    coins -= shopRefreshCost;
    shopRefreshCost++;
    spawnFloatText(player.x, player.y - 60, "刷新货架 🪙" + (shopRefreshCost - 1), "#7dd3fc");
    if (ui.shopCoins) ui.shopCoins.textContent = coins;
    if (ui.coinVal) ui.coinVal.textContent = "🪙" + coins;
    rollShopOffers();
    renderShopOffers();
    updateShopRefreshBtn();
}

// 购买商品:扣币 → 应用天赋(复用 applyTalent,含历史记录与音效)→ 仅将该商品下架,其余不动
function buyShopItem(t, price) {
    if (coins < price) {
        spawnFloatText(player.x, player.y - 60, "金币不足!", "#f87171");
        return;
    }
    coins -= price;
    applyTalent(t);
    spawnFloatText(player.x, player.y - 60, "购入:" + t.name, "#ffd700");
    if (ui.shopCoins) ui.shopCoins.textContent = coins;
    if (ui.coinVal) ui.coinVal.textContent = "🪙" + coins;
    updateStatus();
    renderHeroStatusPanel && renderHeroStatusPanel();
    // 购买后不自动刷新货架:仅移除已购商品,其余保持原样
    shopOffers = shopOffers.filter(o => o.id !== t.id);
    renderShopOffers();
    updateShopRefreshBtn();
}

// 离开商店 → 进入下一波(Boss 波先播 3 秒倒计时)
function closeShop() {
    if (ui.shopPanel) ui.shopPanel.hidden = true;
    state = State.PLAYING;
    audio.resumeBgm();
    proceedToNextWave();
}

function proceedToNextWave() {
    const next = wave + 1;
    if (isBossWave(next)) {
        startBossCountdown(3, () => startWave(next));
    } else {
        startWave(next);
    }
}

// Boss 出场倒计时(全屏遮罩,玩家仍可移动,倒计时结束开始 Boss 波)
function startBossCountdown(seconds, cb) {
    bossCountdownTimer = seconds;
    bossCountdownCb = cb;
    if (ui.bossCountdownNum) ui.bossCountdownNum.textContent = String(seconds);
    if (ui.bossCountdownOverlay) ui.bossCountdownOverlay.hidden = false;
}

// 屏幕中央 toast(难度解锁提示等,3 秒自动消失)
function showCenterToast(msg) {
    const wrap = document.querySelector(".canvas-wrap");
    if (!wrap) { spawnFloatText(W / 2, 120, msg, "#ffd700"); return; }
    const el = document.createElement("div");
    el.className = "center-toast";
    el.textContent = msg;
    el.style.cssText = "position:absolute;left:50%;top:18%;transform:translateX(-50%);z-index:55;" +
        "background:rgba(0,0,0,.78);border:1px solid #ffd700;border-radius:10px;padding:10px 18px;" +
        "color:#ffd700;font-size:15px;font-weight:800;white-space:nowrap;pointer-events:none;" +
        "box-shadow:0 0 18px rgba(255,215,0,.45);animation:shop-panel-in .3s ease;";
    wrap.appendChild(el);
    setTimeout(() => { el.style.transition = "opacity .5s"; el.style.opacity = "0"; }, 2500);
    setTimeout(() => el.remove(), 3100);
}

// ============================================================
// 【5】通关弹窗与结算(VICTORY) —— 第 20/40/60…波清场立即触发
// ============================================================
function triggerVictory() {
    state = State.VICTORY;
    audio.pauseBgm();
    cycleClearedOnce = true;
    // 难度解锁奖励:以当前难度通关 → 解锁下一难度(上限 5);首次通关同步开放元天赋入口
    const hints = applyDifficultyClearRewards();
    if (ui.victoryCycle) ui.victoryCycle.textContent = cycleIndex(wave) + 1;
    if (ui.victoryPanel) ui.victoryPanel.hidden = false;
    hints.forEach((msg, i) => setTimeout(() => showCenterToast(msg), 500 + i * 700));
}

// 通关难度解锁:返回提示文案数组
function applyDifficultyClearRewards() {
    const hints = [];
    const data = HeroGameData.get(player.heroId);
    const firstClear = data.unlockedDifficulty < 2;
    if (difficulty >= data.unlockedDifficulty && data.unlockedDifficulty < DIFFICULTY_MAX) {
        data.unlockedDifficulty = clamp(Math.max(data.unlockedDifficulty, difficulty + 1), 1, DIFFICULTY_MAX);
        HeroGameData.save(player.heroId, data);
        if (firstClear) hints.push("🎉 难度挑战模式已解锁!元天赋入口已开放");
        hints.push("🏆 难度 " + data.unlockedDifficulty + " 已解锁!");
    }
    return hints;
}

// 通关弹窗:继续游戏(进入下一轮第 1 波,即总波次 21)
function continueAfterVictory() {
    if (ui.victoryPanel) ui.victoryPanel.hidden = true;
    state = State.PLAYING;
    audio.resumeBgm();
    startWave(wave + 1);
}

// 通关弹窗:结束游戏 → 清场 → 计数器 +1 → 结算界面
function endRunCleanly() {
    if (ui.victoryPanel) ui.victoryPanel.hidden = true;
    runEndedFromVictory = true;
    bullets = []; enemies = []; eBullets = [];
    particles = []; pickups = []; floatTexts = []; bossAreaWarnings = [];
    bossAlive = false; waveActive = false;
    audio.stopBgm();
    state = State.OVER;
    // 触发角色计数器(通关结束游戏路径,始终触发)
    bumpHeroCounter(player.heroId);
    showOverPanel(true);
}

// 结算面板(死亡/结束游戏共用)
function showOverPanel(endedFromVictory) {
    if (ui.overTitle) ui.overTitle.textContent = endedFromVictory ? "本次挑战结束" : "舰船损毁";
    if (ui.overWave) ui.overWave.textContent = wave;
    if (ui.overKills) ui.overKills.textContent = killCount;
    if (ui.overCombo) ui.overCombo.textContent = maxCombo;
    if (ui.overHp) ui.overHp.textContent = Math.max(0, Math.ceil(player.hp)) + "/" + Math.round(player.maxHp);
    if (ui.overScore) ui.overScore.textContent = score;
    if (ui.overBest) ui.overBest.textContent = bestScore;
    const restartBtn = document.getElementById("restartBtn2");
    if (restartBtn) restartBtn.hidden = !!endedFromVictory;
    setTimeout(() => { if (ui.overPanel) ui.overPanel.hidden = false; }, endedFromVictory ? 800 : 700);
}

// ============================================================
// 【3b】Boss 技能标准接口 —— 供后续 Boss 扩展技能时统一调用
//   castSkill(e, skillId, opts):释放指定技能(当前占位,转发 Nikador 模组)
//   updateAI(e, dt):           每帧行为入口(按 bossKey 分发)
//   setAttributes(e, attrs):   属性调整(生命/速度/半径/伤害系数)
// ============================================================
const BossAPI = {
    /**
     * 释放 Boss 技能
     * @param {object} e  Boss 实体
     * @param {string} skillId 技能标识(预留:如 "fanSpread"/"ringBurst"/"slash")
     * @param {object} [opts] 技能参数 { dt, count, angle, dmgMult ... }
     * 当前版本:所有 Boss 共用 Nikador 技能模组,专属技能实现后在此按 skillId 分发
     */
    castSkill(e, skillId, opts = {}) {
        const dt = opts.dt || 0;
        const t = BOSS_TYPES[e.bossKey];
        if (t && t.pattern === "nikador") { updateNikador(e, dt); return; }
        updateDefaultBossAttack(e, dt);
    },
    /** 每帧 AI 入口:未实现专属 AI 的 Boss 占位复用 Nikador 模组 */
    updateAI(e, dt) {
        if (e.bossKey === "nikador") { updateNikador(e, dt); return; }
        const t = BOSS_TYPES[e.bossKey];
        if (t && t.pattern === "nikador") { updateNikador(e, dt); return; }
        if (e.bossKey === "sylph") { updateSylph(e, dt); return; }
        updateDefaultBossAttack(e, dt);
    },
    /**
     * 属性调整
     * @param {object} e Boss 实体
     * @param {{hp?:number, speed?:number, r?:number, dmgMult?:number}} attrs
     */
    setAttributes(e, attrs) {
        if (!e || !attrs) return;
        if (attrs.hp) { e.maxHp = attrs.hp; e.hp = attrs.hp; e.lifeHp = attrs.hp; e.maxLifeHp = attrs.hp; }
        if (attrs.speed) e.speed = attrs.speed;
        if (attrs.r) e.r = attrs.r;
        if (attrs.dmgMult) e.dmgMult = attrs.dmgMult;
    },
};

// ============================================================
// 随机事件系统（每波生成时 10% 概率触发，暂停游戏等待玩家选择）
// 选项效果类型：属性变化 / 道具获取 / 环境影响 / 后续波次调整
// ============================================================
const EVENT_TRIGGER_CHANCE = 0.1; // 每波触发概率

// ===== [测试用] 开局立即弹出事件选择面板：改为 false 或删除本行及 startGame 中的标记行即可关闭 =====
const DEBUG_EVENT_ON_START = false;

const RANDOM_EVENTS = [
    {
        id: "cannonEvent-1",
        heroId: "cannon", // 仅缇宝可触发该事件
        name: "火箭的应该是这样的",
        icon: "🚀",
        desc: "休整间隙，缇宝三人围着你的导弹飞行器争论不休。缇宝想把火箭改成「会唱歌的星星」，缇安觉得「软绵绵的云朵造型」更治愈，而缇宁举着原厂设计图挡在电路板前，试图阻止第四颗亮片贴纸被贴到推进器喷口上……他们决定让你做决定。",
        options: [
            {
                label: "采纳缇宝的意见，将火箭改成「会唱歌的星星」",
                tag: "伤害",
                desc:"导弹的伤害会增加15%，并且造成伤害时候可以产生星星特效，但是导弹发射速度会降低5%（因为缇宝想在导弹命中敌人时候鼓掌）",
                apply: () => {
                    player.damage *= 1.15;
                    player.fireRate *= 0.95;
                    player.cannonStarEffect = true;//星星特效
                },
            },
            {
                label: "采纳缇安的意见：将火箭改成「云朵安抚弹」",
                tag: "生命",
                desc:"缇安将火箭可以围绕着缇宝旋转，攻速加快50%，但是伤害减少40%，终结技+2s（缇安想留出时间拥抱）",
                apply: () => {
                    player.cannonOrbitMode = true;       // 普攻改为围绕玩家旋转的轨道弹
                    player.fireRate *= 1.5;              // 攻速加快50%
                    player.cannonOrbitDmgMult = 0.6;     // 伤害减少40%
                    if (player.ultConfig) player.ultConfig.cooldown += 2; // 终结技冷却+2s
                    player.tiananRevive = true;          // 获得一次满血复活机会（缇安的拥抱）
                },
            },
            {
                label: "采纳缇宁的意见：将火箭改成「原厂设计图」",
                tag: "属性",
                desc:"将火箭恢复出厂设置，移除追踪效果每0.01追踪能力转化成1%伤害，包括以后的选择的追踪能力",
                apply: () => {
                    // 移除追踪：当前追踪能力转化为伤害（每0.01 = 1%）
                    const h = player.homing;
                    player.homing = 0;
                    player.finalDmgMult *= (1 + h);
                    player.cannonNoHoming = true; // 以后获得的追踪能力自动转化为伤害
                },
            },
        ],
    },
    // (历史空事件占位对象已移除:无 options 的空事件会导致 offerRandomEvent 抛异常并使游戏卡在 EVENT 状态)
];

// 事件系统运行时状态
let currentEvent = null;        // 当前展示的事件
let selectedEventOption = -1;   // 当前选中的选项索引（-1 未选）

// 尝试触发随机事件（在 startWave 中调用）：10% 概率弹出事件面板并暂停游戏
function tryTriggerRandomEvent(waveNum) {
    if (state !== State.PLAYING) return;          // 仅在正常游戏中触发
    if (waveNum < 2) return;                      // 第 1 波开局即生成，不打断开局节奏
    if (Math.random() >= EVENT_TRIGGER_CHANCE) return;
    offerRandomEvent();
}

// 打开事件面板：随机抽取一个事件并渲染（仅抽取当前英雄可用、结构完整的事件）
function offerRandomEvent() {
    // 防御:缺少 options/名称的非法事件一律过滤,避免选中后抛异常导致游戏卡在 EVENT
    const pool = RANDOM_EVENTS.filter(e =>
        e && (!e.heroId || e.heroId === player.heroId) &&
        Array.isArray(e.options) && e.options.length > 0 && e.name
    );
    if (pool.length === 0) return; // 当前英雄没有可用事件，跳过本次触发
    try {
        currentEvent = choice(pool);
        selectedEventOption = -1;
        state = State.EVENT; // 暂停游戏主循环（与升级/天赋面板同一机制）

        ui.eventIcon.textContent = currentEvent.icon;
        ui.eventName.textContent = currentEvent.name;
        ui.eventDesc.textContent = currentEvent.desc;

        ui.eventOptions.innerHTML = "";
        currentEvent.options.forEach((opt, idx) => {
            const card = document.createElement("div");
            card.className = "event-option";
            card.innerHTML = `
            <div class="event-option-head">
                <span class="event-option-label">${opt.label}</span>
                <span class="event-option-tag">${opt.tag}</span>
            </div>
            <div class="event-option-desc">${opt.desc}</div>
        `;
            card.onclick = () => selectEventOption(idx);
            ui.eventOptions.appendChild(card);
        });

        ui.eventConfirmBtn.disabled = true;
        ui.eventPanel.hidden = false;
    } catch (e) {
        // 渲染异常兜底:恢复游戏运行,绝不允许停留在"无面板的 EVENT 状态"(半冻结)
        console.warn("[Event] 事件面板渲染失败,跳过本次事件:", e);
        currentEvent = null;
        selectedEventOption = -1;
        if (ui.eventPanel) ui.eventPanel.hidden = true;
        state = State.PLAYING;
    }
}

// 选中某个选项（仅高亮，需点确认按钮生效）
function selectEventOption(idx) {
    selectedEventOption = idx;
    [...ui.eventOptions.children].forEach((el, i) => {
        el.classList.toggle("selected", i === idx);
    });
    ui.eventConfirmBtn.disabled = false;
}

// 确认选择：应用选项效果并恢复游戏
function confirmEventChoice() {
    if (state !== State.EVENT || !currentEvent) return;
    const idx = selectedEventOption;
    if (idx < 0 || idx >= currentEvent.options.length) return;

    const opt = currentEvent.options[idx];
    try {
        opt.apply();
        spawnFloatText(player.x, player.y - 40, `${currentEvent.icon} ${opt.label}`, "#7dd3fc");
    } catch (e) {
        console.warn("[Event] 选项效果应用失败:", e);
    }

    // 关闭面板并恢复游戏
    currentEvent = null;
    selectedEventOption = -1;
    ui.eventPanel.hidden = true;
    state = State.PLAYING;
    updateStatus();
}

// ============================================================
// 升级系统(肉鸽核心)
// ============================================================
const UPGRADES = [
    { 
        id: "dmg", name: "阿阮袋", 
        desc: "获得三次升级，但是下两次选项减少2个", rarity: "common",img: "assets/up/阿阮袋.png",
        rarity: "common",stackable: false,
        apply: () => {
            pendingUpgradePicks = 3;
        }
    },
    {
       id: "spongeKing",name: "海绵王", 
       desc: "每进入下一波次，扣除当前80%的血，生命值上限增加10%，效果触发4次后，该装备破碎",
       rarity:"common",img:"assets/up/海绵王.png",stackable: false,
       apply: () => {
            player._spongeKingActive = true;
            player._spongeKingCount = 0;
            },
    },
    {
        id: "fictionalMecha", name: "虚构机兵", 
        desc: "每进入下一波次，恢复最大生命值的20%",
        rarity:"common",img:"assets/up/虚构机兵.png",stackable: false,
        apply: () => {
           player._fictionalMechaActive = true; 
        }
    }
];

// =====================
// 英雄专属升级
// 只有当前选择的对应英雄才会出现在升级池
// =====================
const HERO_EXCLUSIVE_UPGRADES = [
    {
        id: "nova-swarm",
        heroId: "nova",
        name: "小飞机协同",
        desc: "阿格莱雅专属：射速 +15%，伤害 +15%",
        rarity: "rare",
        stackable: false,
        apply: () => {
            player.fireRate *= 1.15;
            player.damage *= 1.15;
        },
    },
    {
        id: "cannon-guided",
        heroId: "cannon",
        name: "万径相连",
        desc: "缇宝专属：追踪 +0.05，伤害 +12%",
        rarity: "rare",
        stackable: false,
        apply: () => {
            player.homing = clamp(player.homing + 0.05, 0, 1.0);
            player.damage *= 1.12;
        },
    },
    {
        id: "cannon-charge",
        heroId: "cannon",
        name: "童话，关于我们",
        desc: "缇宝专属：每 60 秒自动补满一次终结技能充能",
        rarity: "epic",
        stackable: false,
        apply: () => {
            player.chargeRefreshEnabled = true;
            player.chargeRefreshCooldown = 60;
            player.ultimateReady = false;
            player.charge = 0;
        },
    },
    {
        id: "cannon-homing",
        heroId: "cannon",
        name: "童话，关于往昔",
        desc: "缇宝专属： 追踪半径扩大20%，锁敌能力加0.05",
        rarity: "epic",
        stackable: false,
        apply: () => {
        player.cannonRocketTurnRate = (player.cannonRocketTurnRate || 0.12) * 1.30;
        player.cannonRocketTrackRadius = (player.cannonRocketTrackRadius || 300) * 1.20;
        }
    },
    {
        id: "cannon-multishot",
        heroId: "cannon",
        name: "预言，带来纷争",
        desc: "缇宝专属： 增加一次性发射子弹2个，但是伤害减少25%",
        rarity: "epic",
        stackable: false,
        apply: () => {
        player.damage *= 0.75;
        player.multishot += 2;
        }
    },
    {
        id: "cannon-hope",
        heroId: "cannon",
        name: "预言，留下希望",
        desc: "缇宝专属： 每2秒恢复百分之一的血",
        rarity: "epic",
        stackable: false,
        apply: () => {
            player.regenAmount = (player.regenAmount || 0) + 0.01;
            player.regenTimer = player.regenTimer || 0;
        }
    },
    {
        id: "cannon-myth",
        heroId: "cannon",
        name: "预言，再续神话",
        desc: "缇宝专属： 每一波次，我方目标每次施放终结技时，造成的最终伤害提高4%，最多叠加60%。",
        rarity: "epic",
        stackable: false,
        apply: () => {
            player.cannonUltDmgBuffEnabled = true;   // 启用该被动
            player.cannonUltDmgStacks = 0;           // 当前已叠加层数
            player.cannonUltDmgMaxStacks = 15;       // 15层 × 4% = 60%上限
        }
    },
    {
        id: "storm-counter",
        heroId: "storm",
        name: "反击增幅",
        desc: "万敌专属：伤害 +20%，最大生命 +20",
        rarity: "rare",
        stackable: false,
        apply: () => {
            player.damage *= 1.20;
            player.maxHp += 20;
            player.hp = clamp(player.hp + 20, 0, player.maxHp);
        },
    },
];

// ===== 缇宝专属祝福（集齐3个专属升级后触发）=====
const CANNON_BLESSING = {
    id: "cannon-blessing",
    name: "门关月，我令游离的足迹以此同谐",
    desc: "集齐3项缇宝专属升级后获得：追踪能力 +0.15，终结技充能效率 +25%，最大生命值 +15%",
    apply: () => {
        player.homing = clamp(player.homing + 0.15, 0, 1.0);
        if (player.ultConfig) {
            player.ultConfig.chargePerHit *= 1.25;
        }
        player.maxHp *= 1.15;
        player.hp = clamp(player.hp * 1.15, 0, player.maxHp);
        // 全屏特效提示
        spawnFloatText(player.x, player.y - 60, "✨ 门关月，我令游离的足迹以此同谐 ✨", "#ff1e00");
        spawnExplosion(player.x, player.y, "#ff1e00", 40, 2.5);
    }
};

// 检查缇宝是否已集齐3个专属升级，若满足则发放祝福（仅一次）
function checkCannonBlessing() {
    if (player.heroId !== "cannon") return;
    if (player._cannonBlessingGranted) return; // 已发过

    const cannonUpgradeIds = HERO_EXCLUSIVE_UPGRADES
        .filter(u => u.heroId === "cannon")
        .map(u => u.id);

    const ownedCount = historyEntries.filter(h =>
        h.source === "upgrade" && cannonUpgradeIds.includes(h.id)
    ).length;

    if (ownedCount >= 3) {
        player._cannonBlessingGranted = true;
        CANNON_BLESSING.apply();
        // 记录到历史面板
        recordHistory({
            id: CANNON_BLESSING.id,
            name: CANNON_BLESSING.name,
            desc: CANNON_BLESSING.desc,
            rarity: "legendary",
            kind: "legendary",
            source: "upgrade",
            type: "缇宝 专属祝福",
            icon: "✨",
            stackable: false,
        });
        if (typeof renderHeroStatusPanel === "function") renderHeroStatusPanel();
    }
}

const GUARANTEED_FIRST_UPGRADE = {
    cannon: "cannon-guided",
};

// ===== 英雄(战机)定义 - 14 个,各有特色
// hero.image 可选:图片文件名(放在 assets/heroes/ 目录下)
// 若未提供 image 或文件加载失败,会回退到 emoji
// ============================================================
// ============================================================
// 终极技能配置表(每个英雄独立配置,差异化参数)
// chargePerHit: 单次攻击命中充能量(5-20)
// chargeThreshold: 释放所需充能阈值(50-200)
// cooldown: 技能冷却时间(秒,5-15)
// skill: { type, dmg, radius, duration, ... } 技能效果参数
// ============================================================
const HEROES = [
    {
        id: "nova", name: "阿格莱雅", emoji: "🚀", title: "攻速型", image: "阿格莱雅.png",
        desc: "会召唤一个小飞机帮助攻击敌人，开启终极技能攻击后攻速变快，攻击越快伤害越高。",
        base: {},
        ultimate: {
            chargePerHit: 8, chargeThreshold: 100, cooldown: 8,
            skill: { type: "frenzy", dmg: 0, radius: 0, duration: 6, fireRateMult: 2.2, dmgMult: 1.4 },
            icon: null, // null 表示使用角色头像
        },
    },
    {
        id: "cannon", name: "缇宝", emoji: "💥", title: "重炮手", image: "缇宝.png",
        desc: "普通攻击会自动追踪敌人，单发伤害翻倍,但射速减半、子弹更大。开启终极技能6秒内。命中敌人时，发射一个50%最大生命值的小火箭攻击敌人。",
        base: { damage: 20, fireRate: 3.3, bulletR: 6, homing: 0.05 },
        ultimate: {
            chargePerHit: 15, chargeThreshold: 120, cooldown: 10,//chargePerHit每次攻击恢复能量, chargeThreshold开启大招需要能量, cooldown技能触发的cd,
            skill: { type: "rocket", dmg: 0, radius: 80, duration: 10, hpRatio: 0.5 },//type:技能类型, dmg:伤害, radius:范围, duration:持续时间, hpRatio:小火箭伤害为敌人最大生命值的百分比
            icon: null,// null 表示使用角色头像
        },
    },
    {
        id: "storm", name: "万敌", emoji: "⚡", title: "反击型", image: "万敌.png",
        desc: "受到一定伤害时会触发一次厉害攻击，攻击范围大、伤害高。开启终极技能后，最大生命值增加，受到伤害增加。",
        base: { damage: 5.5, fireRate: 11.5 },
        ultimate: {
            chargePerHit: 12, chargeThreshold: 150, cooldown: 12,
            skill: { type: "berserk", dmg: 0, radius: 0, duration: 8, maxHpBonus: 80, dmgTakenMult: 1.5, dmgDealtMult: 2.0 },
            icon: null,
        },
    },
    //普通攻击是近战攻击，伤害基于遐蝶生命值，每次攻击消耗遐蝶自身生命值，开局生成一个立场，范围内的敌人会每秒受到伤害，遐蝶的终结技解锁条件是遐蝶累计失去当前最大生命值的30%，开启终结技召唤巨龙对全屏敌人造成每秒造成遐蝶身最大生命值百分之20的伤害，持续4秒，期间普攻对敌人造成伤害翻倍,在4秒后龙会自爆，对全屏敌人造成遐蝶身最大生命值百分之30的伤害，并给遐蝶恢复10%的血
    {
        id: "scatter", name: "遐蝶", emoji: "🌟", title: "立场型", image: "遐蝶.png",
        desc: "普通攻击是近战攻击，全内的敌人会每秒受到伤害，开启终结技召唤巨龙对全屏敌人造成伤害，普攻伤害翻倍,在4秒后龙会自爆，对全屏敌人造成遐蝶身最大生命值的伤害，并给遐蝶回血。",
        base: { damage: 0.05, range: 60, attackSpeed: 1.0 },
        passive:{ type: "field", dmgPercent: 0.05, interval: 1.0, radius: 9999 },
        ultimate: {
            chargePerHit: 6, chargeThreshold: 130, cooldown: 11,
            skill: { type: "dragon", dmgPercent: 0.20, radius: 9999, duration: 4.0, hits: 4, interval: 1.0, burstPercent: 0.30, healPercent: 0.10 },
            icon: null,
        },
    },
    {
        id: "lance", name: "那刻夏", emoji: "🎯", title: "追击流", image: "那刻夏.png",
        desc: "子弹攻击到敌人会自动追击后面一名敌人，子弹攻击到敌人会叠加一次印记，攻击到三个印记的敌人发动一次追加攻击，开启终结技时，给所有敌人加上三层印记，静止1秒钟。",
        base: { pierce: 2, damage: 8.5 },
        ultimate: {
            chargePerHit: 10, chargeThreshold: 110, cooldown: 9,
            skill: { type: "mark", dmg: 50, radius: 9999, duration: 1, markStacks: 3, freezeTime: 1 },
            icon: null,
        },
    },
    {
        id: "crit", name: "风堇", emoji: "🗡️", title: "吸血流", image: "风堇.png",
        desc: "30% 暴击率,暴击伤害 3 倍,但基础伤害略低。开启终结技时，吸血效果翻倍，攻击必定暴击。",
        base: { critChance: 0.30, critMult: 3, damage: 8.5 },
        ultimate: {
            chargePerHit: 9, chargeThreshold: 100, cooldown: 8,
            skill: { type: "bloodlust", dmg: 0, radius: 0, duration: 6, lifestealMult: 2, critChance: 1.0 },
            icon: null,
        },
    },
    {
        id: "bastion", name: "赛飞儿", emoji: "🛡️", title: "攒钱者", image: "赛飞儿.png",
        desc: "每次攻击可以获得伤害的10%的金币，开启终结技时，可以对场上最厉害的敌人释放一次根据金币数量的强力攻击。",
        base: { maxHp: 200, hp: 200, shield: 2, damage: 8 },
        ultimate: {
            chargePerHit: 7, chargeThreshold: 90, cooldown: 7,
            skill: { type: "gold_strike", dmg: 0, radius: 60, duration: 0, goldRatio: 8 },
            icon: null,
        },
    },
    {
        id: "zephyr", name: "白厄", emoji: "🌪️", title: "疾风", image: "白厄.png",
        desc: "移动速度极快,但生命只有 70。开启终结技时，时间静止2秒，期间无敌。",
        base: { speed: 6.5, maxHp: 70, hp: 70 },
        ultimate: {
            chargePerHit: 11, chargeThreshold: 100, cooldown: 9,
            skill: { type: "time_stop", dmg: 0, radius: 0, duration: 2, invul: true },
            icon: null,
        },
    },
    {
        id: "leech", name: "海瑟音", emoji: "🩸", title: "dot鬼", image: "海瑟音.png",
        desc: "每次攻击敌人叠加一层流血效果,持续伤害敌人,开启终结技时，流血效果翻倍。",
        base: { lifesteal: 5, damage: 8.5 },
        ultimate: {
            chargePerHit: 10, chargeThreshold: 110, cooldown: 10,
            skill: { type: "bleed_burst", dmg: 0, radius: 9999, duration: 5, bleedMult: 2 },
            icon: null,
        },
    },
    {
        id: "hunter", name: "刻律德拉", emoji: "🔮", title: "双倍流", image: "刻律德拉.png",
        desc: "每次攻击会记录一次，记录到第6次时候的攻击发射双倍，层数减少6层，开启终极技能时，对全屏造成伤害，层数增加2层。",
        base: { homing: 0.35, fireRate: 5.1 },
        ultimate: {
            chargePerHit: 8, chargeThreshold: 120, cooldown: 11,
            skill: { type: "double_strike", dmg: 60, radius: 9999, duration: 0, stackAdd: 2 },
            icon: null,
        },
    },
    {
        id: "inferno", name: "长夜月", emoji: "🔥", title: "爆破流", image: "长夜月.png",
        desc: "击杀敌人时产生范围爆炸,连锁清场。开启终结技时，引爆所有敌人造成大量伤害。",
        base: { explodeOnKill: true, damage: 8.5 },
        ultimate: {
            chargePerHit: 12, chargeThreshold: 130, cooldown: 10,
            skill: { type: "detonate", dmg: 80, radius: 100, duration: 0 },
            icon: null,
        },
    },
    {
        id: "sage", name: "丹恒腾荒", emoji: "📚", title: "经验家", image: "丹恒腾荒.png",
        desc: "获得 60% 额外经验,升级飞快。开启终结技时，立即获得大量经验。",
        base: { xpBonus: 1.6, damage: 8.5 },
        ultimate: {
            chargePerHit: 9, chargeThreshold: 80, cooldown: 6,
            skill: { type: "knowledge", dmg: 0, radius: 0, duration: 0, xpGain: 15 },
            icon: null,
        },
    },
    {
        id: "maul", name: "昔涟", emoji: "🪐", title: "重型弹", image: "昔涟.png",
        desc: "超大子弹(伤害范围广),单发高伤。开启终结技时，发射一颗超巨型炮弹，贯穿全场。",
        base: { bulletR: 8, damage: 13, fireRate: 4.5 },
        ultimate: {
            chargePerHit: 14, chargeThreshold: 140, cooldown: 12,
            skill: { type: "mega_shot", dmg: 200, radius: 30, duration: 0, pierce: 999 },
            icon: null,
        },
    },
    {
        id: "bolt", name: "记忆主", emoji: "💫", title: "神速弹", image: "记忆主.png",
        desc: "子弹飞行极快,射击频率略升。开启终结技时，3秒内无限穿透且子弹数翻倍。",
        base: { bulletSpeed: 14, fireRate: 6.9, damage: 9 },
        ultimate: {
            chargePerHit: 7, chargeThreshold: 90, cooldown: 7,
            skill: { type: "rapid_fire", dmg: 0, radius: 0, duration: 3, pierce: 999, multishotBonus: 2 },
            icon: null,
        },
    },
];

// ============================================================
// 模式系统 + 进度保存
// ============================================================
const PROGRESS_KEY = "rls_progress_v1";
const PROGRESS_VERSION = 1;
const STORY_INITIAL_UNLOCKED_COUNT = 3; // 剧情模式初始解锁的英雄数量（通关 Boss 可逐个解锁）

/**
 * 简易校验和（CRC16 简化版），防止手动篡改进度数据
 * 不是加密，但能识别绝大多数"改个值就能作弊"的尝试
 */
function progressChecksum(jsonStr) {
    let h = 0xA5A5;
    for (let i = 0; i < jsonStr.length; i++) {
        h ^= jsonStr.charCodeAt(i);
        h = (h << 1) | (h >> 15);
        h &= 0xFFFF;
    }
    return h.toString(16).padStart(4, "0");
}

const Progress = {
    // 运行时状态（内存）
    mode: null,          // "endless" | "story"
    storyUnlocked: [],   // 剧情模式已解锁的英雄 id 列表
    storyCurrentHero: null, // 剧情模式当前锁定英雄
    storyLevel: 0,       // 剧情模式已通关关卡数（每击败一个 Boss +1）
    storyProphecyShown: false, // 缇宝预言是否已展示（每次剧情仅一次）

    // 序列化 + 保存
    save() {
        try {
            const data = {
                v: PROGRESS_VERSION,
                mode: this.mode,
                storyUnlocked: this.storyUnlocked,
                storyCurrentHero: this.storyCurrentHero,
                storyLevel: this.storyLevel,
                storyProphecyShown: this.storyProphecyShown,
                savedAt: Date.now(),
            };
            const json = JSON.stringify(data);
            const checksum = progressChecksum(json);
            localStorage.setItem(PROGRESS_KEY, json + "." + checksum);
            return true;
        } catch (e) {
            console.warn("[Progress] 保存失败:", e);
            return false;
        }
    },

    // 加载并校验
    load() {
        try {
            const raw = localStorage.getItem(PROGRESS_KEY);
            if (!raw) return null;
            const lastDot = raw.lastIndexOf(".");
            if (lastDot < 0) { localStorage.removeItem(PROGRESS_KEY); return null; }
            const json = raw.substring(0, lastDot);
            const checksum = raw.substring(lastDot + 1);
            if (progressChecksum(json) !== checksum) {
                console.warn("[Progress] 校验和不匹配,进度可能被篡改,已重置");
                localStorage.removeItem(PROGRESS_KEY);
                return null;
            }
            const data = JSON.parse(json);
            if (data.v !== PROGRESS_VERSION) return null;
            return data;
        } catch (e) {
            console.warn("[Progress] 加载失败:", e);
            localStorage.removeItem(PROGRESS_KEY);
            return null;
        }
    },

    // 重置剧情模式
    resetStory() {
        this.storyUnlocked = HEROES.slice(0, STORY_INITIAL_UNLOCKED_COUNT).map(h => h.id);
        this.storyCurrentHero = null;
        this.storyLevel = 0;
        this.storyProphecyShown = false;
        this.save();
    },

    // 设置当前模式
    setMode(mode) {
        this.mode = mode;
        if (mode === "story" && this.storyUnlocked.length === 0) {
            this.resetStory();
        }
        this.save();
    },

    // 剧情模式：选择并锁定英雄
    lockHeroInStory(heroId) {
        this.storyCurrentHero = heroId;
        this.save();
    },

    // 剧情模式：通关一个关卡 → 解锁下一个英雄
    unlockNextHero() {
        const locked = HEROES.filter(h => !this.storyUnlocked.includes(h.id));
        if (locked.length === 0) return null;
        const next = locked[0];
        this.storyUnlocked.push(next.id);
        this.storyLevel++;
        this.save();
        return next;
    },

    // 剧情模式：通关一个关卡（击败 Boss）
    markLevelCleared() {
        const unlocked = this.unlockNextHero();
        return unlocked;
    },

    // 判断英雄是否已解锁
    isHeroUnlocked(heroId) {
        if (this.mode === "endless") return true;
        if (this.mode === "story") return this.storyUnlocked.includes(heroId);
        return true; // mode 未确定前默认全部解锁
    },

    // 判断是否存在可继续的剧情进度
    hasStoryProgress() {
        return this.mode === "story" && !!this.storyCurrentHero && this.storyUnlocked.length > 0;
    },
};

// 页面关闭/刷新前自动保存
window.addEventListener("beforeunload", () => Progress.save());

// 初始化：加载已有进度
(function initProgress() {
    const saved = Progress.load();
    if (saved) {
        Progress.mode = saved.mode || null;
        Progress.storyUnlocked = saved.storyUnlocked || [];
        Progress.storyCurrentHero = saved.storyCurrentHero || null;
        Progress.storyLevel = saved.storyLevel || 0;
        Progress.storyProphecyShown = !!saved.storyProphecyShown;
        // 兼容旧存档：如果剧情关卡 0 但解锁数远超初始值，说明是旧格式，自动修正
        if (
            Progress.mode === "story" &&
            Progress.storyLevel === 0 &&
            !Progress.storyCurrentHero &&
            Progress.storyUnlocked.length > STORY_INITIAL_UNLOCKED_COUNT
        ) {
            console.warn("[Progress] 检测到旧格式存档,重置剧情解锁列表");
            Progress.storyUnlocked = HEROES.slice(0, STORY_INITIAL_UNLOCKED_COUNT).map(h => h.id);
            Progress.save();
        }
    }
})();

// ============================================================
// 【1】角色游戏数据（持久化:gameData_{heroId}）
//   - counter:            该英雄通关计数（角色计数器）
//   - unlockedDifficulty: 最高已解锁难度(1=难度1可用,2=首次通关后,上限5)
//   元天赋入口解锁条件: unlockedDifficulty >= 2（即首次通关20波）
// ============================================================
const HERO_GAMEDATA_VERSION = 1;
const HERO_GAMEDATA_KEY_PREFIX = "gameData_";
const _heroDataCache = {};

const HeroGameData = {
    _key(heroId) { return HERO_GAMEDATA_KEY_PREFIX + heroId; },

    _default() {
        return { v: HERO_GAMEDATA_VERSION, counter: 0, unlockedDifficulty: 1, savedAt: 0 };
    },

    /**
     * 读取并校验角色数据。
     * 格式错误/字段缺失/被篡改(类型异常) → 自动重置为默认值并回写,保证系统可用
     */
    load(heroId) {
        if (!heroId) return this._default();
        if (_heroDataCache[heroId]) return _heroDataCache[heroId];
        let data = null;
        try {
            const raw = localStorage.getItem(this._key(heroId));
            if (raw) data = JSON.parse(raw);
        } catch (e) {
            data = null;
        }
        // 完整性校验:结构或字段类型异常一律重置
        const d = this._default();
        let valid = data
            && typeof data === "object"
            && data.v === HERO_GAMEDATA_VERSION
            && Number.isFinite(data.counter) && data.counter >= 0
            && Number.isFinite(data.unlockedDifficulty) && data.unlockedDifficulty >= 1;
        if (valid) {
            d.counter = Math.floor(data.counter);
            d.unlockedDifficulty = clamp(Math.floor(data.unlockedDifficulty), 1, 5);
        } else {
            // 数据损坏:立即回写默认值
            this.save(heroId, d);
        }
        _heroDataCache[heroId] = d;
        return d;
    },

    save(heroId, data) {
        try {
            const d = data || _heroDataCache[heroId] || this._default();
            d.savedAt = Date.now();
            _heroDataCache[heroId] = d;
            localStorage.setItem(this._key(heroId), JSON.stringify(d));
        } catch (e) {
            console.warn("[HeroGameData] 保存失败:", e);
        }
    },

    get(heroId) { return this.load(heroId); },
};

// 判断是否有可继续的存档（用于入口 UI）
function hasSavedProgress() {
    return Progress.mode !== null;
}

let selectedHeroId = null;

// 英雄图片的基础路径
const HERO_IMG_DIR = "assets/heroes/";
// 支持的图片扩展名(会按顺序尝试)
const HERO_IMG_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

/**
 * 获取英雄图片 URL
 * 优先用 h.image 指定的文件名,否则用 h.id + h.name 匹配
 * 找不到返回 null(调用方应回退到 emoji)
 */
function getHeroImagePath(h) {
    if (!h) return null;
    if (h.image) return HERO_IMG_DIR + h.image;
    // 自动探测:依次尝试 id.png、id.jpg、name.png、name.jpg ...
    const candidates = [];
    HERO_IMG_EXTS.forEach(ext => {
        candidates.push(HERO_IMG_DIR + h.id + ext);
        candidates.push(HERO_IMG_DIR + h.name + ext);
    });
    // 返回第一个候选(浏览器会自动处理 404,失败后 img onerror 会隐藏)
    return candidates[0];
}

// 获取英雄的图标 HTML:优先 img,回退 emoji
function getHeroIconHtml(h) {
    const path = getHeroImagePath(h);
    if (path) {
        return `<img class="hero-icon-img" src="${path}" alt="${h.name}" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='');">
                <span class="hero-emoji" style="display:none">${h.emoji}</span>`;
    }
    return `<span class="hero-emoji">${h.emoji}</span>`;
}

// 默认玩家基线(新星号)
const PLAYER_BASELINE = {
    x: W / 2, y: H - 90,
    speed: 4,
    damage: 10, fireRate: 6, bulletSpeed: 9, bulletR: 4,
    multishot: 1, spread: 0.12, pierce: 0, homing: 0,
    critChance: 0.05, critMult: 2, lifesteal: 0,
    explodeOnKill: false, xpBonus: 1,
    maxHp: 100, hp: 100, shield: 0,
    fireCd: 0, invul: 0, thrust: 0,
    finalDmgMult: 1,
    // 终极技能相关基线
    charge: 0, ultimateReady: false, ultimateCooldown: 0,
    ultimateActive: null, ultimateActiveTimer: 0,
    autoMode: true, autoReleaseTimer: 0,
    bleedStacks: {}, markStacks: {}, hitCount: 0, gold: 0,
    // ===== 缇宝小技能基线 =====
    cannonMiniActive: false,     // 小技能是否生效中
    cannonMiniTimer: 0,          // 生效时间剩余(秒)
    cannonMiniCooldown: 0,       // 冷却剩余时间(秒)
    cannonMiniAutoMode: true,    // 自动模式:冷却结束立即触发;false 手动按 E
    cannonMiniOriginalDamage: 0, // 生效前原始伤害(用于结束时恢复)
    cannonRocketTalent: false,   // 缇宝专属：小技能期间每次命中额外发射追击火箭
    cannonOrbitMode: false,      // 缇宝「云朵安抚弹」：普攻改为围绕玩家旋转的轨道弹
    cannonOrbitDmgMult: 1,       // 云朵安抚弹伤害系数（事件减伤用）
    tiananRevive: false,        // 缇安的拥抱：死亡时满血复活一次（云朵安抚弹事件获得）
    cannonNoHoming: false,     // 缇宁「原厂设计图」：移除追踪，追踪能力自动转化为伤害
};

// 渲染英雄选择网格
function renderHeroGrid() {
    const grid = document.getElementById("heroGrid");
    grid.innerHTML = "";
    const isStory = Progress.mode === "story";
    const storyLockedId = Progress.mode === "story" ? Progress.storyCurrentHero : null;
    HEROES.forEach(h => {
        const cell = document.createElement("div");
        cell.className = "hero-cell";
        cell.dataset.id = h.id;
        const unlocked = Progress.isHeroUnlocked(h.id);
        if (!unlocked) cell.classList.add("locked");
        if (isStory && storyLockedId && storyLockedId === h.id) cell.classList.add("story-locked");
        cell.innerHTML = `
            ${getHeroIconHtml(h)}
            <div class="hero-name-mini">${h.name}${!unlocked ? " (未解锁)" : ""}</div>
            ${HeroGameData.get(h.id).counter > 0 ? `<span class="hero-counter-badge">计数: ${HeroGameData.get(h.id).counter}</span>` : ""}
        `;
        grid.appendChild(cell);
    });
}

// 事件委托:在 grid 上监听 mouseenter(委托)和 click
const heroGridEl = document.getElementById("heroGrid");
heroGridEl.addEventListener("mouseover", e => {
    const cell = e.target.closest(".hero-cell");
    if (cell) previewHero(cell.dataset.id);
});
heroGridEl.addEventListener("click", e => {
    const cell = e.target.closest(".hero-cell");
    if (cell) selectHero(cell.dataset.id);
});

// 悬停预览
function previewHero(id) {
    const h = HEROES.find(x => x.id === id);
    if (!h) return;
    const b = { ...PLAYER_BASELINE, ...h.base };
    const iconHtml = (() => {
        const path = getHeroImagePath(h);
        if (path) {
            return `<img class="hp-icon" src="${path}" alt="${h.name}" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='';">
                    <span class="hp-emoji" style="display:none">${h.emoji}</span>`;
        }
        return `<span class="hp-emoji">${h.emoji}</span>`;
    })();
    document.getElementById("heroPreview").innerHTML = `
        <div class="hp-name">${iconHtml} ${h.name}</div>
        <div class="hp-title">${h.title}</div>
        <div class="hp-desc">${h.desc}</div>
        <div class="hp-stats">
            <div class="hp-stat"><span>生命</span><b>${b.maxHp}</b></div>
            <div class="hp-stat"><span>伤害</span><b>${b.damage}</b></div>
            <div class="hp-stat"><span>射速</span><b>${b.fireRate}/s</b></div>
            <div class="hp-stat"><span>子弹数</span><b>${b.multishot}</b></div>
            <div class="hp-stat"><span>穿透</span><b>${b.pierce}</b></div>
            <div class="hp-stat"><span>暴击</span><b>${Math.round(b.critChance * 100)}%</b></div>
            <div class="hp-stat"><span>移速</span><b>${b.speed}</b></div>
            <div class="hp-stat"><span>弹速</span><b>${b.bulletSpeed}</b></div>
        </div>
    `;
}

// 点击选中
function selectHero(id) {
    // 剧情模式：只能选已解锁英雄；已锁定英雄强制选中不可更换
    if (!Progress.isHeroUnlocked(id)) {
        spawnFloatText(window.innerWidth / 2, window.innerHeight / 2, "该英雄未解锁！", "#f87171");
        return;
    }
    selectedHeroId = id;
    document.querySelectorAll(".hero-cell").forEach(c => {
        c.classList.toggle("selected", c.dataset.id === id);
    });
    previewHero(id);
    document.getElementById("heroConfirmBtn").disabled = false;
    syncMetaTalentBtn(); // v12: 选中英雄后按其解锁状态显示元天赋入口
}

// 剧情模式锁定英雄：自动选中并隐藏选择自由度
function lockStoryHeroOnGrid() {
    if (Progress.mode !== "story") return;
    const lockedId = Progress.storyCurrentHero;
    if (!lockedId) return;
    selectedHeroId = lockedId;
    renderHeroGrid(); // 重新渲染以标出 story-locked
    document.querySelectorAll(".hero-cell").forEach(c => {
        c.classList.toggle("selected", c.dataset.id === lockedId);
    });
    previewHero(lockedId);
    document.getElementById("heroConfirmBtn").disabled = false;
}

function offerUpgrades() {
    state = State.UPGRADE;
    ui.upgradeWave.textContent = wave;
    // v20:消耗一次积压升级(奖励升级"阿阮袋"次数优先,不占用积压次数)
    if (pendingUpgradePicks <= 0 && pendingLevelUps > 0) pendingLevelUps--;

    // 1) 当前英雄是谁：玩家在游戏中选择的英雄，或者菜单中已选中的英雄
    const activeHeroId = player.heroId || selectedHeroId;

    // 2) 取出当前英雄的专属升级池 + 通用升级池
    //    这样升级时，既有全局通用升级，也有该英雄专属的强化方向
    let heroSpecificPool = HERO_EXCLUSIVE_UPGRADES.filter(u => u.heroId === activeHeroId);
    let basePool = [...UPGRADES].filter(u => !(activeHeroId === "cannon" && u.id === "homing"));

    // 已选升级过滤：对于 stackable === false 的升级，若已在 historyEntries 中记录过，则从池中剔除
    //    —— 英雄专属升级全部为不可叠加（stackable:false），选择后必须立即失效
    const filterChosenUpgrades = (u) => {
        if (u.stackable === false) {
            return !historyEntries.some(h => h.source === "upgrade" && h.id === u.id);
        }
        return true;
    };
    basePool = basePool.filter(filterChosenUpgrades);
    heroSpecificPool = heroSpecificPool.filter(filterChosenUpgrades);

    const pool = [...basePool, ...heroSpecificPool];
    let pickCount;
    
    if (pendingUpgradePicks > 0) {
        // 奖励模式：第一次3个，后续每次只有1个
        pickCount = (pendingUpgradePicks === 3) ? 3 : 1;
        pendingUpgradePicks--;  // 消耗一次
    } else {
        pickCount = 3; // 正常升级始终3选1
    }
    const picks = [];
    const weight = { common: 1, rare: 0.55, epic: 0.3, legendary: 0.12 };
    
    // 3) 首次强制升级规则：某些英雄在第一次升级时，必须出现指定专属升级
    //    例如缇宝第一次升级必定出现 "cannon-guided"
    const guaranteedId = GUARANTEED_FIRST_UPGRADE[activeHeroId];
    const shouldForceFirstUpgrade = Boolean(guaranteedId) && !player.firstUpgradeSeen[activeHeroId];

    
    if (shouldForceFirstUpgrade) {
        // 从当前可选升级中，找到这个固定 ID 的专属升级
        // 如果没找到，就直接跳过强制规则，继续随机筛选
        const forcedUpgrade = [...pool].find(u => u.id === guaranteedId)
            || heroSpecificPool.find(u => u.id === guaranteedId);

        if (forcedUpgrade) {
            // 强制塞入 picks，确保它一定出现
            picks.push(forcedUpgrade);
            // 标记：这个英雄已经触发过首次强制升级，以后不再强制
            player.firstUpgradeSeen[activeHeroId] = true;
        }
    }

    // 4) 把强制加入的那一项从池子中剔除，防止重复出现
    const remainingPool = pool.filter(u => !picks.some(p => p.id === u.id));

    // 5) 补齐剩余 2 个升级：按稀有度权重随机抽取
    while (picks.length < pickCount && remainingPool.length) {
        const total = remainingPool.reduce((s, u) => s + (weight[u.rarity] || 1), 0);
        let r = Math.random() * total;
        let idx = 0;
        for (let i = 0; i < remainingPool.length; i++) {
            r -= (weight[remainingPool[i].rarity] || 1);
            if (r <= 0) { idx = i; break; }
            idx = i;
        }
        picks.push(remainingPool.splice(idx, 1)[0]);
    }

    // 6) 如果当前英雄没有专属升级，或池子为空，则回退到通用池
    //    这样不会因为缺少专属内容导致升级为空
    if (picks.length < pickCount && remainingPool.length === 0) {
        const fallback = [...basePool].filter(u => !picks.some(p => p.id === u.id));
        while (picks.length < pickCount && fallback.length) {
            const total = fallback.reduce((s, u) => s + (weight[u.rarity] || 1), 0);
            let r = Math.random() * total;
            let idx = 0;
            for (let i = 0; i < fallback.length; i++) {
                r -= (weight[fallback[i].rarity] || 1);
                if (r <= 0) { idx = i; break; }
                idx = i;
            }
            picks.push(fallback.splice(idx, 1)[0]);
        }
    }

    // 7) 池已抽空(所有不可叠加升级都拿过)且无可选项:禁止弹出空升级面板
    //    空面板会让游戏永久卡在 UPGRADE 状态(无卡可点=软锁),改为发金币补偿并继续结算流程
    if (picks.length === 0) {
        pendingUpgradePicks = 0;
        coins += 25;
        if (ui.coinVal) ui.coinVal.textContent = "🪙" + coins;
        try { updateStatus(); } catch (e) {}
        ui.upgradePanel.hidden = true;
        console.warn("[Upgrade] 升级池已抽空,跳过本次升级并发放 25 金币补偿");
        // v20:空池视同完成一次选择,继续后续结算(还有积压升级 → 继续选;否则进商店)
        if (pendingLevelUps > 0) setTimeout(() => offerUpgrades(), 350);
        else offerShop();
        return;
    }

    ui.upgradeList.innerHTML = "";
    picks.forEach(u => {
        const card = document.createElement("div");
        card.className = "upgrade-card";
        card.innerHTML = `
            <div class="upgrade-head">
        ${u.img ? `<img class="upgrade-icon-img" src="${u.img}" alt="${u.name}" onerror="this.style.display='none'">` : ""}
        <div class="upgrade-info">
            <div class="upgrade-name">${u.name}
                <span class="rarity ${u.rarity}">${({common:"普通",rare:"稀有",epic:"史诗",legendary:"传说"})[u.rarity]}</span>
            </div>
                <div class="upgrade-desc">${u.desc}</div>
            </div>
        </div>`;
        card.onclick = () => {
            u.apply();
            // 记录升级选择到英雄成长面板(状态面板)
            try { recordUpgradeChosen(u.id); } catch(e){}

            // 缇宝祝福：集齐3个专属升级后触发（仅一次）
            try { checkCannonBlessing(); } catch(e){ console.warn(e); }

            if (pendingUpgradePicks > 0) {
                setTimeout(()=> offerUpgrades(), 350); // 奖励模式:延迟显示下一轮升级
            } else if (pendingLevelUps > 0) {
                setTimeout(()=> offerUpgrades(), 350); // v20:还有积压升级,继续下一次选择
            } else {
                // v20:升级选择全部完成 → 进入波次商店
                ui.upgradePanel.hidden = true;
                offerShop();
                updateStatus();
            }
        };
        ui.upgradeList.appendChild(card);
    });
    ui.upgradePanel.hidden = false;
}

// ============================================================
// 粒子/特效
// ============================================================
function spawnExplosion(x, y, color, count = 12, power = 1) {
    for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const sp = rand(1, 4) * power;
        particles.push({
            x, y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: rand(20, 40),
            maxLife: 40,
            r: rand(1.5, 3.5),
            color,
        });
    }
}

function spawnFloatText(x, y, text, color) {
    floatTexts.push({ x, y, text, color, life: 50, maxLife: 50 });
}

// Boss 技能台词
function showBossDialogue(e, text, color = "#fff", duration = 1.8) {
    e.dialogue = text;
    e.dialogueColor = color;
    e.dialogueTimer = duration;
}

function spawnTrail(x, y, color) {
    particles.push({
        x, y, vx: 0, vy: rand(0.3, 0.8),
        life: 18, maxLife: 18, r: rand(1, 2.5), color, fade: true,
    });
}

// 绘制五角星路径（以 x,y 为中心，r 为外接半径，rot 为旋转角）
function starPath(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const a = rot + i * TAU / 5 - Math.PI / 2;
        const ax = x + Math.cos(a) * r;
        const ay = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(ax, ay);
        else ctx.lineTo(ax, ay);
        const a2 = a + TAU / 10;
        ctx.lineTo(x + Math.cos(a2) * r * 0.45, y + Math.sin(a2) * r * 0.45);
    }
    ctx.closePath();
}

// 缇宝星星爆开特效：与普通怪物死亡爆炸形成强烈视觉区分
// 双色系（金色×品红）、多层加亮闪光、中心旋转大星、碎片带动态拖尾
// 总时长约 1.5~2.5 秒（90~150 帧），不影响游戏节奏
function spawnStarBurst(x, y) {
    // 1) 双层闪光：白热核心 + 品红外晕，快速膨胀增强冲击力
    particles.push({
        x, y, vx: 0, vy: 0, r: 8, grow: 5,
        life: 14, maxLife: 14, color: "#fff8dc", type: "starFlash",
    });
    particles.push({
        x, y, vx: 0, vy: 0, r: 12, grow: 3.4,
        life: 22, maxLife: 22, color: "#ff3da6", type: "starFlash",
    });
    // 2) 双色光环：金色内环 + 品红外环，向外扩散形成冲击波层
    particles.push({
        x, y, vx: 0, vy: 0, r: 10, grow: 4.5,
        life: 20, maxLife: 20, color: "#ffd700", type: "starRing",
    });
    particles.push({
        x, y, vx: 0, vy: 0, r: 6, grow: 5,
        life: 24, maxLife: 24, color: "#ff3da6", type: "starRing",
    });
    // 3) 中心旋转大星：特效的专属辨识元素
    particles.push({
        x, y, vx: 0, vy: 0, r: 10, grow: 1.1,
        life: 32, maxLife: 32, color: "#ffd700",
        type: "starCore", rot: 0, vrot: 0.09,
    });
    // 4) 双色火花点缀
    spawnExplosion(x, y, "#ffd700", 8, 1.3);
    spawnExplosion(x, y, "#ff3da6", 6, 1.1);
    // 5) 星星碎片：金色为主、品红/亮黄点缀，随机大小/速度/轨迹，
    //    向上抛起后受重力自然坠落，生命 90~150 帧（1.5~2.5 秒）
    for (let i = 0; i < 16; i++) {
        const a = rand(0, TAU);
        const sp = rand(2, 7);
        const lf = rand(90, 150);
        const color = Math.random() < 0.25 ? "#ff3da6" : (Math.random() < 0.4 ? "#fff3b0" : "#ffd700");
        particles.push({
            x: x + rand(-5, 5), y: y + rand(-5, 5),
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp * 0.6 - rand(1, 3),
            r: rand(2.5, 6),
            life: lf, maxLife: lf,
            color,
            type: "starFrag",
            gravity: 0.075,
            rot: rand(0, TAU),
            vrot: rand(-0.15, 0.15),
            trailAcc: 0,
        });
    }
}

// ============================================================
// 碰撞
// ============================================================
function circleHit(a, b) {
    const r = a.r + b.r;
    return dist2(a.x, a.y, b.x, b.y) < r * r;

}

function updateBossAreaWarnings(dt) {
    for (let i = bossAreaWarnings.length - 1; i >= 0; i--) {
        const warning = bossAreaWarnings[i];
        warning.timer -= dt / 60;
        if (warning.timer <= 0) {
            if (dist2(warning.x, warning.y, player.x, player.y) <= warning.radius * warning.radius) {
                damagePlayer(warning.damage);
                spawnFloatText(player.x, player.y - 24, "范围爆炸 -" + warning.damage, "#c084fc");
                spawnExplosion(warning.x, warning.y, "#c084fc", 36, 2);
            }
            bossAreaWarnings.splice(i, 1);
        }
    }
}

// ============================================================
// 玩家受击
// ============================================================
function damagePlayer(amount) {
    // v12: 难度系统 —— 敌方伤害 ×(1 + 10%×(难度-1))
    amount = Math.max(1, Math.round(amount * getDifficultyMult().dmg));
    if (player.invul > 0) return;
    if (player.shield > 0) {
        player.shield--;
        player.invul = 40;
        spawnFloatText(player.x, player.y - 20, "护盾!", "#00e5ff");
        spawnExplosion(player.x, player.y, "#00e5ff", 14, 1);
        return;
    }
    player.hp -= amount;
    player.invul = 50;
    spawnFloatText(player.x, player.y - 20, "-" + amount, "#f87171");
    spawnExplosion(player.x, player.y, "#f87171", 8, 0.6);
    // 遐蝶：受到伤害损失的生命同样累计充能终结技
    if (player.heroId === "scatter") chargeScatterUlt(amount);
    if (player.hp <= 0) {
        // 缇安的拥抱：优先消耗复活机会，满血复活而非结算
        if (player.tiananRevive) {
            player.tiananRevive = false;
            player.hp = player.maxHp;
            player.invul = 120; // 2 秒无敌，避免复活瞬间再次被击杀
            audio.playReviveBgm(); // 复活时切换 BGM 为《明天你好》
            spawnExplosion(player.x, player.y, "#f87171", 40, 2.5);
            spawnExplosion(player.x, player.y, "#fff", 20, 1.5);
            spawnFloatText(player.x, player.y - 30, "缇安的拥抱！满血复活", "#f87171");
            // 记录「缇安」升级到历史面板
            recordHistory({
                id: "tianan-revive",
                name: "缇安",
                desc: "死亡时满血复活一次（缇安的拥抱）",
                rarity: "legendary",
                kind: "legendary",
                source: "upgrade",
                type: "缇安 拥抱",
                icon: '<img src="assets/up/缇安.png" style="width:1.1em;height:1.1em;vertical-align:middle">',
                stackable: false,
            });
            if (typeof renderHeroStatusPanel === "function") renderHeroStatusPanel();
            return;
        }
        player.hp = 0;
        gameOver();
    }
}

// ============================================================
// 主循环
// ============================================================
let lastTime = 0;
function loop(t) {
    const dt = Math.min(33, t - lastTime) / 16.667; // 归一化到 60fps
    lastTime = t;

    // 异常安全网:即使 update/render 抛出未处理异常,也只跳过当前帧,
    // 绝不让 requestAnimationFrame 链断裂(否则游戏彻底冻结且无任何提示)
    try {
        if (state === State.PLAYING) {
            update(dt);
        }
        // v22: 波次倒计时 HUD —— 每帧刷新(仅 PLAYING 走表,面板/暂停期间冻结显示)
        if (ui.waveTimerHud) {
            const showHud = waveActive && state !== State.OVER && state !== State.VICTORY;
            ui.waveTimerHud.hidden = !showHud;
            if (showHud) {
                const tSec = Math.max(0, Math.ceil(waveTimerSec));
                ui.waveTimerHud.textContent = "⏱ " + tSec + "s";
                ui.waveTimerHud.classList.toggle("urgent", tSec <= 10);
            }
        }
        render();
    } catch (e) {
        console.error("[GameLoop] 主循环异常,本帧跳过:", e);
    }
    requestAnimationFrame(loop);
}

// ============================================================
// 更新逻辑
// ============================================================
function update(dt) {
    // --- 屏幕震动衰减(强度随剩余时间线性回落) ---
    if (screenShake.t > 0) {
        screenShake.t -= dt;
        const m = screenShake.mag * Math.max(0, screenShake.t / 12);
        screenShake.dx = rand(-m, m);
        screenShake.dy = rand(-m, m);
        if (screenShake.t <= 0) { screenShake.dx = 0; screenShake.dy = 0; }
    }
    // --- 玩家移动 ---
    let mx = 0, my = 0;
    if (keys["arrowleft"] || keys["a"]) mx -= 1;
    if (keys["arrowright"] || keys["d"]) mx += 1;
    if (keys["arrowup"] || keys["w"]) my -= 1;
    if (keys["arrowdown"] || keys["s"]) my += 1;
    if (mx && my) { mx *= 0.707; my *= 0.707; }
    player.x = clamp(player.x + mx * player.speed * dt, player.r, W - player.r);
    player.y = clamp(player.y + my * player.speed * dt, player.r, H - player.r);
    player.thrust = (mx || my) ? 1 : 0.5;

    if (player.invul > 0) player.invul -= dt;

    // --- 自动射击 ---
    player.fireCd -= dt;
    if (player.fireCd <= 0) {
        spawnPlayerBullets();
        player.fireCd = 60 / player.fireRate;
    }

    // --- 玩家子弹 ---
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        // 云朵安抚弹：轨道弹围绕玩家旋转，跳过常规追踪/移动/出界
        if (b.orbit) {
            b.orbitAngle += b.orbitSpeed * dt;
            b.x = player.x + Math.cos(b.orbitAngle) * b.orbitRadius;
            b.y = player.y + Math.sin(b.orbitAngle) * b.orbitRadius;
            b.life -= dt;
            spawnTrail(b.x, b.y, "#a5f3ff");
            if (b.life <= 0) { bullets.splice(i, 1); continue; }
        } else {
        // 制导
        if (b.homing > 0 && !b.isRocket) {
            let nearest = null, nd = Infinity;
            for (const e of enemies) {
                if (b.hit.has(e.id)) continue;
                const d = dist2(b.x, b.y, e.x, e.y);
                if (d < nd) { nd = d; nearest = e; }
            }
            if (nearest && nd < 240 * 240) {
                const ang = Math.atan2(nearest.y - b.y, nearest.x - b.x);
                const cur = Math.atan2(b.vy, b.vx);
                let diff = ang - cur;
                while (diff > Math.PI) diff -= TAU;
                while (diff < -Math.PI) diff += TAU;
                const turn = clamp(diff, -0.06 * b.homing * dt * 4, 0.06 * b.homing * dt * 4);
                const nAng = cur + turn;
                const sp = Math.hypot(b.vx, b.vy);
                b.vx = Math.cos(nAng) * sp;
                b.vy = Math.sin(nAng) * sp;
            }
        }
        if (b.isRocket) {
            const target = enemies.find(e => e.id === b.rocketTargetId && e.hp > 0);
            const trackR = player.cannonRocketTrackRadius || 300; // 追踪半径
            if (target && dist2(b.x, b.y, target.x, target.y) < trackR * trackR) {
                const ang = Math.atan2(target.y - b.y, target.x - b.x);
                const cur = Math.atan2(b.vy, b.vx);
                let diff = ang - cur;

                while (diff > Math.PI) diff -= TAU;
                while (diff < -Math.PI) diff += TAU;

                const turnRate = player.cannonRocketTurnRate || 0.12;
                const turn = clamp(diff, -0.12 * dt, 0.12 * dt);
                const sp = Math.hypot(b.vx, b.vy);
                const nAng = cur + turn;

                b.vx = Math.cos(nAng) * sp;
                b.vy = Math.sin(nAng) * sp;
            }
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        spawnTrail(b.x, b.y, b.isRocket ? "#ff6b35" : (b.isCrit ? "#fbbf24" : "#00e5ff"));

        if (b.y < -10 || b.y > H + 10 || b.x < -10 || b.x > W + 10 || b.life <= 0) {
            bullets.splice(i, 1);
            continue;
        }
        } // end else (非轨道弹移动)
        // 与敌人碰撞
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (!e) continue;
            if (b.hit.has(e.id)) continue;
            if (circleHit(b, e)) {
    // === Boss 多命机制：无敌时不扣血 ===
    if (e.type === "boss" && e.isInvincible) {
        // Boss 无敌中，子弹无效，直接移除子弹
        b.hit.add(e.id);
        bullets.splice(i, 1);
        break;
    }

    //缇宝星星特效（在伤害结算前触发）
    if (player.cannonStarEffect && b.isRocket) {
        spawnStarBurst(e.x, e.y);
        spawnFloatText(e.x, e.y - e.r - 10, "⭐", "#ffd700");
    }
    
    // === 火箭命中 ===
    if (b.isRocket) {
        if (e.type === "boss") {
            e.lifeHp -= b.dmg;
        } else {
            e.hp -= b.dmg;
        }
        e.flash = 12;
        spawnFloatText(e.x, e.y - e.r, "火箭 " + Math.round(b.dmg), "#ff6b35");
        spawnExplosion(e.x, e.y, "#ff6b35", 30, 1.8);
        // Boss 用 lifeHp，普通敌人用 hp
        if (e.type === "boss" ? (e.lifeHp <= 0) : (e.hp <= 0)) {
            killEnemy(j);
        }
        bullets.splice(i, 1);
        break;
    }



    // === 普通子弹命中 ===
    if (e.type === "boss") {
        e.lifeHp -= b.dmg;
    } else {
        e.hp -= b.dmg;
    }
    e.flash = 6;
    b.hit.add(e.id);
    spawnFloatText(e.x, e.y - e.r, Math.round(b.dmg), b.isCrit ? "#fbbf24" : "#fff");
    spawnExplosion(b.x, b.y, e.color, 4, 0.4);

    // 缇宝终极技能:命中敌人时发射火箭
    if (player.ultimateActive && player.ultimateActive.type === "rocket") {
        spawnRocketShot(e, null, { ratio: 0.20 });
    }
    // 缇宝专属天赋:小技能持续期间，每次命中额外发射追击火箭
    if (player.heroId === "cannon" && player.cannonMiniActive && player.cannonRocketTalent) {
        const rocketDmg = player.maxHp * 0.10;
        spawnRocketShot(e, rocketDmg, {
            r: 7, homing: 0.9, life: 180, speed: 8, color: "#ff8a3d",
        });
    }

    // ===== 终极技能充能:每次命中 +chargePerHit =====
    if (player.ultConfig) {
        addCharge(player.ultConfig.chargePerHit);
        if (player.heroId === "leech") {
            player.bleedStacks[e.id] = (player.bleedStacks[e.id] || 0) + 1;
        }
        if (player.heroId === "lance") {
            player.markStacks[e.id] = (player.markStacks[e.id] || 0) + 1;
            if (player.markStacks[e.id] >= 3) {
                const bonus = player.damage * 1.5;
                e.hp -= bonus;
                e.flash = 8;
                spawnFloatText(e.x, e.y - e.r - 12, "印记 " + Math.round(bonus), "#34d399");
                player.markStacks[e.id] = 0;
            }
        }
        if (player.heroId === "hunter") {
            player.hitCount++;
        }
        if (player.heroId === "bastion") {
            player.gold += b.dmg * 0.1;
        }
    }

    // 击杀判定
    if (e.type === "boss") {
        // Boss 用 lifeHp，但只有所有命都用完时才真正击杀
        if (e.lifeHp <= 0) {
            // 不在这里 killEnemy，交给 updateNikador 处理多命过渡
        }
    } else {
        if (e.hp <= 0) {
            killEnemy(j);
        }
    }

    // 穿透 / 移除子弹
    if (b.pierce > 0) {
        b.pierce--;
    } else {
        bullets.splice(i, 1);
        break;
    }
}
    }
    }

    // --- 敌人生成 ---
    spawnCd -= dt;
    if (spawnQueue.length > 0 && spawnCd <= 0) {
        const next = spawnQueue[0];
        if (next.delay > 0) {
            next.delay -= dt;
        } else {
            spawnEnemy(next.type);
            spawnQueue.shift();
            spawnCd = 8;
        }
    }
    // v23: 动态自适应出怪 —— 击杀效率越高补怪越快,场上越空补怪越急,上限保护防性能/难度异常
    // (初始队列耗尽后接管;击杀效率采样半衰期3秒,杀得越快 killRateRecent 越高)
    killRateRecent *= Math.pow(0.5, dt / 180);
    if (waveActive && state === State.PLAYING && spawnQueue.length === 0) {
        const winNow = waveInCycle(), cycNow = cycleIndex();
        // 期望场上存量:随波次/轮次缓慢增长,封顶 14
        const targetField = Math.min(14, Math.round(4 + winNow * 0.6 + cycNow * 2));
        const aliveNow = enemies.length;
        if (aliveNow === 0) {
            // 真空期保护:场上清空时几乎立即补怪
            waveTopUpCd = Math.min(waveTopUpCd, 8);
        }
        if (aliveNow < Math.min(ENEMY_FIELD_CAP, targetField + 3)) {
            // 效率加成:近3秒击杀越多,冷却消耗越快(1.0~2.2倍速)
            const boost = 1 + Math.min(killRateRecent, 6) * 0.2;
            waveTopUpCd -= dt * boost;
            if (waveTopUpCd <= 0) {
                spawnEnemy(choice(waveSpawnTypes));
                // 基础间隔随波次收紧;存量缺口越大间隔越短(1.0~0.45倍)
                const shortage = clamp((targetField - aliveNow) / Math.max(1, targetField), 0, 1);
                waveTopUpCd = Math.max(12, Math.round((95 - winNow * 2.5 - cycNow * 8) * (1 - shortage * 0.55)));
            }
        }
    }

    // --- 敌人更新 ---
    // 时间静止/印记终结技生效时,敌人不移动、不射击
    const enemyFrozen = player.ultimateActive &&
        (player.ultimateActive.type === "time_stop" || player.ultimateActive.type === "mark");
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.t += dt;
        if (e.flash > 0) e.flash -= dt;

        if (e.type === "boss") {
            if (!enemyFrozen) updateBoss(e, dt);
        } else {
            if (!enemyFrozen) updateEnemy(e, dt);
        }

        if (e.dialogueTimer > 0) e.dialogueTimer -= dt / 60;

        // 与玩家碰撞
        if (circleHit(e, player)) {
            if (e.type !== "boss") {
                damagePlayer(15);
                killEnemy(i);
            } else {
                damagePlayer(20);
                // 推开玩家
                const ang = Math.atan2(player.y - e.y, player.x - e.x);
                player.x += Math.cos(ang) * 20;
                player.y += Math.sin(ang) * 20;
            }
        }

        // 超出屏幕(下方)移除
        if (e.y > H + 60 && e.type !== "boss") {
            enemies.splice(i, 1);
        }
    }

    // --- 敌人子弹 ---
    for (let i = eBullets.length - 1; i >= 0; i--) {
        const b = eBullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.y > H + 10 || b.y < -10 || b.x < -10 || b.x > W + 10 || b.life <= 0) {
            eBullets.splice(i, 1);
            continue;
        }
        // 云朵安抚弹：轨道弹可抵消敌人子弹（护盾效果）
        let cancelled = false;
        for (let k = bullets.length - 1; k >= 0; k--) {
            const pb = bullets[k];
            if (!pb.orbit) continue;
            if (circleHit(pb, b)) {
                bullets.splice(k, 1);
                eBullets.splice(i, 1);
                spawnExplosion(b.x, b.y, b.color, 5, 0.5);
                cancelled = true;
                break;
            }
        }
        if (cancelled) continue;
        if (circleHit(b, player)) {
            damagePlayer(b.dmg);
            eBullets.splice(i, 1);
        }
    }

    // --- 拾取物(经验/金币/血包) ---
    for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];

        // Step 1: 重力/落定(xp 和 coin 下落, heal 不需要)
        if (p.type === "xp" || p.type === "coin") {
            if (!p.settled) {
                p.vy += p.gravity * dt;
                if (p.y + p.r >= p.floorY) {
                    p.y = p.floorY - p.r;
                    p.vy *= -0.18;
                    p.vx *= 0.7;
                    if (Math.abs(p.vy) < 0.08) {
                        p.vy = 0;
                        p.settled = true;
                    }
                }
            }
        }

        // Step 2: 吸向玩家(所有类型,xp/coin 引力稍强)
        {
            const dx = player.x - p.x, dy = player.y - p.y;
            const d = Math.hypot(dx, dy);
            if (d < 120) {
                const pull = (p.type === "xp" || p.type === "coin") ? 0.18 : 0.15;
                p.vx += (dx / d) * pull * dt;
                p.vy += (dy / d) * pull * dt;
            }
        }

        // Step 3: 位置更新 + 摩擦 + 边界(统一处理)
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === "xp" || p.type === "coin") {
            p.vx *= 0.92;
            p.vy *= 0.92;
            p.x = clamp(p.x, p.r, W - p.r);
            p.y = clamp(p.y, p.r, p.floorY - p.r);
        } else {
            // heal
            p.vx *= 0.95;
            p.vy *= 0.95;
            p.x = clamp(p.x, p.r, W - p.r);
            p.y = clamp(p.y, p.r, H - p.r);
        }

        // Step 4: 碰撞检测
        if (circleHit(p, player)) {
            collectPickup(p);
            pickups.splice(i, 1);
        }
        if (p.y > H + 30) pickups.splice(i, 1);
    }

    // --- 粒子 ---
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
        if (p.gravity) p.vy += p.gravity * dt;   // 星星碎片受重力坠落
        if (p.vrot) p.rot += p.vrot * dt;        // 碎片旋转
        if (p.grow) p.r += p.grow * dt;          // 闪光/光环向外扩散
        // 星星碎片拖尾：速度越快密度越高，速度×大小决定拖尾长度
        if (p.type === "starFrag" && particles.length < 900) {
            const spd = Math.hypot(p.vx, p.vy);
            p.trailAcc += spd * dt;
            const spacing = clamp(7 - spd * 0.9, 2.2, 7);
            if (spd > 0.6 && p.trailAcc >= spacing) {
                p.trailAcc = 0;
                const tLife = clamp(spd * 3 + p.r, 8, 26);
                particles.push({
                    x: p.x, y: p.y,
                    vx: p.vx * 0.12 + rand(-0.2, 0.2),
                    vy: p.vy * 0.12 + rand(-0.1, 0.3),
                    r: p.r * rand(0.25, 0.5),
                    life: tLife, maxLife: tLife,
                    color: p.color,
                    type: "starTrail",
                });
            }
        }
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // --- 飘字 ---
    for (let i = floatTexts.length - 1; i >= 0; i--) {
        const f = floatTexts[i];
        f.y -= 0.6 * dt;
        f.life -= dt;
        if (f.life <= 0) floatTexts.splice(i, 1);
    }

    // --- v12: 连击窗口衰减(3 秒内未击杀则连击归零) ---
    if (comboTimer > 0) {
        comboTimer -= dt / 60;
        if (comboTimer <= 0) comboCount = 0;
    }

    // --- v12: Boss 出场倒计时(商店关闭后、Boss 波开始前,3 秒) ---
    if (bossCountdownTimer > 0) {
        const prev = Math.ceil(bossCountdownTimer);
        bossCountdownTimer -= dt / 60;
        const now = Math.ceil(bossCountdownTimer);
        if (now !== prev && ui.bossCountdownNum && now > 0) {
            ui.bossCountdownNum.textContent = now;
            // 重新触发数字弹跳动画
            ui.bossCountdownNum.style.animation = "none";
            void ui.bossCountdownNum.offsetWidth;
            ui.bossCountdownNum.style.animation = "";
        }
        if (bossCountdownTimer <= 0) {
            if (ui.bossCountdownOverlay) ui.bossCountdownOverlay.hidden = true;
            const cb = bossCountdownCb;
            bossCountdownCb = null;
            if (cb) cb();
        }
    }

    // --- 检查波次结束(仅在 PLAYING 状态处理,避免与升级/事件面板同帧冲突) ---
    if (waveActive) {
        waveDurationSec += dt / 60;
        // v22: 60秒倒计时仅在 PLAYING 时走表 —— 升级/事件/暂停面板打开时计时自动冻结
        if (state === State.PLAYING) {
            waveTimerSec -= dt / 60;
            if (waveTimerSec <= 0) {
                waveTimerSec = 0;
                endWaveByTimer();
            }
        }
        // v22: 波次倒计时 HUD(剩余秒数,≤10s 变红提示)
        if (ui.waveTimerHud) {
            ui.waveTimerHud.hidden = false;
            const tSec = Math.max(0, Math.ceil(waveTimerSec));
            ui.waveTimerHud.textContent = "⏱ " + tSec + "s";
            ui.waveTimerHud.classList.toggle("urgent", tSec <= 10);
        }
    } else if (ui.waveTimerHud) {
        ui.waveTimerHud.hidden = true;
    }
    if (!waveActive && !waveSettled && waveBreak > 0 && state === State.PLAYING && bossCountdownTimer <= 0) {
        waveBreak -= dt;
        if (waveBreak <= 0) {
            // v20 波次结算顺序:发货币 → 逐次结算积压升级(选完自动链到商店) → 商店
            waveSettled = true;
            settleWaveRewards();
            if (pendingLevelUps > 0) {
                offerUpgrades();
            } else {
                offerShop();
            }
        }
    }

    // === 持续回血逻辑 === ← ✅ 移到 update() 内部
    if (player.regenAmount > 0) {
        player.regenTimer = (player.regenTimer || 0) + dt; // ⚠️ 用 dt 而非固定 +1
        if (player.regenTimer >= 120) { // 120帧 = 2秒(60fps归一化)
            player.regenTimer -= 120;   // 用 -= 保留余量，避免累积误差
            player.hp = Math.min(player.maxHp, player.hp + player.maxHp * player.regenAmount);
            //飘字回血
            spawnFloatText(player.x, player.y - 20, "+" + Math.round(player.maxHp * player.regenAmount), "#4ade80");
        }
    }

    // --- Boss 范围技能预警 ---
    updateBossAreaWarnings(dt);

    // ===== 终极技能系统更新(冷却/自动释放/生效中/动画)=====
    updateUltimateSystem(dt);
    // ===== 缇宝小技能系统更新 =====
    updateCannonMiniSystem(dt);
    // v12: 时间触发天赋已移除(替换为波次商店);仅保留生存时间统计供状态面板显示
    survivalSeconds += dt / 60;

    updateHUD();
}

// ============================================================
//                        敌人行为
// ============================================================
function updateEnemy(e, dt) {
    switch (e.behavior) {
        case "straight":
            e.y += e.speed * dt;
            break;
        case "zigzag":
            e.y += e.speed * dt;
            e.x += Math.sin(e.t * 0.05) * 2 * dt;
            e.x = clamp(e.x, e.r, W - e.r);
            break;
        case "swarm":
            e.y += e.speed * dt;
            e.x += Math.sin(e.t * 0.08 + e.angle) * 1.5 * dt;
            break;
        case "shooter":
            e.y += e.speed * dt * 0.6;
            if (e.y > 100) {
                // 减速悬停并射击
                e.speed *= 0.96;
                e.shootCd -= dt;
                if (e.shootCd <= 0) {
                    enemyShootAt(e, 3.5, 8);
                    e.shootCd = rand(80, 140);
                }
            }
            break;
    }
}

function enemyShootAt(e, speed, dmg) {
    const ang = Math.atan2(player.y - e.y, player.x - e.x);
    eBullets.push({
        x: e.x, y: e.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        r: 5, dmg, life: 300, color: "#ff3da6",
    });
}

// ============================================================
//                       Boss 行为
// ============================================================
function updateBoss(e, dt) {
    if (e.entering) {
        // v12: 出场(entering)期间无敌,约 1.5s 入场完毕后解除
        e.isInvincible = true;
        e.y += e.speed * dt * 1.5;
        if (e.y >= 100) { e.y = 100; e.entering = false; e.isInvincible = false; }
        return;
    }
    // v12: 统一走 BossAPI 标准入口(按 bossKey 分发;未实现的 Boss 占位复用 Nikador 模组)
    BossAPI.updateAI(e, dt);
}
// ============================================================
//                       Nikador 行为
// ============================================================
// ===== 劈砍攻击动画系统 =====
// 玩家在 Boss 左侧 → 向左劈;右侧 → 向右劈
// 关键帧: 蓄力(图片向劈砍侧上方抬起) → 迅速下劈(打击帧) → 平滑恢复
const SLASH_HIT_RANGE = 155;     // 劈砍近身伤害判定距离(远距离只吃冲击波)
const SLASH_DAMAGE = 18;         // 劈砍近身伤害
const SLASH_WINDUP = 16;         // 蓄力帧数(约 0.27s)
const SLASH_STRIKE = 7;          // 下劈帧数(约 0.12s)
const SLASH_RECOVER = 14;        // 恢复帧数(约 0.23s)

// 起手:根据玩家方位决定劈砍方向
function startNikadorSlash(e) {
    e.slash = {
        phase: "windup",             // windup 蓄力 → slash 下劈 → recover 恢复
        timer: 0,
        side: player.x < e.x ? -1 : 1, // -1 玩家在左(向左劈) / +1 玩家在右(向右劈)
    };
    // 劈砍期间锁定贴图自转角,保证"抬起方向"清晰可读
    e._slashLockRot = e.t * 0.01;
    e.slashCd = 300; // 起手即开始计冷却
    showBossDialogue(e, "剑锋所向，纷争不熄", "#ff8f5e");
}

// 劈砍状态机推进
function updateNikadorSlash(e, dt) {
    const s = e.slash;
    s.timer += dt;
    if (s.phase === "windup") {
        if (s.timer >= SLASH_WINDUP) {
            s.phase = "slash"; s.timer = 0;
            doNikadorSlashHit(e); // 打击帧:特效 + 判定 + 冲击波
        }
    } else if (s.phase === "slash") {
        if (s.timer >= SLASH_STRIKE) { s.phase = "recover"; s.timer = 0; }
    } else if (s.phase === "recover") {
        if (s.timer >= SLASH_RECOVER) {
            e.slash = null;
            delete e._slashLockRot;
            e.slashCd = 240; // 劈砍结束后 4 秒冷却
        }
    }
}

// 打击帧:弧光刀光 + 屏幕震动 + 近身判定 + 弧形冲击波 + 音效
function doNikadorSlashHit(e) {
    const s = e.slash;
    // 弧光刀光(随 Boss 绘制,渐隐)
    e.slashArc = { timer: 0, maxTimer: 14, side: s.side };
    // 屏幕震动(强打击感)
    screenShake.t = 12; screenShake.mag = 7;
    // 近身伤害判定:玩家在劈砍侧且进入弧线范围
    const dx = player.x - e.x, dy = player.y - e.y;
    if (Math.hypot(dx, dy) < SLASH_HIT_RANGE && dx * s.side >= -20) {
        damagePlayer(SLASH_DAMAGE);
    }
    // 弧形冲击波:沿玩家方向飞出的旋转金色月牙弹幕
    const ang = Math.atan2(player.y - e.y, player.x - e.x);
    eBullets.push({
        x: e.x + s.side * 26, y: e.y + 10,
        vx: Math.cos(ang) * 4.2, vy: Math.sin(ang) * 4.2,
        r: 24, dmg: 16, life: 200, color: "#ffd700",
        type: "slash", angle: ang,
    });
    // 火花粒子 + 打击音效
    spawnExplosion(e.x + s.side * 42, e.y + 12, "#ffd700", 14, 1.4);
    audio.playKillSound();
}

// 计算劈砍动画的贴图偏移与旋转(供 Boss 绘制叠加)
// 三段缓动:蓄力 easeOutCubic 渐起 → 下劈 easeIn 加速爆发 → 恢复 easeOutCubic 平滑回收
function getNikadorSlashOffset(e) {
    if (!e.slash) return null;
    const s = e.slash, side = s.side;
    // 关键帧锚点:抬起位(劈砍侧上方) → 劈中位(挥过中线到对侧下方) → 原位
    const windup = { x: side * 26, y: -34, rot: side * 0.38 };
    const struck = { x: -side * 30, y: 26, rot: -side * 0.55 };
    const rest = { x: 0, y: 0, rot: 0 };
    let from, to, k;
    if (s.phase === "windup") {
        from = rest; to = windup;
        k = 1 - Math.pow(1 - Math.min(1, s.timer / SLASH_WINDUP), 3);
    } else if (s.phase === "slash") {
        from = windup; to = struck;
        k = Math.pow(Math.min(1, s.timer / SLASH_STRIKE), 2.2);
    } else {
        from = struck; to = rest;
        k = 1 - Math.pow(1 - Math.min(1, s.timer / SLASH_RECOVER), 3);
    }
    return {
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k,
        rot: from.rot + (to.rot - from.rot) * k,
    };
}

function updateNikador(e, dt) {

    // 劈砍弧光计时(不依赖劈砍状态,保证收招后残光自然消失)
    if (e.slashArc) {
        e.slashArc.timer += dt;
        if (e.slashArc.timer >= e.slashArc.maxTimer) e.slashArc = null;
    }

    // 劈砍期间 Boss 定身(不移动不射击),优先级最高
    if (e.slash) {
        updateNikadorSlash(e, dt);
        return;
    }
    // 周期性起手劈砍(方向由玩家方位决定:玩家在左→向左劈,在右→向右劈)
    e.slashCd = (e.slashCd === undefined ? 180 : e.slashCd) - dt;
    if (e.slashCd <= 0) {
        startNikadorSlash(e);
        return;
    }

    // 初始化命数（只在第一次进入时执行）
    if (e.lives === undefined) {
        e.lives = 3;              // 总共 3 条命
        e.currentLife = 1;        // 当前第几条命
        e.lifeHp = e.maxHp;       // 当前命的血量
        e.maxLifeHp = e.maxHp;    // 每条命的满血值
        e.isInvincible = false;   // 是否无敌中
        e.invincibleTimer = 0;    // 无敌计时器
    }

    // 无敌状态处理（命被打完后的过渡时间）
    if (e.isInvincible) {
        e.invincibleTimer -= dt;
        if (e.invincibleTimer <= 0) {
            e.isInvincible = false;
            // 无敌结束，开始下一条命
            e.currentLife++;
            e.lifeHp = e.maxLifeHp;  // 回满血
            spawnFloatText(e.x, e.y - e.r - 40, "第" + e.currentLife + "条命！", "#ffaa00");
            spawnExplosion(e.x, e.y, "#ffaa00", 50, 3);
        }
        // 无敌期间只移动不攻击，直接 return
        return;
    }
    // 当前命的血量扣完了 → 进入无敌过渡
    if (e.lifeHp <= 0) {
        e.lives--;
        if (e.lives <= 0) {
            const idx = enemies.indexOf(e);
            if (idx >= 0) killEnemy(idx);
            // 所有命都打完了，Boss 死亡（由外部逻辑处理）
            return;
        }
        // 还有命，进入无敌过渡
        e.isInvincible = true;
        e.invincibleTimer = 120;  // 2秒无敌时间
        spawnFloatText(e.x, e.y - e.r - 40, "还剩" + e.lives + "条命！", "#ff4444");
        spawnExplosion(e.x, e.y, "#ff3da6", 60, 3);
        return;
    }
    // ===== 阶段判定（根据当前是第几条命）=====
    if (e.currentLife === 1) {
        updateNikadorStage1(e, dt);
    } else if (e.currentLife === 2) {
        updateNikadorStage2(e, dt);
    } else if (e.currentLife >= 3) {
        updateNikadorStage3(e, dt);
    }
}

// ============================================================
// Nikador Stage 1: 第一条命 — 扇形 / 三连发 / 环形弹幕组合
// ============================================================
function updateNikadorStage1(e, dt) {
    // 初始化阶段参数（每个 Boss 实例首次进入该阶段时设置一次）
    if (e._stage1Init !== true) {
        e._stage1Init = true;
        e.moveTimer = e.moveTimer || rand(60, 120);
        e.shootTimer = e.shootTimer || 30;
        e.phase = e.phase || 0;
        e.targetX = e.targetX || rand(80, W - 80);
        e.targetY = e.targetY || 100;
    }
    // 移动:在顶部区域左右游走
    e.moveTimer -= dt;
    if (e.moveTimer <= 0) {
        e.targetX = rand(80, W - 80);
        e.targetY = rand(80, 160);
        e.moveTimer = rand(90, 150);
    }
    const dx = e.targetX - e.x, dy = e.targetY - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
        e.x += (dx / d) * e.speed * dt;
        e.y += (dy / d) * e.speed * dt;
    }
    // 攻击
    e.shootTimer -= dt;
    if (e.shootTimer <= 0) {
        const pattern = e.phase % 3;
        if (pattern === 0) {
             // 金色飞矛：瞄准玩家方向发射
            showBossDialogue(e, "曾为苍穹的雷枪", "#ffd700");
            const ang = Math.atan2(player.y - e.y, player.x - e.x);
            eBullets.push({
                x: e.x, y: e.y + e.r,
                vx: Math.cos(ang) * 5,
                vy: Math.sin(ang) * 5,
                r: 8,
                dmg: 20,
                life: 300,
                color: "#ffd700",
                type: "spear",    // 标记类型，方便绘制时区分
                angle: ang,       // 记录朝向，用于旋转绘制
            });
            e.shootTimer = 70;
        } else if (pattern === 1) {
            // 左侧弧形弹幕：子弹之间留出缝隙，玩家需要横向穿行躲避
            showBossDialogue(e, "劈断冥河的湍流", "#fbbf24");
            const arcCount = 11;
            const arcTop = 70;
            const arcBottom = H - 70;
            for (let i = 0; i < arcCount; i++) {
                const progress = i / (arcCount - 1);
                const arcY = arcTop + (arcBottom - arcTop) * progress;
                const arcX = -24 + Math.sin(progress * Math.PI) * 105;
                eBullets.push({
                    x: arcX, y: arcY,
                    vx: 3.6, vy: 0,
                    r: 7, dmg: 14, life: 260, color: "#fbbf24",
                    type: "arc",
                });
            }
            e.shootTimer = 50;
        } else {
            // 地面范围预警：锁定玩家当前所在位置，2 秒后爆炸
            showBossDialogue(e, "纷那战火漫无边际", "#c084fc");
            bossAreaWarnings.push({
                x: player.x,
                y: player.y,
                radius: 95,
                timer: 2,
                maxTimer: 2,
                damage: 35,
            });
            e.shootTimer = 90;
        }
        e.phase++;
    }
}

// ============================================================
// Nikador Stage 2: 第二条命 — 追踪弹 + 扇形加强
// ============================================================
function updateNikadorStage2(e, dt) {
    if (e._stage2Init !== true) {
        e._stage2Init = true;
        e.moveTimer = rand(50, 90);
        e.shootTimer = 25;
        e.phase = 0;
        e.targetX = e.x; e.targetY = 130;
    }
    // 左右快速移动
    e.moveTimer -= dt;
    if (e.moveTimer <= 0) {
        e.targetX = rand(60, W - 60);
        e.targetY = rand(110, 180);
        e.moveTimer = rand(50, 90);
    }
    const dx = e.targetX - e.x, dy = e.targetY - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
        e.x += (dx / d) * (e.speed * 1.4) * dt;
        e.y += (dy / d) * (e.speed * 1.4) * dt;
    }
    // 追踪弹 + 双排扇形交替
    e.shootTimer -= dt;
    if (e.shootTimer <= 0) {
        const pattern = e.phase % 2;
        if (pattern === 0) {
            // 4 发追踪弹
            showBossDialogue(e, "追上他，撕碎他！", "#ef4444");
            for (let i = 0; i < 4; i++) {
                const ang = Math.atan2(player.y - e.y, player.x - e.x) + (i - 1.5) * 0.25;
                eBullets.push({
                    x: e.x, y: e.y,
                    vx: Math.cos(ang) * 4.2, vy: Math.sin(ang) * 4.2,
                    r: 7, dmg: 16, life: 320, color: "#ef4444",
                });
            }
            e.shootTimer = 42;
        } else {
            // 双排扇形
            showBossDialogue(e, "撕裂大地的脊髓", "#22d3ee");
            const n = 7;
            for (let row = 0; row < 2; row++) {
                for (let i = 0; i < n; i++) {
                    const a = Math.PI / 2 - 0.9 + (1.8 * i) / (n - 1) + row * 0.08;
                    const spd = 2.6 + row * 0.8;
                    eBullets.push({
                        x: e.x, y: e.y + e.r,
                        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
                        r: 5, dmg: 11, life: 380, color: "#22d3ee",
                    });
                }
            }
            e.shootTimer = 60;
        }
        e.phase++;
    }
}

// ============================================================
// Nikador Stage 3: 第三条命 — 密集弹幕 + 冲撞
// ============================================================
function updateNikadorStage3(e, dt) {
    if (e._stage3Init !== true) {
        e._stage3Init = true;
        e.moveTimer = 40;
        e.shootTimer = 18;
        e.phase = 0;
        e.chargeTimer = 0;
        e.charging = false;
        e.targetX = e.x; e.targetY = 150;
    }
    // 冲撞模式:每隔一段时间冲向玩家,然后退回
    if (!e.charging && (e.chargeTimer = (e.chargeTimer || 0) + dt) > 220) {
        e.charging = true;
        e.chargeDirX = player.x - e.x;
        e.chargeDirY = player.y - e.y;
        const cd = Math.hypot(e.chargeDirX, e.chargeDirY) || 1;
        e.chargeDirX /= cd; e.chargeDirY /= cd;
        e.chargeTime = 40;
        showBossDialogue(e, "准备迎接冲撞！", "#ff4444", 2.5);
    }
    if (e.charging) {
        e.x += e.chargeDirX * 6 * dt;
        e.y += e.chargeDirY * 6 * dt;
        e.chargeTime -= dt;
        if (e.chargeTime <= 0) {
            e.charging = false;
            e.chargeTimer = 0;
            e.targetX = rand(80, W - 80);
            e.targetY = rand(120, 200);
        }
    } else {
        // 正常游走
        e.moveTimer -= dt;
        if (e.moveTimer <= 0) {
            e.targetX = rand(80, W - 80);
            e.targetY = rand(120, 200);
            e.moveTimer = rand(40, 70);
        }
        const dx = e.targetX - e.x, dy = e.targetY - e.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
            e.x += (dx / d) * (e.speed * 1.1) * dt;
            e.y += (dy / d) * (e.speed * 1.1) * dt;
        }
    }
    // 高密度弹幕
    e.shootTimer -= dt;
    if (e.shootTimer <= 0) {
        const pattern = e.phase % 4;
        if (pattern === 0) {
            // 双向螺旋
            showBossDialogue(e, "螺旋弹幕！", "#f43f5e");
            const n = 6;
            for (let i = 0; i < n; i++) {
                const a1 = (TAU * i) / n + e.t * 0.05;
                const a2 = (TAU * i) / n - e.t * 0.05;
                eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a1) * 3.2, vy: Math.sin(a1) * 3.2, r: 5, dmg: 10, life: 340, color: "#f43f5e" });
                eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a2) * 2.6, vy: Math.sin(a2) * 2.6, r: 4, dmg: 9,  life: 420, color: "#fb923c" });
            }
            e.shootTimer = 36;
        } else if (pattern === 1) {
            // 瞄准玩家八连扇形
            showBossDialogue(e, "躲得开吗？", "#fbbf24");
            const n = 9;
            const baseAng = Math.atan2(player.y - e.y, player.x - e.x);
            for (let i = 0; i < n; i++) {
                const a = baseAng - 0.8 + (1.6 * i) / (n - 1);
                eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 4.5, vy: Math.sin(a) * 4.5, r: 6, dmg: 14, life: 300, color: "#fbbf24" });
            }
            e.shootTimer = 32;
        } else if (pattern === 2) {
            // 超大环形
            showBossDialogue(e, "毁灭之环！", "#a78bfa");
            const n = 20;
            for (let i = 0; i < n; i++) {
                const a = (TAU * i) / n;
                eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2, r: 6, dmg: 10, life: 460, color: "#a78bfa" });
            }
            e.shootTimer = 52;
        } else {
            // 高速向下直线弹
            showBossDialogue(e, "坠落吧！", "#00e5ff");
            for (let i = 0; i < 6; i++) {
                eBullets.push({ x: e.x - 80 + i * 32, y: e.y, vx: 0, vy: 5.5, r: 5, dmg: 12, life: 300, color: "#00e5ff" });
            }
            e.shootTimer = 28;
        }
        e.phase++;
    }
}

// ============================================================
// Sylph Boss (预留): 目前暂时使用默认弹幕
// ============================================================
function updateSylph(e, dt) {
    updateDefaultBossAttack(e, dt);
}

// ============================================================
// 默认 Boss 攻击行为（未知 bossKey 都走这个兜底）
// ============================================================
function updateDefaultBossAttack(e, dt) {
    // 初始化
    if (e._dftInit !== true) {
        e._dftInit = true;
        e.moveTimer = 80;
        e.shootTimer = 40;
        e.targetX = e.x; e.targetY = 120;
    }
    // 悬停 + 左右移动
    e.moveTimer -= dt;
    if (e.moveTimer <= 0) {
        e.targetX = rand(100, W - 100);
        e.targetY = rand(100, 180);
        e.moveTimer = rand(90, 160);
    }
    const dx = e.targetX - e.x, dy = e.targetY - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
        e.x += (dx / d) * e.speed * dt;
        e.y += (dy / d) * e.speed * dt;
    }
    // 瞄准玩家射击,每 3 次来一次环形
    e.shootTimer -= dt;
    if (e.shootTimer <= 0) {
        e.phase = (e.phase || 0) + 1;
        if (e.phase % 4 === 0) {
            const n = 14;
            for (let i = 0; i < n; i++) {
                const a = (TAU * i) / n;
                eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 2.8, vy: Math.sin(a) * 2.8, r: 6, dmg: 12, life: 400, color: e.color });
            }
            e.shootTimer = 70;
        } else {
            for (let i = -1; i <= 1; i++) {
                const ang = Math.atan2(player.y - e.y, player.x - e.x) + i * 0.2;
                eBullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 3.8, vy: Math.sin(ang) * 3.8, r: 5, dmg: 12, life: 300, color: e.color });
            }
            e.shootTimer = 50;
        }
    }
}

// ============================================================
// 击杀敌人
// ============================================================
function killEnemy(idx) {
    if (typeof idx !== "number" || idx < 0 || idx >= enemies.length) return;
    const e = enemies[idx];
    if (!e) return;

    // v12: 击杀数 + 连击统计(3 秒窗口内连续击杀,受伤不清空)
    killCount++;
    comboCount++;
    comboTimer = 3;
    if (comboCount > maxCombo) maxCombo = comboCount;
    if (comboCount >= 5 && comboCount % 5 === 0) {
        spawnFloatText(e.x, e.y - e.r - 16, comboCount + " 连击!", "#fbbf24");
    }

    score += e.score;// 增加分数
    spawnFloatText(e.x, e.y, "+" + e.score, "#fbbf24");
    spawnExplosion(e.x, e.y, e.color, e.type === "boss" ? 40 : 14, e.type === "boss" ? 2.5 : 1);
    
    audio.playKillSound();// 播放击杀音效

    // 爆破弹头连锁
    if (player.explodeOnKill) {
        const radius = 60;
        spawnExplosion(e.x, e.y, "#fbbf24", 18, 1.2);
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (j === idx) continue;
            const o = enemies[j];
            if (dist2(e.x, e.y, o.x, o.y) < radius * radius) {
                o.hp -= 20;
                o.flash = 6;
                if (o.hp <= 0) killEnemy(j);
            }
        }
    }

    // 吸血
    if (player.lifesteal > 0) {
        player.hp = clamp(player.hp + player.lifesteal, 0, player.maxHp);
    }

    // 掉落经验
    const drops = e.type === "boss" ? e.xp : 1;
    for (let i = 0; i < drops; i++) {
        pickups.push({
            x: e.x + rand(-10, 10), y: e.y + rand(-10, 10),
            vx: rand(-1.2, 1.2), vy: rand(-0.8, 0.4),
            r: 5, type: "xp", value: e.type === "boss" ? 1 : 1,
            color: "#00e5ff",
            gravity: 0.08, floorY: H - 18,
            settled: false,
        });
    }
    // v23: 掉落金币(每种怪物独立配置 coinMin/coinMax;金币拾取后直接入账)
    if ((e.coinMax ?? 0) > 0) {
        pickups.push({
            x: e.x + rand(-8, 8), y: e.y + rand(-8, 8),
            vx: rand(-1, 1), vy: rand(-0.6, 0.4),
            r: 6, type: "coin",
            value: Math.round(rand(e.coinMin ?? 0, e.coinMax ?? 0)),
            color: "#ffd700",
            gravity: 0.08, floorY: H - 18,
            settled: false,
        });
    }
    // boss 额外掉血包
    if (e.type === "boss") {
        pickups.push({
            x: e.x, y: e.y, vx: 0, vy: 0,
            r: 7, type: "heal", value: 30, color: "#4ade80",
        });
        bossAlive = false;
        // 剧情模式：击败 Boss = 完整关卡通关 → 解锁下一个英雄
        if (Progress.mode === "story") {
            const unlocked = Progress.markLevelCleared();
            if (unlocked) {
                spawnFloatText(player.x, player.y - 50, `🎉 解锁新英雄 ${unlocked.name}!`, "#fbbf24");
            } else {
                spawnFloatText(player.x, player.y - 50, `📖 剧情模式 · 关卡 ${Progress.storyLevel} 通关`, "#6ee7b7");
            }
        }
    }
    // 小概率掉血包
    if (e.type !== "boss" && Math.random() < 0.03) {
        pickups.push({
            x: e.x, y: e.y, vx: 0, vy: 0,
            r: 7, type: "heal", value: 20, color: "#4ade80",
        });
    }

    enemies.splice(idx, 1);
}

// v23: 数值格式化 —— 生命值等属性显示为整数或最多 1 位小数
// (百分比加成如 maxHp×1.1 会产生 146.41000000000008 之类的浮点尾数,统一在此清洗)
function fmtHp(n) {
    const r = Math.round(Number(n) * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function collectPickup(p) {
    if (p.type === "xp") {
        xp += Math.ceil(1 * player.xpBonus);
        while (xp >= xpNeed) {
            xp -= xpNeed;
            level++;
            xpNeed = Math.floor(3 + level * 1.6);
            // v20:波内升级只记录不弹窗,清场结算阶段再逐次让玩家选择
            pendingLevelUps++;
        }
    } else if (p.type === "coin") {
        // v23:金币拾取直接入账
        coins += p.value;
        if (ui.coinVal) ui.coinVal.textContent = "🪙" + coins;
        spawnFloatText(player.x, player.y - 30, "+" + p.value + " 🪙", "#ffd700");
    } else if (p.type === "heal") {
        player.hp = clamp(player.hp + p.value, 0, player.maxHp);
        spawnFloatText(player.x, player.y - 20, "+" + p.value, "#4ade80");
    }
}

// ============================================================
// 终极技能系统 - 充能、释放、效果执行、UI 同步
// ============================================================
const ULT_STATE = {
    IDLE: "idle",           // 充能中
    READY: "ready",         // 充能完成
    COOLDOWN: "cooldown",   // 冷却中
    ACTIVE: "active",       // 技能生效中
    RELEASING: "releasing", // 释放动画中
};

// 释放动画对象(全屏特效序列)
let ultReleaseAnim = null;  // { heroId, t, duration, color, text }

// 取当前英雄的 ultimate 配置
function currentUlt() {
    return player.ultConfig;
}

// 1) 充能:每次命中调用
function addCharge(amount) {
    if (!player.ultConfig) return;
    if (player.ultimateCooldown > 0) return;       // 冷却中不充能
    if (player.ultimateActive) return;             // 技能生效中不充能
    if (player.ultimateReady) return;             // 已就绪不再充
    player.charge = clamp(player.charge + amount, 0, player.ultConfig.chargeThreshold);
    if (player.charge >= player.ultConfig.chargeThreshold) {
        player.ultimateReady = true;
        player.autoReleaseTimer = 0.5; // 自动模式 0.5s 防误触延迟
        spawnFloatText(player.x, player.y - 30, "终结技就绪!", "#ffd700");
        // 充能完成提示音(简短蜂鸣)
        playUltReadySound();
    }
}

// 充能完成提示音(0.5s 内两声蜂鸣)
function playUltReadySound() {
    if (audio.muted) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        [0, 0.18].forEach(off => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = "square";
            o.frequency.value = 880;
            g.gain.setValueAtTime(0, now + off);
            g.gain.linearRampToValueAtTime(0.15 * audio.volume, now + off + 0.02);
            g.gain.linearRampToValueAtTime(0, now + off + 0.12);
            o.start(now + off);
            o.stop(now + off + 0.13);
        });
    } catch (e) {}
}

// 2) 释放终极技能
function tryReleaseUltimate() {
    if (!player.ultConfig) return false;
    if (!player.ultimateReady) return false;
    if (player.ultimateCooldown > 0) return false;
    if (player.ultimateActive) return false;
    if (ultReleaseAnim) return false;

    const skill = player.ultConfig.skill;
    const heroId = player.heroId;

    // 设置释放动画(1.5-3s)
    ultReleaseAnim = {
        heroId, t: 0,
        duration: clamp(1.5 + (skill.duration || 0) * 0.3, 1.5, 3),
        color: getHeroColor(heroId),
        text: getUltimateName(skill.type),
    };

    // 立即执行即时效果;持续效果交给 update 中的 ACTIVE 处理
    executeUltimateEffect(skill);

    // 再续神话:每次施放终结技,最终伤害 +4%(最多叠加 15 层 = 60%)
    if (player.cannonUltDmgBuffEnabled) {
        const maxStacks = player.cannonUltDmgMaxStacks || 15;
        if (player.cannonUltDmgStacks < maxStacks) {
            player.cannonUltDmgStacks++;
            spawnFloatText(player.x, player.y - 50,
                `再续神话 ${player.cannonUltDmgStacks}/${maxStacks} 层`, "#ff3da6");
        }
    }

    // 重置充能、设置冷却
    player.charge = 0;
    player.ultimateReady = false;
    player.autoReleaseTimer = 0;
    player.ultimateCooldown = player.ultConfig.cooldown;
    return true;
}

// 终极技能效果执行器(根据 type 分发)
function executeUltimateEffect(skill) {
    switch (skill.type) {
        // 新星号:狂热 - 6s 内攻速 2.2x、伤害 1.4x
        case "frenzy": {
            player.ultimateActive = { type: "frenzy", ...skill, originalFireRate: player.fireRate, originalDamage: player.damage };
            player.ultimateActiveTimer = skill.duration;
            player.fireRate *= skill.fireRateMult;
            player.damage *= skill.dmgMult;
            break;
        }
        // 缇宝:火箭 - 对最近敌人发射 50% 最大 HP 火箭
        case "rocket": {
            player.ultimateActive = { type: "rocket", ...skill };
            player.ultimateActiveTimer = skill.duration;
            break;
        }
       
        // 万敌:狂暴 - 8s 内 maxHp+80、伤害+100%、受伤+50%
        case "berserk": {
            player.ultimateActive = { type: "berserk", ...skill, originalMaxHp: player.maxHp, originalDamage: player.damage };
            player.ultimateActiveTimer = skill.duration;
            player.maxHp += skill.maxHpBonus;
            player.hp += skill.maxHpBonus;
            player.damage *= skill.dmgDealtMult;
            break;
        }
        // 遐蝶:巨龙 - 全屏 4 次 35 伤害(每 0.6s)
        case "dragon": {
            player.ultimateActive = { type: "dragon", ...skill, hitCount: 0, hitTimer: 0 };
            player.ultimateActiveTimer = skill.duration;
            break;
        }
        // 那刻夏:印记 - 全屏敌人加 3 层印记、1s 静止
        case "mark": {
            enemies.forEach(e => {
                player.markStacks[e.id] = (player.markStacks[e.id] || 0) + skill.markStacks;
            });
            player.ultimateActive = { type: "mark", ...skill };
            player.ultimateActiveTimer = skill.freezeTime;
            // 静止 1s 通过 ACTIVE 状态下 update 暂停敌人移动实现
            break;
        }
        // 风堇:嗜血 - 6s 内必暴击、吸血 2x
        case "bloodlust": {
            player.ultimateActive = {
                type: "bloodlust", ...skill,
                originalCritChance: player.critChance,
                originalLifesteal: player.lifesteal,
            };
            player.ultimateActiveTimer = skill.duration;
            player.critChance = 1.0;
            player.lifesteal *= skill.lifestealMult;
            break;
        }
        // 赛飞儿:金币打击 - 对最强敌人按金币数 x8 伤害
        case "gold_strike": {
            if (enemies.length > 0) {
                const target = enemies.reduce((a, b) => (a.maxHp > b.maxHp ? a : b));
                const dmg = player.gold * skill.goldRatio + 50;
                target.hp -= dmg;
                target.flash = 12;
                spawnFloatText(target.x, target.y - target.r, "金币爆击 " + Math.round(dmg), "#fbbf24");
                spawnExplosion(target.x, target.y, "#fbbf24", 30, 1.8);
                player.gold = 0;
                if (target.hp <= 0) {
                    const idx = enemies.indexOf(target);
                    if (idx >= 0) killEnemy(idx);
                }
            }
            break;
        }
        // 白厄:时间静止 - 2s 内无敌、敌人不动
        case "time_stop": {
            player.ultimateActive = { type: "time_stop", ...skill };
            player.ultimateActiveTimer = skill.duration;
            player.invul = Math.max(player.invul, skill.duration * 60);
            break;
        }
        // 海瑟音:流血爆发 - 5s 内所有流血层数翻倍
        case "bleed_burst": {
            Object.keys(player.bleedStacks).forEach(id => {
                player.bleedStacks[id] *= skill.bleedMult;
            });
            player.ultimateActive = { type: "bleed_burst", ...skill };
            player.ultimateActiveTimer = skill.duration;
            break;
        }
        // 刻律德拉:双倍打击 - 全屏 60 伤害、层数+2
        case "double_strike": {
            enemies.forEach(e => {
                e.hp -= skill.dmg;
                e.flash = 12;
                spawnExplosion(e.x, e.y, "#a78bfa", 8, 0.8);
            });
            player.hitCount += skill.stackAdd;
            // 清理已死亡敌人
            for (let i = enemies.length - 1; i >= 0; i--) {
                if (enemies[i].hp <= 0) killEnemy(i);
            }
            break;
        }
        // 长夜月:引爆 - 所有敌人 80 范围伤害
        case "detonate": {
            enemies.forEach(e => {
                e.hp -= skill.dmg;
                e.flash = 12;
                spawnExplosion(e.x, e.y, "#ff6b35", 18, 1.5);
            });
            for (let i = enemies.length - 1; i >= 0; i--) {
                if (enemies[i].hp <= 0) killEnemy(i);
            }
            break;
        }
        // 丹恒腾荒:知识 - 立即获得 15 经验
        case "knowledge": {
            xp += Math.ceil(skill.xpGain * player.xpBonus);
            while (xp >= xpNeed) {
                xp -= xpNeed;
                level++;
                xpNeed = Math.floor(3 + level * 1.6);
                // v20:升级延迟到清场后结算
                pendingLevelUps++;
            }
            spawnFloatText(player.x, player.y - 30, "+" + skill.xpGain + " XP", "#00e5ff");
            break;
        }
        // 昔涟:超巨型炮弹 - 发射 200 伤害、贯穿全场
        case "mega_shot": {
            bullets.push({
                x: player.x, y: player.y - 10,
                vx: 0, vy: player.bulletSpeed * 1.5,
                r: skill.radius,
                dmg: skill.dmg, isCrit: true,
                pierce: skill.pierce,
                hit: new Set(),
                homing: 0,
                life: 240,
                color: "#fbbf24",
                isMega: true,
            });
            break;
        }
        // 记忆主:急速射击 - 3s 内无限穿透、子弹数+2
        case "rapid_fire": {
            player.ultimateActive = {
                type: "rapid_fire", ...skill,
                originalPierce: player.pierce,
                originalMultishot: player.multishot,
            };
            player.ultimateActiveTimer = skill.duration;
            player.pierce = skill.pierce;
            player.multishot += skill.multishotBonus;
            break;
        }
        default:
            console.warn("Unknown ultimate type:", skill.type);
    }
}

// 3) 终极技能生效期间 update(每帧调用)
function updateUltimateActive(dt) {
    if (!player.ultimateActive) return;
    const a = player.ultimateActive;
    player.ultimateActiveTimer -= dt / 60; // dt 是帧数,转秒

    // 持续型效果
    switch (a.type) {
        case "dragon": {
            a.hitTimer -= dt / 60;
            if (a.hitTimer <= 0 && a.hitCount < a.hits) {
                a.hitCount++;
                a.hitTimer = a.interval;
                // 每跳伤害：遐蝶最大生命值的 20%（兼容旧 dmg 固定值配置）
                const dmg = a.dmgPercent ? Math.round(player.maxHp * a.dmgPercent) : a.dmg;
                enemies.forEach(e => {
                    // Boss 用 lifeHp，普通敌人用 hp（与子弹伤害一致）
                    if (e.type === "boss") e.lifeHp -= dmg;
                    else e.hp -= dmg;
                    e.flash = 12;
                    spawnExplosion(e.x, e.y, "#ff3da6", 12, 1);
                    spawnFloatText(e.x, e.y - e.r, "龙息 " + dmg, "#ff3da6");
                });
                for (let i = enemies.length - 1; i >= 0; i--) {
                    const e = enemies[i];
                    if (e.type === "boss" ? (e.lifeHp <= 0) : (e.hp <= 0)) killEnemy(i);
                }
            }
            break;
        }
        case "mark": {
            // 静止敌人
            break;
        }
        case "time_stop": {
            // 敌人不移动、不射击
            break;
        }
        case "bleed_burst": {
            // 每秒对所有流血敌人造成伤害
            if (!a.tickTimer) a.tickTimer = 0;
            a.tickTimer += dt / 60;
            if (a.tickTimer >= 1) {
                a.tickTimer = 0;
                enemies.forEach(e => {
                    const stacks = player.bleedStacks[e.id] || 0;
                    if (stacks > 0) {
                        const dmg = stacks * 2;
                        e.hp -= dmg;
                        e.flash = 6;
                        spawnFloatText(e.x, e.y, "-" + dmg, "#dc2626");
                    }
                });
                for (let i = enemies.length - 1; i >= 0; i--) {
                    if (enemies[i].hp <= 0) killEnemy(i);
                }
            }
            break;
        }
    }

    if (player.ultimateActiveTimer <= 0) {
        endUltimate();
    }
}

// 4) 终极技能结束:恢复原始属性
function endUltimate() {
    const a = player.ultimateActive;
    if (!a) return;
    switch (a.type) {
        case "frenzy":
            player.fireRate = a.originalFireRate;
            player.damage = a.originalDamage;
            break;
        case "berserk":
            player.maxHp = a.originalMaxHp;
            player.hp = Math.min(player.hp, player.maxHp);
            player.damage = a.originalDamage;
            break;
        case "bloodlust":
            player.critChance = a.originalCritChance;
            player.lifesteal = a.originalLifesteal;
            break;
        case "rapid_fire":
            player.pierce = a.originalPierce;
            player.multishot = a.originalMultishot;
            break;
        case "dragon": {
            // 4 秒结束：龙自爆，对全屏敌人造成 30% 最大生命值伤害
            const burst = Math.round(player.maxHp * (a.burstPercent || 0.30));
            enemies.forEach(e => {
                if (e.type === "boss") e.lifeHp -= burst;
                else e.hp -= burst;
                e.flash = 12;
                spawnExplosion(e.x, e.y, "#ff3da6", 20, 1.8);
                spawnFloatText(e.x, e.y - e.r, "龙爆 " + burst, "#ff3da6");
            });
            for (let i = enemies.length - 1; i >= 0; i--) {
                const e = enemies[i];
                if (e.type === "boss" ? (e.lifeHp <= 0) : (e.hp <= 0)) killEnemy(i);
            }
            spawnExplosion(player.x, player.y, "#ff3da6", 40, 2.5);
            // 龙的回馈：遐蝶恢复 10% 最大生命值
            const heal = Math.round(player.maxHp * (a.healPercent || 0.10));
            if (heal > 0 && player.hp > 0) {
                player.hp = Math.min(player.maxHp, player.hp + heal);
                spawnFloatText(player.x, player.y - 30, "+" + heal, "#6ee7b7");
            }
            break;
        }
    }
    player.ultimateActive = null;
    player.ultimateActiveTimer = 0;
}

// 5) 主更新:冷却、自动释放、动画推进
// ============================================================
// 缇宝小技能(炮击强化)系统
// 效果:开启后 6 秒伤害 +20%;冷却 12 秒;E 键手动 / 自动触发
// ============================================================
const CANNON_MINI_CONFIG = {
    duration: 6,       // 生效时长(秒)
    cooldown: 12,       // 冷却时长(秒)
    dmgMult: 1.2,       // 伤害加成 1.2x(+20%)
};

// 尝试激活缇宝小技能
function tryActivateCannonMiniSkill() {
    if (player.heroId !== "cannon") return false;
    if (player.cannonMiniActive) return false;      // 已生效中
    if (player.cannonMiniCooldown > 0) return false; // 冷却中
    // 记录原始伤害(注意:此时可能有终极技能在修改伤害;所以存储"当前伤害/dmgMult"作为基线值,避免结束时覆盖了终极技能的伤害修改)
    player.cannonMiniOriginalDamage = player.damage / CANNON_MINI_CONFIG.dmgMult;
    player.damage = player.damage * CANNON_MINI_CONFIG.dmgMult;
    player.cannonMiniActive = true;
    player.cannonMiniTimer = CANNON_MINI_CONFIG.duration;
    spawnFloatText(player.x, player.y - 30, "炮击强化!", "#ff6b35");
    // 小技能激活音效(短促)
    playCannonMiniActivateSound();
    return true;
}

// 结束缇宝小技能(恢复伤害)
function endCannonMiniSkill() {
    if (!player.cannonMiniActive) return;
    // 恢复伤害:原始基线 × 当前可能存在的终极技能倍率
    // 注意:为了不与终极技能(berserk/frenzy 等)的 damage 乘法冲突,
    // 我们直接把当前 damage 除以 CANNON_MINI_CONFIG.dmgMult,这等价于还原小技能的 +20%
    function endCannonMiniSkill() {
        if (!player.cannonMiniActive) return;
        player.damage = player.cannonMiniOriginalDamage;
        player.cannonMiniActive = false;
        player.cannonMiniTimer = 0;
        player.cannonMiniCooldown = CANNON_MINI_CONFIG.cooldown;
    }

    player.cannonMiniActive = false;
    player.cannonMiniTimer = 0;
    // 触发冷却
    player.cannonMiniCooldown = CANNON_MINI_CONFIG.cooldown;
}

// 小技能主循环:冷却倒计时、生效倒计时、自动触发
function updateCannonMiniSystem(dt) {
    if (player.heroId !== "cannon") return;

    // 1. 生效倒计时
    if (player.cannonMiniActive) {
        player.cannonMiniTimer -= dt / 60;
        if (player.cannonMiniTimer <= 0) {
            endCannonMiniSkill();
        }
    }

    // 2. 冷却倒计时
    if (player.cannonMiniCooldown > 0) {
        player.cannonMiniCooldown = Math.max(0, player.cannonMiniCooldown - dt / 60);
    }

    // 3. 自动模式:冷却结束 + 未生效 → 立即触发(调试日志在 window.__cannonDebug 中)
    if (player.cannonMiniAutoMode &&
        !player.cannonMiniActive &&
        player.cannonMiniCooldown <= 0 &&
        state === State.PLAYING) {
        tryActivateCannonMiniSkill();
    }
}

// 缇宝小技能激活音效(0.25s 升调)
function playCannonMiniActivateSound() {
    if (audio.muted) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "sawtooth";
        o.frequency.setValueAtTime(320, now);
        o.frequency.exponentialRampToValueAtTime(640, now + 0.18);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.12 * audio.volume, now + 0.02);
        g.gain.linearRampToValueAtTime(0, now + 0.22);
        o.start(now);
        o.stop(now + 0.24);
    } catch (e) {}
}

// 获取缇宝小技能状态(供 HUD 用)
function getCannonMiniStatus() {
    if (player.heroId !== "cannon") {
        return { show: false, state: "idle", cdPct: 0, remain: 0, activePct: 0, name: "炮击强化" };
    }
    const cfg = CANNON_MINI_CONFIG;
    if (player.cannonMiniActive) {
        return {
            show: true,
            state: "active",
            cdPct: 0,
            remain: player.cannonMiniTimer,
            activePct: player.cannonMiniTimer / cfg.duration * 100,
            name: "炮击强化",
        };
    }
    if (player.cannonMiniCooldown > 0) {
        return {
            show: true,
            state: "cooldown",
            cdPct: 1 - player.cannonMiniCooldown / cfg.cooldown,
            remain: player.cannonMiniCooldown,
            activePct: 0,
            name: "炮击强化",
        };
    }
    return { show: true, state: "ready", cdPct: 100, remain: 0, activePct: 0, name: "炮击强化" };
}

// 同步缇宝小技能 HUD
function updateCannonMiniHUD() {
    const row = document.getElementById("cannonMiniRow");
    if (!row) return;
    const s = getCannonMiniStatus();
    row.hidden = !s.show;
    if (!s.show) return;

    const icon = document.getElementById("cannonMiniIcon");
    const fill = document.getElementById("cannonMiniFill");
    const num = document.getElementById("cannonMiniNum");
    const cdOverlay = document.getElementById("cannonMiniCd");
    const modeBtn = document.getElementById("cannonMiniModeBtn");

    if (modeBtn) {
        modeBtn.textContent = player.cannonMiniAutoMode ? "自动" : "手动(E)";
        modeBtn.classList.toggle("manual", !player.cannonMiniAutoMode);
    }

    if (s.state === "ready") {
        if (icon) {
            icon.classList.add("ready");
            icon.classList.remove("active");
            icon.style.opacity = "1";
        }
        if (fill) fill.style.width = "100%";
        if (num) num.textContent = s.name + " 就绪";
        if (cdOverlay) cdOverlay.style.display = "none";
    } else if (s.state === "active") {
        if (icon) {
            icon.classList.remove("ready");
            icon.classList.add("active");
            icon.style.opacity = "1";
        }
        if (fill) fill.style.width = s.activePct + "%";
        if (num) num.textContent = s.name + " " + s.remain.toFixed(1) + "s";
        if (cdOverlay) cdOverlay.style.display = "none";
    } else {
        // cooldown
        if (icon) {
            icon.classList.remove("ready", "active");
            icon.style.opacity = "0.55";
        }
        if (fill) fill.style.width = (s.cdPct * 100) + "%";
        if (num) num.textContent = "冷却 " + s.remain.toFixed(1) + "s";
        if (cdOverlay) {
            cdOverlay.style.display = "flex";
            cdOverlay.textContent = Math.ceil(s.remain) + "s";
        }
    }
}

// 缇宝小技能 模式按钮点击绑定
function bindCannonMiniUI() {
    const modeBtn = document.getElementById("cannonMiniModeBtn");
    if (modeBtn) {
        modeBtn.onclick = () => {
            if (player.heroId !== "cannon") return;
            player.cannonMiniAutoMode = !player.cannonMiniAutoMode;
            spawnFloatText(player.x, player.y - 30, player.cannonMiniAutoMode ? "小技能自动" : "小技能手动(E)", "#ff6b35");
            updateCannonMiniHUD();
        };
    }
    const icon = document.getElementById("cannonMiniIcon");
    if (icon) {
        icon.style.cursor = "pointer";
        icon.onclick = () => {
            if (player.heroId !== "cannon") return;
            if (state !== State.PLAYING) return;
            tryActivateCannonMiniSkill();
        };
    }
}

// ============================================================
// 天赋系统(每 60 秒存活获得一次天赋选择机会)
// - 类型:damage / fireRate / defense / support / hero-exclusive
// - v20:时间自动触发天赋机制已移除,天赋池改由波次商店(offerShop)作为商品使用
// ============================================================
// ===== 天赋池:普通(通用)天赋 =====
// rarity: common / rare / epic / legendary / exclusive(英雄专属)
// kind:  "talent" 用于状态面板颜色编码
// stackable: true → 同 id 可多次获得 (叠加层数); false → 一次后从候选池移除
const TALENTS_GENERAL = [

    //头部遗器
    {
        id: "t-life-root", name: "头部遗器", icon: "💚",
        desc: "生命 +10。解锁头部遗器强化。",
        rarity: "common", kind: "talent", type: "生存", stackable: false,
        apply: () => { 
            player.maxHp += 10; 
            player.hp = clamp(player.hp + 10, 0, player.maxHp);
         },
    },
    {
        id: "t-crit-rate-4", name: "强化头部遗器", icon: "🎯",
        desc: "暴击率 +4%。生命值 +10。",
        rarity: "rare", kind: "talent", type: "输出", stackable: true,maxPick: 4,
        requires: ["t-life-root"],
        apply: () => { 
            player.critChance = clamp(player.critChance + 0.04, 0, 1);
            player.maxHp += 10; 
            player.hp = clamp(player.hp + 10, 0, player.maxHp);
         },
    },
    {
        id: "t-crit-dmg-8", name: "强化头部遗器", icon: "💥",
        desc: "暴击伤害 +8%。生命值 +10。",
        rarity: "rare", kind: "talent", type: "输出", stackable: true,maxPick: 4,
        requires: ["t-life-root"],
        apply: () => { 
            player.maxHp += 10; 
            player.hp = clamp(player.hp + 10, 0, player.maxHp);
            player.critMult += 0.08; 
        },
    },
    {
        id: "t-fire-rate-10", name: "强化头部遗器", icon: "⚡",
        desc: "攻击速度 +10%。生命值 +10。",
        rarity: "rare", kind: "talent", type: "输出", stackable: true,maxPick: 4,
        requires: ["t-life-root"],
        apply: () => { 
            player.maxHp += 10; 
            player.hp = clamp(player.hp + 10, 0, player.maxHp);
            player.fireRate *= 1.10;
     },
    },
    {
        id: "t-hp-plus-5", name: "强化头部遗器", icon: "🛡️",
        desc: "攻击力 +5。生命值 +10。",
        rarity: "rare", kind: "talent", type: "输出", stackable: true,maxPick: 4,
        requires: ["t-life-root"],
        apply: () => { 
            player.maxHp += 10; 
            player.hp = clamp(player.hp + 10, 0, player.maxHp);
            player.damage += 5;
        },
    },

    //手部遗器
    {
        id: "t-fire-1", name: "手部遗器", icon: "⚡",
        desc: "攻击伤害 +15。解锁手部遗器强化。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: false,
        apply: () => { 
            player.damage += 15;
        },
    },
    {
        id: "t-fire-1-1", name: "强化手部遗器", icon: "💥",
        desc: "伤害 +5。",
        rarity: "rare", kind: "talent", type: "输出", stackable: true,maxPick: 4,
        requires: ["t-fire-1"],
        apply: () => { 
            player.damage += 15;
            player.damage += 5;
},
    },
    {
        id: "t-fire-1-2", name: "强化手部遗器", icon: "🛡",
        desc: "最大生命 +5。",
        rarity: "rare", kind: "talent", type: "防御", stackable: true,maxPick: 4,
        requires: ["t-fire-1"],
        apply: () => {
            player.damage += 15;
            player.maxHp += 5; 
            player.hp = player.maxHp;
            ;
        },
    },
    {
        id: "t-fire-1-3", name: "强化手部遗器", icon: "💫",
        desc: "暴击率 +4%。",
        rarity: "rare", kind: "talent", type: "防御", stackable: true,maxPick: 4,
        requires: ["t-fire-1"],
        apply: () => { 
            player.damage += 15;
            player.critChance = clamp(player.critChance + 0.04, 0, 1);
            },
    },
    {
        id: "t-fire-1-4", name: "强化手部遗器", icon: "💎",
        desc: "暴击伤害 +8%。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: true,maxPick: 4,
        requires: ["t-fire-1"],
        apply: () => { 
            player.damage += 15;
            player.critMult += 0.08;
        },
    },

    //-----------------------胸部遗器

    {
        id: "t-defense-1", name: "胸部遗器", icon: "🛡️",
        desc: "暴击伤害 +10%。解锁胸部遗器强化。",
        rarity: "rare", kind: "talent", type: "防御", stackable: false,
        mutex:["t-defense-2","t-defense-3","t-defense-4"],
        apply: () => { 
            player.critMult += 0.10;
        },
    },
    {
        id: "t-defense-2", name: "胸部遗器", icon: "💥",
        desc: "生命值增加8%，解锁胸部遗器强化。",
        rarity: "rare", kind: "talent", type: "防御", stackable: false,
        mutex:["t-defense-1","t-defense-3","t-defense-4"],
        apply: () => { 
            player.maxHp *= 1.08;
            player.hp = clamp(player.hp * 1.08, 0, player.maxHp);
        },
    },
    {
        id: "t-defense-3", name: "胸部遗器", icon: "💥",
        desc: "攻击力 +7%。解锁胸部遗器强化。",
        rarity: "rare", kind: "talent", type: "防御", stackable: false,
        mutex:["t-defense-1","t-defense-2","t-defense-4"],
        apply: () => { 
            player.damage *= 1.07;
        },
    },
    {
        id: "t-defense-4", name: "胸部遗器", icon: "💫",
        desc: "暴击率 +4%。解锁胸部遗器强化。",
        rarity: "rare", kind: "talent", type: "防御", stackable: false,
        mutex: ["t-defense-1","t-defense-2" ,"t-defense-3"],
        apply: () => { 
            player.critChance = clamp(player.critChance + 0.04, 0, 1);
        },
    },

    {
        id: "t-defense-11", name: "强化胸部遗器", icon: "🚀",
        desc: "攻击力 +4%",
        rarity: "rare", kind: "talent", type: "生存", stackable: true,maxPick: 4,
        requires: ["t-defense-1", "t-defense-2","t-defense-4"],
        apply: () => { 
            player.damage *= 1.04;
            if (hasTalent("t-defense-1")) player.critMult += 0.04;
            if (hasTalent("t-defense-2")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
            if (hasTalent("t-defense-4")) player.critChance = clamp(player.critChance + 0.02, 0, 1);
        },
    },
    {
        id: "t-defense-12", name: "强化胸部遗器", icon: "🚀",
        desc: "攻击速度 +10%",
        rarity: "rare", kind: "talent", type: "生存", stackable: true,maxPick: 4,
        requires: ["t-defense-1", "t-defense-2", "t-defense-3", "t-defense-4"],
        apply: () => { 
            player.fireRate *= 1.10;
            if (hasTalent("t-defense-1")) player.critMult += 0.04;
            if (hasTalent("t-defense-2")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
            if (hasTalent("t-defense-3")) player.damage *= 1.04;
            if (hasTalent("t-defense-4")) player.critChance = clamp(player.critChance + 0.02, 0, 1);
         },
    },
    {
        id: "t-defense-13", name: "强化胸部遗器", icon: "🚀",
        desc: "生命值 +5%",
        rarity: "rare", kind: "talent", type: "生存", stackable: true,maxPick: 4,
        requires: ["t-defense-1","t-defense-3", "t-defense-4"],
        apply: () => { 
            player.maxHp *= 1.05;
            if (hasTalent("t-defense-1")) player.critMult += 0.04;
            if (hasTalent("t-defense-3")) player.damage *= 1.04;
            if (hasTalent("t-defense-4")) player.critChance = clamp(player.critChance + 0.02, 0, 1);
         },
    },
    {
        id: "t-defense-14", name: "强化胸部遗器", icon: "🚀",
        desc: "暴击率 +4%",
        rarity: "rare", kind: "talent", type: "生存", stackable: true,maxPick: 4,
        requires: ["t-defense-1", "t-defense-2", "t-defense-3"],
        apply: () => { 
            player.critChance = clamp(player.critChance + 0.04, 0, 1);
            if (hasTalent("t-defense-1")) player.critMult += 0.04;
            if (hasTalent("t-defense-2")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
            if (hasTalent("t-defense-3")) player.damage *= 1.04;
         },
    },
    {
        id: "t-defense-15", name: "强化胸部遗器", icon: "🚀",
        desc: "暴击伤害 +8%",
        rarity: "rare", kind: "talent", type: "生存", stackable: true,maxPick: 4,
        requires: ["t-defense-2", "t-defense-3", "t-defense-4"],
        apply: () => { 
            player.critMult += 0.08;
            if (hasTalent("t-defense-2")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
            if (hasTalent("t-defense-3")) player.damage *= 1.04;
            if (hasTalent("t-defense-4")) player.critChance = clamp(player.critChance + 0.02, 0, 1);
         },
    },

    //----------------------------鞋部遗器

    {
        id: "t-xie-1", name: "鞋部遗器", icon: "👟",
        desc: "攻击速度 +10%。解锁鞋部遗器强化。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: false,
        mutex:["t-xie-2","t-xie-3"],
        apply: () => {
            player.fireRate *= 1.10;
        },
    },
    {
        id: "t-xie-2", name: "鞋部遗器", icon: "💥",
        desc: "攻击伤害 +7%。解锁鞋部遗器强化。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: false,
        mutex:["t-xie-1","t-xie-3"],
        apply: () => {
            player.damage *= 1.07;
        },
    },
    {
        id: "t-xie-3", name: "鞋部遗器", icon: "💫",
        desc: "最大生命 +8%。解锁鞋部遗器强化。",
        rarity: "rare", kind: "talent", type: "生存", stackable: false,
        mutex:["t-xie-1","t-xie-2"],
        apply: () => {
            player.maxHp *= 1.08;
            player.hp = clamp(player.hp * 1.08, 0, player.maxHp);
        },
    },
    {
        id: "t-xie-11", name: "强化鞋部遗器", icon: "🚀",
        desc: "攻击速度 +5%。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: true,maxPick: 4,
        requires: ["t-xie-2", "t-xie-3"],
        apply: () => {
            player.fireRate *= 1.05;
            if (hasTalent("t-xie-2")) player.damage *= 1.05;
            if (hasTalent("t-xie-3")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
        },
    },
    {
        id: "t-xie-12", name: "强化鞋部遗器", icon: "🚀",
        desc: "暴击率 +4%。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: true,maxPick: 4,
        requires: ["t-xie-1", "t-xie-2", "t-xie-3"],
        apply: () => {
            player.critChance = clamp(player.critChance + 0.04, 0, 1);
            if (hasTalent("t-xie-1")) player.fireRate *= 1.10;
            if (hasTalent("t-xie-2")) player.damage *= 1.05;
            if (hasTalent("t-xie-3")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
        },
    },
    {
        id: "t-xie-13", name: "强化鞋部遗器", icon: "🚀",
        desc: "暴击伤害 +8%。",
        rarity: "rare", kind: "talent", type: "生存", stackable: true,maxPick: 4,
        requires: ["t-xie-1", "t-xie-2", "t-xie-3"],
        apply: () => {
            player.critMult += 0.08;
            if (hasTalent("t-xie-1")) player.fireRate *= 1.10;
            if (hasTalent("t-xie-2")) player.damage *= 1.05;
            if (hasTalent("t-xie-3")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
        },
    },
    {
        id: "t-xie-21", name: "强化鞋部遗器", icon: "🚀",
        desc: "生命值 +4%。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: true,maxPick: 4,
        requires: ["t-xie-1", "t-xie-2"],
        apply: () => {
            player.maxHp *= 1.04;
            player.hp = clamp(player.hp * 1.04, 0, player.maxHp);
            if (hasTalent("t-xie-1")) player.fireRate *= 1.10;
            if (hasTalent("t-xie-2")) player.damage *= 1.05;
        },
    },
    {
        id: "t-xie-22", name: "强化鞋部遗器", icon: "🚀",
        desc: "攻击力 +5%。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: true,maxPick: 4,
        requires: ["t-xie-1", "t-xie-3"],
        apply: () => {
            player.damage *= 1.05;
            if (hasTalent("t-xie-1")) player.fireRate *= 1.10;
            if (hasTalent("t-xie-3")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
        }
    },

    //----------------------------连接绳遗器

    {
        id: "t-rope-1", name: "连接绳遗器", icon: "🪢",
        desc: "充能效率 +10%，解锁连接绳遗器强化。",
        rarity: "rare", kind: "talent", type: "生存", stackable: false,
        mutex:["t-rope-2","t-rope-3"],
        apply: () => {
            player.ultConfig.chargePerHit *= 1.10;
        }
    },
    {
        id: "t-rope-2", name: "连接绳遗器", icon: "🪢",
        desc: "攻击力 +5%。解锁连接绳遗器强化。",
        rarity: "rare", kind: "talent", type: "生存", stackable: false,
        mutex:["t-rope-1","t-rope-3"],
        apply: () => {
            player.damage *= 1.05;
        }
    },
    {
        id: "t-rope-3", name: "连接绳遗器", icon: "🪢",
        desc: "生命值 +4%。解锁连接绳遗器强化。",
        rarity: "rare", kind: "talent", type: "生存", stackable: false,
        mutex:["t-rope-1","t-rope-2"],
        apply: () => {
            player.maxHp *= 1.04;
            player.hp = clamp(player.hp * 1.04, 0, player.maxHp);
        }
    },
    {
        id: "t-rope-11", name: "强化连接绳遗器", icon: "🚀",
        desc: "攻击速度 +5%。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: true,maxPick: 4,
        requires: ["t-rope-1", "t-rope-2", "t-rope-3"],
        apply: () => {
            player.fireRate *= 1.05;
            if (hasTalent("t-rope-1")) player.ultConfig.chargePerHit *= 1.10;
            if (hasTalent("t-rope-2")) player.damage *= 1.05;
            if (hasTalent("t-rope-3")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
        },
    },
    {
        id: "t-rope-12", name: "强化连接绳遗器", icon: "🚀",
        desc: "暴击率 +4%。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: true,maxPick: 4,
        requires: ["t-rope-1", "t-rope-2", "t-rope-3"],
        apply: () => {
            player.critChance = clamp(player.critChance + 0.04, 0, 1);
            if (hasTalent("t-rope-1")) player.fireRate *= 1.10;
            if (hasTalent("t-rope-2")) player.damage *= 1.05;
            if (hasTalent("t-rope-3")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
        },
    },
    {
        id: "t-rope-13", name: "强化连接绳遗器", icon: "🚀",
        desc: "暴击伤害 +8%。",
        rarity: "rare", kind: "talent", type: "生存", stackable: true,maxPick: 4,
        requires: ["t-rope-1", "t-rope-2", "t-rope-3"],
        apply: () => {
            player.critMult += 0.08;
            if (hasTalent("t-rope-1")) player.fireRate *= 1.10;
            if (hasTalent("t-rope-2")) player.damage *= 1.05;
            if (hasTalent("t-rope-3")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
        },
    },
    {
        id: "t-rope-21", name: "强化连接绳遗器", icon: "🚀",
        desc: "生命值 +4%。解锁连接绳遗器强化。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: true,maxPick: 4,
        requires: ["t-rope-1", "t-rope-2"],
        apply: () => {
            player.maxHp *= 1.04;
            player.hp = clamp(player.hp * 1.04, 0, player.maxHp);
            if (hasTalent("t-rope-1")) player.fireRate *= 1.10;
            if (hasTalent("t-rope-2")) player.damage *= 1.05;
        },
    },
    {
        id: "t-rope-22", name: "强化连接绳遗器", icon: "🚀",
        desc: "攻击力 +5%。解锁连接绳遗器强化。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: true,maxPick: 4,
        requires: ["t-rope-1", "t-rope-3"],
        apply: () => {
            player.damage *= 1.05;
            if (hasTalent("t-rope-1")) player.fireRate *= 1.10;
            if (hasTalent("t-rope-3")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
        }
    },

    //-----------------------------位面球遗器
    {
        id: "t-qiu-1", name: "位面球遗器", icon: "🔱",
        desc: "最终伤害 +10%（独立乘区，在所有伤害计算之后生效）。解锁位面球遗器强化。",
        rarity: "epic", kind: "talent", type: "输出", stackable: false,
        mutex:["t-qiu-2","t-qiu-3"],
        apply: () => {
            player.finalDmgMult *= 1.10;
        },
    },
    {
        id: "t-qiu-2", name: "位面球遗器", icon: "🪢",
        desc: "攻击力 +5%。解锁位面球遗器强化。",
        rarity: "rare", kind: "talent", type: "生存", stackable: false,
        mutex:["t-qiu-1","t-qiu-3"],
        apply: () => {
            player.damage *= 1.05;
        }
    },
    {
        id: "t-qiu-3", name: "位面球遗器", icon: "🪢",
        desc: "生命值 +4%。解锁位面球遗器强化。",
        rarity: "rare", kind: "talent", type: "生存", stackable: false,
        mutex:["t-qiu-1","t-qiu-2"],
        apply: () => {
            player.maxHp *= 1.04;
            player.hp = clamp(player.hp * 1.04, 0, player.maxHp);
        }
    },
    {
        id: "t-qiu-11", name: "强化位面球", icon: "🚀",
        desc: "攻击速度 +5%。",
        rarity: "rare", kind: "talent", type: "输出", stackable: true,maxPick: 4,
        requires: ["t-qiu-1", "t-qiu-2", "t-qiu-3"],
        apply: () => {
            player.fireRate *= 1.05;
            if (hasTalent("t-qiu-1")) player.finalDmgMult *= 1.10;
            if (hasTalent("t-qiu-2")) player.damage *= 1.05;
            if (hasTalent("t-qiu-3")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
        },
    },
    {
        id: "t-qiu-12", name: "强化位面球", icon: "🚀",
        desc: "暴击率 +4%。",
        rarity: "rare", kind: "talent", type: "输出", stackable: true,maxPick: 4,
        requires: ["t-qiu-1", "t-qiu-2", "t-qiu-3"],
        apply: () => {
            player.critChance = clamp(player.critChance + 0.04, 0, 1);
            if (hasTalent("t-qiu-1")) player.finalDmgMult *= 1.10;
            if (hasTalent("t-qiu-2")) player.damage *= 1.05;
            if (hasTalent("t-qiu-3")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
        },
    },
    {
        id: "t-qiu-13", name: "强化位面球", icon: "🚀",
        desc: "暴击伤害 +8%。",
        rarity: "rare", kind: "talent", type: "输出", stackable: true,maxPick: 4,
        requires: ["t-qiu-1", "t-qiu-2", "t-qiu-3"],
        apply: () => {
            player.critMult += 0.08;
            if (hasTalent("t-qiu-1")) player.finalDmgMult *= 1.10;
            if (hasTalent("t-qiu-2")) player.damage *= 1.05;
            if (hasTalent("t-qiu-3")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
        },
    },
    {
        id: "t-qiu-21", name: "强化位面球", icon: "🚀",
        desc: "生命值 +4%。",
        rarity: "rare", kind: "talent", type: "生存", stackable: true,maxPick: 4,
        requires: ["t-qiu-1", "t-qiu-2"],
        apply: () => {
            player.maxHp *= 1.04;
            player.hp = clamp(player.hp * 1.04, 0, player.maxHp);
            if (hasTalent("t-qiu-1")) player.finalDmgMult *= 1.10;
            if (hasTalent("t-qiu-2")) player.damage *= 1.05;
        },
    },
    {
        id: "t-qiu-22", name: "强化位面球", icon: "🚀",
        desc: "攻击力 +5%。",
        rarity: "rare", kind: "talent", type: "攻击", stackable: true,maxPick: 4,
        requires: ["t-qiu-1", "t-qiu-3"],
        apply: () => {
            player.damage *= 1.05;
            if (hasTalent("t-qiu-1")) player.finalDmgMult *= 1.10;
            if (hasTalent("t-qiu-3")) {player.maxHp *= 1.04;player.hp = clamp(player.hp * 1.04, 0, player.maxHp);}
        }
    },
];

// ===== 天赋池:缇宝(英雄专属)天赋 =====
const TALENTS_HERO_EXCLUSIVE = {
    cannon: [
        {
            id: "t-cn-shell-1", name: "重型霰弹", icon: "🧨",
            desc: "缇宝专属:伤害 +15%;同时发射子弹数 +1，但是射速-6%。多次选取可叠加。",
            rarity: "exclusive", kind: "talent-exclusive", type: "缇宝 专属", stackable: true,//rarity稀有度，kind是否是英雄专属，type类型，stackable是否可叠加
            apply: () => {
                player.damage *= 1.15;
                player.multishot += 1;
                player.fireRate = clamp(player.fireRate * 0.94, 0.5, 50);
            },
        },
        {
            id: "t-cn-crit-1", name: "岔路旁的小石子？", icon: "🎯",
            desc: "缇宝专属:每次火箭攻击到敌人恢复5点终结技能量。",
            rarity: "exclusive", kind: "talent-exclusive", type: "缇宝 专属", stackable: false,
            apply: () => {
                player.ultConfig.chargePerHit += 5;
            },
        },
        {
            id: "t-cn-ult-1", name: "火箭弹药", icon: "🚀",
            desc: "缇宝专属:在小技能持续期间，每次攻击敌人也会发动追击火箭，每次造成自身最大生命值的5%的伤害。",
            rarity: "exclusive", kind: "talent-exclusive", type: "缇宝 专属", stackable: false,
            apply: () => {
                player.cannonRocketTalent = true;
            },
        },
        {
            id: "t-cn-rocket-1", name: "火箭巢扩容", icon: "🚀",
            desc: "缇宝专属:缇宝火箭终极技能半径 +40%,持续时间 +2s,伤害 +25%。多次选取可叠加。",
            rarity: "exclusive", kind: "talent-exclusive", type: "缇宝 专属", stackable: true,
            apply: () => {
                if (player.ultConfig && player.ultConfig.skill.type === "rocket") {
                    player.ultConfig.skill.radius = (player.ultConfig.skill.radius || 120) * 1.40;
                    player.ultConfig.skill.duration = (player.ultConfig.skill.duration || 4) + 2;
                    player.ultConfig.skill.dmg = (player.ultConfig.skill.dmg || 80) * 1.25;
                }
            },
        },
        {
            id: "t-cn-mini-1", name: "炮击专家", icon: "💥",
            desc: "缇宝专属:炮击强化(小技能)伤害加成额外 +5%,持续时间 +2s,冷却减少 2s。多次选取可叠加。",
            rarity: "exclusive", kind: "talent-exclusive", type: "缇宝 专属", stackable: true,
            apply: () => {
                if (player.cannonMiniOriginalDamage == null) player.cannonMiniOriginalDamage = 0;
                // 在 CANNON_MINI_CONFIG 基础上动态增益(每次获取永久加强)
                CANNON_MINI_CONFIG.dmgMult = (CANNON_MINI_CONFIG.dmgMult || 1.2) * 1.05;
                CANNON_MINI_CONFIG.duration = (CANNON_MINI_CONFIG.duration || 6) + 2;
                CANNON_MINI_CONFIG.cooldown = Math.max(4, (CANNON_MINI_CONFIG.cooldown || 12) - 2);
            },
        },
        {
            id: "t-cn-hp-1", name: "坚甲巨炮", icon: "🏰",
            desc: "缇宝专属:最大生命 +50,子弹尺寸 +25%,暴伤 +0.5x。多次选取可叠加。",
            rarity: "rare", kind: "talent-exclusive", type: "缇宝 专属", stackable: true,
            apply: () => {
                player.maxHp += 50;
                player.hp = player.maxHp;
                player.bulletR *= 1.25;
                player.critMult += 0.5;
            },
        },
    ],
};

// ===== 已获取的升级/天赋列表(供英雄状态面板渲染) =====
// 结构: [{ uid, id, name, desc, rarity, kind, source("upgrade"|"talent"), type, icon, stackable, count, acquiredAt }]
let historyEntries = [];
let _historySeq = 0; // uid 生成序列

// 生存时间(秒,仅 PLAYING 状态累加)
let survivalSeconds = 0;
// 当前激活的状态面板 Tab
let heroStatusTab = "upgrades";

// === 工具:为 historyEntries 新增/叠加一项 ===
function recordHistory(entry) {
    // 可叠加:同一 id 合并,count++
    if (entry.stackable) {
        const same = historyEntries.find(h => h.id === entry.id && h.source === entry.source);
        if (same) {
            same.count += 1;
            same.acquiredAt = performance.now();
            return same;
        }
    }
    const wrap = {
        uid: ++_historySeq,
        id: entry.id,
        name: entry.name,
        desc: entry.desc,
        rarity: entry.rarity || "common",
        kind: entry.kind || "common", // common/rare/epic/legendary/talent/talent-exclusive
        source: entry.source || "talent", // "upgrade" | "talent"
        type: entry.type || "通用",
        icon: entry.icon || null,
        stackable: !!entry.stackable,
        count: 1,
        acquiredAt: performance.now(),
    };
    historyEntries.unshift(wrap);
    return wrap;
}

// === 生存秒数格式化为 m:ss ===
function fmtSurvival(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function hasTalent(id) {
    return historyEntries.some(h => h.source === "talent" && h.id === id);
}

function getTalentPickCount(id) {
    return historyEntries.filter(h => h.source === "talent" && h.id === id)//filter是过滤器
        .reduce((sum, h) => sum + (h.count || 1), 0);//总结天赋被选择几次
}

//检查是否可以选择天赋
function canPickTalent(t) {
    if (!t) return false;

    if (t.maxPick && getTalentPickCount(t.id) >= t.maxPick) 
        return false;

    const heroPool = TALENTS_HERO_EXCLUSIVE[player.heroId] || [];
    const allTalents = [...TALENTS_GENERAL, ...heroPool];

    for (const selected of historyEntries) {
        if (selected.source !== "talent") continue;
            const selectedTalent = allTalents.find(tt => tt.id === selected.id);
        if (selectedTalent && selectedTalent.mutex && selectedTalent.mutex.includes(t.id)) {
            return false; // 已选天赋与当前天赋互斥
        }
    }
    if (t.mutex && t.mutex.length > 0) {
        for (const mutexId of t.mutex) {
            if (historyEntries.some(h => h.source === "talent" && h.id === mutexId)) {
                return false; // 当前天赋与已选天赋互斥
            }
        }
    }
    if (t.requires && t.requires.length > 0) {
        return t.requires.some(r => getTalentPickCount(r) > 0);
    }
    return true;
}

// === 从通用 + 英雄专属 天赋池中抽取 3 个随机天赋 ===
function rollTalentPicks(heroId) {
    // 1) 候选池:通用 + 英雄专属(如果有)
    const heroPool = (TALENTS_HERO_EXCLUSIVE[heroId] || []).filter(t => {
        if (!canPickTalent(t)) return false;
        if (!t.stackable) {
            const got = hasTalent(t.id);
            return !got;
        }
        return true;
    });

    const generalPool = TALENTS_GENERAL.filter(t => {
        if (!canPickTalent(t)) return false;
        if (!t.stackable) {
            const got = hasTalent(t.id);
            return !got;
        }
        return true;
    });

    // 稀有度权重(天赋的 legendary 较稀)
    const weight = { common: 1, rare: 0.55, epic: 0.28, legendary: 0.08, exclusive: 0.4 };
    const picks = [];
    const totalPool = [...heroPool, ...generalPool];

    // (a) 优先保证缇宝专属天赋至少出现 1 个(若该英雄有专属池且第一次触发时概率强制 60%)
    if (heroPool.length > 0) {
        // 强制 1 项来自英雄专属的概率 = 65% (若没有被取完)
        const chance = Math.random();
        if (chance < 0.65) {
            const total = heroPool.reduce((s, t) => s + (weight[t.rarity] || 1), 0) || 1;
            let r = Math.random() * total;
            let idx = 0;
            for (let i = 0; i < heroPool.length; i++) {
                r -= (weight[heroPool[i].rarity] || 1);
                if (r <= 0) { idx = i; break; }
                idx = i;
            }
            picks.push(heroPool[idx]);
        }
    }

    // (b) 从整个池子(去掉已选)补齐到 3 个
    const remainingPool = totalPool.filter(t => !picks.some(p => p.id === t.id));
    while (picks.length < 3 && remainingPool.length > 0) {
        const total = remainingPool.reduce((s, t) => s + (weight[t.rarity] || 1), 0) || 1;
        let r = Math.random() * total;
        let idx = 0;
        for (let i = 0; i < remainingPool.length; i++) {
            r -= (weight[remainingPool[i].rarity] || 1);
            if (r <= 0) { idx = i; break; }
            idx = i;
        }
        picks.push(remainingPool.splice(idx, 1)[0]);
    }
    // (c) 若仍不足 3(极端情况),回退通用池(允许 stackable 的再重复)
    while (picks.length < 3 && TALENTS_GENERAL.length) {
        const t = TALENTS_GENERAL[Math.floor(Math.random() * TALENTS_GENERAL.length)];
        if (!picks.some(p => p.id === t.id)) picks.push(t);
        else if (t.stackable) picks.push(t);
        else if (picks.length < 3) picks.push(t); // 容错
    }
    return picks.slice(0, 3);
}

// === 应用某个天赋并记录 history ===
function applyTalent(t) {
    if (!t) return false;
    try {
        t.apply();
    } catch (e) { console.warn("[Talent] apply 出错:", t.id, e); }
    recordHistory({
        id: t.id, name: t.name, desc: t.desc,
        rarity: t.rarity, kind: t.kind,
        source: "talent", type: t.type, icon: t.icon, stackable: t.stackable,
    });
    spawnFloatText(player.x, player.y - 36, `天赋: ${t.name}`,
        t.rarity === "legendary" ? "#f59e0b" :
        t.rarity === "epic"      ? "#a78bfa" :
        t.rarity === "rare"      ? "#60a5fa" :
        t.rarity === "exclusive" ? "#ff3da6" : "#00e5ff");
    playTalentGainSound(t.rarity);
    return true;
}

// v20:时间触发天赋弹窗(offerTalents/closeTalentPanel/updateTalentSystem/updateTalentHUD)
// 已随时间触发机制整体移除,天赋获取入口改为波次商店 buyShopItem(复用 applyTalent)。

// === 天赋获取音效(按稀有度不同音调) ===
function playTalentGainSound(rarity) {
    if (audio.muted) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ac = new AudioCtx();
        const now = ac.currentTime;
        // base frequency by rarity (稀有度越高音调越丰富)
        const base = { common: 520, rare: 620, epic: 720, legendary: 820, exclusive: 880 }[rarity] || 520;
        const steps = rarity === "legendary" ? 5 : rarity === "exclusive" ? 5 : rarity === "epic" ? 4 : 3;
        const sweepTime = 0.22 + steps * 0.04;
        for (let i = 0; i < steps; i++) {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.connect(g); g.connect(ac.destination);
            o.type = i === 0 ? "triangle" : "sine";
            const f0 = base + i * 110;
            const f1 = f0 * 1.6;
            o.frequency.setValueAtTime(f0, now + i * 0.03);
            o.frequency.exponentialRampToValueAtTime(f1, now + i * 0.03 + sweepTime * 0.6);
            const g0 = 0.0001;
            const g1 = 0.12 * audio.volume / (i + 1);
            g.gain.setValueAtTime(g0, now + i * 0.03);
            g.gain.exponentialRampToValueAtTime(g1, now + i * 0.03 + 0.02);
            g.gain.exponentialRampToValueAtTime(g0, now + i * 0.03 + sweepTime);
            o.start(now + i * 0.03);
            o.stop(now + i * 0.03 + sweepTime + 0.02);
        }
    } catch (e) {}
}

// ============================================================
// 英雄状态面板(升级 + 天赋)
// 渲染逻辑:
// - 根据 heroStatusTab(upgrades/talents/all) 过滤
// - 每项显示:稀有度左边线 + 图标 + 名称 + 简述 + 叠加层数
// - 悬停:详细 tooltip(含 稀有度/类型/是否可叠加/当前层数/获取时间点)
// - 自适应:自动切换 tooltip 方向(空间不足时 flip)
// - 滚动:超出高度自动出现滚动条
// ============================================================
function _getUpgradeMeta(upgradeId) {
    const u = UPGRADES.find(x => x.id === upgradeId) || HERO_EXCLUSIVE_UPGRADES.find(x => x.id === upgradeId);
    if (!u) return null;
    let rarity = u.rarity || "common";
    let kind = rarity; // common / rare / epic / legendary
    let type = "升级 · 通用";
    if (u.heroId) type = `升级 · ${ (HEROES.find(h => h.id === u.heroId) || {}).name || u.heroId } 专属`;
    // 图标(根据 id 映射 emoji)
    const iconMap = {
        dmg: "⚔", fire: "⚡", bspd: "💨", mhp: "❤️", heal: "➕",
        multi: "🔫", pierce: "🔱", homing: "🎡", crit: "💥", critdmg: "🔥",
        speed: "🚀", bigr: "⭕", leech: "🩸", shield: "🛡", explode: "💣", xp: "✨",
        "nova-swarm": "🛩", "cannon-guided": "🧭", "cannon-charge": "🔋",
        "storm-counter": "⚡",
    };
    return {
        id: u.id, name: u.name, desc: u.desc, rarity, kind,
        source: "upgrade", type,
        icon: iconMap[u.id] || "🔹",
        stackable: u.stackable !== false, 
    }
}

// 升级系统被点击时:也记录到 historyEntries
function hookUpgradeRecording() {
    // offerUpgrades 中 onclick 会调用 u.apply 并关闭面板
    // 这里用 MutationObserver 观察 upgradePanel 隐藏 → 捕捉"选择了升级"事件,结合补丁升级 apply
    // 更简单:在 offerUpgrades 里直接替换为包装 apply → 通过重写它
}

// 英雄状态 Tab 切换
function _bindHeroStatusTabs() {
    const tabs = document.querySelectorAll(".hero-status-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const t = tab.dataset.tab;
            heroStatusTab = t;
            tabs.forEach(x => x.classList.toggle("active", x === tab));
            renderHeroStatusPanel();
        });
    });
}

// 渲染英雄状态面板(每获得一个升级/天赋调用一次;也可每帧更新 HUD 时调用一次)
function renderHeroStatusPanel() {
    if (!ui.heroStatusPanel) return;

    // 过滤:按 tab
    let items = historyEntries.slice();
    // 兼容:升级通过 offerUpgrades -> recordUpgradeRecord 获取
    if (heroStatusTab === "upgrades") items = items.filter(x => x.source === "upgrade");
    else if (heroStatusTab === "talents") items = items.filter(x => x.source === "talent");
    // else all

    const totalCount = historyEntries.reduce((s, x) => s + (x.count || 1), 0);
    const upgradeCount = historyEntries.filter(x => x.source === "upgrade").reduce((s, x) => s + (x.count || 1), 0);
    const talentCount = historyEntries.filter(x => x.source === "talent").reduce((s, x) => s + (x.count || 1), 0);

    if (ui.heroStatusCount) ui.heroStatusCount.textContent = totalCount;
    if (ui.heroStatusTabUpgradeCount) ui.heroStatusTabUpgradeCount.textContent = upgradeCount;
    if (ui.heroStatusTabTalentCount) ui.heroStatusTabTalentCount.textContent = talentCount;

    const empty = ui.heroStatusEmpty;
    const list = ui.heroStatusList;
    if (!list) return;

    if (items.length === 0) {
        if (empty) empty.style.display = "";
        list.innerHTML = "";
        list.appendChild(empty);
        return;
    }
    if (empty) empty.style.display = "none";

    const rarityCn = { common: "普通", rare: "稀有", epic: "史诗", legendary: "传说", exclusive: "专属" };
    const tipMap = { common: "tip-common", rare: "tip-rare", epic: "tip-epic", legendary: "tip-legendary" };
    // kind -> tip class
    const kindToTip = k => {
        if (k === "talent") return "tip-talent";
        if (k === "talent-exclusive") return "tip-exclusive";
        return tipMap[k] || "tip-common";
    };
    const kindLabel = (k, r) => {
        if (k === "talent") return "天赋";
        if (k === "talent-exclusive") return "英雄专属天赋";
        return "升级 · " + (rarityCn[r] || "普通");
    };

    // 生成列表
    const frag = document.createDocumentFragment();
    items.forEach(entry => {
        const div = document.createElement("div");
        div.className = `hero-status-item rarity-${entry.kind || entry.rarity || "common"}`;
        div.dataset.uid = entry.uid;
        const acquiredSec = entry.acquiredAt ? Math.max(0, Math.floor((entry.acquiredAt - (window.__gameStartTime || 0)) / 1000)) : 0;
        div.innerHTML = `
            <div class="hs-icon">${entry.icon || "🔹"}</div>
            <div class="hs-main">
                <div class="hs-name">${entry.name}</div>
                <div class="hs-desc">${entry.desc}</div>
            </div>
            ${(entry.count || 1) > 1 ? `<div class="hs-count">×${entry.count}</div>` : `<div class="hs-count" style="opacity:.55">×1</div>`}
            <div class="hs-tooltip" role="tooltip">
                <div class="tip-title">
                    <span>${entry.icon || "🔹"} ${entry.name}</span>
                    <span class="tip-tag ${kindToTip(entry.kind, entry.rarity)}">${kindLabel(entry.kind, entry.rarity)}</span>
                </div>
                <div class="tip-desc">${entry.desc}</div>
                <div class="tip-stack">
                    <div>分类:${entry.type || "通用"} · ${entry.stackable ? "可叠加" : "唯一"}</div>
                    <div>当前层数:<b style="color:#ffd166">×${entry.count || 1}</b></div>
                    ${entry.source === "talent" ? `<div>获取时存活:${fmtSurvival(Math.floor(survivalSeconds - 0) - 0)}</div>` : ""}
                </div>
            </div>
        `;
        frag.appendChild(div);
    });
    list.innerHTML = "";
    list.appendChild(frag);
    if (empty) list.appendChild(empty); // 仍然保留,便于 next time

    // 自动判断右侧剩余空间是否足够显示 tooltip → 空间不足 flip to left
    requestAnimationFrame(() => {
        const itemsEls = list.querySelectorAll(".hero-status-item");
        const panelRect = ui.heroStatusPanel.getBoundingClientRect();
        const spaceOnRight = Math.max(0, window.innerWidth - panelRect.right);
        const needFlip = spaceOnRight < 240;
        itemsEls.forEach(el => {
            if (needFlip) el.classList.add("flip-tooltip");
            else el.classList.remove("flip-tooltip");
        });
    });
}

// === 记录一次升级选择(由 offerUpgrades 在点击卡片时调用) ===
function recordUpgradeChosen(upgradeId) {
    const meta = _getUpgradeMeta(upgradeId);
    if (!meta) return;
    // 必须同时从通用升级池和英雄专属升级池查找，否则专属升级的 stackable 会误判为可叠加
    const upgradeDef = UPGRADES.find(x => x.id === upgradeId)
                   || HERO_EXCLUSIVE_UPGRADES.find(x => x.id === upgradeId);
    recordHistory({
        id: meta.id, name: meta.name, desc: meta.desc,
        rarity: meta.rarity, kind: meta.kind,
        source: "upgrade", type: meta.type, icon: meta.icon,
        stackable: upgradeDef ? (upgradeDef.stackable !== false) : false,
    });
    renderHeroStatusPanel();
}

// 绑定状态面板 tab(v20:天赋弹窗跳过按钮已随时间触发机制移除)
function bindTalentAndStatusUI() {
    _bindHeroStatusTabs();
}

function updateUltimateSystem(dt) {
    if (!player.ultConfig) return;

    // 冷却倒计时(dt 帧数 → 秒)
    if (player.ultimateCooldown > 0) {
        player.ultimateCooldown = Math.max(0, player.ultimateCooldown - dt / 60);
    }

    // 生效中技能 update
    if (player.ultimateActive) {
        updateUltimateActive(dt);
    }

    // 缇宝专属：每 60 秒自动补满一次终结技能
    if (player.chargeRefreshEnabled) {
        if (!player.ultimateReady && !player.ultimateActive && player.ultimateCooldown <= 0) {
            player.chargeRefreshCooldown = Math.max(0, player.chargeRefreshCooldown - dt / 60);
            if (player.chargeRefreshCooldown <= 0) {
                player.charge = player.ultConfig ? player.ultConfig.chargeThreshold : 0;
                player.ultimateReady = true;
                player.autoReleaseTimer = 0.5;
                player.chargeRefreshCooldown = 60;
                spawnFloatText(player.x, player.y - 30, "缇宝充能!", "#ffd700");
            }
        }
    }

    // 自动释放模式:充能就绪 + 0.5s 延迟后自动释放
    if (player.autoMode && player.ultimateReady && !player.ultimateActive && player.ultimateCooldown <= 0) {
        player.autoReleaseTimer -= dt / 60;
        if (player.autoReleaseTimer <= 0) {
            tryReleaseUltimate();
        }
    }

    // 释放动画推进
    if (ultReleaseAnim) {
        ultReleaseAnim.t += dt / 60;
        if (ultReleaseAnim.t >= ultReleaseAnim.duration) {
            ultReleaseAnim = null;
        }
    }
    
    // ===== 遐蝶被动：立场每秒全屏百分比伤害 =====
    if (player.passiveConfig && player.passiveConfig.type === "field") {
        player._fieldTickTimer += dt / 60;
        if (player._fieldTickTimer >= player.passiveConfig.interval) {
            player._fieldTickTimer = 0;
            const pctDmg = player.passiveConfig.dmgPercent;
            for (let i = enemies.length - 1; i >= 0; i--) {
                const e = enemies[i];
                const dmg = Math.round(e.maxHp * pctDmg);
                // Boss 用 lifeHp，普通敌人用 hp（与子弹伤害一致）
                if (e.type === "boss") e.lifeHp -= dmg;
                else e.hp -= dmg;
                e.flash = 6;
                spawnFloatText(e.x, e.y - e.r, "立场 " + dmg, "#a78bfa");
                if (e.type === "boss" ? (e.lifeHp <= 0) : (e.hp <= 0)) killEnemy(i);
            }
        }
    }
    // 流血效果每秒结算(被动,无需终极技能激活)
    if (!player.bleedTickTimer) player.bleedTickTimer = 0;
    player.bleedTickTimer += dt / 60;
    if (player.bleedTickTimer >= 1) {
        player.bleedTickTimer = 0;
        const bleedMult = (player.ultimateActive && player.ultimateActive.type === "bleed_burst") ? player.ultimateActive.bleedMult : 1;
        enemies.forEach(e => {
            const stacks = (player.bleedStacks[e.id] || 0);
            if (stacks > 0) {
                const dmg = stacks * 2 * bleedMult;
                e.hp -= dmg;
                e.flash = 6;
                if (Math.random() < 0.5) spawnFloatText(e.x, e.y, "流血 " + dmg, "#dc2626");
                // 流血层数衰减
                player.bleedStacks[e.id] = Math.max(0, stacks - 1);
            }
        });
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (enemies[i].hp <= 0) killEnemy(i);
        }
    }
}

// 颜色映射(给释放动画用)
function getHeroColor(heroId) {
    const map = {
        nova: "#00e5ff", cannon: "#ff6b35", storm: "#fbbf24", scatter: "#a78bfa",
        lance: "#34d399", crit: "#dc2626", bastion: "#60a5fa", zephyr: "#67e8f9",
        leech: "#be123c", hunter: "#a78bfa", inferno: "#f97316", sage: "#10b981",
        maul: "#f59e0b", bolt: "#fcd34d",
    };
    return map[heroId] || "#ffffff";
}

// 终极技能名称
function getUltimateName(type) {
    const map = {
        frenzy: "极速狂热", rocket: "毁灭火箭", berserk: "狂暴之怒", dragon: "巨龙之息",
        mark: "印记审判", bloodlust: "嗜血狂袭", gold_strike: "金币风暴", time_stop: "时之静止",
        bleed_burst: "流血爆发", double_strike: "双倍打击", detonate: "全面引爆",
        knowledge: "知识涌动", mega_shot: "超巨型炮弹", rapid_fire: "极速扫射",
    };
    return map[type] || "终结技";
}

// 获取终极技能状态(供 UI 用)
function getUltimateStatus() {
    if (!player.ultConfig) return { state: ULT_STATE.IDLE, chargePct: 0, cooldownPct: 0, ready: false, name: "" };
    if (player.ultimateActive) return { state: ULT_STATE.ACTIVE, chargePct: 100, cooldownPct: 0, ready: false, name: getUltimateName(player.ultConfig.skill.type) };
    if (player.ultimateCooldown > 0) return {
        state: ULT_STATE.COOLDOWN,
        chargePct: 0,
        cooldownPct: 1 - player.ultimateCooldown / player.ultConfig.cooldown,
        ready: false,
        name: getUltimateName(player.ultConfig.skill.type),
    };
    if (player.ultimateReady) return { state: ULT_STATE.READY, chargePct: 100, cooldownPct: 0, ready: true, name: getUltimateName(player.ultConfig.skill.type) };
    return {
        state: ULT_STATE.IDLE,
        chargePct: player.charge / player.ultConfig.chargeThreshold * 100,
        cooldownPct: 0,
        ready: false,
        name: getUltimateName(player.ultConfig.skill.type),
    };
}

// 暴露到 window 以便调试与单元测试
// 通过 getter 暴露 player/enemies/HEROES,确保总是引用最新值
// (enemies 会被重新赋值,必须用 getter 而非一次性引用)
window.__ultimate = {
    ULT_STATE, addCharge, tryReleaseUltimate, getUltimateStatus,
    executeUltimateEffect, endUltimate, getUltimateName, updateUltimateSystem,
    updateUltimateHUD, syncUltimateIcon,
    // ===== 缇宝小技能 =====
    CANNON_MINI_CONFIG, tryActivateCannonMiniSkill, endCannonMiniSkill,
    updateCannonMiniSystem, getCannonMiniStatus, updateCannonMiniHUD,
    // ===== 天赋池(v20:作为商店商品;时间触发弹窗 API 已移除) =====
    TALENTS_GENERAL, TALENTS_HERO_EXCLUSIVE,
    rollTalentPicks, applyTalent, playTalentGainSound,
    get survivalSeconds() { return survivalSeconds; },
    // ===== 英雄状态面板 =====
    recordHistory, recordUpgradeChosen, renderHeroStatusPanel, fmtSurvival,
    get historyEntries() { return historyEntries; },
    set historyEntries(v) { historyEntries = v; },
    get heroStatusTab() { return heroStatusTab; },
    set heroStatusTab(v) { heroStatusTab = v; },
    bindTalentAndStatusUI,
    get player() { return player; },
    get enemies() { return enemies; },
    get HEROES() { return HEROES; },
    get UPGRADES() { return UPGRADES; },
    get HERO_EXCLUSIVE_UPGRADES() { return HERO_EXCLUSIVE_UPGRADES; },
    get ultReleaseAnim() { return ultReleaseAnim; },
    set ultReleaseAnim(v) { ultReleaseAnim = v; },
    get state() { return state; },
    set state(v) { state = v; },
    // ===== v12: 波次/经济/难度 调试与回归测试钩子(单机游戏,控制台调试无副作用) =====
    get wave() { return wave; },
    get coins() { return coins; },
    set coins(v) { coins = v; if (ui.coinVal) ui.coinVal.textContent = "🪙" + coins; },
    get difficulty() { return difficulty; },
    set difficulty(v) { difficulty = v; },
    get killCount() { return killCount; },
    get maxCombo() { return maxCombo; },
    get waveActive() { return waveActive; },
    get bossAlive() { return bossAlive; },
    get spawnQueueLen() { return spawnQueue.length; },
    State, WAVES_PER_CYCLE,
    getDifficultyMult, HeroGameData,
    startWave, offerShop, closeShop, triggerVictory, continueAfterVictory,
    endRunCleanly, bumpHeroCounter, killEnemy,
    // v21: 商店调试接口(货架/刷新费用)
    get shopOffers() { return shopOffers.map(t => t.id); },
    get shopRefreshCost() { return shopRefreshCost; },
    refreshShopOffers,
    // v22: 计时波调试接口
    get waveTimerSec() { return waveTimerSec; },
    WAVE_DURATION_SEC,
    fmtHp, // v23: HP格式化(测试用)
    /** 调试:立即把波次倒计时打到 0.05 秒(下一帧触发回收/清场/商店链) */
    debugEndWaveTimer() { if (waveActive) waveTimerSec = 0.05; return { wave, waveTimerSec }; },
    /** 调试:立即清空当前波所有敌人(走正常击杀结算,经验/击杀数/连击均生效) */
    debugClearWave() {
        spawnQueue.length = 0;
        let guard = 0;
        while (enemies.length > 0 && guard++ < 500) {
            killEnemy(enemies.length - 1);
        }
        bossAlive = false;
        return { wave, enemies: enemies.length, killCount, maxCombo };
    },
    /** 调试:一键恢复满血(防止测试中死亡中断) */
    debugHeal() { player.hp = player.maxHp; player.invul = 0; },
    /** 调试:手动推进一帧 update,返回 "OK" 或异常堆栈(定位主循环异常) */
    debugTick() {
        try { update(1); return "OK"; }
        catch (e) { return "THREW: " + (e && e.message) + " | stack: " + (e && e.stack); }
    },
    /** 调试:完整状态快照 */
    debugSnapshot() {
        return {
            state, wave, coins, difficulty, killCount, maxCombo,
            enemies: enemies.length, bossAlive, waveActive,
            pickups: pickups.length,
            spawnQueue: spawnQueue.length, waveBreak, waveSettled,
            waveTimerSec: Math.round(waveTimerSec * 10) / 10,
            killRateRecent: Math.round(killRateRecent * 10) / 10, // v23
            cycleClearedOnce, runEndedFromVictory, bossCountdownTimer,
            hp: Math.round(player.hp), maxHp: player.maxHp,
            shopHidden: ui.shopPanel ? ui.shopPanel.hidden : null,
            victoryHidden: ui.victoryPanel ? ui.victoryPanel.hidden : null,
            overHidden: ui.overPanel ? ui.overPanel.hidden : null,
            waveHud: null, // v21: 画布右上角 Wave HUD 已移除(顶栏波次统计即可)
            countdownHidden: ui.bossCountdownOverlay ? ui.bossCountdownOverlay.hidden : null,
        };
    },
};

// ============================================================
// 渲染
// ============================================================
function render() {
    // 屏幕震动:整体平移画布(每帧重置变换,无残留)
    ctx.setTransform(1, 0, 0, 1, screenShake.dx || 0, screenShake.dy || 0);
    // 背景:渐变 + 星空滚动
    ctx.fillStyle = "#02030a";
    ctx.fillRect(0, 0, W, H);

    // 滚动星空
    renderStars();

    if (state === State.MENU) {
        // 菜单时画一个炫酷预览
        return;
    }

    // --- 经验拾取物 ---
    for (const p of pickups) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        if (p.type === "xp") {
            // 菱形
            ctx.translate(p.x, p.y);
            ctx.rotate(performance.now() * 0.003);
            ctx.moveTo(0, -p.r);
            ctx.lineTo(p.r, 0);
            ctx.lineTo(0, p.r);
            ctx.lineTo(-p.r, 0);
            ctx.closePath();
        } else if (p.type === "coin") {
            // v23:金币 —— 圆形 + 内环,轻微缩放呼吸感
            const pulse = 1 + Math.sin(performance.now() * 0.008 + p.x) * 0.12;
            ctx.arc(p.x, p.y, p.r * pulse, 0, TAU);
        } else {
            // 圆形(血包)
            ctx.arc(p.x, p.y, p.r, 0, TAU);
        }
        ctx.fill();
        if (p.type === "coin") {
            // 金币内环描边(区分血包)
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "#b8860b";
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * 0.55, 0, TAU);
            ctx.stroke();
        }
        ctx.restore();
    }

    // --- 粒子 ---
    for (const p of particles) {
        const alpha = p.life / (p.maxLife || 40);
        // 星星闪光：径向渐变亮斑，加亮混合增强冲击力
        if (p.type === "starFlash") {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(p.r, 1));
            g.addColorStop(0, "rgba(255,255,240," + (0.9 * alpha).toFixed(3) + ")");
            g.addColorStop(0.4, "rgba(255,215,0," + (0.55 * alpha).toFixed(3) + ")");
            g.addColorStop(1, "rgba(255,215,0,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, TAU);
            ctx.fill();
            ctx.restore();
            continue;
        }
        // 中心旋转大星：金底白心 + 双色光晕，特效的专属辨识元素
        if (p.type === "starCore") {
            const a = Math.min(1, alpha * 1.4);
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
            g.addColorStop(0, "rgba(255,240,180," + (0.5 * a).toFixed(3) + ")");
            g.addColorStop(0.5, "rgba(255,61,166," + (0.3 * a).toFixed(3) + ")");
            g.addColorStop(1, "rgba(255,61,166,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * 2.2, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = a;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot || 0);
            starPath(ctx, 0, 0, p.r, 0);
            ctx.fillStyle = "#ffd700";
            ctx.fill();
            starPath(ctx, 0, 0, p.r * 0.55, 0);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.restore();
            continue;
        }
        // 星星碎片拖尾：加亮小光点，随生命自然渐隐
        if (p.type === "starTrail") {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, TAU);
            ctx.fill();
            ctx.restore();
            continue;
        }
        // 星星光环：向外扩散的描边圆
        if (p.type === "starRing") {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = alpha * 0.9;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 3 * alpha + 0.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, TAU);
            ctx.stroke();
            ctx.restore();
            continue;
        }
        // 星星碎片：五角星造型，带旋转与白色高光核心
        if (p.type === "starFrag") {
            const a = Math.min(1, alpha * 1.6); // 生命末期才明显淡出，保持可见度
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = a;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot || 0);
            starPath(ctx, 0, 0, p.r, 0);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.globalAlpha = a * 0.8;
            starPath(ctx, 0, 0, p.r * 0.45, 0);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.restore();
            continue;
        }
        // 镰刀挥砍：新月形斩击，向外扩散并淡出
        if (p.type === "slash") {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = alpha;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot || 0);
            ctx.lineCap = "round";
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 10 * alpha + 1;
            ctx.beginPath();
            ctx.arc(0, 0, p.r, -0.9, 0.9);          // 外层新月弧
            ctx.stroke();
            ctx.globalAlpha = alpha * 0.8;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 3 * alpha + 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, p.r * 0.82, -0.75, 0.75); // 内层白色亮弧
            ctx.stroke();
            ctx.restore();
            continue;
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // --- 玩家子弹 ---
    for (const b of bullets) {
        ctx.save();
        ctx.shadowColor = b.isCrit ? "#fbbf24" : "#00e5ff";
        ctx.shadowBlur = 10;
        ctx.fillStyle = b.isCrit ? "#fde68a" : "#a5f3ff";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
        ctx.restore();
    }

    // --- 敌人 ---
    for (const e of enemies) {
        drawEnemy(e);
    }

    // --- Boss 范围技能预警圈 ---
    for (const warning of bossAreaWarnings) {
        const progress = clamp(1 - warning.timer / warning.maxTimer, 0, 1);
        const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.04;
        ctx.save();
        ctx.globalAlpha = 0.16 + progress * 0.16;
        ctx.fillStyle = "#c084fc";
        ctx.beginPath();
        ctx.arc(warning.x, warning.y, warning.radius * pulse, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.75 + progress * 0.2;
        ctx.strokeStyle = "#e9d5ff";
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.arc(warning.x, warning.y, warning.radius * pulse, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#f5f3ff";
        ctx.font = "bold 14px 'Microsoft YaHei', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("天谴之矛落下倒计时 " + warning.timer.toFixed(1) + "s", warning.x, warning.y + 5);
        ctx.restore();
    }

    // --- 敌人子弹 ---
    for (const b of eBullets) {
        if (b.type === "spear") {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);  // 让矛尖朝向运动方向

        // 矛身（长条）
        ctx.fillStyle = "#ffd700";
        ctx.beginPath();
        ctx.ellipse(0, 0, 18, 4, 0, 0, TAU);
        ctx.fill();

        // 矛尖（三角形）
        ctx.fillStyle = "#fff8dc";
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(12, -5);
        ctx.lineTo(12, 5);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
        } else if (b.type === "slash") {
            // 劈砍冲击波:旋转金色月牙,外发光增强冲击感
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.angle + performance.now() * 0.012); // 沿飞行方向 + 自转
            ctx.globalCompositeOperation = "lighter";
            ctx.shadowColor = "#ffd700";
            ctx.shadowBlur = 14;
            // 外弧(亮金)
            ctx.strokeStyle = "#ffd700";
            ctx.lineWidth = 6;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.arc(0, 0, b.r, -1.1, 1.1);
            ctx.stroke();
            // 内弧(白热刃口)
            ctx.strokeStyle = "#fffbe6";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, b.r * 0.78, -0.9, 0.9);
            ctx.stroke();
            ctx.restore();
        } else {
            // 普通圆形子弹的绘制
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, TAU);
            ctx.fill();
        }
    }

    // --- 玩家 ---
    drawPlayer();

    // --- 终极技能释放动画(全屏特效)---
    if (ultReleaseAnim) {
        const a = ultReleaseAnim;
        const p = a.t / a.duration; // 0~1
        ctx.save();
        // 全屏闪光(开头强烈,逐渐衰减)
        const flash = Math.max(0, 1 - p * 2) * 0.4;
        ctx.fillStyle = a.color;
        ctx.globalAlpha = flash;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        // 扩散圆环
        const ringR = p * Math.max(W, H) * 0.7;
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 6 * (1 - p) + 1;
        ctx.globalAlpha = 1 - p * 0.5;
        ctx.beginPath();
        ctx.arc(player.x, player.y, ringR, 0, TAU);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x, player.y, ringR * 0.7, 0, TAU);
        ctx.stroke();
        // 中心光晕
        const grd = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 100);
        grd.addColorStop(0, a.color);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = (1 - p) * 0.5;
        ctx.fillStyle = grd;
        ctx.fillRect(player.x - 100, player.y - 100, 200, 200);
        ctx.globalAlpha = 1;
        // 文字
        ctx.fillStyle = a.color;
        ctx.font = "bold 32px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.shadowColor = a.color;
        ctx.shadowBlur = 20;
        ctx.globalAlpha = 1 - p * 0.7;
        ctx.fillText(a.text, W / 2, H / 2);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // --- 飘字 ---
    for (const f of floatTexts) {
        ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
        ctx.fillStyle = f.color;
        ctx.font = "bold 13px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // --- Boss 血条 ---
    for (const e of enemies) {
        if (e.type === "boss") {
            if (e.dialogue && e.dialogueTimer > 0) {
                const dialogueAlpha = clamp(e.dialogueTimer / 0.35, 0, 1);
                ctx.save();
                ctx.globalAlpha = dialogueAlpha;
                ctx.font = "bold 14px 'Microsoft YaHei', sans-serif";
                ctx.textAlign = "center";
                const dialogueWidth = ctx.measureText(e.dialogue).width + 24;
                const dialogueY = e.y - e.r - 22;
                ctx.fillStyle = "rgba(5, 8, 20, 0.88)";
                ctx.fillRect(e.x - dialogueWidth / 2, dialogueY - 17, dialogueWidth, 24);
                ctx.strokeStyle = e.dialogueColor || "#fff";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(e.x - dialogueWidth / 2, dialogueY - 17, dialogueWidth, 24);
                ctx.fillStyle = e.dialogueColor || "#fff";
                ctx.fillText(e.dialogue, e.x, dialogueY);
                ctx.restore();
            }
            const bw = W - 40, bh = 10;
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(20, 16, bw, bh);
            const hpRatio = Math.max(0, (e.lifeHp !== undefined ? e.lifeHp : e.hp) / e.maxHp);
            ctx.fillStyle = e.isInvincible ? "#888" : "#ff3da6";
            ctx.fillRect(20, 16, bw * hpRatio, bh);
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1;
            ctx.strokeRect(20, 16, bw, bh);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 10px 'Segoe UI', sans-serif";
            ctx.textAlign = "center";
            const currentHp = e.lifeHp !== undefined ? Math.max(0, Math.ceil(e.lifeHp)) : Math.ceil(e.hp);
            ctx.fillText((e.name || "BOSS") + " · BOSS · " + currentHp + " / " + Math.ceil(e.maxHp), W / 2, 12);
        }
    }
}

// 滚动星空
const stars = [];
for (let i = 0; i < 60; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.5 + 0.5, sp: Math.random() * 1.5 + 0.3 });
}
function renderStars() {
    ctx.fillStyle = "#ffffff";
    for (const s of stars) {
        if (state === State.PLAYING) {
            s.y += s.sp;
            if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
        }
        ctx.globalAlpha = s.s / 2 + 0.3;
        ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
}

// 绘制玩家飞船
function drawPlayer() {
    const p = player;
    const blink = p.invul > 0 && Math.floor(p.invul / 4) % 2 === 0;
    const isCannon = p.heroId === "cannon";
    if (blink) ctx.globalAlpha = 0.4;

    ctx.save();
    ctx.translate(p.x, p.y);

    // 引擎尾焰
    const flameColor = isCannon ? "#fbbf24" : "#fbbf24";
    ctx.fillStyle = flameColor;
    ctx.shadowColor = flameColor;
    ctx.shadowBlur = 12;
    const flameLen = 10 + Math.sin(performance.now() * 0.03) * 3 * p.thrust;
    ctx.beginPath();
    ctx.moveTo(-5, p.r);
    ctx.lineTo(0, p.r + flameLen);
    ctx.lineTo(5, p.r);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // 船体
    const bodyColor = isCannon ? "#ef4444" : "#00e5ff";
    const bodyGlow = isCannon ? "#fca5a5" : "#00e5ff";
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = bodyGlow;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, -p.r);          // 顶
    ctx.lineTo(p.r * 0.8, p.r * 0.6);
    ctx.lineTo(p.r * 0.4, p.r * 0.4);
    ctx.lineTo(-p.r * 0.4, p.r * 0.4);
    ctx.lineTo(-p.r * 0.8, p.r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 缇宝专属：红白条带
    if (isCannon) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(-p.r * 0.45, -p.r * 0.2, p.r * 0.9, p.r * 0.4);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(-p.r * 0.3, -p.r * 0.05, p.r * 0.6, p.r * 0.1);
    }

    // 驾驶舱
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, -2, 3, 0, TAU);
    ctx.fill();

    // 护盾
    if (p.shield > 0) {
        ctx.strokeStyle = isCannon ? "#fff" : "#00e5ff";
        ctx.globalAlpha = 0.5 + Math.sin(performance.now() * 0.01) * 0.2;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, p.r + 6, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    ctx.restore();

    // 遐蝶：巨龙终结技期间，环绕旋转的龙形指示
    if (p.ultimateActive && p.ultimateActive.type === "dragon") {
        const t = performance.now() * 0.004;
        const orbitR = 42;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        // 环绕轨道
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = "#ff3da6";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, orbitR, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        // 三个环绕龙首光点
        for (let i = 0; i < 3; i++) {
            const a = t + (i / 3) * TAU;
            const dx = p.x + Math.cos(a) * orbitR;
            const dy = p.y + Math.sin(a) * orbitR;
            const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, 10);
            g.addColorStop(0, "rgba(255,255,255,0.95)");
            g.addColorStop(0.4, "rgba(255,61,166,0.8)");
            g.addColorStop(1, "rgba(255,61,166,0)");
            ctx.globalAlpha = 1;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(dx, dy, 10, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

// 绘制敌人
function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.flash > 0) {
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 14;
    }
    ctx.fillStyle = e.flash > 0 ? "#fff" : e.color;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;

    const r = e.r;
    switch (e.shape) {
        case "tri":
            ctx.beginPath();
            ctx.moveTo(0, r);
            ctx.lineTo(r, -r * 0.7);
            ctx.lineTo(-r, -r * 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case "diamond":
            ctx.beginPath();
            ctx.moveTo(0, r); ctx.lineTo(r, 0); ctx.lineTo(0, -r); ctx.lineTo(-r, 0);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            break;
        case "hex":
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (TAU * i) / 6;
                const px = Math.cos(a) * r, py = Math.sin(a) * r;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            break;
        case "square":
            ctx.fillRect(-r, -r, r * 2, r * 2);
            ctx.strokeRect(-r, -r, r * 2, r * 2);
            break;
        case "boss": {
            const bossImg = bossSpriteImage;
            // 劈砍动画:叠加贴图偏移与旋转(蓄力抬起→下劈→恢复)
            const slash = getNikadorSlashOffset(e);
            const sox = slash ? slash.x : 0;
            const soy = slash ? slash.y : 0;
            // 劈砍期间锁定自转角,平时持续自转
            const baseRot = e.slash ? (e._slashLockRot || 0) : e.t * 0.01;
            if (bossImg && bossImg.complete && bossImg.naturalWidth > 0) {
                ctx.translate(sox, soy); // 先平移(屏幕坐标系)后旋转(围绕贴图中心)
                ctx.rotate(baseRot + (slash ? slash.rot : 0));
                const size = r * 2.5;
                ctx.drawImage(bossImg, -size / 2, -size / 2, size, size);
                // v12: 占位 Boss 配色光环(复用 Nikador 素材时以专属颜色能量光环区分)
                if (e.bossKey !== "nikador" && e.color) {
                    ctx.globalCompositeOperation = "lighter";
                    const aura = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, size * 0.72);
                    aura.addColorStop(0, "rgba(0,0,0,0)");
                    aura.addColorStop(1, e.color + "66");
                    ctx.fillStyle = aura;
                    ctx.beginPath();
                    ctx.arc(0, 0, size * 0.72, 0, TAU);
                    ctx.fill();
                    ctx.globalCompositeOperation = "source-over";
                }
            } else {
                // 大型多边形 + 旋转
                ctx.translate(sox, soy);
                ctx.rotate(baseRot + (slash ? slash.rot : 0));
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const a = (TAU * i) / 8;
                    const rr = r * (i % 2 === 0 ? 1 : 0.7);
                    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill(); ctx.stroke();
                // 中心核
                ctx.fillStyle = "#fff";
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.3, 0, TAU);
                ctx.fill();
            }
            // 劈砍弧光刀光:金色月牙从劈砍侧上方扫向下方,快速渐隐
            if (e.slashArc) {
                const sa = e.slashArc;
                const aa = 1 - sa.timer / sa.maxTimer;
                const dir = sa.side;
                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                ctx.translate(sox, soy); // 先平移后旋转
                // 随时间扫过:从抬起侧扫向劈中侧
                const sweep = dir * (0.5 - (sa.timer / sa.maxTimer)) * 1.1;
                ctx.rotate((dir < 0 ? Math.PI : 0) + sweep);
                const R = r * 2.6;
                const grad = ctx.createLinearGradient(0, 0, R * dir, 0);
                grad.addColorStop(0, "rgba(255,255,255," + (0.85 * aa).toFixed(3) + ")");
                grad.addColorStop(1, "rgba(255,215,0,0)");
                ctx.strokeStyle = grad;
                ctx.lineWidth = 11 * aa + 2;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.arc(0, 0, R, -0.85, 0.85);
                ctx.stroke();
                // 内层白色亮刃
                ctx.lineWidth = 3;
                ctx.strokeStyle = "rgba(255,255,255," + (0.9 * aa).toFixed(3) + ")";
                ctx.beginPath();
                ctx.arc(0, 0, R * 0.8, -0.75, 0.75);
                ctx.stroke();
                ctx.restore();
            }
            break;
        }
    }
    ctx.restore();

    // v12: Boss 头顶名牌(占位 Boss 靠名字 + 颜色光环区分身份)
    if (e.type === "boss" && e.name) {
        ctx.save();
        ctx.font = "bold 13px 'Microsoft YaHei', sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,.85)";
        ctx.fillStyle = e.color || "#ff3da6";
        const ny = e.y - e.r * 2.2;
        ctx.strokeText(e.name, e.x, ny);
        ctx.fillText(e.name, e.x, ny);
        ctx.restore();
    }

    // 普通敌人血条(受伤时显示)
    if (e.type !== "boss" && e.hp < e.maxHp) {
        const bw = e.r * 2, bh = 3;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(e.x - e.r, e.y - e.r - 8, bw, bh);
        ctx.fillStyle = "#4ade80";
        ctx.fillRect(e.x - e.r, e.y - e.r - 8, bw * (e.hp / e.maxHp), bh);
    }
}

// ============================================================
// HUD 更新
// ============================================================
function updateHUD() {
    ui.score.textContent = score;
    ui.wave.textContent = wave;
    const hpPct = clamp(player.hp / player.maxHp * 100, 0, 100);
    ui.hpFill.style.width = hpPct + "%";
    ui.hpNum.textContent = fmtHp(Math.ceil(player.hp)) + "/" + fmtHp(player.maxHp) + (player.shield > 0 ? "  🛡" + fmtHp(player.shield) : "");
    const xpPct = clamp(xp / xpNeed * 100, 0, 100);
    ui.xpFill.style.width = xpPct + "%";
    // v20:波内积压的升级在清场后结算,XP 条上显示待选次数
    ui.xpNum.textContent = Math.floor(xp) + "/" + xpNeed +
        (pendingLevelUps > 0 ? " 待选升级 ×" + pendingLevelUps : "");
    // ===== 终极技能 HUD 更新 =====
    updateUltimateHUD();
    // ===== 缇宝小技能 HUD 更新 =====
    updateCannonMiniHUD();
    // ===== v12: 金币 HUD 更新(时间触发天赋倒计时已移除) =====
    if (ui.coinVal) ui.coinVal.textContent = "🪙" + coins;
}

// 终极技能 HUD:进度条百分比 + 闪烁 + 冷却 + 图标透明度
function updateUltimateHUD() {
    const status = getUltimateStatus();
    const bar = document.getElementById("ultChargeFill");
    const num = document.getElementById("ultNum");
    const iconWrap = document.getElementById("ultIcon");
    const iconImg = document.getElementById("ultIconImg");
    const iconEmoji = document.getElementById("ultIconEmoji");
    const cooldownOverlay = document.getElementById("ultCooldown");
    const readyHint = document.getElementById("ultReadyHint");

    if (!bar) return; // DOM 未就绪

    // 进度条
    bar.style.width = clamp(status.chargePct, 0, 100) + "%";
    if (num) {
        const currentCharge = Math.round(player.charge || 0);
        const totalCharge = player.ultConfig ? player.ultConfig.chargeThreshold : 0;
        const chargeText = totalCharge > 0 ? ` (${currentCharge}/${totalCharge})` : "";

        if (status.state === ULT_STATE.COOLDOWN) {
            num.textContent = "冷却 " + player.ultimateCooldown.toFixed(1) + "s";
        } else if (status.state === ULT_STATE.READY) {
            num.textContent = status.name + " 就绪!" + chargeText;
        } else if (status.state === ULT_STATE.ACTIVE) {
            num.textContent = status.name + " " + player.ultimateActiveTimer.toFixed(1) + "s";
        } else {
            num.textContent = status.name + " " + Math.round(status.chargePct) + "%" + chargeText;
        }
    }

    // 图标透明度:未满 60%、就绪 100%、生效中发光
    if (iconWrap) {
        if (status.state === ULT_STATE.READY) {
            iconWrap.classList.add("ready");
            iconWrap.classList.remove("active");
            iconWrap.style.opacity = "1";
        } else if (status.state === ULT_STATE.ACTIVE) {
            iconWrap.classList.remove("ready");
            iconWrap.classList.add("active");
            iconWrap.style.opacity = "1";
        } else if (status.state === ULT_STATE.COOLDOWN) {
            iconWrap.classList.remove("ready", "active");
            iconWrap.style.opacity = "0.5";
        } else {
            iconWrap.classList.remove("ready", "active");
            iconWrap.style.opacity = "0.6"; // 充能未满 60%
        }
    }

    // 冷却遮罩
    if (cooldownOverlay) {
        if (status.state === ULT_STATE.COOLDOWN) {
            cooldownOverlay.style.display = "flex";
            cooldownOverlay.textContent = Math.ceil(player.ultimateCooldown) + "s";
        } else {
            cooldownOverlay.style.display = "none";
        }
    }

    // 就绪提示
    if (readyHint) {
        readyHint.style.display = (status.state === ULT_STATE.READY) ? "block" : "none";
    }
}

function updateStatus() {
    const list = [
        ["等级", level],
        ["伤害", player.damage.toFixed(1)],
        ["射速", player.fireRate.toFixed(1) + "/s"],
        ["子弹数", player.multishot],
        ["穿透", player.pierce],
        ["暴击", (player.critChance * 100).toFixed(0) + "%"],
        ["暴伤", player.critMult.toFixed(1) + "x"],
        ["制导", (player.homing * 100).toFixed(0) + "%"],
        ["吸血", player.lifesteal],
        ["护盾", player.shield],
        ["爆破", player.explodeOnKill ? "✓" : "—"],
        ["移速", player.speed.toFixed(1)],
        ["最大HP", player.maxHp],
        ["经验加成", ((player.xpBonus - 1) * 100).toFixed(0) + "%"],
    ];
    ui.statusList.innerHTML = list.map(([k, v]) =>
        `<li><span>${k}</span><span>${v}</span></li>`
    ).join("");
}

// ============================================================
// 流程控制
// ============================================================
function startGame() {
    // 根据 selectedHeroId 应用英雄属性(默认新星号)
    const hero = HEROES.find(h => h.id === selectedHeroId) || HEROES[0];
    Object.assign(player, PLAYER_BASELINE, hero.base);
    //------------遐蝶的被动
    player.passiveConfig = hero.passive || null;
    player._fieldTickTimer = 0;
    // ===== 终极技能系统初始化 =====
    player.heroId = hero.id;
    player.ultConfig = hero.ultimate ? { ...hero.ultimate } : null;
    // 遐蝶：终结技解锁条件 = 累计失去 30% 最大生命值（充能值即失去的生命）
    if (player.heroId === "scatter" && player.ultConfig) {
        player.ultConfig.chargeThreshold = Math.round(player.maxHp * 0.30);
    }
    player.charge = 0;
    player.ultimateReady = false;
    player.ultimateCooldown = 0;
    player.ultimateActive = null;
    player.ultimateActiveTimer = 0;
    player.autoReleaseTimer = 0;
    player.bleedStacks = {};
    player.markStacks = {};
    player.hitCount = 0;
    player.gold = 0;
    player.firstUpgradeSeen = {};// 记录已见过的升级选项,避免重复弹窗
    player.autoMode = true; // 默认自动释放终极技能
    ultReleaseAnim = null;// 终极技能释放动画
    player.cannonRocketTurnRate = 0.12;   // 默认每帧最大转向 0.12 弧度 ≈ 6.9°
    player.cannonRocketTrackRadius = 300; // 默认追踪半径 300 像素

    // ===== 缇宝小技能初始化 =====
    player.cannonMiniActive = false;
    player.cannonMiniTimer = 0;
    player.cannonMiniCooldown = 0;
    player.cannonMiniAutoMode = true;   // 默认自动触发
    player.cannonMiniOriginalDamage = 0;
    player.cannonRocketTalent = false;
    // 云朵安抚弹状态归零，避免跨局残留
    player.cannonOrbitMode = false;
    player.cannonOrbitDmgMult = 1;
    player.tiananRevive = false;
    player.cannonNoHoming = false;
    

    // ===== 天赋系统 + 英雄状态面板初始化 =====
    player._spongeKingCount = 0;//海绵王
    player._spongeKingActive = false;//海绵王
    player._fictionalMechaActive = false;//虚构机兵
    player._cannonBlessingGranted = false;//缇宝专属祝福（集齐3项触发，仅一次）
    // 缇宝专属升级中涉及的附加状态归零，避免跨局残留
    player.cannonUltDmgBuffEnabled = false;
    player.cannonUltDmgStacks = 0;
    player.cannonUltDmgMaxStacks = 0;
    player.chargeRefreshEnabled = false;
    player.chargeRefreshCooldown = 0;
    player.regenAmount = 0;
    player.regenTimer = 0;
    survivalSeconds = 0;
    historyEntries = [];
    _historySeq = 0;
    if (!window.__gameStartTime) window.__gameStartTime = performance.now();
    else window.__gameStartTime = performance.now();

    bullets = []; enemies = []; eBullets = [];
    particles = []; pickups = []; floatTexts = []; bossAreaWarnings = [];
    wave = 0; score = 0; xp = 0; xpNeed = 3; level = 1;
    waveActive = false; waveBreak = 0; bossAlive = false;
    spawnQueue = [];

    // ===== v12:商店经济 / 统计 / 难度 / 波次流程 状态重置 =====
    coins = 0;
    if (!difficulty || difficulty < 1) difficulty = 1;
    killCount = 0; maxCombo = 0; comboCount = 0; comboTimer = 0;
    pendingLevelUps = 0; pendingUpgradePicks = 0;
    waveDurationSec = 0; waveSettled = false;
    cycleClearedOnce = false;
    runEndedFromVictory = false;
    bossCountdownTimer = 0; bossCountdownCb = null;
    counterAnimating = false;
    if (ui.coinVal) ui.coinVal.textContent = "🪙0";

    // ===== 随机事件系统重置 =====
    player._eventNextWaveMods = null;
    currentWaveMods = { countMult: 1, hpMult: 1, speedMult: 1 };
    currentEvent = null;
    selectedEventOption = -1;

    ui.startPanel.hidden = true;
    ui.heroPanel.hidden = true;
    ui.upgradePanel.hidden = true;
    ui.pausePanel.hidden = true;
    ui.overPanel.hidden = true;
    if (ui.modePanel) ui.modePanel.hidden = true;
    if (ui.talentPanel) ui.talentPanel.hidden = true;
    if (ui.eventPanel) ui.eventPanel.hidden = true;
    if (ui.prophecyPanel) ui.prophecyPanel.hidden = true;
    // v12 新增面板/浮层
    if (ui.shopPanel) ui.shopPanel.hidden = true;
    if (ui.victoryPanel) ui.victoryPanel.hidden = true;
    if (ui.difficultyPanel) ui.difficultyPanel.hidden = true;
    if (ui.metaTalentPanel) ui.metaTalentPanel.hidden = true;
    if (ui.bossCountdownOverlay) ui.bossCountdownOverlay.hidden = true;
    if (ui.counterAnim) ui.counterAnim.hidden = true;
    const restartBtn2El = document.getElementById("restartBtn2");
    if (restartBtn2El) restartBtn2El.hidden = false;

    state = State.PLAYING;
    startWave(1);
    if (DEBUG_EVENT_ON_START) offerRandomEvent(); // [测试用] 开局弹事件，配合 DEBUG_EVENT_ON_START 关闭
    maybeShowCannonProphecy(); // 剧情模式缇宝首次出战:展示预言(与天赋面板同风格)
    updateStatus();
    updateHUD();
    // 英雄状态面板:初始渲染(显示空状态)
    renderHeroStatusPanel();
    audio.playBgm();
    // 同步终极技能 UI:模式按钮、图标图片
    const modeBtn = document.getElementById("ultModeBtn");
    if (modeBtn) {
        modeBtn.textContent = player.autoMode ? "自动" : "手动(Q)";
        modeBtn.classList.toggle("manual", !player.autoMode);
    }
    syncUltimateIcon();
    // 绑定缇宝小技能 UI + 天赋/状态面板 UI(只绑定一次)
    bindCannonMiniUI();
    if (!window.__talentStatusBound) {
        bindTalentAndStatusUI();
        window.__talentStatusBound = true;
    }
}

// 同步终极技能图标:用当前英雄头像作为临时图标
function syncUltimateIcon() {
    const hero = HEROES.find(h => h.id === player.heroId);
    if (!hero) return;
    const img = document.getElementById("ultIconImg");
    const emoji = document.getElementById("ultIconEmoji");
    if (!img || !emoji) return;
    // 优先用 HEROES 中 ultimate.icon(技能专属图标),否则用英雄头像
    const ultIcon = hero.ultimate && hero.ultimate.icon;
    const iconPath = ultIcon
        ? "assets/skills/icons/" + ultIcon
        : getHeroImagePath(hero);
    if (iconPath) {
        img.src = iconPath;
        img.style.display = "block";
        emoji.style.display = "none";
    } else {
        emoji.textContent = hero.emoji;
        emoji.style.display = "block";
        img.style.display = "none";
    }
}

function pause() {
    state = State.PAUSED;
    ui.pausePanel.hidden = false;
    audio.pauseBgm();
}
function resume() {
    state = State.PLAYING;
    ui.pausePanel.hidden = true;
    audio.resumeBgm();
}

function gameOver() {
    state = State.OVER;
    audio.stopBgm();
    spawnExplosion(player.x, player.y, "#00e5ff", 40, 2.5);
    spawnExplosion(player.x, player.y, "#fff", 20, 1.5);
    // 剧情模式：死亡即自动保存当前进度
    Progress.save();
    const isNew = score > bestScore;
    if (isNew) {
        bestScore = score;
        localStorage.setItem("rls_best", String(bestScore));
        ui.best.textContent = bestScore;
    }
    ui.newBest.hidden = !isNew;
    // v12: 角色计数器 —— 死亡路径仅在已解锁难度挑战模式(首次通关过)时触发
    if (!runEndedFromVictory) {
        const gd = HeroGameData.get(player.heroId);
        if (gd.unlockedDifficulty >= 2) bumpHeroCounter(player.heroId);
    }
    // 延迟显示结算,让爆炸先播放
    showOverPanel(false);
}

// ============================================================
// 绑定按钮
// ============================================================
// 入口：模式选择面板 + 继续上次
// ============================================================
function showModePanel() {
    // 刷新"继续上次"区域(v20:剧情入口已隐藏,仅无尽模式存档显示继续)
    const cont = document.getElementById("modeContinue");
    const info = document.getElementById("continueInfo");
    const hasSaved = hasSavedProgress() && Progress.mode === "endless";
    if (hasSaved) {
        info.textContent = "无尽模式 · 准备就绪";
        cont.hidden = false;
    } else {
        cont.hidden = true;
    }
    ui.modePanel.hidden = false;
    ui.startPanel.hidden = true;
    ui.heroPanel.hidden = true;
}

// 模式选择按钮
document.getElementById("endlessModeBtn").onclick = () => {
    Progress.setMode("endless");
    ui.modePanel.hidden = true;
    ui.startPanel.hidden = false; // 无尽模式保留原有 startPanel → heroPanel 流程
};
// v12: 剧情模式入口已在 HTML 中暂时隐藏,按钮不存在时安全跳过(逻辑保留)
const storyModeBtnEl = document.getElementById("storyModeBtn");
if (storyModeBtnEl) storyModeBtnEl.onclick = () => {
    // 重置剧情：从未进过剧情模式、或剧情刚开头（无锁定英雄无通关记录）但解锁数异常
    const needReset =
        Progress.mode !== "story" ||
        (Progress.storyLevel === 0 &&
            !Progress.storyCurrentHero &&
            Progress.storyUnlocked.length !== STORY_INITIAL_UNLOCKED_COUNT);
    if (needReset) Progress.resetStory();
    Progress.setMode("story");
    // 直接进英雄选择，剧情模式下由 Progress.storyCurrentHero 控制锁定
    renderHeroGrid();
    lockStoryHeroOnGrid(); // 若已锁定英雄则自动选中
    ui.modePanel.hidden = true;
    ui.heroPanel.hidden = false;
    ui.startPanel.hidden = true;
};

// 继续上次
document.getElementById("continueBtn").onclick = () => {
    if (!hasSavedProgress()) return;
    // 剧情模式：直接用锁定英雄开 game
    if (Progress.mode === "story" && Progress.storyCurrentHero) {
        selectedHeroId = Progress.storyCurrentHero;
        startGame();
        return;
    }
    // 无尽模式：进英雄选择
    if (Progress.mode === "endless") {
        Progress.storyCurrentHero = null;
        Progress.save();
        renderHeroGrid();
        ui.modePanel.hidden = true;
        ui.heroPanel.hidden = false;
        ui.startPanel.hidden = true;
        return;
    }
    showModePanel(); // 意外状态，回模式面板
};

// 重新选择模式
document.getElementById("reselectModeBtn").onclick = () => {
    Progress.mode = null; // 清空模式但保留剧情进度
    Progress.save();
    showModePanel();
};

// ============================================================
// 剧情预言(缇宝):剧情模式下首次出战时展示,视觉风格与天赋面板一致
// ============================================================
function maybeShowCannonProphecy() {
    if (Progress.mode !== "story") return;          // 仅剧情模式
    if (player.heroId !== "cannon") return;         // 仅缇宝
    if (Progress.storyProphecyShown) return;        // 每次剧情仅一次
    Progress.storyProphecyShown = true;
    Progress.save();
    state = State.EVENT; // 暂停游戏主循环(与事件/天赋面板同一机制)
    if (ui.prophecyPanel) ui.prophecyPanel.hidden = false;
}

// 关闭预言面板,恢复游戏
function closeProphecyPanel() {
    if (!ui.prophecyPanel || ui.prophecyPanel.hidden) return;
    ui.prophecyPanel.hidden = true;
    state = State.PLAYING;
}
if (ui.prophecyConfirmBtn) ui.prophecyConfirmBtn.onclick = closeProphecyPanel;

// ============================================================
document.getElementById("startBtn").onclick = () => {
    // 打开英雄选择
    renderHeroGrid();
    document.getElementById("heroPreview").innerHTML =
        '<div class="hero-preview-empty">悬停或点击查看战机详情</div>';
    document.getElementById("heroConfirmBtn").disabled = true;
    selectedHeroId = null;
    document.querySelectorAll(".hero-cell").forEach(c => c.classList.remove("selected"));
    ui.startPanel.hidden = true;
    ui.heroPanel.hidden = false;
    syncMetaTalentBtn(); // v12: 未选英雄时隐藏元天赋入口
};
document.getElementById("heroConfirmBtn").onclick = () => {
    if (!selectedHeroId) return;
    // 剧情模式：第一次确认时锁定英雄
    if (Progress.mode === "story" && !Progress.storyCurrentHero) {
        Progress.lockHeroInStory(selectedHeroId);
    }
    // v12: 无尽模式先选难度再开局;剧情模式直接开局(难度固定为 1)
    if (Progress.mode === "story") {
        difficulty = 1;
        startGame();
    } else {
        // v21: 动态难度入口 —— 该英雄尚未通关过 20 波(unlockedDifficulty===1)时
        // 隐藏难度选择界面,直接以难度 1 开局;通关一次后才显示难度选择
        const data = HeroGameData.get(selectedHeroId);
        if (data.unlockedDifficulty >= 2) {
            showDifficultyPanel();
        } else {
            difficulty = 1;
            startGame();
        }
    }
};
document.getElementById("heroBackBtn").onclick = () => {
    ui.heroPanel.hidden = true;
    // 剧情模式已锁定英雄则回模式面板；无尽模式回 startPanel
    if (Progress.mode === "story") {
        showModePanel();
    } else {
        ui.startPanel.hidden = false;
    }
};
document.getElementById("resumeBtn").onclick = resume;
document.getElementById("restartBtn1").onclick = () => {
    // 重新开始也走英雄选择流程
    ui.pausePanel.hidden = true;
    ui.overPanel.hidden = true;
    renderHeroGrid();
    document.getElementById("heroPreview").innerHTML =
        '<div class="hero-preview-empty">悬停或点击查看战机详情</div>';
    if (Progress.mode === "story") {
        lockStoryHeroOnGrid();
    } else {
        document.getElementById("heroConfirmBtn").disabled = true;
        selectedHeroId = null;
        document.querySelectorAll(".hero-cell").forEach(c => c.classList.remove("selected"));
    }
    ui.heroPanel.hidden = false;
};
document.getElementById("restartBtn2").onclick = () => {
    ui.overPanel.hidden = true;
    renderHeroGrid();
    document.getElementById("heroPreview").innerHTML =
        '<div class="hero-preview-empty">悬停或点击查看战机详情</div>';
    if (Progress.mode === "story") {
        lockStoryHeroOnGrid();
    } else {
        document.getElementById("heroConfirmBtn").disabled = true;
        selectedHeroId = null;
        document.querySelectorAll(".hero-cell").forEach(c => c.classList.remove("selected"));
    }
    ui.heroPanel.hidden = false;
};

// ============================================================
// 【6】角色计数器(数字向下滚动动画) + 难度选择 + 元天赋界面
// ============================================================

// 触发计数器 +1(动画锁:播放期间新触发直接丢弃)
// 持久化在动画开始前立即完成 —— 动画仅作视觉表现,即使 rAF 被浏览器节流
// (如标签页后台/窗口最小化)导致动画未播完,计数数据也不会丢失
function bumpHeroCounter(heroId) {
    if (!heroId || counterAnimating) return;
    const data = HeroGameData.get(heroId);
    const from = data.counter;
    const to = from + 1;
    // 1) 先落盘:数据安全不依赖动画
    data.counter = to;
    HeroGameData.save(heroId, data);
    // 2) 再播动画;完成后仅刷新徽章等 UI
    playCounterAnimation(from, to, from === 0, () => {
        if (ui.heroPanel && !ui.heroPanel.hidden) {
            renderHeroGrid();
            document.querySelectorAll(".hero-cell").forEach(c =>
                c.classList.toggle("selected", c.dataset.id === selectedHeroId));
        }
        syncMetaTalentBtn();
    });
}

// 数字向下滚动(胶带)计数器动画
//   isFirst(0→1):5 秒慢放 + audio/boom.mp3;之后:1 秒正常速度、无音频
function playCounterAnimation(from, to, isFirst, done) {
    if (!ui.counterAnim || !ui.counterAnimStrip) { if (done) done(); return; }
    counterAnimating = true;
    const CELL_H = 110;
    const strip = ui.counterAnimStrip;
    strip.innerHTML = "";
    for (let v = from; v <= to; v++) {
        const cell = document.createElement("div");
        cell.className = "counter-anim-cell";
        cell.textContent = v;
        cell.style.height = CELL_H + "px";
        cell.style.lineHeight = CELL_H + "px";
        strip.appendChild(cell);
    }
    strip.style.transition = "none";
    strip.style.transform = "translateY(0)";
    ui.counterAnim.hidden = false;

    // 首次计数:播放 boom.mp3
    if (isFirst && !audio.muted) {
        try {
            const s = audio.sfxKill.cloneNode(); // sfxKill = audio/boom.mp3
            s.currentTime = 0;
            s.volume = 0.5 * audio.volume;
            s.play().catch(() => {});
        } catch (e) {}
    }

    const duration = isFirst ? 5000 : 1000;
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    let finished = false; // 幂等保护:rAF 完成与超时兜底只触发一次 done
    const finish = () => {
        if (finished) return;
        finished = true;
        ui.counterAnim.hidden = true;
        counterAnimating = false;
        if (done) done();
    };
    // 超时兜底:标签页后台时 rAF 会被节流暂停,锁若只靠 rAF 释放将永久卡死
    setTimeout(finish, duration + 500);
    requestAnimationFrame(() => {
        const t0 = performance.now();
        const tick = (now) => {
            const p = clamp((now - t0) / duration, 0, 1);
            strip.style.transform = "translateY(" + (-easeOut(p) * (to - from) * CELL_H).toFixed(2) + "px)";
            if (p < 1) {
                requestAnimationFrame(tick);
            } else {
                setTimeout(finish, 350);
            }
        };
        requestAnimationFrame(tick);
    });
}

// ===== 难度选择 =====
function diffMultFor(d) {
    return { hp: 1 + 0.15 * (d - 1), dmg: 1 + 0.10 * (d - 1), spd: 1 + 0.08 * (d - 1) };
}

function showDifficultyPanel() {
    const data = HeroGameData.get(selectedHeroId);
    const unlocked = data.unlockedDifficulty;
    if (!ui.difficultyList) return;
    ui.difficultyList.innerHTML = "";
    for (let d = 1; d <= DIFFICULTY_MAX; d++) {
        const locked = d > unlocked;
        const m = diffMultFor(d);
        const card = document.createElement("div");
        card.className = "difficulty-card" + (locked ? " locked" : "");
        card.title = locked ? `完成难度 ${d - 1} 通关后解锁` : `怪物生命 ×${m.hp.toFixed(2)} · 伤害 ×${m.dmg.toFixed(2)}`;
        card.innerHTML = `
            <span class="d-num">${d}</span>
            <span class="d-name">${DIFFICULTY_NAMES[d]}</span>
            <span class="d-mod">${locked
                ? `完成难度${d - 1}<br>解锁`
                : `HP ×${m.hp.toFixed(2)}<br>伤害 ×${m.dmg.toFixed(2)}`}</span>`;
        if (!locked) {
            card.onclick = () => {
                document.querySelectorAll(".difficulty-card").forEach(c => c.classList.remove("d-selected"));
                card.classList.add("d-selected");
                setTimeout(() => {
                    if (ui.difficultyPanel) ui.difficultyPanel.hidden = true;
                    difficulty = d;
                    startGame();
                }, 200);
            };
        }
        ui.difficultyList.appendChild(card);
    }
    if (ui.difficultyPanel) ui.difficultyPanel.hidden = false;
}

// ===== 元天赋(占位:6 张禁用卡,首次通关20波后解锁入口) =====
const META_TALENT_PLACEHOLDERS = [
    { icon: "⚔️", name: "战意觉醒", desc: "敬请期待 —— 攻击成长方向强化" },
    { icon: "🛡️", name: "铁壁守护", desc: "敬请期待 —— 生命与护盾成长强化" },
    { icon: "⚡", name: "疾风迅雷", desc: "敬请期待 —— 射速与移速成长强化" },
    { icon: "💰", name: "贪欲契约", desc: "敬请期待 —— 经济与商店强化" },
    { icon: "🔥", name: "焚天烈焰", desc: "敬请期待 —— 爆炸与范围伤害强化" },
    { icon: "❄️", name: "时空凝滞", desc: "敬请期待 —— 终结技冷却与持续强化" },
];

function openMetaTalentPanel() {
    if (!ui.metaTalentPanel || !selectedHeroId) return;
    const data = HeroGameData.get(selectedHeroId);
    if (data.unlockedDifficulty < 2) return; // 未解锁直接返回
    if (ui.metaTalentList) {
        ui.metaTalentList.innerHTML = "";
        META_TALENT_PLACEHOLDERS.forEach(t => {
            const card = document.createElement("div");
            card.className = "talent-card rarity-common meta-talent-card disabled-card";
            card.innerHTML = `
                <div class="talent-head">
                    <div class="talent-icon">${t.icon}</div>
                    <div class="talent-meta">
                        <div class="talent-name"><span>${t.name}</span></div>
                        <div class="talent-type"><span class="meta-soon-tag">🔒 敬请期待</span></div>
                    </div>
                </div>
                <div class="talent-desc">${t.desc}</div>`;
            ui.metaTalentList.appendChild(card);
        });
    }
    ui.metaTalentPanel.hidden = false;
}

function closeMetaTalentPanel() {
    if (ui.metaTalentPanel) ui.metaTalentPanel.hidden = true;
}

// 元天赋入口按钮可见性(选中英雄的已解锁难度 >= 2 时显示)
function syncMetaTalentBtn() {
    if (!ui.metaTalentBtn) return;
    if (!selectedHeroId) { ui.metaTalentBtn.hidden = true; return; }
    const data = HeroGameData.get(selectedHeroId);
    ui.metaTalentBtn.hidden = data.unlockedDifficulty < 2;
}

// 页面加载完成：显示模式面板
showModePanel();

// ============================================================
// v12 新增按钮绑定:商店 / 通关 / 难度 / 元天赋 / 结算返回
// ============================================================
if (ui.shopCloseBtn) ui.shopCloseBtn.onclick = closeShop;
if (ui.shopRefreshBtn) ui.shopRefreshBtn.onclick = refreshShopOffers;
if (ui.victoryContinueBtn) ui.victoryContinueBtn.onclick = continueAfterVictory;
if (ui.victoryEndBtn) ui.victoryEndBtn.onclick = endRunCleanly;
if (ui.metaTalentBtn) ui.metaTalentBtn.onclick = openMetaTalentPanel;
if (ui.metaTalentCloseBtn) ui.metaTalentCloseBtn.onclick = closeMetaTalentPanel;
if (ui.difficultyBackBtn) ui.difficultyBackBtn.onclick = () => {
    if (ui.difficultyPanel) ui.difficultyPanel.hidden = true;
    ui.heroPanel.hidden = false;
};
// 结算"返回菜单":回到游戏内模式主菜单(可重新选机/选难度)
if (ui.overBackMenuLink) {
    ui.overBackMenuLink.addEventListener("click", (e) => {
        e.preventDefault();
        if (ui.overPanel) ui.overPanel.hidden = true;
        state = State.MENU;
        showModePanel();
    });
}
// 同步元天赋入口初始可见性
syncMetaTalentBtn();

// 静音切换
function toggleMuteBtn() {
    const muted = audio.toggleMute();
    const btn = document.getElementById("muteBtn");
    btn.classList.toggle("muted", muted);
    btn.title = muted ? "取消静音 (M)" : "静音 (M)";
    btn.textContent = muted ? "♪̸" : "♪";
    // 同步更新滑块显示:静音时滑块显示 0
    const slider = document.getElementById("volumeSlider");
    const val = document.getElementById("volumeVal");
    if (muted) {
        slider.value = 0;
        val.textContent = "0";
    } else {
        const v = audio.getVolume();
        slider.value = v;
        val.textContent = v;
    }
}
document.getElementById("muteBtn").onclick = toggleMuteBtn;

// 暂停按钮点击绑定
document.getElementById("pauseBtn").onclick = () => {
    if (state === State.PLAYING) pause();
    else if (state === State.PAUSED) resume();
};

// 音量滑块绑定
function initVolumeControl() {
    const slider = document.getElementById("volumeSlider");
    const val = document.getElementById("volumeVal");
    const initVol = audio.getVolume();
    slider.value = initVol;
    val.textContent = initVol;

    slider.addEventListener("input", e => {
        const v = parseInt(e.target.value, 10);
        audio.setVolume(v);
        val.textContent = v;
        // 拖动滑块时如果处于静音状态,自动取消静音
        if (audio.muted && v > 0) {
            audio.muted = false;
            const btn = document.getElementById("muteBtn");
            btn.classList.remove("muted");
            btn.textContent = "♪";
            btn.title = "静音 (M)";
            if (state === State.PAUSED) {
                audio.applyBgmVolume();
            } else if (state === State.PLAYING) {
                audio.applyBgmVolume();
                audio.bgm.play().catch(() => {});
            }
        }
    });
}
initVolumeControl();

// 终极技能:模式切换按钮 + 手动释放按钮点击绑定
const ultModeBtn = document.getElementById("ultModeBtn");
if (ultModeBtn) {
    ultModeBtn.onclick = () => {
        player.autoMode = !player.autoMode;
        ultModeBtn.textContent = player.autoMode ? "自动" : "手动(Q)";
        ultModeBtn.classList.toggle("manual", !player.autoMode);
        spawnFloatText(player.x, player.y - 30, player.autoMode ? "自动释放" : "手动释放 (Q)", "#00e5ff");
    };
}
// 点击图标也可手动释放(就绪时)
const ultIconEl = document.getElementById("ultIcon");
if (ultIconEl) {
    ultIconEl.style.cursor = "pointer";
    ultIconEl.onclick = () => {
        if (state === State.PLAYING && player.ultConfig && player.ultimateReady) {
            tryReleaseUltimate();
        }
    };
}

// 触屏支持(简易:触屏移动)
let touchActive = false;
canvas.addEventListener("touchstart", e => {
    e.preventDefault();
    touchActive = true;
    handleTouch(e);
}, { passive: false });
canvas.addEventListener("touchmove", e => {
    e.preventDefault();
    if (touchActive) handleTouch(e);
}, { passive: false });
canvas.addEventListener("touchend", e => {
    e.preventDefault();
    touchActive = false;
}, { passive: false });
function handleTouch(e) {
    if (state !== State.PLAYING) return;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0];
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const tx = (t.clientX - rect.left) * sx;
    const ty = (t.clientY - rect.top) * sy;
    // 平滑跟随
    const dx = tx - player.x, dy = ty - player.y;
    const d = Math.hypot(dx, dy);
    if (d > 2) {
        const step = Math.min(d, player.speed * 1.5);
        player.x = clamp(player.x + (dx / d) * step, player.r, W - player.r);
        player.y = clamp(player.y + (dy / d) * step, player.r, H - player.r);
    }
}

// 启动循环
requestAnimationFrame(loop);
updateStatus();

})();
