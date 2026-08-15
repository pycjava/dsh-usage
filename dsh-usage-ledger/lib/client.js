window.__ModuleLoader__.load({
	id: "dsh-usage-ledger",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:D:\project\dsh-usage\dsh-usage-ledger\src\client\UsageSection.module.css.mjs
		const css = ".v8bDAq_section{width:100%;max-width:780px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;display:flex}.v8bDAq_header{justify-content:space-between;align-items:center;gap:12px;display:flex}.v8bDAq_rangeLabel{color:var(--dsw-alias-label-secondary);font-size:13px}.v8bDAq_seg{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;gap:2px;padding:2px;display:inline-flex}.v8bDAq_segButton{color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:0 0;border:none;border-radius:6px;padding:4px 12px;font-size:12px;line-height:18px}.v8bDAq_segButton[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px #00000014}.v8bDAq_status,.v8bDAq_meta{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:20px}.v8bDAq_failure{color:var(--dsw-alias-state-error-primary);align-items:center;gap:10px;display:flex}.v8bDAq_failure button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}.v8bDAq_cards{grid-template-columns:repeat(3,1fr);gap:10px;display:grid}.v8bDAq_card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-direction:column;gap:6px;min-width:0;padding:12px 14px;display:flex}.v8bDAq_cardLabel{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;font-size:12px;line-height:16px;display:inline-flex}.v8bDAq_cardValue{font-variant-numeric:tabular-nums;font-size:24px;font-weight:600;line-height:30px}.v8bDAq_cardValueSmall{font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap;font-size:20px;font-weight:600;line-height:26px;overflow:hidden}.v8bDAq_cardSub{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}.v8bDAq_block{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-direction:column;gap:10px;padding:14px;display:flex}.v8bDAq_blockHead{justify-content:space-between;align-items:center;gap:12px;display:flex}.v8bDAq_blockTitle{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;font-weight:500}.v8bDAq_heatLegend{color:var(--dsw-alias-label-tertiary);align-items:center;gap:3px;font-size:11px;display:inline-flex}.v8bDAq_heatLegend>span{border-radius:2px;flex:none;width:10px;height:10px}.v8bDAq_heatMonths{height:14px;color:var(--dsw-alias-label-tertiary);grid-auto-columns:minmax(0,1fr);grid-auto-flow:column;gap:3px;font-size:11px;display:grid}.v8bDAq_heatMonths>span{white-space:nowrap;min-width:0;overflow:visible}.v8bDAq_heat{grid-template-rows:repeat(7,minmax(0,1fr));grid-auto-columns:minmax(0,1fr);grid-auto-flow:column;gap:3px;width:100%;display:grid}.v8bDAq_heatCellL0,.v8bDAq_heatCellL1,.v8bDAq_heatCellL2,.v8bDAq_heatCellL3,.v8bDAq_heatCellL4,.v8bDAq_heatCellOff{border-radius:2px;min-width:0;min-height:0}.v8bDAq_heatCellOff{background:0 0}.v8bDAq_heatCellL0{background:var(--dsw-alias-border-l3)}.v8bDAq_heatCellL1{background:var(--dsw-static-deepseek-100)}.v8bDAq_heatCellL2{background:var(--dsw-static-deepseek-200)}.v8bDAq_heatCellL3{background:var(--dsw-static-deepseek-300)}.v8bDAq_heatCellL4{background:var(--dsw-static-deepseek-450)}.v8bDAq_trendFrame{flex-direction:column;gap:10px;margin-inline:auto;display:flex}.v8bDAq_trend{align-items:flex-end;gap:2px;height:160px;display:flex;position:relative}.v8bDAq_trendColumn{border-radius:2px;flex-direction:column;flex:1;justify-content:flex-end;min-width:4px;max-width:110px;height:100%;display:flex}.v8bDAq_trendColumn:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)}.v8bDAq_tooltip{z-index:2;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);min-width:200px;box-shadow:var(--dsw-shadow-lv1,0 4px 16px #00000029);pointer-events:none;border-radius:8px;flex-direction:column;gap:3px;padding:8px 10px;display:flex;position:absolute;top:4px}.v8bDAq_tooltipDate{font-size:12px;font-weight:600;line-height:16px}.v8bDAq_tooltipTotal,.v8bDAq_tooltipRow{align-items:center;gap:6px;font-size:12px;line-height:16px;display:flex}.v8bDAq_tooltipTotal .v8bDAq_tooltipValue{font-weight:600}.v8bDAq_tooltipName{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-secondary);flex:1;overflow:hidden}.v8bDAq_tooltipValue{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}.v8bDAq_trendBar{border-radius:2px;flex-direction:column;justify-content:flex-end;height:100%;display:flex;overflow:hidden}.v8bDAq_trendSegment{flex:none;width:100%;display:block}.v8bDAq_ticks{height:16px;color:var(--dsw-alias-label-tertiary);font-size:11px;position:relative}.v8bDAq_ticks>span{white-space:nowrap;position:absolute;transform:translate(-50%)}.v8bDAq_legend{color:var(--dsw-alias-label-secondary);flex-wrap:wrap;gap:6px 16px;font-size:12px;display:flex}.v8bDAq_legendItem{align-items:center;gap:6px;display:inline-flex}.v8bDAq_legendDot{border-radius:2px;flex:none;width:8px;height:8px}";
		const tagId = "dsh-usage-ledger/UsageSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-usage-ledger";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var UsageSection_module_css_default = {
			"header": "v8bDAq_header",
			"tooltip": "v8bDAq_tooltip",
			"heatCellL1": "v8bDAq_heatCellL1",
			"legendDot": "v8bDAq_legendDot",
			"blockTitle": "v8bDAq_blockTitle",
			"trendFrame": "v8bDAq_trendFrame",
			"tooltipRow": "v8bDAq_tooltipRow",
			"trendBar": "v8bDAq_trendBar",
			"cardValueSmall": "v8bDAq_cardValueSmall",
			"segButton": "v8bDAq_segButton",
			"heat": "v8bDAq_heat",
			"seg": "v8bDAq_seg",
			"trendSegment": "v8bDAq_trendSegment",
			"heatCellL0": "v8bDAq_heatCellL0",
			"heatLegend": "v8bDAq_heatLegend",
			"heatMonths": "v8bDAq_heatMonths",
			"trendColumn": "v8bDAq_trendColumn",
			"tooltipDate": "v8bDAq_tooltipDate",
			"tooltipName": "v8bDAq_tooltipName",
			"ticks": "v8bDAq_ticks",
			"legendItem": "v8bDAq_legendItem",
			"blockHead": "v8bDAq_blockHead",
			"rangeLabel": "v8bDAq_rangeLabel",
			"section": "v8bDAq_section",
			"heatCellL3": "v8bDAq_heatCellL3",
			"cardValue": "v8bDAq_cardValue",
			"meta": "v8bDAq_meta",
			"heatCellL4": "v8bDAq_heatCellL4",
			"heatCellOff": "v8bDAq_heatCellOff",
			"card": "v8bDAq_card",
			"heatCellL2": "v8bDAq_heatCellL2",
			"status": "v8bDAq_status",
			"trend": "v8bDAq_trend",
			"failure": "v8bDAq_failure",
			"cardLabel": "v8bDAq_cardLabel",
			"block": "v8bDAq_block",
			"tooltipTotal": "v8bDAq_tooltipTotal",
			"tooltipValue": "v8bDAq_tooltipValue",
			"legend": "v8bDAq_legend",
			"cardSub": "v8bDAq_cardSub",
			"cards": "v8bDAq_cards"
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
			const zh = localeId.startsWith("zh");
			const report = state.status === "ready" ? state.report : void 0;
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
						const level = tokens === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(4 * tokens / max)));
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
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
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
											children: report.topModel === null ? "—" : modelShortName(report.topModel.label)
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
															children: modelShortName(row.model)
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
										}), modelShortName(model)]
									}, model))
								}) : null
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: UsageSection_module_css_default.meta,
							children: [report.label, report.totals.reportedTokens !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
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
		/** Short display name of one provider/model pair (legend + top-model card). */
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
				order: 20,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({
					query,
					localeId: localeId()
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