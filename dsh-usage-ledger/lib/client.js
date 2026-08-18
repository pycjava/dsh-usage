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
		//#region \0dsh-css:D:\Study\js\dsh-usage\dsh-usage-ledger\src\client\UsageSection.module.css.mjs
		const css = ".Rk5X7G_section{width:100%;max-width:780px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;display:flex}.Rk5X7G_header{justify-content:space-between;align-items:center;gap:12px;display:flex}.Rk5X7G_rangeLabel{color:var(--dsw-alias-label-secondary);font-size:13px}.Rk5X7G_headerActions{align-items:center;gap:8px;display:inline-flex}.Rk5X7G_refresh{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px;font-size:12px;line-height:18px}.Rk5X7G_refresh:hover{background:var(--dsw-alias-bg-layer-1)}.Rk5X7G_seg{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;gap:2px;padding:2px;display:inline-flex}.Rk5X7G_segButton{color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:0 0;border:none;border-radius:6px;padding:4px 12px;font-size:12px;line-height:18px}.Rk5X7G_segButton[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px #00000014}.Rk5X7G_status,.Rk5X7G_meta{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:20px}.Rk5X7G_failure{color:var(--dsw-alias-state-error-primary);align-items:center;gap:10px;display:flex}.Rk5X7G_failure button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}.Rk5X7G_cards{grid-template-columns:repeat(3,1fr);gap:10px;display:grid}.Rk5X7G_card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-direction:column;gap:6px;min-width:0;padding:12px 14px;display:flex}.Rk5X7G_cardLabel{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;font-size:12px;line-height:16px;display:inline-flex}.Rk5X7G_cardValue{font-variant-numeric:tabular-nums;font-size:24px;font-weight:600;line-height:30px}.Rk5X7G_cardValueSmall{font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap;font-size:20px;font-weight:600;line-height:26px;overflow:hidden}.Rk5X7G_cardSub{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}.Rk5X7G_block{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-direction:column;gap:10px;padding:14px;display:flex}.Rk5X7G_blockHead{justify-content:space-between;align-items:center;gap:12px;display:flex}.Rk5X7G_blockTitle{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;font-weight:500}.Rk5X7G_heatLegend{color:var(--dsw-alias-label-tertiary);align-items:center;gap:3px;font-size:11px;display:inline-flex}.Rk5X7G_heatLegend>span{border-radius:2px;flex:none;width:10px;height:10px}.Rk5X7G_heatMonths{height:14px;color:var(--dsw-alias-label-tertiary);grid-auto-columns:minmax(0,1fr);grid-auto-flow:column;gap:3px;font-size:11px;display:grid}.Rk5X7G_heatMonths>span{white-space:nowrap;min-width:0;overflow:visible}.Rk5X7G_heat{grid-template-rows:repeat(7,minmax(0,1fr));grid-auto-columns:minmax(0,1fr);grid-auto-flow:column;gap:3px;width:100%;display:grid}.Rk5X7G_heatCellL0,.Rk5X7G_heatCellL1,.Rk5X7G_heatCellL2,.Rk5X7G_heatCellL3,.Rk5X7G_heatCellL4,.Rk5X7G_heatCellOff{border-radius:2px;min-width:0;min-height:0}.Rk5X7G_heatCellOff{background:0 0}.Rk5X7G_heatCellL0{background:var(--dsw-alias-border-l3)}.Rk5X7G_heatCellL1{background:var(--dsw-static-deepseek-100)}.Rk5X7G_heatCellL2{background:var(--dsw-static-deepseek-200)}.Rk5X7G_heatCellL3{background:var(--dsw-static-deepseek-300)}.Rk5X7G_heatCellL4{background:var(--dsw-static-deepseek-450)}.Rk5X7G_trendFrame{flex-direction:column;gap:10px;margin-inline:auto;display:flex}.Rk5X7G_trend{align-items:flex-end;gap:2px;height:160px;display:flex;position:relative}.Rk5X7G_trendColumn{border-radius:2px;flex-direction:column;flex:1;justify-content:flex-end;min-width:4px;max-width:110px;height:100%;display:flex}.Rk5X7G_trendColumn:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)}.Rk5X7G_tooltip{z-index:2;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);min-width:200px;box-shadow:var(--dsw-shadow-lv1,0 4px 16px #00000029);pointer-events:none;border-radius:8px;flex-direction:column;gap:3px;padding:8px 10px;display:flex;position:absolute;top:4px}.Rk5X7G_tooltipDate{font-size:12px;font-weight:600;line-height:16px}.Rk5X7G_tooltipTotal,.Rk5X7G_tooltipRow{align-items:center;gap:6px;font-size:12px;line-height:16px;display:flex}.Rk5X7G_tooltipTotal .Rk5X7G_tooltipValue{font-weight:600}.Rk5X7G_tooltipName{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-secondary);flex:1;overflow:hidden}.Rk5X7G_tooltipValue{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}.Rk5X7G_trendBar{border-radius:2px;flex-direction:column;justify-content:flex-end;height:100%;display:flex;overflow:hidden}.Rk5X7G_trendSegment{flex:none;width:100%;display:block}.Rk5X7G_ticks{height:16px;color:var(--dsw-alias-label-tertiary);font-size:11px;position:relative}.Rk5X7G_ticks>span{white-space:nowrap;position:absolute;transform:translate(-50%)}.Rk5X7G_legend{color:var(--dsw-alias-label-secondary);flex-wrap:wrap;gap:6px 16px;font-size:12px;display:flex}.Rk5X7G_legendItem{align-items:center;gap:6px;display:inline-flex}.Rk5X7G_legendDot{border-radius:2px;flex:none;width:8px;height:8px}.Rk5X7G_shareLayout{align-items:center;gap:20px;display:flex}.Rk5X7G_donutWrap{flex:none;width:132px;height:132px;position:relative}.Rk5X7G_donut{width:100%;height:100%;display:block}.Rk5X7G_donut circle{transition:opacity .12s}.Rk5X7G_donutCenter{pointer-events:none;flex-direction:column;justify-content:center;align-items:center;gap:2px;display:flex;position:absolute;inset:0}.Rk5X7G_donutTotal{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);font-size:18px;font-weight:600;line-height:22px}.Rk5X7G_donutUnit{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:14px}.Rk5X7G_shareLegend{flex-direction:column;flex:1;gap:2px;min-width:0;margin:0;padding:0;list-style:none;display:flex}.Rk5X7G_shareRow{border-radius:6px;align-items:center;gap:8px;padding:3px 6px;font-size:12px;line-height:16px;display:flex}.Rk5X7G_shareRow:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)}.Rk5X7G_shareName{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-secondary);flex:1;overflow:hidden}.Rk5X7G_shareValue{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);white-space:nowrap}.Rk5X7G_sharePct{text-align:right;font-variant-numeric:tabular-nums;width:44px;color:var(--dsw-alias-label-primary);white-space:nowrap;font-weight:500}";
		const tagId = "dsh-usage-ledger/UsageSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-usage-ledger";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var UsageSection_module_css_default = {
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
			"donutTotal": "Rk5X7G_donutTotal",
			"donutUnit": "Rk5X7G_donutUnit",
			"donutWrap": "Rk5X7G_donutWrap",
			"failure": "Rk5X7G_failure",
			"header": "Rk5X7G_header",
			"headerActions": "Rk5X7G_headerActions",
			"heat": "Rk5X7G_heat",
			"heatCellL0": "Rk5X7G_heatCellL0",
			"heatCellL1": "Rk5X7G_heatCellL1",
			"heatCellL2": "Rk5X7G_heatCellL2",
			"heatCellL3": "Rk5X7G_heatCellL3",
			"heatCellL4": "Rk5X7G_heatCellL4",
			"heatCellOff": "Rk5X7G_heatCellOff",
			"heatLegend": "Rk5X7G_heatLegend",
			"heatMonths": "Rk5X7G_heatMonths",
			"legend": "Rk5X7G_legend",
			"legendDot": "Rk5X7G_legendDot",
			"legendItem": "Rk5X7G_legendItem",
			"meta": "Rk5X7G_meta",
			"rangeLabel": "Rk5X7G_rangeLabel",
			"refresh": "Rk5X7G_refresh",
			"section": "Rk5X7G_section",
			"seg": "Rk5X7G_seg",
			"segButton": "Rk5X7G_segButton",
			"shareLayout": "Rk5X7G_shareLayout",
			"shareLegend": "Rk5X7G_shareLegend",
			"shareName": "Rk5X7G_shareName",
			"sharePct": "Rk5X7G_sharePct",
			"shareRow": "Rk5X7G_shareRow",
			"shareValue": "Rk5X7G_shareValue",
			"status": "Rk5X7G_status",
			"ticks": "Rk5X7G_ticks",
			"tooltip": "Rk5X7G_tooltip",
			"tooltipDate": "Rk5X7G_tooltipDate",
			"tooltipName": "Rk5X7G_tooltipName",
			"tooltipRow": "Rk5X7G_tooltipRow",
			"tooltipTotal": "Rk5X7G_tooltipTotal",
			"tooltipValue": "Rk5X7G_tooltipValue",
			"trend": "Rk5X7G_trend",
			"trendBar": "Rk5X7G_trendBar",
			"trendColumn": "Rk5X7G_trendColumn",
			"trendFrame": "Rk5X7G_trendFrame",
			"trendSegment": "Rk5X7G_trendSegment"
		};
		//#endregion
		//#region src/client/UsageSection.tsx
		/**
		* The 数据与统计 settings section: dashboard layout — period toggle, six
		* summary cards, a GitHub-style activity heatmap, and the daily token trend
		* stacked by model. Pure read surface; data arrives over the plugin's
		* private RPC channel.
		*/
		const PERIODS = ["7d", "30d"];
		/** Categorical colors for the trend legend (mid-tone, legible on both themes). */
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
		const TREND_GAP = 2;
		/** Minimum gap (px) between adjacent tick centers: the 11px "M/D" date
		* labels stay ~30px wide, so 44px keeps them from crowding. */
		const TREND_TICK_GAP = 44;
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
		/** Render the usage dashboard section. */
		function UsageSection({ query, localeId, t }) {
			const [period, setPeriod] = (0, react.useState)("30d");
			const [request, setRequest] = (0, react.useState)(0);
			const [state, setState] = (0, react.useState)({ status: "loading" });
			/** Trend column under the pointer; drives the floating tooltip. */
			const [hovered, setHovered] = (0, react.useState)(null);
			/** Model-share donut slice under the pointer (dims the others). */
			const [shareHover, setShareHover] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let current = true;
				setState({ status: "loading" });
				query({ period }).then((result) => {
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
			}, [
				query,
				period,
				request
			]);
			const zh = localeId().startsWith("zh");
			const report = state.status === "ready" ? state.report : void 0;
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
			const trendMax = (0, react.useMemo)(() => report === void 0 ? 1 : Math.max(1, ...report.series.map((day) => day.tokens)), [report]);
			const trendTicks = (0, react.useMemo)(() => {
				if (report === void 0) return [];
				const count = report.series.length;
				if (count < 2) return [0];
				const frame = Math.min(720, count * 112 - TREND_GAP);
				const maxTicks = Math.min(7, Math.max(2, Math.floor(frame / TREND_TICK_GAP) + 1));
				const step = Math.ceil((count - 1) / (maxTicks - 1));
				const ticks = [];
				for (let index = 0; index < count - 1; index += step) ticks.push(index);
				ticks.push(count - 1);
				return ticks;
			}, [report]);
			/** Period model shares for the donut, derived from the daily series
			* (summing values[model] over the window == the period's per-model totals).
			* Long tails collapse into a single Other row; always sorted descending. */
			const modelShares = (0, react.useMemo)(() => {
				if (report === void 0) return [];
				const total = report.totals.totalTokens;
				const entries = report.models.map((model) => {
					let tokens = 0;
					for (const day of report.series) tokens += day.values[model] ?? 0;
					return {
						label: model,
						tokens,
						share: total > 0 ? tokens / total : 0
					};
				}).filter((row) => row.tokens > 0);
				if (entries.length <= SHARE_MAX_NAMED) return entries;
				const named = entries.slice(0, SHARE_MAX_NAMED);
				const restTokens = entries.slice(SHARE_MAX_NAMED).reduce((sum, row) => sum + row.tokens, 0);
				return [...named, {
					label: t("share.other"),
					tokens: restTokens,
					share: total > 0 ? restTokens / total : 0
				}];
			}, [report, t]);
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
			const inRange = hovered !== null && report !== void 0 && hovered < report.series.length;
			const hoveredDay = inRange ? report.series[hovered] : void 0;
			const hoveredRows = inRange ? report.models.map((model, index) => ({
				model,
				color: MODEL_COLORS[index % MODEL_COLORS.length],
				value: hoveredDay.values[model] ?? 0
			})).filter((row) => row.value > 0).sort((a, b) => b.value - a.value) : [];
			const hoveredLeft = inRange ? (hovered + .5) / report.series.length * 100 : 50;
			const hoveredShift = hoveredLeft < 12 ? "0%" : hoveredLeft > 88 ? "-100%" : "-50%";
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: UsageSection_module_css_default.section,
				"aria-busy": state.status === "loading",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: UsageSection_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: UsageSection_module_css_default.rangeLabel,
							children: t("range")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: UsageSection_module_css_default.headerActions,
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
									children: t(`period.${value}`)
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
					state.status === "ready" && report.totals.calls > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
						}),
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
									children: heat.columns.map((column) => column.map((cell) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cell.future ? UsageSection_module_css_default.heatCellOff : UsageSection_module_css_default[`heatCellL${cell.level}`],
										title: cell.future ? void 0 : `${heatLabel(cell.key)} · ${formatTokens(cell.tokens, zh)}`
									}, cell.key)))
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: UsageSection_module_css_default.block,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: UsageSection_module_css_default.blockHead,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										className: UsageSection_module_css_default.blockTitle,
										children: t("trend")
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: UsageSection_module_css_default.trendFrame,
									style: { width: `min(100%, ${report.series.length * 112 - TREND_GAP}px)` },
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: UsageSection_module_css_default.trend,
										onMouseLeave: () => setHovered(null),
										children: [report.series.map((day, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: UsageSection_module_css_default.trendColumn,
											"aria-label": `${heatLabel(day.day)} · ${formatTokens(day.tokens, zh)}`,
											onMouseEnter: () => setHovered(index),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: UsageSection_module_css_default.trendBar,
												children: [...report.models].reverse().map((model) => {
													const value = day.values[model] ?? 0;
													if (value === 0) return null;
													return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: UsageSection_module_css_default.trendSegment,
														style: {
															height: `${Math.max(1.5, value / trendMax * 100)}%`,
															background: MODEL_COLORS[report.models.indexOf(model) % MODEL_COLORS.length]
														}
													}, model);
												})
											})
										}, day.day)), hoveredDay !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: UsageSection_module_css_default.tooltip,
											style: {
												left: `${hoveredLeft}%`,
												transform: `translateX(${hoveredShift})`
											},
											role: "status",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: UsageSection_module_css_default.tooltipDate,
													children: heatLabel(hoveredDay.day)
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: UsageSection_module_css_default.tooltipTotal,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: UsageSection_module_css_default.tooltipName,
														children: t("tooltip.total")
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: UsageSection_module_css_default.tooltipValue,
														children: formatTokens(hoveredDay.tokens, zh)
													})]
												}),
												hoveredRows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
															children: formatTokens(row.value, zh)
														})
													]
												}, row.model))
											]
										}) : null]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: UsageSection_module_css_default.ticks,
										"aria-hidden": "true",
										children: trendTicks.map((index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: { left: `${(index + .5) / report.series.length * 100}%` },
											children: dateLabel(report.series[index].day)
										}, index))
									})]
								}),
								report.models.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: UsageSection_module_css_default.legend,
									children: report.models.map((model, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: UsageSection_module_css_default.legendItem,
										title: model,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: UsageSection_module_css_default.legendDot,
											style: { background: MODEL_COLORS[index % MODEL_COLORS.length] }
										}), labelOf(model)]
									}, model))
								}) : null
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
											onMouseEnter: () => setShareHover(index)
										}, slice.label) : null)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: UsageSection_module_css_default.donutCenter,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: UsageSection_module_css_default.donutTotal,
											children: formatTokens(report.totals.totalTokens, zh)
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
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: UsageSection_module_css_default.legendDot,
												style: { background: MODEL_COLORS[index % MODEL_COLORS.length] }
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: UsageSection_module_css_default.shareName,
												title: slice.label,
												children: labelOf(slice.label)
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: UsageSection_module_css_default.shareValue,
												children: [
													formatTokens(slice.tokens, zh),
													" ",
													t("unit.tokens")
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: UsageSection_module_css_default.sharePct,
												children: [Math.round(slice.share * 100), "%"]
											})
										]
									}, slice.label))
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: UsageSection_module_css_default.meta,
							children: [period === "7d" ? t("period.7d") : t("period.30d"), report.totals.reportedTokens !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
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
			estimatedHint: "估算为启发式(char/4),并非提供方实报数字。"
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
			estimatedHint: "Estimates use the chars/4 heuristic, not provider-reported numbers."
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