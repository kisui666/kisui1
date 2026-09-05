/* ============================================================
 * scenario.test.js — v12 重构全流程回归场景(页面内自动运行)
 * 用法:
 *   1. 打开游戏页面,正常开局进入 PLAYING(任意难度均可)
 *   2. 控制台执行:  var s=document.createElement('script');
 *                  s.src='scenario.test.js?v=1'; document.head.appendChild(s);
 *   3. 启动:  __runScenario()
 *   4. 轮询结果: __testReport(数组,持续追加) / __scenarioDone(布尔)
 * 覆盖: 波次推进/商店/Boss倒计时/出场无敌/占位Boss名牌/20波通关弹窗/
 *       继续游戏(21波无总波数)/结束游戏结算四项/计数器动画/
 *       难度2解锁/元天赋6占位卡/localStorage持久化数据/控制台错误
 * ============================================================ */
(function () {
    "use strict";
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const $ = id => document.getElementById(id);
    const U = window.__ultimate;

    window.__testReport = [];
    const log = (k, v) => {
        try {
            window.__testReport.push({ t: Math.round((performance.now() - window.__scenarioT0) / 100) / 10, k, v });
        } catch (e) {}
    };

    let autoTimer = null;
    function startAuto() {
        stopAuto();
        autoTimer = setInterval(() => {
            const shop = $("shopPanel");
            if (shop && !shop.hidden) {
                if (window.__recordShopOnce) {
                    window.__recordShopOnce = false;
                    log("shop", {
                        coins: $("shopCoins") ? $("shopCoins").textContent : null,
                        items: document.querySelectorAll("#shopList .talent-card").length,
                        firstPrice: (document.querySelector("#shopList .shop-item-price") || {}).textContent || null,
                    });
                }
                $("shopCloseBtn").click();
                return;
            }
            const up = $("upgradePanel");
            if (up && !up.hidden) {
                if (up.querySelectorAll(".upgrade-card").length === 0) {
                    log("STUCK", "upgrade panel with 0 cards (pool exhausted soft-lock?)");
                } else if (!up.dataset.busy) {
                    const c = up.querySelector(".upgrade-card");
                    if (c) {
                        up.dataset.busy = "1";
                        c.click();
                        setTimeout(() => { delete up.dataset.busy; }, 600);
                    }
                }
                return;
            }
            const ep = $("eventPanel");
            if (ep && !ep.hidden) {
                const o = ep.querySelector(".event-option");
                if (o && !o.classList.contains("selected")) o.click();
                const b = $("eventConfirmBtn");
                if (b && !b.disabled) b.click();
            }
        }, 250);
    }
    function stopAuto() { if (autoTimer) clearInterval(autoTimer); autoTimer = null; }

    async function waitFor(cond, timeout, label) {
        const t0 = performance.now();
        while (performance.now() - t0 < timeout) {
            await sleep(200);
            if (cond()) return true;
        }
        log("TIMEOUT", label);
        return false;
    }
    function bossInfo() {
        return U.enemies.filter(e => e.type === "boss").map(e => ({
            key: e.bossKey, name: e.name, entering: e.entering,
            inv: e.isInvincible, hp: Math.round(e.hp), maxHp: e.maxHp, color: e.color,
        }));
    }

    // 推进到目标波次(v22 计时波:每波用 debugEndWaveTimer 直接触发计时结束,
    // 自动处理商店/升级/事件;倒计时期间等待)
    async function driveToWave(target) {
        let guard = 0;
        while (U.wave < target && guard++ < 120) {
            const s = U.debugSnapshot();
            if (s.state === 1 && s.waveActive) {
                U.debugHeal();
                U.debugEndWaveTimer(); // 计时归零 → 回收/清怪/商店链自动走完
            }
            await sleep(500);
        }
        // Boss 波:倒计时结束后 Boss 可能延迟入队,等其真正出现再返回(避免观察漏帧)
        if (target % 5 === 0) {
            await waitFor(() => U.enemies.some(e => e.type === "boss"), 6000, "boss-spawn-drive-" + target);
        }
        log("reached", { target, wave: U.wave });
        return U.wave === target;
    }

    async function observeBoss(w) {
        await waitFor(() => U.enemies.some(e => e.type === "boss"), 6000, "boss-spawn-" + w);
        log("boss-enter", { wave: w, info: bossInfo() });
        await sleep(2600);
        log("boss-settled", { wave: w, info: bossInfo() });
    }

    window.__runScenario = async function () {
        window.__testReport = [];
        window.__scenarioT0 = performance.now();
        window.__scenarioDone = false;
        startAuto();
        window.__recordShopOnce = true;
        try {
            // ---- 第一轮:5/12/15/20 Boss 波观察 ----
            for (const w of [5, 12, 15, 20]) {
                await driveToWave(w);
                await observeBoss(w);
                U.debugHeal();
                U.debugClearWave();
                await sleep(300);
            }
            // ---- 20 波通关弹窗 ----
            await waitFor(() => U.state === 8, 9000, "victory-20");
            log("victory", {
                state: U.state,
                cycle: $("victoryCycle") ? $("victoryCycle").textContent : null,
                panelHidden: $("victoryPanel") ? $("victoryPanel").hidden : null,
            });
            // 继续游戏 → 第 21 波(HUD 应无 /20)
            $("victoryContinueBtn").click();
            await waitFor(() => U.wave === 21 && U.state === 1, 8000, "wave-21");
            log("continue", { wave: U.wave });

            // ---- 第二轮:25/32/35/40 ----
            for (const w of [25, 32, 35, 40]) {
                await driveToWave(w);
                await observeBoss(w);
                U.debugHeal();
                U.debugClearWave();
                U.debugEndWaveTimer(); // v22: 结束本波(40波→通关弹窗,其余→商店链)
                await sleep(300);
            }
            await waitFor(() => U.state === 8, 9000, "victory-40");
            log("victory", {
                state: U.state,
                cycle: $("victoryCycle") ? $("victoryCycle").textContent : null,
                panelHidden: $("victoryPanel") ? $("victoryPanel").hidden : null,
            });

            // ---- 结束游戏 → 计数器动画(首次 5 秒)→ 结算面板 ----
            const snap0 = U.debugSnapshot();
            log("pre-end-stats", { kills: snap0.killCount, maxCombo: snap0.maxCombo, coins: snap0.coins, wave: snap0.wave });
            $("victoryEndBtn").click();
            await sleep(500);
            log("counter-start", {
                overlayHidden: $("counterAnim") ? $("counterAnim").hidden : null,
                cells: document.querySelectorAll("#counterAnimStrip .counter-anim-cell").length,
                state: U.state,
            });
            // 首次计数动画约 5 秒,等待其结束
            await waitFor(() => $("counterAnim") && $("counterAnim").hidden === true, 9000, "counter-anim-end");
            await sleep(800);
            log("over-panel", {
                panelHidden: $("overPanel").hidden,
                title: $("overTitle") ? $("overTitle").textContent : null,
                wave: $("overWave") ? $("overWave").textContent : null,
                kills: $("overKills") ? $("overKills").textContent : null,
                combo: $("overCombo") ? $("overCombo").textContent : null,
                hp: $("overHp") ? $("overHp").textContent : null,
                score: $("overScore") ? $("overScore").textContent : null,
                restartHidden: $("restartBtn2") ? $("restartBtn2").hidden : null,
            });
            // 持久化数据
            const heroId = U.player.heroId;
            log("localStorage", { heroId, data: localStorage.getItem("gameData_" + heroId) });

            // ---- 返回主菜单 → 英雄面板:元天赋入口 + 计数器徽章 ----
            $("overBackMenuLink").click();
            await waitFor(() => U.state === 0, 4000, "back-menu");
            log("menu", { modePanelHidden: $("modePanel").hidden });
            $("endlessModeBtn").click();
            await sleep(200);
            $("startBtn").click();
            await sleep(400);
            // 先选中第一个英雄(syncMetaTalentBtn 需要 selectedHeroId),再检查元天赋入口
            const firstHeroCell = document.querySelector(".hero-cell");
            if (firstHeroCell) firstHeroCell.click();
            await sleep(300);
            log("hero-panel", {
                panelHidden: $("heroPanel").hidden,
                metaBtnHidden: $("metaTalentBtn") ? $("metaTalentBtn").hidden : null,
                badges: Array.from(document.querySelectorAll(".hero-counter-badge")).map(b => b.textContent.trim()),
            });
            // 元天赋面板:6 张占位卡
            if ($("metaTalentBtn") && !$("metaTalentBtn").hidden) {
                $("metaTalentBtn").click();
                await sleep(300);
                log("meta-talent", {
                    panelHidden: $("metaTalentPanel").hidden,
                    cardCount: document.querySelectorAll("#metaTalentList .meta-talent-card").length,
                    names: Array.from(document.querySelectorAll("#metaTalentList .talent-name")).map(n => n.textContent.trim()),
                });
                $("metaTalentCloseBtn").click();
                await sleep(200);
            } else {
                log("meta-talent", { skipped: "metaTalentBtn hidden" });
            }

            // ---- 出击 → 难度选择:难度2应已解锁 ----
            $("heroConfirmBtn").click();
            await waitFor(() => $("difficultyPanel") && !$("difficultyPanel").hidden, 4000, "diff-panel");
            log("difficulty", {
                cards: Array.from(document.querySelectorAll(".difficulty-card")).map(c => ({
                    text: c.textContent.replace(/\s+/g, " ").trim().slice(0, 30),
                    locked: c.classList.contains("locked"),
                })),
            });
            // 选择难度 2(第二张未锁定卡)
            const cards = Array.from(document.querySelectorAll(".difficulty-card"));
            const d2 = cards.find(c => !c.classList.contains("locked") && c.textContent.indexOf("2") === 0);
            if (d2) d2.click();
            await waitFor(() => U.state === 1, 5000, "start-d2");
            await sleep(1000); // 等敌人生成
            log("difficulty2-start", {
                difficulty: U.difficulty,
                mult: U.getDifficultyMult(),
                firstEnemyMaxHp: U.enemies[0] ? U.enemies[0].maxHp : null,
                hud: null, // v21: waveHud 已移除
            });

            // ---- 控制台错误汇总 ----
            log("console-errors", window.__log || "(未安装错误收集器)");
        } catch (e) {
            log("FATAL", (e && e.message) + " | " + (e && e.stack));
        } finally {
            stopAuto();
            window.__scenarioDone = true;
        }
    };

    console.log("[scenario.test] ready — 执行 __runScenario() 开始回归场景");
})();
