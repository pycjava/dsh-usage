window.__ModuleLoader__.load({
	id: "dsh-usage-ledger",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region lib/heat-level.js
		/**
		* Heatmap shade for one day's token total, shared by the browser half
		* (UsageSection) and the smoke tests.
		*
		* Token usage spans orders of magnitude, so a plain linear share of the
		* busiest day flattens every smaller-but-real day into the near-white
		* level 1 — the panel then looks like it only shows the busiest day. A log
		* scale maps each order of magnitude to a visible shade: level 1 = any
		* activity, level 4 = the max day, with the levels between spread across
		* the token-range below the max.
		*
		* @param {number} tokens - day total (0 or positive).
		* @param {number} max - largest day total (must be positive).
		* @returns {number} 0 for empty days, 1..4 for active days.
		*/
		function heatLevel(tokens, max) {
			if (!(tokens > 0)) return 0;
			const safeMax = max > 0 ? max : 1;
			const intensity = safeMax > 1 ? Math.log(tokens) / Math.log(safeMax) : tokens / safeMax;
			return Math.min(4, 1 + Math.floor(3 * intensity));
		}
		//#endregion
		//#region lib/quota-view.js
		/**
		* Display math shared by the two quota surfaces — the monospace report the
		* `usage_stats` tool returns and the 供应商额度 block in the settings panel.
		*
		* Pure functions over one quota reading: no network, no harness, no locale.
		* Wording stays with each surface (the panel localizes, the report does not),
		* so exactly one definition exists for "what share is left" and "when does it
		* reset".
		*
		* @module dsh-usage-ledger/quota-view
		*/
		/** Percent of the window still available, or undefined when unknowable. */
		function remainingPercentOf(window) {
			if (window === void 0 || window === null) return void 0;
			if (Number.isFinite(window.remainingPercent)) return clamp(window.remainingPercent);
			if (Number.isFinite(window.usedPercent)) return clamp(100 - window.usedPercent);
			if (Number.isFinite(window.limit) && Number.isFinite(window.remaining) && window.limit > 0) return clamp(window.remaining / window.limit * 100);
		}
		/**
		* Seconds until the window resets: the reported countdown when the vendor
		* gives one, else derived from its reset timestamp.
		* @param window - one window reading.
		* @param now - current epoch millis.
		* @returns seconds, or undefined when the vendor said nothing usable.
		*/
		function horizonSeconds(window, now = Date.now()) {
			if (window === void 0 || window === null) return void 0;
			if (Number.isFinite(window.resetIn) && window.resetIn >= 0) return window.resetIn;
			if (typeof window.resetAt !== "string") return void 0;
			const time = Date.parse(window.resetAt);
			if (Number.isNaN(time)) return void 0;
			return Math.max(0, (time - now) / 1e3);
		}
		/** Currency glyph for a balance reading; unknown codes keep their code. */
		function currencySymbol(currency) {
			if (currency === "CNY") return "¥";
			if (currency === "USD") return "$";
			if (currency === "EUR") return "€";
			return `${currency ?? ""} `;
		}
		/** Two-decimal money amount (provider balances are decimal strings). */
		function formatAmount(value) {
			return Number.isFinite(value) ? value.toFixed(2) : "—";
		}
		function clamp(value) {
			return Math.min(100, Math.max(0, value));
		}
		//#endregion
		//#region \0dsh-css:D:\Study\js\dsh-usage\dsh-usage-ledger\src\client\UsageSection.module.css.mjs
		const css = ".Rk5X7G_section{width:100%;max-width:780px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;display:flex}.Rk5X7G_trendTools{align-items:center;gap:8px;display:inline-flex}.Rk5X7G_refresh{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px;font-size:12px;line-height:18px}.Rk5X7G_refresh:hover{background:var(--dsw-alias-bg-layer-1)}.Rk5X7G_seg{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;gap:2px;padding:2px;display:inline-flex}.Rk5X7G_segButton{color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:0 0;border:none;border-radius:6px;padding:4px 12px;font-size:12px;line-height:18px}.Rk5X7G_segButton[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px #00000014}.Rk5X7G_status,.Rk5X7G_meta{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:20px}.Rk5X7G_failure{color:var(--dsw-alias-state-error-primary);align-items:center;gap:10px;display:flex}.Rk5X7G_failure button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}.Rk5X7G_cards{grid-template-columns:repeat(3,1fr);gap:10px;display:grid}.Rk5X7G_card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-direction:column;gap:6px;min-width:0;padding:12px 14px;display:flex}.Rk5X7G_cardLabel{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;font-size:12px;line-height:16px;display:inline-flex}.Rk5X7G_cardValue{font-variant-numeric:tabular-nums;font-size:24px;font-weight:600;line-height:30px}.Rk5X7G_cardValueSmall{font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap;font-size:20px;font-weight:600;line-height:26px;overflow:hidden}.Rk5X7G_cardSub{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}.Rk5X7G_block{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-direction:column;gap:10px;padding:14px;display:flex}.Rk5X7G_blockHead{justify-content:space-between;align-items:center;gap:12px;display:flex}.Rk5X7G_blockTitle{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;font-weight:500}.Rk5X7G_quotaMeta{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;font-size:11px;display:inline-flex}.Rk5X7G_quotaStale{border:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-tertiary);border-radius:4px;padding:0 4px;font-size:10px;line-height:14px}.Rk5X7G_quotaGrid{grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;display:grid}.Rk5X7G_quotaCard{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-direction:column;gap:6px;min-width:0;padding:12px 14px;display:flex}.Rk5X7G_quotaHead{align-items:center;gap:6px;min-width:0;display:flex}.Rk5X7G_quotaTitle{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;overflow:hidden}.Rk5X7G_quotaBadge{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;border-radius:4px;flex:none;max-width:96px;padding:0 5px;font-size:10px;line-height:15px;overflow:hidden}.Rk5X7G_quotaRoute{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:14px;font-family:var(--dsw-font-family-mono,ui-monospace, SFMono-Regular, monospace);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.Rk5X7G_quotaRow{flex-direction:column;gap:4px;display:flex}.Rk5X7G_quotaRowHead{justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;line-height:16px;display:flex}.Rk5X7G_quotaRowLabel{color:var(--dsw-alias-label-secondary)}.Rk5X7G_quotaValue{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);font-weight:600}.Rk5X7G_quotaBar{background:var(--dsw-alias-border-l3);border-radius:3px;height:6px;overflow:hidden}.Rk5X7G_quotaBarFill,.Rk5X7G_quotaBarFillLow{background:var(--dsw-static-deepseek-450);border-radius:3px;height:100%;display:block}.Rk5X7G_quotaBarFillLow{background:var(--dsw-alias-state-warn-primary,#f7ad31)}.Rk5X7G_quotaRowFoot{color:var(--dsw-alias-label-tertiary);justify-content:space-between;align-items:baseline;gap:8px;font-size:11px;line-height:14px;display:flex}.Rk5X7G_quotaBalance{flex-wrap:wrap;align-items:baseline;gap:8px;display:flex}.Rk5X7G_quotaBalanceValue{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);font-size:22px;font-weight:600;line-height:28px}.Rk5X7G_quotaOk,.Rk5X7G_quotaWarn{font-size:11px;line-height:16px}.Rk5X7G_quotaOk{color:var(--dsw-alias-state-success-primary,#22c55e)}.Rk5X7G_quotaWarn{color:var(--dsw-alias-state-warn-primary,#f7ad31)}.Rk5X7G_quotaSub{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;font-size:11px;line-height:15px;overflow:hidden}.Rk5X7G_quotaError{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:16px}.Rk5X7G_heatLegend{color:var(--dsw-alias-label-tertiary);align-items:center;gap:3px;font-size:11px;display:inline-flex}.Rk5X7G_heatLegend>span{border-radius:2px;flex:none;width:10px;height:10px}.Rk5X7G_heatMonths{height:14px;color:var(--dsw-alias-label-tertiary);grid-auto-columns:minmax(0,1fr);grid-auto-flow:column;gap:3px;font-size:11px;display:grid}.Rk5X7G_heatMonths>span{white-space:nowrap;min-width:0;overflow:visible}.Rk5X7G_heat{grid-template-rows:repeat(7,minmax(0,1fr));grid-auto-columns:minmax(0,1fr);grid-auto-flow:column;gap:3px;width:100%;display:grid}.Rk5X7G_heatCellL0,.Rk5X7G_heatCellL1,.Rk5X7G_heatCellL2,.Rk5X7G_heatCellL3,.Rk5X7G_heatCellL4,.Rk5X7G_heatCellOff{border-radius:2px;min-width:0;min-height:0}.Rk5X7G_heatCellOff{background:0 0}.Rk5X7G_heatCellL0{background:var(--dsw-alias-border-l3)}.Rk5X7G_heatCellL1{background:var(--dsw-static-deepseek-100)}.Rk5X7G_heatCellL2{background:var(--dsw-static-deepseek-200)}.Rk5X7G_heatCellL3{background:var(--dsw-static-deepseek-300)}.Rk5X7G_heatCellL4{background:var(--dsw-static-deepseek-450)}.Rk5X7G_trendFrame{flex-direction:column;gap:10px;display:flex}.Rk5X7G_trend{height:160px;display:flex;position:relative}.Rk5X7G_trendColumn{border-radius:2px;flex:1;min-width:0;height:100%}.Rk5X7G_trendColumn:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)}.Rk5X7G_gridLine{border-top:1px dashed var(--dsw-alias-border-l2);pointer-events:none;position:absolute;left:0;right:0}.Rk5X7G_tooltip{z-index:2;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);min-width:200px;box-shadow:var(--dsw-shadow-lv1,0 4px 16px #00000029);pointer-events:none;border-radius:8px;flex-direction:column;gap:3px;padding:8px 10px;display:flex;position:absolute;top:4px}.Rk5X7G_tooltipDate{font-size:12px;font-weight:600;line-height:16px}.Rk5X7G_tooltipRow{align-items:center;gap:6px;font-size:12px;line-height:16px;display:flex}.Rk5X7G_tooltipName{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-secondary);flex:1;overflow:hidden}.Rk5X7G_tooltipValue{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}.Rk5X7G_ticks{height:16px;color:var(--dsw-alias-label-tertiary);font-size:11px;position:relative}.Rk5X7G_ticks>span{white-space:nowrap;position:absolute;transform:translate(-50%)}.Rk5X7G_legend{color:var(--dsw-alias-label-secondary);flex-wrap:wrap;gap:6px 16px;font-size:12px;display:flex}.Rk5X7G_legendItem{align-items:center;gap:6px;display:inline-flex}.Rk5X7G_legendDot{border-radius:50%;flex:none;width:8px;height:8px}.Rk5X7G_legendLine{background:var(--dsw-alias-label-primary);border-radius:2px;flex:none;width:12px;height:3px}.Rk5X7G_trendOverlay{z-index:1;pointer-events:none;position:absolute;inset:0}.Rk5X7G_trendSvg{width:100%;height:100%;display:block;overflow:visible}.Rk5X7G_trendLine{fill:none;stroke:var(--dsw-alias-label-primary);stroke-width:2.5px;stroke-linecap:round;stroke-linejoin:round}.Rk5X7G_trendLineModel{fill:none;stroke-width:1.5px;stroke-linecap:round;stroke-linejoin:round}.Rk5X7G_trendDot{background:var(--dsw-alias-label-primary);border-radius:50%;width:5px;height:5px;position:absolute;transform:translate(-50%,-50%)}.Rk5X7G_hoverDot,.Rk5X7G_hoverDotTotal{border-radius:50%;width:5px;height:5px;position:absolute;transform:translate(-50%,-50%)}.Rk5X7G_hoverDotTotal{background:var(--dsw-alias-label-primary);width:6px;height:6px}@media (prefers-reduced-motion:no-preference){.Rk5X7G_trendLine.Rk5X7G_anim,.Rk5X7G_trendLineModel.Rk5X7G_anim{stroke-dasharray:1;animation:.7s cubic-bezier(.33,0,.2,1) backwards Rk5X7G_trendLineDraw}.Rk5X7G_trendDot.Rk5X7G_anim{animation:.24s ease-out backwards Rk5X7G_trendDotPop}.Rk5X7G_heat>.Rk5X7G_anim{animation:.3s ease-out backwards Rk5X7G_heatFade}.Rk5X7G_donut .Rk5X7G_anim{animation:.6s cubic-bezier(.33,0,.2,1) backwards Rk5X7G_donutSweep}}@keyframes Rk5X7G_trendLineDraw{0%{stroke-dashoffset:1px}to{stroke-dashoffset:0}}@keyframes Rk5X7G_trendDotPop{0%{opacity:0;transform:translate(-50%,-50%)scale(.3)}to{opacity:1;transform:translate(-50%,-50%)scale(1)}}@keyframes Rk5X7G_heatFade{0%{opacity:0}}@keyframes Rk5X7G_donutSweep{0%{stroke-dasharray:0 var(--circ,251.2)}to{stroke-dasharray:var(--arc,0) var(--circ,251.2)}}.Rk5X7G_shareLayout{align-items:center;gap:20px;display:flex}.Rk5X7G_donutWrap{flex:none;width:132px;height:132px;position:relative}.Rk5X7G_donut{width:100%;height:100%;display:block}.Rk5X7G_donut circle{transition:opacity .12s}.Rk5X7G_donutCenter{pointer-events:none;flex-direction:column;justify-content:center;align-items:center;gap:2px;display:flex;position:absolute;inset:0}.Rk5X7G_donutTotal{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);font-size:18px;font-weight:600;line-height:22px}.Rk5X7G_donutUnit{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:14px}.Rk5X7G_shareLegend{flex-direction:column;flex:1;min-width:0;margin:0;padding:0;list-style:none;display:flex}.Rk5X7G_shareRow{border-radius:6px;align-items:center;gap:8px;padding:7px 6px;font-size:12px;line-height:16px;display:flex}.Rk5X7G_shareRow+.Rk5X7G_shareRow{border-top:1px solid var(--dsw-alias-border-l3);border-top-left-radius:0;border-top-right-radius:0}.Rk5X7G_shareRow:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)}.Rk5X7G_shareBody{flex-direction:column;flex:1;gap:1px;min-width:0;display:flex}.Rk5X7G_shareTop{justify-content:space-between;align-items:baseline;gap:8px;display:flex}.Rk5X7G_shareName{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}.Rk5X7G_shareSub{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:14px}.Rk5X7G_sharePct{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);white-space:nowrap;font-weight:600}";
		const tagId = "dsh-usage-ledger/UsageSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-usage-ledger";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var UsageSection_module_css_default = {
			"anim": "Rk5X7G_anim",
			"block": "Rk5X7G_block",
			"blockHead": "Rk5X7G_blockHead",
			"blockTitle": "Rk5X7G_blockTitle",
			"card": "Rk5X7G_card",
			"cardLabel": "Rk5X7G_cardLabel",
			"cardSub": "Rk5X7G_cardSub",
			"cardValue": "Rk5X7G_cardValue",
			"cardValueSmall": "Rk5X7G_cardValueSmall",
			"cards": "Rk5X7G_cards",
			"donut": "Rk5X7G_donut",
			"donutCenter": "Rk5X7G_donutCenter",
			"donutSweep": "Rk5X7G_donutSweep",
			"donutTotal": "Rk5X7G_donutTotal",
			"donutUnit": "Rk5X7G_donutUnit",
			"donutWrap": "Rk5X7G_donutWrap",
			"failure": "Rk5X7G_failure",
			"gridLine": "Rk5X7G_gridLine",
			"heat": "Rk5X7G_heat",
			"heatCellL0": "Rk5X7G_heatCellL0",
			"heatCellL1": "Rk5X7G_heatCellL1",
			"heatCellL2": "Rk5X7G_heatCellL2",
			"heatCellL3": "Rk5X7G_heatCellL3",
			"heatCellL4": "Rk5X7G_heatCellL4",
			"heatCellOff": "Rk5X7G_heatCellOff",
			"heatFade": "Rk5X7G_heatFade",
			"heatLegend": "Rk5X7G_heatLegend",
			"heatMonths": "Rk5X7G_heatMonths",
			"hoverDot": "Rk5X7G_hoverDot",
			"hoverDotTotal": "Rk5X7G_hoverDotTotal",
			"legend": "Rk5X7G_legend",
			"legendDot": "Rk5X7G_legendDot",
			"legendItem": "Rk5X7G_legendItem",
			"legendLine": "Rk5X7G_legendLine",
			"meta": "Rk5X7G_meta",
			"quotaBadge": "Rk5X7G_quotaBadge",
			"quotaBalance": "Rk5X7G_quotaBalance",
			"quotaBalanceValue": "Rk5X7G_quotaBalanceValue",
			"quotaBar": "Rk5X7G_quotaBar",
			"quotaBarFill": "Rk5X7G_quotaBarFill",
			"quotaBarFillLow": "Rk5X7G_quotaBarFillLow",
			"quotaCard": "Rk5X7G_quotaCard",
			"quotaError": "Rk5X7G_quotaError",
			"quotaGrid": "Rk5X7G_quotaGrid",
			"quotaHead": "Rk5X7G_quotaHead",
			"quotaMeta": "Rk5X7G_quotaMeta",
			"quotaOk": "Rk5X7G_quotaOk",
			"quotaRoute": "Rk5X7G_quotaRoute",
			"quotaRow": "Rk5X7G_quotaRow",
			"quotaRowFoot": "Rk5X7G_quotaRowFoot",
			"quotaRowHead": "Rk5X7G_quotaRowHead",
			"quotaRowLabel": "Rk5X7G_quotaRowLabel",
			"quotaStale": "Rk5X7G_quotaStale",
			"quotaSub": "Rk5X7G_quotaSub",
			"quotaTitle": "Rk5X7G_quotaTitle",
			"quotaValue": "Rk5X7G_quotaValue",
			"quotaWarn": "Rk5X7G_quotaWarn",
			"refresh": "Rk5X7G_refresh",
			"section": "Rk5X7G_section",
			"seg": "Rk5X7G_seg",
			"segButton": "Rk5X7G_segButton",
			"shareBody": "Rk5X7G_shareBody",
			"shareLayout": "Rk5X7G_shareLayout",
			"shareLegend": "Rk5X7G_shareLegend",
			"shareName": "Rk5X7G_shareName",
			"sharePct": "Rk5X7G_sharePct",
			"shareRow": "Rk5X7G_shareRow",
			"shareSub": "Rk5X7G_shareSub",
			"shareTop": "Rk5X7G_shareTop",
			"status": "Rk5X7G_status",
			"ticks": "Rk5X7G_ticks",
			"tooltip": "Rk5X7G_tooltip",
			"tooltipDate": "Rk5X7G_tooltipDate",
			"tooltipName": "Rk5X7G_tooltipName",
			"tooltipRow": "Rk5X7G_tooltipRow",
			"tooltipValue": "Rk5X7G_tooltipValue",
			"trend": "Rk5X7G_trend",
			"trendColumn": "Rk5X7G_trendColumn",
			"trendDot": "Rk5X7G_trendDot",
			"trendDotPop": "Rk5X7G_trendDotPop",
			"trendFrame": "Rk5X7G_trendFrame",
			"trendLine": "Rk5X7G_trendLine",
			"trendLineDraw": "Rk5X7G_trendLineDraw",
			"trendLineModel": "Rk5X7G_trendLineModel",
			"trendOverlay": "Rk5X7G_trendOverlay",
			"trendSvg": "Rk5X7G_trendSvg",
			"trendTools": "Rk5X7G_trendTools"
		};
		//#endregion
		//#region src/client/QuotaBlock.tsx
		/**
		* The 供应商额度 (provider allowance) block of the 数据与统计 settings section.
		*
		* It renders what each configured provider route reports about its own
		* remaining allowance: Coding Plan 5-hour/weekly windows with reset
		* countdowns (智谱 GLM, Kimi), and DeepSeek's pay-as-you-go balance in its own
		* currency. Nothing here is computed from token counts — these are live
		* vendor numbers, kept deliberately separate from the ledger above.
		*
		* The block owns its request: quota reads cross the network, so they load,
		* fail, and refresh independently of the usage dashboard beside them.
		*/
		/** Below this share the window bar turns into the warning color. */
		const LOW_PERCENT = 20;
		/** Display names for the probe families (the route id follows as a chip). */
		const PROBE_KEYS = {
			zhipu: "quota.probe.zhipu",
			kimi: "quota.probe.kimi",
			deepseek: "quota.probe.deepseek"
		};
		/**
		* Render the provider-allowance block.
		* Renders nothing at all when the deployment configures no probeable route —
		* the block is additive, never an empty box.
		*/
		function QuotaBlock({ queryQuotas, localeId, refreshToken, t }) {
			const [state, setState] = (0, react.useState)({ status: "loading" });
			const [retry, setRetry] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				let current = true;
				setState({ status: "loading" });
				queryQuotas({ force: refreshToken > 0 || retry > 0 }).then((result) => {
					if (!current) return;
					if (result.ok) setState({
						status: "ready",
						quotas: result.value.quotas
					});
					else setState({ status: "error" });
				}, () => {
					if (current) setState({ status: "error" });
				});
				return () => {
					current = false;
				};
			}, [
				queryQuotas,
				refreshToken,
				retry
			]);
			const zh = localeId().startsWith("zh");
			const quotas = state.status === "ready" ? state.quotas : [];
			if (state.status === "ready" && quotas.length === 0) return null;
			const okReadings = quotas.filter((reading) => reading.ok);
			const stamp = okReadings.reduce((newest, reading) => reading.fetchedAt === void 0 ? newest : Math.max(newest ?? 0, reading.fetchedAt), void 0);
			const anyStale = okReadings.some((reading) => reading.stale === true);
			const updatedAt = stamp === void 0 ? null : new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", {
				hour: "2-digit",
				minute: "2-digit"
			}).format(new Date(stamp));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: UsageSection_module_css_default.block,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: UsageSection_module_css_default.blockHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: UsageSection_module_css_default.blockTitle,
							children: t("quota.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: UsageSection_module_css_default.quotaMeta,
							children: [updatedAt === null ? null : t("quota.updated", { time: updatedAt }), anyStale ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: UsageSection_module_css_default.quotaStale,
								children: t("quota.cached")
							}) : null]
						})]
					}),
					state.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: UsageSection_module_css_default.status,
						children: t("loading")
					}) : null,
					state.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: UsageSection_module_css_default.failure,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							children: t("quota.error")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								setRetry((value) => value + 1);
							},
							children: t("retry")
						})]
					}) : null,
					state.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: UsageSection_module_css_default.quotaGrid,
						children: quotas.map((reading) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaCard, {
							reading,
							zh,
							t
						}, reading.route))
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: UsageSection_module_css_default.meta,
						children: t("quota.hint")
					})] }) : null
				]
			});
		}
		/** One provider route: title, badge, and what that vendor reported. */
		function QuotaCard({ reading, zh, t }) {
			const nameKey = PROBE_KEYS[reading.probe];
			const name = nameKey === void 0 ? reading.label ?? reading.probe : t(nameKey);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: UsageSection_module_css_default.quotaCard,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: UsageSection_module_css_default.quotaHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: UsageSection_module_css_default.quotaTitle,
								title: reading.label ?? reading.probe,
								children: name
							}),
							reading.ok ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaBadge, {
								data: reading.data,
								t
							}) : null,
							reading.stale === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: UsageSection_module_css_default.quotaStale,
								children: t("quota.cached")
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: UsageSection_module_css_default.quotaRoute,
						children: reading.route
					}),
					reading.ok ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaBody, {
						data: reading.data,
						zh,
						t
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaFailure, {
						reading,
						t
					})
				]
			});
		}
		/** The plan/membership badge both window vendors report. */
		function QuotaBadge({ data, t }) {
			if (data === void 0 || data.kind !== "windows") return null;
			const text = data.plan !== void 0 && data.plan !== "unknown" ? data.plan : data.membership;
			if (text === void 0 || text === "") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: UsageSection_module_css_default.quotaBadge,
				title: text,
				children: text
			});
		}
		/** The vendor's numbers for one route. */
		function QuotaBody({ data, zh, t }) {
			const now = Date.now();
			if (data === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: UsageSection_module_css_default.quotaError,
				children: t("quota.unavailable")
			});
			if (data.kind === "balance") {
				const granted = data.granted > 0 ? t("quota.granted", { amount: `${currencySymbol(data.currency)}${formatAmount(data.granted)}` }) : null;
				const toppedUp = data.toppedUp > 0 ? t("quota.toppedUp", { amount: `${currencySymbol(data.currency)}${formatAmount(data.toppedUp)}` }) : null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: UsageSection_module_css_default.quotaBalance,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: UsageSection_module_css_default.quotaBalanceValue,
						children: [currencySymbol(data.currency), formatAmount(data.available)]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: data.sufficient ? UsageSection_module_css_default.quotaOk : UsageSection_module_css_default.quotaWarn,
						children: data.sufficient ? t("quota.sufficient") : t("quota.insufficient")
					})]
				}), granted === null && toppedUp === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: UsageSection_module_css_default.quotaSub,
					children: [granted, toppedUp].filter(Boolean).join(" · ")
				})] });
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WindowRow, {
					label: t("quota.fiveHour"),
					window: data.fiveHour,
					zh,
					now,
					t
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WindowRow, {
					label: t("quota.weekly"),
					window: data.weekly,
					zh,
					now,
					t
				}),
				data.mcp?.remaining === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: UsageSection_module_css_default.quotaSub,
					children: t("quota.mcp", { n: String(data.mcp.remaining) })
				}),
				data.parallelLimit === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: UsageSection_module_css_default.quotaSub,
					children: t("quota.parallel", { n: String(data.parallelLimit) })
				})
			] });
		}
		/** One allowance window: remaining bar, share, and the reset countdown. */
		function WindowRow({ label, window, zh, now, t }) {
			const remaining = remainingPercentOf(window);
			const horizon = horizonText(window, now, zh, t);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: UsageSection_module_css_default.quotaRow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: UsageSection_module_css_default.quotaRowHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: UsageSection_module_css_default.quotaRowLabel,
							children: label
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: UsageSection_module_css_default.quotaValue,
							children: remaining === void 0 ? "—" : `${String(Math.round(remaining))}%`
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: UsageSection_module_css_default.quotaBar,
						role: "img",
						"aria-label": `${label} ${remaining === void 0 ? "" : `${String(Math.round(remaining))}%`}`,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: remaining !== void 0 && remaining < LOW_PERCENT ? UsageSection_module_css_default.quotaBarFillLow : UsageSection_module_css_default.quotaBarFill,
							style: { width: `${remaining ?? 0}%` }
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: UsageSection_module_css_default.quotaRowFoot,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: remaining === void 0 ? t("quota.unknown") : t("quota.left") }), horizon === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: horizon })]
					})
				]
			});
		}
		/** A route that could not be read: no credential, or the vendor refused. */
		function QuotaFailure({ reading, t }) {
			const unconfigured = reading.reason === "unconfigured";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: UsageSection_module_css_default.quotaError,
				children: unconfigured ? t("quota.unconfigured") : t("quota.unavailable")
			}), reading.error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: UsageSection_module_css_default.quotaSub,
				title: reading.error,
				children: reading.error
			})] });
		}
		/** "resets in 2 hours" in the user's language, or null when unknown. */
		function horizonText(window, now, zh, t) {
			const seconds = horizonSeconds(window, now);
			if (seconds === void 0) return null;
			const format = new Intl.RelativeTimeFormat(zh ? "zh-CN" : "en-US", {
				numeric: "auto",
				style: "narrow"
			});
			return t("quota.resetsIn", { when: seconds < 3600 ? format.format(Math.max(1, Math.round(seconds / 60)), "minute") : seconds < 86400 ? format.format(Math.round(seconds / 3600), "hour") : format.format(Math.round(seconds / 86400), "day") });
		}
		//#endregion
		//#region src/client/trend-points.ts
		/** Build the visible window for one period. */
		function buildTrendPoints(report, period, formatTick, formatTip) {
			if (period === "today") {
				const today = report.todayHours;
				if (today === void 0) return [];
				return today.hours.map((bucket) => ({
					key: `h${bucket.hour}`,
					tokens: bucket.tokens,
					values: bucket.values,
					tick: `${bucket.hour}:00`,
					tip: `${formatTip(today.day)} ${bucket.hour}:00`
				}));
			}
			return (period === "7d" ? report.series.slice(-7) : report.series).map((day) => ({
				key: day.day,
				tokens: day.tokens,
				values: day.values,
				tick: formatTick(day.day),
				tip: formatTip(day.day)
			}));
		}
		//#endregion
		//#region src/client/UsageSection.tsx
		/**
		* The 数据与统计 settings section: dashboard layout — six summary cards, the
		* provider-allowance block, a GitHub-style activity heatmap, and the token
		* trend as per-model colored lines under a neutral total line. Pure read
		* surface; data arrives over the plugin's private RPC channel (the quota
		* block over its own endpoint, so a slow vendor cannot delay the usage
		* numbers).
		*
		* The report is always queried for 30 days; the 7-day view is a client-side
		* slice of that series and 今日 draws the report's hourly buckets, so the
		* period toggle swaps instantly with no second round-trip. The toggle lives
		* in the trend block's header (the only charts it affects) and the cards
		* stay fixed to the 30-day window.
		*/
		const PERIODS = [
			"today",
			"7d",
			"30d"
		];
		/** The one and only period requested from the ledger; `period.30d` labels
		* everything that comes straight from the report (cards, meta line). */
		const QUERY_PERIOD = "30d";
		/** How long the opening animation choreography runs before the one-shot
		* animation classes are dropped (longest chain: model-line cascade ≈1.3s). */
		const PLAY_ONCE_MS = 1400;
		/** Categorical colors for the model lines (mid-tone, legible on both themes). */
		const MODEL_COLORS = [
			"#4d93f8",
			"#22c55e",
			"#f7ad31",
			"#a78bfa",
			"#f87171",
			"#7f8287",
			"#b7c8fe"
		];
		/** Heatmap grid: weeks shown, ending at the current week. A full year keeps
		* the cells small when the grid stretches to the panel width. */
		const HEAT_WEEKS = 53;
		/** Model-share donut geometry (SVG viewBox 120x120, center 60,60). */
		const RING_RADIUS = 40;
		const RING_STROKE = 14;
		const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
		/** Most named rows before the tail collapses into Other (the rest still
		* sums into its own slice, so the donut always covers 100%). */
		const SHARE_MAX_NAMED = 5;
		/** Local YYYY-MM-DD key (mirrors the host's day convention). */
		function dayKeyOf(date) {
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			return `${date.getFullYear()}-${month}-${day}`;
		}
		/** 89795000 -> "8979.5万" (zh) / "89.8M" (en). */
		function formatTokens(value, zh) {
			if (zh) {
				if (value >= 1e8) return `${trim(value / 1e8)}亿`;
				if (value >= 1e4) return `${trim(value / 1e4)}万`;
				return String(value);
			}
			if (value >= 1e9) return `${trim(value / 1e9)}G`;
			if (value >= 1e6) return `${trim(value / 1e6)}M`;
			if (value >= 1e3) return `${trim(value / 1e3)}K`;
			return String(value);
		}
		function trim(value) {
			if (value >= 100) return String(Math.round(value));
			if (value >= 10) return String(Math.round(value * 10) / 10);
			return String(Math.round(value * 100) / 100);
		}
		function formatNumber(value) {
			return new Intl.NumberFormat("en-US").format(value);
		}
		/** Catmull-Rom spline through the points, emitted as cubic Béziers. The
		* curve interpolates every point (markers stay glued), and control points
		* are clamped to the chart box so a spike never pulls the line past the
		* baseline or above the frame. */
		function smoothLinePath(points) {
			if (points.length === 0) return "";
			const fmt = (value) => value.toFixed(2);
			const clampY = (value) => Math.min(100, Math.max(0, value));
			let d = `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
			for (let index = 0; index < points.length - 1; index++) {
				const p0 = points[index - 1] ?? points[index];
				const p1 = points[index];
				const p2 = points[index + 1];
				const p3 = points[index + 2] ?? p2;
				const c1x = p1.x + (p2.x - p0.x) / 6;
				const c2x = p2.x - (p3.x - p1.x) / 6;
				const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
				const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
				d += ` C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
			}
			return d;
		}
		/** Points of one series in the frame's percentage space: x sits on the
		* column centers (same formula as the ticks), y maps value/trendMax to the
		* chart height. */
		function toGeometry(values, trendMax) {
			const n = Math.max(1, values.length);
			return values.map((value, index) => ({
				x: (index + .5) / n * 100,
				y: 100 - value / trendMax * 100
			}));
		}
		/** Render the usage dashboard section. */
		function UsageSection({ query, queryQuotas, localeId, t }) {
			const [period, setPeriod] = (0, react.useState)("30d");
			const [request, setRequest] = (0, react.useState)(0);
			const [state, setState] = (0, react.useState)({ status: "loading" });
			/** True until the opening choreography has played once (page open only:
			* period switches and refreshes swap data in place, with no replay). */
			const [playOnce, setPlayOnce] = (0, react.useState)(true);
			/** Trend column under the pointer; drives the markers + floating tooltip. */
			const [hovered, setHovered] = (0, react.useState)(null);
			/** Model-share donut slice under the pointer (dims the others). */
			const [shareHover, setShareHover] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let current = true;
				setState({ status: "loading" });
				query({ period: QUERY_PERIOD }).then((result) => {
					if (!current) return;
					if (result.ok) setState({
						status: "ready",
						report: result.value
					});
					else setState({ status: "error" });
				}, () => {
					if (current) setState({ status: "error" });
				});
				return () => {
					current = false;
				};
			}, [query, request]);
			(0, react.useEffect)(() => {
				if (state.status !== "ready" || !playOnce) return;
				const timer = window.setTimeout(() => {
					setPlayOnce(false);
				}, PLAY_ONCE_MS);
				return () => {
					window.clearTimeout(timer);
				};
			}, [state.status, playOnce]);
			const zh = localeId().startsWith("zh");
			const report = state.status === "ready" ? state.report : void 0;
			const dateLabel = (day) => {
				const [year, month, date] = day.split("-").map(Number);
				return new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", {
					month: "numeric",
					day: "numeric"
				}).format(new Date(year, month - 1, date));
			};
			const heatLabel = (day) => {
				const [year, month, date] = day.split("-").map(Number);
				return new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", {
					month: "short",
					day: "numeric"
				}).format(new Date(year, month - 1, date));
			};
			/** Full provider/model label -> legend display name. Several providers can
			* serve the same model name, so we keep the bare model name only while it is
			* unique across the report; on a collision the full provider/model key is
			* shown so the rows (and the donut slices) stay distinguishable. */
			const modelDisplay = (0, react.useMemo)(() => {
				const models = report?.models ?? [];
				const counts = /* @__PURE__ */ new Map();
				for (const label of models) {
					const short = modelShortName(label);
					counts.set(short, (counts.get(short) ?? 0) + 1);
				}
				const map = /* @__PURE__ */ new Map();
				for (const label of models) map.set(label, (counts.get(modelShortName(label)) ?? 0) > 1 ? label : modelShortName(label));
				return map;
			}, [report]);
			const labelOf = (label) => modelDisplay.get(label) ?? label;
			const heat = (0, react.useMemo)(() => {
				if (report === void 0) return {
					columns: [],
					months: []
				};
				const max = Math.max(1, ...Object.values(report.dailyTotals));
				const today = /* @__PURE__ */ new Date();
				const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
				const first = todayStart - (364 + new Date(todayStart).getDay()) * 864e5;
				const columns = [];
				for (let week = 0; week < HEAT_WEEKS; week++) {
					const column = [];
					for (let row = 0; row < 7; row++) {
						const ms = first + (week * 7 + row) * 864e5;
						const future = ms > todayStart;
						const tokens = future ? 0 : report.dailyTotals[dayKeyOf(new Date(ms))] ?? 0;
						const level = future ? 0 : heatLevel(tokens, max);
						column.push({
							key: dayKeyOf(new Date(ms)),
							tokens,
							level,
							future
						});
					}
					columns.push(column);
				}
				const monthFormatter = new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", { month: "short" });
				return {
					columns,
					months: columns.map((column, index) => {
						if (index > 0 && column[0].key.slice(0, 7) === columns[index - 1][0].key.slice(0, 7)) return null;
						const [year, month, date] = column[0].key.split("-").map(Number);
						return monthFormatter.format(new Date(year, month - 1, date));
					})
				};
			}, [report, zh]);
			/** The window the trend chart and donut actually show: 7d is a tail slice
			* of the 30-day series and 今日 draws the hourly buckets, so toggling
			* never needs a round-trip. (The window math lives in trend-points.ts —
			* pure, unit-tested, and tolerant of a stale host without `todayHours`.) */
			const trendPoints = (0, react.useMemo)(() => report === void 0 ? [] : buildTrendPoints(report, period, dateLabel, heatLabel), [
				report,
				period,
				zh
			]);
			const trendMax = (0, react.useMemo)(() => Math.max(1, ...trendPoints.map((point) => point.tokens)), [trendPoints]);
			/** Models with any usage inside the visible window, in the report's
			* legend order — a model whose line would sit flat on the baseline is
			* noise, so neither its line nor its legend row is drawn. */
			const windowModels = (0, react.useMemo)(() => {
				return (report?.models ?? []).filter((model) => trendPoints.some((point) => (point.values[model] ?? 0) > 0));
			}, [report, trendPoints]);
			/** Per-model lines plus the neutral total line, all in percentage space. */
			const modelLines = (0, react.useMemo)(() => {
				const models = report?.models ?? [];
				return windowModels.map((model) => ({
					key: model,
					color: MODEL_COLORS[models.indexOf(model) % MODEL_COLORS.length],
					points: toGeometry(trendPoints.map((point) => point.values[model] ?? 0), trendMax)
				}));
			}, [
				report,
				windowModels,
				trendPoints,
				trendMax
			]);
			const totalPoints = (0, react.useMemo)(() => toGeometry(trendPoints.map((point) => point.tokens), trendMax), [trendPoints, trendMax]);
			/** Tick indexes: at most 7, always including the last slot. */
			const trendTicks = (0, react.useMemo)(() => {
				const count = trendPoints.length;
				if (count < 2) return count === 1 ? [0] : [];
				const step = Math.ceil((count - 1) / 6);
				const ticks = [];
				for (let index = 0; index < count - 1; index += step) ticks.push(index);
				ticks.push(count - 1);
				return ticks;
			}, [trendPoints]);
			/** Token total of the visible window (the donut's center number and the
			* denominator of its shares). */
			const windowTokens = (0, react.useMemo)(() => trendPoints.reduce((sum, point) => sum + point.tokens, 0), [trendPoints]);
			/** Visible-window model shares for the donut, derived from the same
			* points as the trend chart. Long tails collapse into a single Other row;
			* sorted descending. */
			const modelShares = (0, react.useMemo)(() => {
				const entries = (report?.models ?? []).map((model) => {
					let tokens = 0;
					for (const point of trendPoints) tokens += point.values[model] ?? 0;
					return {
						label: model,
						tokens,
						share: windowTokens > 0 ? tokens / windowTokens : 0
					};
				}).filter((row) => row.tokens > 0);
				if (entries.length <= SHARE_MAX_NAMED) return entries;
				const named = entries.slice(0, SHARE_MAX_NAMED);
				const restTokens = entries.slice(SHARE_MAX_NAMED).reduce((sum, row) => sum + row.tokens, 0);
				return [...named, {
					label: t("share.other"),
					tokens: restTokens,
					share: windowTokens > 0 ? restTokens / windowTokens : 0
				}];
			}, [
				report,
				trendPoints,
				windowTokens,
				t
			]);
			/** Donut slices with cumulative start angles (degrees, clockwise). */
			const shareSlices = (0, react.useMemo)(() => {
				let angle = 0;
				return modelShares.map((row) => {
					const slice = {
						...row,
						offset: angle
					};
					angle += row.share * 360;
					return slice;
				});
			}, [modelShares]);
			const inRange = hovered !== null && hovered < trendPoints.length;
			const hoveredPoint = inRange ? trendPoints[hovered] : void 0;
			const hoveredRows = inRange ? (report?.models ?? []).map((model, index) => ({
				model,
				color: MODEL_COLORS[index % MODEL_COLORS.length],
				value: hoveredPoint.values[model] ?? 0
			})).filter((row) => row.value > 0).sort((a, b) => b.value - a.value) : [];
			const hoveredLeft = inRange ? (hovered + .5) / trendPoints.length * 100 : 50;
			const hoveredShift = hoveredLeft < 12 ? "0%" : hoveredLeft > 88 ? "-100%" : "-50%";
			/** One-shot animation class suffix; absent after the opening run (and for
			* prefers-reduced-motion users, where the CSS media query ignores it). */
			const anim = (base) => playOnce ? `${base} ${UsageSection_module_css_default.anim}` : base;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: UsageSection_module_css_default.section,
				"aria-busy": state.status === "loading",
				children: [
					state.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: UsageSection_module_css_default.status,
						children: t("loading")
					}) : null,
					state.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: UsageSection_module_css_default.failure,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							children: t("error")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								setRequest((value) => value + 1);
							},
							children: t("retry")
						})]
					}) : null,
					state.status === "ready" && report.totals.calls === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: UsageSection_module_css_default.status,
						children: t("empty")
					}) : null,
					state.status === "ready" && report.totals.calls > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: UsageSection_module_css_default.cards,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: UsageSection_module_css_default.card,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: UsageSection_module_css_default.cardLabel,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFlame, {}), t("stat.tokens")]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: UsageSection_module_css_default.cardValue,
									children: formatTokens(report.totals.totalTokens, zh)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: UsageSection_module_css_default.card,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: UsageSection_module_css_default.cardLabel,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChat, {}), t("stat.sessions")]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: UsageSection_module_css_default.cardValue,
									children: formatNumber(report.sessions)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: UsageSection_module_css_default.card,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: UsageSection_module_css_default.cardLabel,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconMessage, {}), t("stat.calls")]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: UsageSection_module_css_default.cardValue,
									children: formatNumber(report.totals.calls)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: UsageSection_module_css_default.card,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: UsageSection_module_css_default.cardLabel,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconCalendar, {}), t("stat.activeDays")]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: UsageSection_module_css_default.cardValue,
									children: formatNumber(report.activeDays)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: UsageSection_module_css_default.card,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: UsageSection_module_css_default.cardLabel,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconBolt, {}), t("stat.streak")]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: UsageSection_module_css_default.cardValue,
									children: formatNumber(report.streakDays)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: UsageSection_module_css_default.card,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: UsageSection_module_css_default.cardLabel,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconSparkle, {}), t("stat.topModel")]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: UsageSection_module_css_default.cardValueSmall,
										title: report.topModel?.label ?? "",
										children: report.topModel === null ? "—" : labelOf(report.topModel.label)
									}),
									report.topModel !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: UsageSection_module_css_default.cardSub,
										children: t("stat.share", { p: `${Math.round(report.topModel.share * 100)}%` })
									}) : null
								]
							})
						]
					}) }) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaBlock, {
						queryQuotas,
						localeId,
						refreshToken: request,
						t
					}),
					state.status === "ready" && report.totals.calls > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: UsageSection_module_css_default.block,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: UsageSection_module_css_default.blockHead,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										className: UsageSection_module_css_default.blockTitle,
										children: t("heatmap")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: UsageSection_module_css_default.heatLegend,
										"aria-hidden": "true",
										children: [
											t("less"),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: UsageSection_module_css_default.heatCellL0 }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: UsageSection_module_css_default.heatCellL1 }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: UsageSection_module_css_default.heatCellL2 }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: UsageSection_module_css_default.heatCellL3 }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: UsageSection_module_css_default.heatCellL4 }),
											t("more")
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: UsageSection_module_css_default.heatMonths,
									"aria-hidden": "true",
									children: heat.months.map((label, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }, heat.columns[index][0].key))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: UsageSection_module_css_default.heat,
									role: "img",
									"aria-label": t("heatmap"),
									style: { aspectRatio: `${HEAT_WEEKS} / 7` },
									children: heat.columns.map((column, weekIndex) => column.map((cell) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: `${cell.future ? UsageSection_module_css_default.heatCellOff : UsageSection_module_css_default[`heatCellL${cell.level}`]}${playOnce ? ` ${UsageSection_module_css_default.anim}` : ""}`,
										style: playOnce ? { animationDelay: `${weekIndex * 4}ms` } : void 0,
										title: cell.future ? void 0 : `${heatLabel(cell.key)} · ${formatTokens(cell.tokens, zh)}`
									}, cell.key)))
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: UsageSection_module_css_default.block,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: UsageSection_module_css_default.blockHead,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										className: UsageSection_module_css_default.blockTitle,
										children: period === "today" ? t("trend.hourly") : t("trend")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: UsageSection_module_css_default.trendTools,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: UsageSection_module_css_default.seg,
											role: "group",
											"aria-label": t("range"),
											children: PERIODS.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: UsageSection_module_css_default.segButton,
												"aria-pressed": period === value,
												onClick: () => {
													setPeriod(value);
												},
												children: t(`period.short.${value}`)
											}, value))
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: UsageSection_module_css_default.refresh,
											"aria-label": t("refresh"),
											onClick: () => {
												setRequest((value) => value + 1);
											},
											children: t("refresh")
										})]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: UsageSection_module_css_default.trendFrame,
									children: [
										period === "today" && trendPoints.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: UsageSection_module_css_default.status,
											children: t("today.stale")
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: UsageSection_module_css_default.trend,
											onMouseLeave: () => setHovered(null),
											children: [
												[
													25,
													50,
													75
												].map((y) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: UsageSection_module_css_default.gridLine,
													style: { top: `${y}%` },
													"aria-hidden": "true"
												}, y)),
												trendPoints.map((point, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: UsageSection_module_css_default.trendColumn,
													"aria-label": `${point.tip} · ${formatTokens(point.tokens, zh)}`,
													onMouseEnter: () => setHovered(index)
												}, point.key)),
												trendPoints.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: UsageSection_module_css_default.trendOverlay,
													"aria-hidden": "true",
													children: [
														trendPoints.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
															className: UsageSection_module_css_default.trendSvg,
															viewBox: "0 0 100 100",
															preserveAspectRatio: "none",
															children: [modelLines.map((line, lineIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
																d: smoothLinePath(line.points),
																pathLength: 1,
																vectorEffect: "non-scaling-stroke",
																stroke: line.color,
																className: anim(UsageSection_module_css_default.trendLineModel),
																style: playOnce ? { animationDelay: `${150 + lineIndex * 70}ms` } : void 0
															}, line.key)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
																d: smoothLinePath(totalPoints),
																pathLength: 1,
																vectorEffect: "non-scaling-stroke",
																className: anim(UsageSection_module_css_default.trendLine)
															})]
														}) : null,
														totalPoints.map((point, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: anim(UsageSection_module_css_default.trendDot),
															style: {
																left: `${point.x}%`,
																top: `${point.y}%`,
																animationDelay: playOnce ? `${Math.round(index / Math.max(1, totalPoints.length - 1) * 700)}ms` : void 0
															}
														}, trendPoints[index].key)),
														hoveredPoint !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [modelLines.map((line) => {
															const value = hoveredPoint.values[line.key] ?? 0;
															if (value === 0) return null;
															return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: UsageSection_module_css_default.hoverDot,
																style: {
																	left: `${hoveredLeft}%`,
																	top: `${100 - value / trendMax * 100}%`,
																	background: line.color
																}
															}, line.key);
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: UsageSection_module_css_default.hoverDotTotal,
															style: {
																left: `${hoveredLeft}%`,
																top: `${100 - hoveredPoint.tokens / trendMax * 100}%`
															}
														})] }) : null
													]
												}) : null,
												hoveredPoint !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: UsageSection_module_css_default.tooltip,
													style: {
														left: `${hoveredLeft}%`,
														transform: `translateX(${hoveredShift})`
													},
													role: "status",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: UsageSection_module_css_default.tooltipDate,
														children: [
															hoveredPoint.tip,
															" · ",
															formatTokens(hoveredPoint.tokens, zh)
														]
													}), hoveredRows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: UsageSection_module_css_default.tooltipRow,
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: UsageSection_module_css_default.legendDot,
																style: { background: row.color }
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: UsageSection_module_css_default.tooltipName,
																children: labelOf(row.model)
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: UsageSection_module_css_default.tooltipValue,
																children: formatNumber(row.value)
															})
														]
													}, row.model))]
												}) : null
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: UsageSection_module_css_default.ticks,
											"aria-hidden": "true",
											children: trendTicks.map((index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: { left: `${(index + .5) / trendPoints.length * 100}%` },
												children: trendPoints[index].tick
											}, index))
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: UsageSection_module_css_default.legend,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: UsageSection_module_css_default.legendItem,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: UsageSection_module_css_default.legendLine }), t("trend.total")]
									}), windowModels.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: UsageSection_module_css_default.legendItem,
										title: model,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: UsageSection_module_css_default.legendDot,
											style: { background: MODEL_COLORS[(report?.models.indexOf(model) ?? 0) % MODEL_COLORS.length] }
										}), labelOf(model)]
									}, model))]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: UsageSection_module_css_default.block,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: UsageSection_module_css_default.blockHead,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: UsageSection_module_css_default.blockTitle,
									children: t("share")
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: UsageSection_module_css_default.shareLayout,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: UsageSection_module_css_default.donutWrap,
									onMouseLeave: () => setShareHover(null),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
										className: UsageSection_module_css_default.donut,
										viewBox: "0 0 120 120",
										role: "img",
										"aria-label": t("share"),
										children: shareSlices.map((slice, index) => slice.share > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
											cx: "60",
											cy: "60",
											r: RING_RADIUS,
											fill: "none",
											strokeWidth: RING_STROKE,
											stroke: MODEL_COLORS[index % MODEL_COLORS.length],
											strokeDasharray: `${slice.share * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`,
											transform: `rotate(${slice.offset} 60 60)`,
											opacity: shareHover === null || shareHover === index ? 1 : .35,
											onMouseEnter: () => setShareHover(index),
											className: playOnce ? UsageSection_module_css_default.anim : void 0,
											style: playOnce ? {
												"--arc": `${slice.share * RING_CIRCUMFERENCE}`,
												"--circ": `${RING_CIRCUMFERENCE}`,
												animationDelay: `${index * 90}ms`
											} : void 0
										}, slice.label) : null)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: UsageSection_module_css_default.donutCenter,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: UsageSection_module_css_default.donutTotal,
											children: formatTokens(windowTokens, zh)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: UsageSection_module_css_default.donutUnit,
											children: t("unit.tokens")
										})]
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: UsageSection_module_css_default.shareLegend,
									children: shareSlices.map((slice, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
										className: UsageSection_module_css_default.shareRow,
										onMouseEnter: () => setShareHover(index),
										onMouseLeave: () => setShareHover(null),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: UsageSection_module_css_default.legendDot,
											style: { background: MODEL_COLORS[index % MODEL_COLORS.length] }
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: UsageSection_module_css_default.shareBody,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: UsageSection_module_css_default.shareTop,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: UsageSection_module_css_default.shareName,
													title: slice.label,
													children: labelOf(slice.label)
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: UsageSection_module_css_default.sharePct,
													children: [Math.round(slice.share * 100), "%"]
												})]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: UsageSection_module_css_default.shareSub,
												children: [
													formatTokens(slice.tokens, zh),
													" ",
													t("unit.tokens")
												]
											})]
										})]
									}, slice.label))
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: UsageSection_module_css_default.meta,
							children: [t(`period.${QUERY_PERIOD}`), report.totals.reportedTokens !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								" · ",
								formatTokens(report.totals.reportedTokens, zh),
								" ",
								t("reported"),
								report.totals.estimatedTokens !== void 0 && report.totals.estimatedTokens > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									" · ",
									formatTokens(report.totals.estimatedTokens, zh),
									" ",
									t("estimated")
								] }) : null
							] }) : null]
						}),
						report.totals.estimatedTokens !== void 0 && report.totals.estimatedTokens > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: UsageSection_module_css_default.meta,
							children: t("estimatedHint")
						}) : null
					] }) : null
				]
			});
		}
		/** Short model name of one provider/model pair (text after the first '/').
		* Collision-aware display happens in UsageSection via `labelOf`. */
		function modelShortName(label) {
			const slash = label.indexOf("/");
			return slash < 0 ? label : label.slice(slash + 1);
		}
		/** 14px inline glyph shared by the summary cards. */
		function Glyph({ path }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "12",
				height: "12",
				viewBox: "0 0 14 14",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: path,
					fill: "currentColor"
				})
			});
		}
		function IconFlame() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Glyph, { path: "M7.2 0.8c0.9 2.4 2.9 3.9 2.9 6.4a3.1 3.1 0 1 1-6.2 0c0-0.9 0.4-1.8 0.9-2.5 0.5 1.4 1 2.3 1.7 3C6.3 5.5 6.1 3.4 7.2 0.8z" });
		}
		function IconChat() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Glyph, { path: "M2 1.5h7a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9 8.5H5.5L3 10.8V8.5H2A1.5 1.5 0 0 1 0.5 7V3A1.5 1.5 0 0 1 2 1.5zm9.5 7.5V6.8a3 3 0 0 1 1 2.2v1.4a1.5 1.5 0 0 1-1.5 1.5H9.4v-1.4h1.6a0.5 0.5 0 0 0 0.5-0.5V9z" });
		}
		function IconMessage() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Glyph, { path: "M2 2h10a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 12 11H6l-3.2 2.4V11H2a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 2 2z" });
		}
		function IconCalendar() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Glyph, { path: "M3.5 1v2h-1A1.5 1.5 0 0 0 1 4.5v7A1.5 1.5 0 0 0 2.5 13h9a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 11.5 3h-1V1h-1.4v2H4.9V1H3.5zM2.4 5.6h9.2v5.9a0.1 0.1 0 0 1-0.1 0.1H2.5a0.1 0.1 0 0 1-0.1-0.1V5.6z" });
		}
		function IconBolt() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Glyph, { path: "M8.2 0.5L2.6 8h3l-1.4 5.5L9.8 6h-3l1.4-5.5z" });
		}
		function IconSparkle() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Glyph, { path: "M7 0.5l1.5 4.4 4.4 1.6-4.4 1.6L7 12.5 5.5 8.1 1.1 6.5l4.4-1.6L7 0.5zM11.5 9.5l0.7 1.8 1.8 0.7-1.8 0.7-0.7 1.8-0.7-1.8-1.8-0.7 1.8-0.7 0.7-1.8z" });
		}
		/** 16px line-chart glyph registered as the settings-section nav icon (see
		* `index.ts` — passed via the `icon` registration option the shell renders
		* ahead of its id→glyph map). Matches the DSH Outline16 family: thin strokes,
		* `currentColor`, so it follows the nav theme. */
		function UsageNavIcon({ size = 16, className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				className,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2 13.5V2.5",
						stroke: "currentColor",
						strokeWidth: "1.3",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M2 13.5H14",
						stroke: "currentColor",
						strokeWidth: "1.3",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M3.5 11L6 7.5L8.5 9L11 4.5L13.5 2.5",
						stroke: "currentColor",
						strokeWidth: "1.3",
						strokeLinecap: "round",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "3.5",
						cy: "11",
						r: "1.1",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "6",
						cy: "7.5",
						r: "1.1",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "8.5",
						cy: "9",
						r: "1.1",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "11",
						cy: "4.5",
						r: "1.1",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "13.5",
						cy: "2.5",
						r: "1.1",
						fill: "currentColor"
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Dictionaries for the 数据与统计 settings section (zh is the source of
		* truth; en mirrors it key for key).
		*/
		const zh = {
			nav: "数据与统计",
			loading: "加载中…",
			error: "读取用量数据失败。",
			retry: "重试",
			refresh: "刷新",
			empty: "还没有任何用量记录——开始对话后,这里会出现统计。",
			range: "时间范围",
			"period.7d": "最近 7 天",
			"period.30d": "最近 30 天",
			"period.short.7d": "7 天",
			"period.short.30d": "30 天",
			"period.short.today": "今日",
			"today.stale": "小时粒度数据将在重启应用后可用。",
			"stat.tokens": "tokens 用量",
			"stat.sessions": "会话数量",
			"stat.calls": "调用次数",
			"stat.activeDays": "活跃天数",
			"stat.streak": "当前连续天数",
			"stat.topModel": "最常用模型",
			"stat.share": "占比 {p}",
			heatmap: "活跃热力图",
			less: "较少",
			more: "较多",
			trend: "按天 Token 趋势",
			"trend.hourly": "按小时 Token 趋势",
			"trend.total": "总计",
			share: "模型用量",
			"share.other": "其他模型",
			"unit.tokens": "tokens",
			"tooltip.total": "总 tokens",
			input: "输入",
			cacheRead: "缓存读取",
			cacheWrite: "缓存写入",
			output: "输出",
			reported: "实报",
			estimated: "估算",
			estimatedHint: "估算为启发式(char/4),并非提供方实报数字。",
			"quota.title": "供应商额度",
			"quota.updated": "更新于 {time}",
			"quota.cached": "缓存",
			"quota.error": "读取供应商额度失败。",
			"quota.hint": "额度为提供方实时实报数字,与上面的用量账本无关,也不做任何计价换算。",
			"quota.probe.zhipu": "智谱 GLM",
			"quota.probe.kimi": "Kimi",
			"quota.probe.deepseek": "DeepSeek",
			"quota.fiveHour": "5 小时窗口",
			"quota.weekly": "每周窗口",
			"quota.left": "剩余",
			"quota.unknown": "无数据",
			"quota.resetsIn": "{when}重置",
			"quota.unconfigured": "未配置凭证",
			"quota.unavailable": "读取失败",
			"quota.granted": "含赠金 {amount}",
			"quota.toppedUp": "充值 {amount}",
			"quota.sufficient": "余额充足",
			"quota.insufficient": "余额不足",
			"quota.mcp": "MCP 剩余 {n} 次",
			"quota.parallel": "并发上限 {n}"
		};
		const en = {
			nav: "Data & Usage",
			loading: "Loading…",
			error: "Failed to read usage data.",
			retry: "Retry",
			refresh: "Refresh",
			empty: "No usage recorded yet — chat with a model and the stats appear here.",
			range: "Time range",
			"period.7d": "Last 7 days",
			"period.30d": "Last 30 days",
			"period.short.7d": "7 days",
			"period.short.30d": "30 days",
			"period.short.today": "Today",
			"today.stale": "Hourly data becomes available after an app restart.",
			"stat.tokens": "Tokens used",
			"stat.sessions": "Sessions",
			"stat.calls": "Calls",
			"stat.activeDays": "Active days",
			"stat.streak": "Current streak",
			"stat.topModel": "Top model",
			"stat.share": "{p} of total",
			heatmap: "Activity heatmap",
			less: "Less",
			more: "More",
			trend: "Daily token trend",
			"trend.hourly": "Hourly token trend",
			"trend.total": "Total",
			share: "Model usage",
			"share.other": "Other models",
			"unit.tokens": "tokens",
			"tooltip.total": "Total tokens",
			input: "Input",
			cacheRead: "Cache read",
			cacheWrite: "Cache write",
			output: "Output",
			reported: "reported",
			estimated: "estimated",
			estimatedHint: "Estimates use the chars/4 heuristic, not provider-reported numbers.",
			"quota.title": "Provider allowance",
			"quota.updated": "Updated {time}",
			"quota.cached": "cached",
			"quota.error": "Failed to read provider allowance.",
			"quota.hint": "Allowance is reported live by each provider; it is separate from the ledger above and no token is ever converted into money.",
			"quota.probe.zhipu": "Zhipu GLM",
			"quota.probe.kimi": "Kimi",
			"quota.probe.deepseek": "DeepSeek",
			"quota.fiveHour": "5-hour window",
			"quota.weekly": "Weekly window",
			"quota.left": "left",
			"quota.unknown": "no data",
			"quota.resetsIn": "resets {when}",
			"quota.unconfigured": "No credential configured",
			"quota.unavailable": "Read failed",
			"quota.granted": "granted {amount}",
			"quota.toppedUp": "topped up {amount}",
			"quota.sufficient": "sufficient",
			"quota.insufficient": "insufficient",
			"quota.mcp": "MCP calls left: {n}",
			"quota.parallel": "parallel limit {n}"
		};
		//#endregion
		//#region src/client/index.ts
		/**
		* Browser half of dsh-usage-ledger: the 数据与统计 settings section.
		*
		* Loaded by the harness client module system (this package declares
		* `dsh.client` and ships a prebuilt `lib/client.js`). Registers one entry
		* into the open `settings.section` list slot; the panel pulls aggregates
		* from the host ledger over the plugin's private loopback RPC channel.
		*
		* @module dsh-usage-ledger/client
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "usage-ledger.settings";
		/** Stable nav glyph for the 数据与统计 settings section. The shell renders a
		* registrant-supplied `icon` ahead of its id→glyph map (unknown ids would
		* otherwise fall back to the settings gear). Built once at module scope so
		* the shell's row snapshot keeps a stable element reference. */
		const NAV_ICON = (0, react.createElement)(UsageNavIcon, { size: 16 });
		/** Services required by the settings-section registration. */
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/** Contribute the 数据与统计 section to the Settings panel. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "usage-ledger: dictionaries");
			const t = ctx.locale.bind(NS);
			const query = (payload) => ctx.connection.rpc.call("/usage-ledger", "dashboard", payload);
			const queryQuotas = (payload = {}) => ctx.connection.rpc.call("/usage-ledger", "quotas", payload);
			const localeId = () => ctx.locale.getSnapshot().active;
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "usage",
				order: 30,
				label: () => t("nav"),
				icon: NAV_ICON,
				locale: NS,
				inject: () => ({
					query,
					queryQuotas,
					localeId
				})
			}, UsageSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map