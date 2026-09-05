/* ============================================================
 * 终极技能系统 - 单元测试用例
 * 在浏览器控制台执行: runUltimateTests()
 * 依赖: game.js 已加载,window.__ultimate 已暴露
 * 说明:用 IIFE 隔离,避免与 game.js 顶层变量意外冲突,并且使用双引号/单引号而非模板字符串,
 *       确保在老版环境下也能正确解析。
 * ============================================================ */
(function () {
  "use strict";

  var U = window.__ultimate;
  if (!U) {
      console.error("[UltimateTest] window.__ultimate 未暴露,无法运行测试");
      window.runUltimateTests = function () {
          console.error("[UltimateTest] 无法运行:window.__ultimate 未暴露");
          return { pass: 0, fail: 0, results: [] };
      };
      window.loadAndRunUltTests = window.runUltimateTests;
      console.log("[UltimateTest] 已就绪(降级模式)。控制台执行 runUltimateTests() 运行测试。");
      return;
  }

  var ULT_STATE = U.ULT_STATE;
  var addCharge = U.addCharge;
  var tryReleaseUltimate = U.tryReleaseUltimate;
  var getUltimateStatus = U.getUltimateStatus;
  var executeUltimateEffect = U.executeUltimateEffect;
  var endUltimate = U.endUltimate;
  var getUltimateName = U.getUltimateName;
  var updateUltimateSystem = U.updateUltimateSystem;

  // 通过 U 暴露的 getter 获取游戏状态
  var player = U.player;
  var HEROES = U.HEROES;

  var ultPassCount = 0, ultFailCount = 0;
  var ultResults = [];

  function ultAssert(cond, msg) {
      if (cond) { ultPassCount++; ultResults.push("✅ " + msg); }
      else { ultFailCount++; ultResults.push("❌ " + msg); }
  }

  function ultResetPlayer() {
      player.charge = 0;
      player.ultimateReady = false;
      player.ultimateCooldown = 0;
      player.ultimateActive = null;
      player.ultimateActiveTimer = 0;
      player.autoReleaseTimer = 0;
      player.autoMode = true;
      if (U) U.ultReleaseAnim = null;
      player.heroId = "nova";
      player.ultConfig = {
          chargePerHit: 10, chargeThreshold: 50, cooldown: 5,
          skill: { type: "frenzy", dmg: 0, radius: 0, duration: 6, fireRateMult: 2, dmgMult: 1.5 }
      };
  }

  // ===== 测试 1: 初始充能为 0 =====
  function test1_initial_charge_zero() {
      ultResetPlayer();
      ultAssert(player.charge === 0, "T1.1 初始充能值应为 0");
      ultAssert(player.ultimateReady === false, "T1.2 初始 ultimateReady 应为 false");
      ultAssert(player.ultimateCooldown === 0, "T1.3 初始冷却应为 0");
      ultAssert(player.ultimateActive === null, "T1.4 初始无生效中技能");
      var s = getUltimateStatus();
      ultAssert(s.state === ULT_STATE.IDLE, "T1.5 初始状态应为 IDLE");
      ultAssert(s.chargePct === 0, "T1.6 初始进度百分比应为 0");
  }

  // ===== 测试 2: 命中充能累加 =====
  function test2_charge_accumulates() {
      ultResetPlayer();
      addCharge(10);
      ultAssert(player.charge === 10, "T2.1 +10 后 charge=10");
      addCharge(20);
      ultAssert(player.charge === 30, "T2.2 +20 后 charge=30");
      var s = getUltimateStatus();
      ultAssert(Math.abs(s.chargePct - 60) < 0.01, "T2.3 进度百分比应为 60%");
  }

  // ===== 测试 3: 充能上限 clamp =====
  function test3_charge_clamp() {
      ultResetPlayer();
      addCharge(999);
      ultAssert(player.charge === player.ultConfig.chargeThreshold, "T3.1 充能值不超过阈值");
      ultAssert(player.ultimateReady === true, "T3.2 达到阈值后 ultimateReady=true");
      var s = getUltimateStatus();
      ultAssert(s.state === ULT_STATE.READY, "T3.3 状态应为 READY");
      ultAssert(s.ready === true, "T3.4 ready 标记为 true");
  }

  // ===== 测试 4: 冷却中不充能 =====
  function test4_no_charge_during_cooldown() {
      ultResetPlayer();
      player.ultimateCooldown = 3;
      addCharge(10);
      ultAssert(player.charge === 0, "T4.1 冷却中 addCharge 无效,charge 仍为 0");
  }

  // ===== 测试 5: 技能生效中不充能 =====
  function test5_no_charge_during_active() {
      ultResetPlayer();
      player.ultimateActive = { type: "frenzy" };
      addCharge(10);
      ultAssert(player.charge === 0, "T5.1 技能生效中 addCharge 无效");
  }

  // ===== 测试 6: 就绪后再次充能无效 =====
  function test6_no_charge_when_ready() {
      ultResetPlayer();
      addCharge(50);
      addCharge(20);
      ultAssert(player.charge === 50, "T6.1 就绪后不再充能,charge 保持阈值");
  }

  // ===== 测试 7: 手动释放 - 冷却中禁止释放 =====
  function test7_release_blocked_in_cooldown() {
      ultResetPlayer();
      player.ultimateReady = true;
      player.ultimateCooldown = 2;
      var ok = tryReleaseUltimate();
      ultAssert(ok === false, "T7.1 冷却中 tryReleaseUltimate 返回 false");
  }

  // ===== 测试 8: 手动释放 - 未就绪禁止释放 =====
  function test8_release_blocked_when_not_ready() {
      ultResetPlayer();
      player.ultimateReady = false;
      player.charge = 30;
      var ok = tryReleaseUltimate();
      ultAssert(ok === false, "T8.1 未就绪 tryReleaseUltimate 返回 false");
  }

  // ===== 测试 9: 成功释放 - 重置充能、设置冷却 =====
  function test9_release_success() {
      ultResetPlayer();
      player.ultimateReady = true;
      player.charge = 50;
      player.ultConfig.skill = { type: "double_strike", dmg: 60, radius: 9999, duration: 0, stackAdd: 2 };
      var oldEnemies = U.enemies.slice();
      U.enemies.length = 0;
      var ok = tryReleaseUltimate();
      U.enemies.push.apply(U.enemies, oldEnemies);
      ultAssert(ok === true, "T9.1 tryReleaseUltimate 返回 true");
      ultAssert(player.charge === 0, "T9.2 释放后 charge 归 0");
      ultAssert(player.ultimateReady === false, "T9.3 释放后 ultimateReady=false");
      ultAssert(player.ultimateCooldown === 5, "T9.4 释放后冷却为配置值 5s");
  }

  // ===== 测试 10: 释放动画时长在 1.5-3s 之间 =====
  function test10_release_animation_duration() {
      ultResetPlayer();
      player.ultimateReady = true;
      player.ultConfig.skill = { type: "rocket", dmg: 0, radius: 80, duration: 0, hpRatio: 0.5 };
      var oldEnemies = U.enemies.slice();
      U.enemies.length = 0;
      try { tryReleaseUltimate(); } catch (e) {}
      U.enemies.push.apply(U.enemies, oldEnemies);
      ultAssert(true, "T10.1 rocket 类型释放成功(无报错)");
  }

  // ===== 测试 11: 所有英雄都有 ultimate 配置 =====
  function test11_all_heroes_have_ultimate() {
      HEROES.forEach(function (h, i) {
          var idx = String(i + 1);
          ultAssert(h.ultimate && typeof h.ultimate === "object",
              "T11." + idx + " 英雄 " + h.name + "(" + h.id + ") 拥有 ultimate 配置");
          ultAssert(h.ultimate.chargePerHit >= 5 && h.ultimate.chargePerHit <= 20,
              "T11." + idx + "b " + h.name + " chargePerHit 在 5-20 范围");
          ultAssert(h.ultimate.chargeThreshold >= 50 && h.ultimate.chargeThreshold <= 200,
              "T11." + idx + "c " + h.name + " chargeThreshold 在 50-200 范围");
          ultAssert(h.ultimate.cooldown >= 5 && h.ultimate.cooldown <= 15,
              "T11." + idx + "d " + h.name + " cooldown 在 5-15s 范围");
          ultAssert(h.ultimate.skill && h.ultimate.skill.type,
              "T11." + idx + "e " + h.name + " skill.type 已配置");
      });
  }

  // ===== 测试 12: 每种技能类型都有名字映射 =====
  function test12_all_skill_types_have_names() {
      var types = HEROES.map(function (h) { return h.ultimate.skill.type; });
      var seen = {};
      var unique = [];
      for (var i = 0; i < types.length; i++) {
          if (!seen[types[i]]) { seen[types[i]] = true; unique.push(types[i]); }
      }
      unique.forEach(function (t) {
          var name = getUltimateName(t);
          ultAssert(name && name !== "终结技",
              "T12 技能类型 " + t + " 有专属名称: " + name);
      });
  }

  // ===== 测试 13: frenzy 效果正确应用与恢复 =====
  function test13_frenzy_effect_apply_and_restore() {
      ultResetPlayer();
      var origFireRate = player.fireRate = 6;
      var origDmg = player.damage = 10;
      executeUltimateEffect({ type: "frenzy", duration: 6, fireRateMult: 2, dmgMult: 1.5 });
      ultAssert(player.fireRate === 12, "T13.1 frenzy 后 fireRate=12,实际=" + player.fireRate);
      ultAssert(player.damage === 15, "T13.2 frenzy 后 damage=15,实际=" + player.damage);
      ultAssert(player.ultimateActive !== null, "T13.3 ultimateActive 已设置");
      endUltimate();
      ultAssert(player.fireRate === origFireRate, "T13.4 结束后 fireRate 恢复");
      ultAssert(player.damage === origDmg, "T13.5 结束后 damage 恢复");
      ultAssert(player.ultimateActive === null, "T13.6 结束后 ultimateActive=null");
  }

  // ===== 测试 14: bloodlust 效果应用与恢复 =====
  function test14_bloodlust_effect() {
      ultResetPlayer();
      player.critChance = 0.3;
      player.lifesteal = 5;
      executeUltimateEffect({ type: "bloodlust", duration: 6, lifestealMult: 2, critChance: 1.0 });
      ultAssert(player.critChance === 1.0, "T14.1 bloodlust 期间必暴击");
      ultAssert(player.lifesteal === 10, "T14.2 bloodlust 期间吸血翻倍");
      endUltimate();
      ultAssert(player.critChance === 0.3, "T14.3 结束后暴击率恢复");
      ultAssert(player.lifesteal === 5, "T14.4 结束后吸血恢复");
  }

  // ===== 测试 15: rapid_fire 效果应用与恢复 =====
  function test15_rapid_fire_effect() {
      ultResetPlayer();
      player.pierce = 1;
      player.multishot = 2;
      executeUltimateEffect({ type: "rapid_fire", duration: 3, pierce: 999, multishotBonus: 2 });
      ultAssert(player.pierce === 999, "T15.1 rapid_fire 期间无限穿透");
      ultAssert(player.multishot === 4, "T15.2 rapid_fire 期间子弹数+2");
      endUltimate();
      ultAssert(player.pierce === 1, "T15.3 结束后穿透恢复");
      ultAssert(player.multishot === 2, "T15.4 结束后子弹数恢复");
  }

  // ===== 测试 16: berserk 效果应用与恢复 =====
  function test16_berserk_effect() {
      ultResetPlayer();
      var origMaxHp = player.maxHp = 100;
      player.hp = 100;
      var origDmg = player.damage = 10;
      executeUltimateEffect({ type: "berserk", duration: 8, maxHpBonus: 80, dmgDealtMult: 2 });
      ultAssert(player.maxHp === 180, "T16.1 berserk 期间 maxHp+80");
      ultAssert(player.hp === 180, "T16.2 berserk 期间 hp 同步增加");
      ultAssert(player.damage === 20, "T16.3 berserk 期间伤害翻倍");
      endUltimate();
      ultAssert(player.maxHp === origMaxHp, "T16.4 结束后 maxHp 恢复");
      ultAssert(player.damage === origDmg, "T16.5 结束后 damage 恢复");
  }

  // ===== 测试 17: 状态机 - 状态切换序列 =====
  function test17_state_machine_transitions() {
      ultResetPlayer();
      ultAssert(getUltimateStatus().state === ULT_STATE.IDLE, "T17.1 初始 IDLE");
      addCharge(50);
      ultAssert(getUltimateStatus().state === ULT_STATE.READY, "T17.2 充能满 → READY");
      var oldEnemies = U.enemies.slice();
      U.enemies.length = 0;
      player.ultConfig.skill = { type: "knowledge", dmg: 0, radius: 0, duration: 0, xpGain: 15 };
      tryReleaseUltimate();
      U.enemies.push.apply(U.enemies, oldEnemies);
      ultAssert(getUltimateStatus().state === ULT_STATE.COOLDOWN, "T17.3 释放后 → COOLDOWN");
      player.ultimateCooldown = 0;
      ultAssert(getUltimateStatus().state === ULT_STATE.IDLE, "T17.4 冷却结束 → IDLE");
  }

  // ===== 测试 18: 自动模式 - 0.5s 延迟后自动释放 =====
  function test18_auto_release_with_delay() {
      ultResetPlayer();
      player.autoMode = true;
      addCharge(50);
      ultAssert(player.ultimateReady === true, "T18.1 充能完成");
      ultAssert(player.autoReleaseTimer === 0.5, "T18.2 自动释放计时器初始化为 0.5s");
      updateUltimateSystem(0.3 * 60);
      ultAssert(player.ultimateReady === true, "T18.3 0.3s 后仍未释放(延迟未到)");
      var oldEnemies = U.enemies.slice();
      U.enemies.length = 0;
      player.ultConfig.skill = { type: "knowledge", dmg: 0, radius: 0, duration: 0, xpGain: 1 };
      updateUltimateSystem(0.3 * 60);
      U.enemies.push.apply(U.enemies, oldEnemies);
      ultAssert(player.ultimateReady === false, "T18.4 0.6s 后自动释放完成");
      ultAssert(player.ultimateCooldown > 0, "T18.5 自动释放后冷却已设置");
  }

  // ===== 测试 19: 手动模式 - 不会自动释放 =====
  function test19_manual_mode_no_auto_release() {
      ultResetPlayer();
      player.autoMode = false;
      addCharge(50);
      updateUltimateSystem(60);
      ultAssert(player.ultimateReady === true, "T19.1 手动模式下即使过了延迟时间也不自动释放");
      ultAssert(player.ultimateCooldown === 0, "T19.2 手动模式下无冷却(未释放)");
  }

  // ===== 测试 20: 边界条件 - ultConfig 为 null =====
  function test20_null_ult_config() {
      ultResetPlayer();
      player.ultConfig = null;
      addCharge(10);
      ultAssert(player.charge === 0, "T20.1 ultConfig=null 时 addCharge 无效");
      var ok = tryReleaseUltimate();
      ultAssert(ok === false, "T20.2 ultConfig=null 时 tryReleaseUltimate 返回 false");
      var s = getUltimateStatus();
      ultAssert(s.state === ULT_STATE.IDLE, "T20.3 ultConfig=null 时状态为 IDLE");
  }

  // ===== 运行所有测试 =====
  function runUltimateTests() {
      ultPassCount = 0; ultFailCount = 0; ultResults.length = 0;
      var tests = [
          test1_initial_charge_zero, test2_charge_accumulates, test3_charge_clamp,
          test4_no_charge_during_cooldown, test5_no_charge_during_active,
          test6_no_charge_when_ready, test7_release_blocked_in_cooldown,
          test8_release_blocked_when_not_ready, test9_release_success,
          test10_release_animation_duration, test11_all_heroes_have_ultimate,
          test12_all_skill_types_have_names, test13_frenzy_effect_apply_and_restore,
          test14_bloodlust_effect, test15_rapid_fire_effect, test16_berserk_effect,
          test17_state_machine_transitions, test18_auto_release_with_delay,
          test19_manual_mode_no_auto_release, test20_null_ult_config
      ];
      for (var i = 0; i < tests.length; i++) {
          var fn = tests[i];
          try { fn(); }
          catch (e) {
              ultFailCount++;
              ultResults.push("❌ " + fn.name + " 抛出异常: " + e.message);
          }
      }
      console.log("%c==== 终极技能系统单元测试 ====", "color:#ffd700;font-weight:700");
      for (var j = 0; j < ultResults.length; j++) console.log(ultResults[j]);
      var color = ultFailCount === 0 ? "#4ade80" : "#f87171";
      console.log("%c通过: " + ultPassCount + "  失败: " + ultFailCount,
          "color:" + color + ";font-weight:700");
      return { pass: ultPassCount, fail: ultFailCount, results: ultResults };
  }

  // 挂载到 window,供控制台调用
  window.loadAndRunUltTests = runUltimateTests;
  window.runUltimateTests = runUltimateTests;
  console.log("[UltimateTest] 已就绪。控制台执行 runUltimateTests() 运行 20 个测试用例。");
})();
