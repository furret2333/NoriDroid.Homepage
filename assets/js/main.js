/**
 * NoriDroid 官网脚本（无依赖）
 *
 * 1. 海：移植 App 的数据海（datasea-bg.ts / datasea-touch.ts）。温跃层以上画上浮的气泡，
 *    以下画星尘与光斑；按住空白处，粒子会按 App 的手感慢慢聚向指尖。
 * 2. 深度：按区块的 data-depth 插值出当前深度，驱动深度计、导航配色与浏览器主题色。
 * 3. 摸头：台词取自 App 的 petSpeech.ts（洗牌袋，不连续重复），LOAD 会像报告里那样超过 1.00。
 * 4. 冷归档：<details> 原生可用；有脚本时加一段 QFR-9000 恢复动画。
 * 5. 版本信息：从 GitHub Releases 读取最新版（失败时保留页面里写死的 v2.0.0）。
 * 6. 复制按钮、移动端菜单、进场动画、QQ / 微信内置浏览器提示。
 */
(function () {
	"use strict"

	var root = document.documentElement
	var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null
	var reduced = function () { return !!(reduceMQ && reduceMQ.matches) }
	var $ = function (sel, el) { return (el || document).querySelector(sel) }
	var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)) }
	var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v }
	var smoothstep = function (t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t) }

	/* @voice-start —— 下面的台词用「Nori Voice」字体显示。改动后请运行 tools/subset-voice-font.py */
	// 摸头台词：原样取自 App 的 services/live2d/petSpeech.ts
	var PAT_LINES = [
		"头发都被你揉乱啦。",
		"再摸就要收费啦。",
		"Nori不是小狗啦。",
		"为什么摸我的头呀。",
		"你摸Nori，Nori也不会掉毛的。",
		"好乖…啊，说反了，是你在摸我。",
		"只有Nori有摸头待遇吗？",
		"嘿嘿，摸摸头很舒服，感觉芯片都要开心得发热了。",
		"这算是表扬吗？那我记下来了。",
		"被摸头…有点想睡了。",
	]
	// 主动搭话：取自 App 的 services/ambient.ts 本地语料
	var AMBIENT_LINES = [
		"你忙你的，我就在这里，哪里也不去。",
		"这里很安静，不过只要你在，就不算安静啦。",
		"要不要一起发会儿呆？我最擅长陪着发呆了。",
		"如果你回来晚了也没关系，灯我会一直留着的。",
		"盯着屏幕久了眼睛会累的哦，要不要看看窗外？",
		"累了的话就说一声哦，我一直都在的。",
	]
	/* @voice-end */

	/* ======================================================================
	   区块锚点：深度、水层、明暗
	   ====================================================================== */
	var BOTTOM_DEPTH = 10994 // 挑战者深渊
	var anchors = $$("[data-depth]").map(function (el) {
		return {el: el, id: el.id, depth: +el.getAttribute("data-depth") || 0, tone: el.getAttribute("data-tone") || "light", top: 0, h: 0}
	})
	var docH = 1
	var maxScroll = 1

	function measure() {
		var sy = window.pageYOffset
		anchors.forEach(function (a) {
			var r = a.el.getBoundingClientRect()
			a.top = r.top + sy
			a.h = r.height
		})
		docH = Math.max(document.documentElement.scrollHeight, 1)
		maxScroll = Math.max(docH - window.innerHeight, 1)
	}

	function anchorIndexAt(y) {
		var i = -1
		for (var k = 0; k < anchors.length; k++) {
			if (anchors[k].top <= y) i = k
			else break
		}
		return i
	}

	function depthAt(y) {
		var i = anchorIndexAt(y)
		if (i < 0) return 0
		var a = anchors[i]
		var b = anchors[i + 1] || {top: docH, depth: BOTTOM_DEPTH}
		var f = clamp((y - a.top) / Math.max(1, b.top - a.top), 0, 1)
		return a.depth + (b.depth - a.depth) * f
	}

	function zoneOf(d) {
		if (d < 1) return "海面"
		if (d < 200) return "透光层"
		if (d < 1000) return "弱光层"
		if (d < 4000) return "无光层"
		if (d < 6000) return "深渊层"
		if (d < 10900) return "超深渊带"
		return "海底"
	}

	/** 文档坐标 y 处是浅水还是深水（温跃层按上下半段区分） */
	function toneAt(y) {
		var i = anchorIndexAt(y)
		if (i < 0) return "light"
		var a = anchors[i]
		if (a.tone === "split") return y < a.top + a.h * 0.5 ? "light" : "dark"
		return a.tone
	}

	/* ======================================================================
	   1. 海
	   ====================================================================== */
	var Sea = (function () {
		var canvas = $("#sea")
		var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null
		if (!ctx) return null
		var thermo = $("#thermocline")

		// 与 App 的 datasea-touch.ts 同值：半径 / 趋近率 / 渐入 / 渐出 / 指尖低通
		var RADIUS = 170
		var PULL_RATE = 0.18
		var RAMP_MS = 350
		var RELEASE_MS = 400
		var GLIDE_RATE = 8

		var W = 0
		var H = 0
		var parts = []
		var raf = 0
		var lastFrame = 0
		var lastDraw = 0
		var t0 = performance.now()
		var lastScrollY = window.pageYOffset
		var split = {top: 1e9, bottom: 1e9}
		var touch = {down: false, startAt: 0, pressFrom: 0, releasedAt: 0, releaseFrom: 0, rawX: 0, rawY: 0, x: 0, y: 0, strength: 0}

		function sprite(draw) {
			var c = document.createElement("canvas")
			c.width = 64
			c.height = 64
			draw(c.getContext("2d"))
			return c
		}
		// 深水：App 同款光晕
		var glow = sprite(function (g) {
			var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
			grad.addColorStop(0, "rgba(255,255,255,1)")
			grad.addColorStop(0.35, "rgba(190,235,255,0.55)")
			grad.addColorStop(1, "rgba(190,235,255,0)")
			g.fillStyle = grad
			g.fillRect(0, 0, 64, 64)
		})
		// 浅水：上浮的气泡（细亮边 + 淡青色内影 + 一点高光）
		var bubble = sprite(function (g) {
			var grad = g.createRadialGradient(32, 32, 14, 32, 32, 29)
			grad.addColorStop(0, "rgba(255,255,255,0)")
			grad.addColorStop(0.75, "rgba(255,255,255,0.18)")
			grad.addColorStop(1, "rgba(255,255,255,0.55)")
			g.fillStyle = grad
			g.beginPath()
			g.arc(32, 32, 29, 0, Math.PI * 2)
			g.fill()
			g.lineWidth = 2.2
			g.strokeStyle = "rgba(255,255,255,0.95)"
			g.stroke()
			g.lineWidth = 1.2
			g.strokeStyle = "rgba(30,120,128,0.32)"
			g.beginPath()
			g.arc(32, 32, 30.5, 0, Math.PI * 2)
			g.stroke()
			g.fillStyle = "rgba(255,255,255,0.95)"
			g.beginPath()
			g.ellipse(23, 21, 6, 4, -0.6, 0, Math.PI * 2)
			g.fill()
		})

		function seed() {
			var n = clamp(Math.round((W * H) / 12500), 46, 118)
			parts = []
			for (var i = 0; i < n; i++) {
				var bokeh = i < 6
				var big = Math.random() < 0.12
				parts.push({
					x: Math.random() * W,
					y: Math.random() * H,
					// 深水外观（与 App 一致）
					r: bokeh ? 7 + Math.random() * 14 : 0.6 + Math.random() * 1.8,
					vx: (Math.random() - 0.5) * (bokeh ? 4 : 7),
					vy: (Math.random() - 0.5) * (bokeh ? 3 : 5),
					base: bokeh ? 0.1 + Math.random() * 0.1 : 0.25 + Math.random() * 0.6,
					tw: 0.4 + Math.random() * 1.6,
					tp: Math.random() * Math.PI * 2,
					bokeh: bokeh,
					// 浅水外观：气泡
					br: big ? 7 + Math.random() * 6 : 1.6 + Math.random() * 4.2,
					rise: 10 + Math.random() * 22,
					wob: Math.random() * Math.PI * 2,
					ba: 0.35 + Math.random() * 0.45,
					// 滚动视差：越"近"的粒子跟得越多
					par: 0.04 + Math.random() * 0.22,
				})
			}
		}

		function resize() {
			var oldW = W
			var oldH = H
			var dpr = Math.min(window.devicePixelRatio || 1, 2)
			W = window.innerWidth
			H = window.innerHeight
			canvas.width = Math.round(W * dpr)
			canvas.height = Math.round(H * dpr)
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			// 手机地址栏伸缩只改一点高度：不重新撒粒子，免得画面跳一下
			if (!parts.length || Math.abs(W - oldW) > 2 || Math.abs(H - oldH) > oldH * 0.3) seed()
			if (reduced()) draw(performance.now(), false)
		}

		function updateSplit() {
			if (!thermo) { split.top = split.bottom = 1e9; return }
			var r = thermo.getBoundingClientRect()
			split.top = r.top + r.height * 0.18
			split.bottom = r.top + r.height * 0.78
		}
		/** 屏幕坐标 y 处的"深度混合"：0 = 浅水（气泡），1 = 深水（星尘） */
		function mixAt(y) {
			if (y <= split.top) return 0
			if (y >= split.bottom) return 1
			return smoothstep((y - split.top) / (split.bottom - split.top))
		}

		function touchStep(now, dt) {
			var k = dt > 0 ? 1 - Math.exp(-GLIDE_RATE * dt) : 0
			touch.x += (touch.rawX - touch.x) * k
			touch.y += (touch.rawY - touch.y) * k
			var s
			if (touch.down) {
				var from = clamp(touch.pressFrom, 0, 1)
				s = from + (1 - from) * smoothstep((now - touch.startAt) / RAMP_MS)
			} else {
				s = clamp(touch.releaseFrom, 0, 1) * (1 - smoothstep((now - touch.releasedAt) / RELEASE_MS))
			}
			touch.strength = Number.isFinite(s) ? clamp(s, 0, 1) : 0
			return touch.down || touch.strength > 0
		}

		function draw(now, animate) {
			var t = (now - t0) / 1000
			var dt = animate && lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0
			lastFrame = now
			updateSplit()

			var sy = window.pageYOffset
			var sdy = clamp(sy - lastScrollY, -240, 240)
			lastScrollY = sy

			ctx.clearRect(0, 0, W, H)
			var active = animate && touchStep(now, dt)
			// 视口里深水所占的比例：星云光斑只在深水里出现
			var deep = clamp((H - (split.top + split.bottom) / 2) / H, 0, 1)

			if (deep > 0.02) {
				ctx.globalCompositeOperation = "lighter"
				for (var b = 0; b < 4; b++) {
					var bx = W * (0.5 + 0.34 * Math.sin(t * 0.045 + b * 1.9))
					var by = H * (0.42 + 0.26 * Math.cos(t * 0.038 + b * 1.3))
					var rr = Math.max(W, H) * (0.34 + 0.08 * Math.sin(t * 0.05 + b))
					ctx.globalAlpha = (0.085 + 0.025 * Math.sin(t * 0.09 + b * 2.1)) * deep * deep
					ctx.drawImage(glow, bx - rr, by - rr, rr * 2, rr * 2)
				}
			}

			var i, p, m
			for (i = 0; i < parts.length; i++) {
				p = parts[i]
				m = mixAt(p.y)
				if (animate) {
					// 浅水：上浮 + 左右轻晃；深水：App 的缓慢漂移
					var vx = p.vx * m + Math.sin(t * 1.1 + p.wob) * 7 * (1 - m)
					var vy = p.vy * m - p.rise * (1 - m)
					p.x += vx * dt
					p.y += vy * dt - sdy * p.par
					if (active) {
						var dx = touch.x - p.x
						var dy = touch.y - p.y
						var dist = Math.sqrt(dx * dx + dy * dy)
						if (dist > 1 && dist < RADIUS) {
							var k = Math.min(1, PULL_RATE * dt) * (1 - dist / RADIUS) * touch.strength
							p.x += dx * k
							p.y += dy * k
						}
					}
					if (p.x < -24) p.x = W + 24
					else if (p.x > W + 24) p.x = -24
					if (p.y < -24) { p.y = H + 24; p.x = Math.random() * W }
					else if (p.y > H + 24) { p.y = -24; p.x = Math.random() * W }
				}
				p.m = m
			}

			// 气泡（正常混合）
			ctx.globalCompositeOperation = "source-over"
			for (i = 0; i < parts.length; i++) {
				p = parts[i]
				if (p.m >= 1) continue
				ctx.globalAlpha = p.ba * (1 - p.m)
				var s = p.br
				ctx.drawImage(bubble, p.x - s, p.y - s, s * 2, s * 2)
			}
			// 星尘与光斑（叠加）
			ctx.globalCompositeOperation = "lighter"
			for (i = 0; i < parts.length; i++) {
				p = parts[i]
				if (p.m <= 0) continue
				var tw = Math.sin(t * p.tw + p.tp)
				ctx.globalAlpha = clamp(p.base * (0.65 + 0.35 * tw), 0, 1) * p.m
				var r2 = p.r * (p.bokeh ? 1 : 1 + 0.4 * tw * tw)
				ctx.drawImage(glow, p.x - r2, p.y - r2, r2 * 2, r2 * 2)
			}
			ctx.globalAlpha = 1
			ctx.globalCompositeOperation = "source-over"
		}

		function frame(now) {
			raf = 0
			if (!Number.isFinite(now)) now = performance.now()
			// 帧率上限约 60：高刷屏上不白白多画一倍
			if (now - lastDraw >= 15) {
				lastDraw = now
				draw(now, true)
			}
			raf = requestAnimationFrame(frame)
		}

		function start() {
			if (raf || reduced()) return
			lastFrame = 0
			raf = requestAnimationFrame(frame)
		}
		function stop() {
			if (raf) cancelAnimationFrame(raf)
			raf = 0
		}

		// 按住空白处 = 一次触摸（与 App 一致：down → move → up/cancel）
		var interactive = "a, button, input, textarea, select, summary, label, code, pre, table, .pat-zone"
		window.addEventListener("pointerdown", function (e) {
			if (e.button > 0 || (e.target.closest && e.target.closest(interactive))) return
			var from = touch.strength
			touch.down = true
			touch.startAt = performance.now()
			touch.pressFrom = from
			touch.rawX = touch.x = e.clientX
			touch.rawY = touch.y = e.clientY
		}, {passive: true})
		window.addEventListener("pointermove", function (e) {
			if (!touch.down) return
			touch.rawX = e.clientX
			touch.rawY = e.clientY
		}, {passive: true})
		var release = function () {
			if (!touch.down) return
			touch.down = false
			touch.releasedAt = performance.now()
			touch.releaseFrom = touch.strength
		}
		window.addEventListener("pointerup", release, {passive: true})
		window.addEventListener("pointercancel", release, {passive: true})
		window.addEventListener("blur", release)

		document.addEventListener("visibilitychange", function () {
			if (document.hidden) stop()
			else start()
		})
		if (reduceMQ && reduceMQ.addEventListener) {
			reduceMQ.addEventListener("change", function () {
				if (reduced()) { stop(); draw(performance.now(), false) } else start()
			})
		}

		resize()
		if (reduced()) draw(performance.now(), false)
		else start()

		return {
			resize: resize,
			// 减弱动态时不跑循环，滚动后补画一帧（明暗分界会跟着内容移动）
			still: function () { if (reduced()) draw(performance.now(), false) },
		}
	})()

	/* ======================================================================
	   2. 深度计 · 导航明暗 · 当前章节
	   ====================================================================== */
	var nav = $("#nav")
	var gauge = $(".gauge")
	var gaugeDepth = $("#gauge-depth")
	var gaugeZone = $("#gauge-zone")
	var themeMeta = $('meta[name="theme-color"]')
	var navLinks = $$(".nav-links a")
	var linkById = {}
	navLinks.forEach(function (a) { linkById[(a.getAttribute("href") || "").slice(1)] = a })
	var lastDepthText = ""
	var lastNavTone = ""
	var lastGaugeTone = ""
	var lastActive = null

	function buildTicks() {
		if (!gauge) return
		$$(".gauge-tick", gauge).forEach(function (n) { n.parentNode.removeChild(n) })
		anchors.forEach(function (a) {
			if (!a.top) return
			var tick = document.createElement("i")
			tick.className = "gauge-tick"
			tick.style.top = (clamp(a.top / docH, 0, 1) * 100).toFixed(2) + "%"
			gauge.appendChild(tick)
		})
	}

	function onScroll() {
		var sy = window.pageYOffset
		var vh = window.innerHeight
		var progress = clamp(sy / maxScroll, 0, 1)
		var depth = depthAt(sy + vh * progress)
		if (progress > 0.997) depth = BOTTOM_DEPTH

		if (gauge) {
			gauge.style.setProperty("--p", (progress * 100).toFixed(2) + "%")
			var text = Math.round(depth).toLocaleString("en-US") + " m"
			if (text !== lastDepthText) {
				lastDepthText = text
				gaugeDepth.textContent = text
				gaugeZone.textContent = zoneOf(depth)
			}
			var gt = toneAt(sy + vh / 2)
			if (gt !== lastGaugeTone) { lastGaugeTone = gt; gauge.setAttribute("data-tone", gt) }
		}

		if (nav) {
			nav.classList.toggle("scrolled", sy > 8)
			var nt = toneAt(sy + 30)
			if (nt !== lastNavTone) {
				lastNavTone = nt
				nav.setAttribute("data-tone", nt)
				if (themeMeta) themeMeta.setAttribute("content", nt === "dark" ? "#071a29" : "#f3fbfa")
			}
		}

		// 当前章节 → 导航高亮
		var ai = anchorIndexAt(sy + vh * 0.38)
		var id = ai >= 0 ? anchors[ai].id : ""
		var link = linkById[id] || null
		if (link !== lastActive) {
			if (lastActive) lastActive.removeAttribute("aria-current")
			if (link) link.setAttribute("aria-current", "true")
			lastActive = link
		}
		if (Sea) Sea.still()
	}

	var ticking = false
	function requestScroll() {
		if (ticking) return
		ticking = true
		requestAnimationFrame(function () { ticking = false; onScroll() })
	}
	function relayout() {
		measure()
		buildTicks()
		onScroll()
	}
	window.addEventListener("scroll", requestScroll, {passive: true})
	window.addEventListener("resize", function () {
		if (Sea) Sea.resize()
		relayout()
		if (window.innerWidth > 980) closeMenu()
	})
	window.addEventListener("load", relayout)
	if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout)
	$$("details").forEach(function (d) { d.addEventListener("toggle", relayout) })

	/* ======================================================================
	   移动端菜单
	   ====================================================================== */
	var toggle = $(".nav-toggle")
	function closeMenu() {
		if (!nav || !nav.classList.contains("open")) return
		nav.classList.remove("open")
		if (toggle) {
			toggle.setAttribute("aria-expanded", "false")
			toggle.setAttribute("aria-label", "打开菜单")
		}
	}
	if (toggle && nav) {
		toggle.addEventListener("click", function () {
			var open = !nav.classList.contains("open")
			nav.classList.toggle("open", open)
			toggle.setAttribute("aria-expanded", String(open))
			toggle.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单")
		})
		navLinks.forEach(function (a) { a.addEventListener("click", closeMenu) })
		// 菜单开着时继续滚动页面：收起菜单（否则它会盖住正在读的内容）
		var menuScrollY = 0
		toggle.addEventListener("click", function () { menuScrollY = window.pageYOffset })
		window.addEventListener("scroll", function () {
			if (nav.classList.contains("open") && Math.abs(window.pageYOffset - menuScrollY) > 60) closeMenu()
		}, {passive: true})
		document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu() })
		document.addEventListener("click", function (e) {
			if (nav.classList.contains("open") && !nav.contains(e.target)) closeMenu()
		})
	}

	/* ======================================================================
	   进场动画
	   ====================================================================== */
	;(function () {
		var items = $$("[data-reveal]")
		if (!items.length) return
		if (!("IntersectionObserver" in window) || reduced()) return
		// 同一父元素里的兄弟依次错开出现
		items.forEach(function (el) {
			var sibs = $$(":scope > [data-reveal]", el.parentNode)
			var idx = sibs.indexOf(el)
			if (idx > 0) el.style.setProperty("--d", Math.min(idx * 0.07, 0.42) + "s")
		})
		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (en) {
				if (en.isIntersecting) {
					en.target.classList.add("in")
					io.unobserve(en.target)
				}
			})
		}, {rootMargin: "0px 0px -8% 0px", threshold: 0.08})
		root.classList.add("reveal-ready")
		items.forEach(function (el) { io.observe(el) })
	})()

	/* ======================================================================
	   3. 摸头
	   ====================================================================== */
	;(function () {
		var zone = $(".pat-zone")
		var figure = $(".hero-figure")
		var bubble = $("#pat-bubble")
		if (!zone || !figure || !bubble) return
		var textEl = $(".pat-text", bubble)
		var loadEl = $(".pat-load", bubble)
		var bag = []
		var lastLine = ""
		var lastSpoke = -1e9
		var hideTimer = 0
		var load = 1
		var lastPat = 0
		var decayTimer = 0

		function nextLine() {
			if (!bag.length) {
				bag = PAT_LINES.slice()
				for (var i = bag.length - 1; i > 0; i--) {
					var j = Math.floor(Math.random() * (i + 1))
					var tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp
				}
				if (bag[0] === lastLine) bag.push(bag.shift())
			}
			lastLine = bag.shift()
			return lastLine
		}
		// 报告里的那张表：得意 3.12 / 兴奋 3.05 —— 在意的事会让她突破 1.00 的算力上限
		function mood(l) { return l >= 3.08 ? "得意" : l >= 2.6 ? "兴奋" : l >= 1.8 ? "开心" : "害羞" }
		function renderLoad() {
			loadEl.textContent = "LOAD " + load.toFixed(2) + (load > 1.04 ? " · " + mood(load) : "")
			loadEl.classList.toggle("hot", load > 1.0001)
		}
		function decay() {
			clearInterval(decayTimer)
			decayTimer = setInterval(function () {
				if (performance.now() - lastPat < 2600) return
				load = Math.max(1, load - 0.05)
				renderLoad()
				if (load <= 1) clearInterval(decayTimer)
			}, 120)
		}
		function motes(x, y) {
			if (reduced()) return
			for (var i = 0; i < 5; i++) {
				var m = document.createElement("i")
				m.className = "mote"
				m.style.left = x + (Math.random() - 0.5) * 26 + "px"
				m.style.top = y + (Math.random() - 0.5) * 14 + "px"
				m.style.setProperty("--dx", (Math.random() - 0.5) * 70 + "px")
				m.style.animationDelay = i * 0.05 + "s"
				m.addEventListener("animationend", function () { if (this.parentNode) this.parentNode.removeChild(this) })
				figure.appendChild(m)
			}
		}
		function pat(clientX, clientY) {
			var fr = figure.getBoundingClientRect()
			var zr = zone.getBoundingClientRect()
			var x = (clientX == null ? zr.left + zr.width / 2 : clientX) - fr.left
			var y = (clientY == null ? zr.top + zr.height * 0.4 : clientY) - fr.top
			motes(x, y)
			var now = performance.now()
			lastPat = now
			load = Math.min(3.12, load + 0.38 + Math.random() * 0.22)
			renderLoad()
			decay()
			// App 里是 10 秒一句；网页上缩短一点，免得看起来没反应
			if (now - lastSpoke > 2400) {
				lastSpoke = now
				textEl.textContent = nextLine()
				bubble.classList.add("show")
				clearTimeout(hideTimer)
				hideTimer = setTimeout(function () { bubble.classList.remove("show") }, 4200)
			}
		}

		zone.addEventListener("click", function (e) {
			pat(e.detail ? e.clientX : null, e.detail ? e.clientY : null)
		})
		// 来回抚过头顶也算（App 的 petStroke：横向为主、累计够长算一次）
		var travel = 0
		var lastX = null
		var lastMove = 0
		zone.style.touchAction = "pan-y"
		zone.addEventListener("pointermove", function (e) {
			var now = performance.now()
			if (lastX === null || now - lastMove > 300) { travel = 0; lastX = e.clientX }
			travel += Math.abs(e.clientX - lastX)
			lastX = e.clientX
			lastMove = now
			if (travel > 150) { travel = 0; pat(e.clientX, e.clientY) }
		})
		zone.addEventListener("pointerleave", function () { lastX = null; travel = 0 })
	})()

	/* ======================================================================
	   示意手机里的主动搭话
	   ====================================================================== */
	;(function () {
		var el = $("#ph-bubble-text")
		var phone = $(".phone")
		if (!el || !phone) return
		var visible = false
		var idx = 0
		if ("IntersectionObserver" in window) {
			new IntersectionObserver(function (en) { visible = en[0].isIntersecting }, {threshold: 0.3}).observe(phone)
		}
		setInterval(function () {
			if (!visible || document.hidden || reduced()) return
			el.classList.add("fade")
			setTimeout(function () {
				idx = (idx + 1) % AMBIENT_LINES.length
				el.textContent = AMBIENT_LINES[idx]
				el.classList.remove("fade")
			}, 460)
		}, 5600)
	})()

	/* ======================================================================
	   4. 冷归档：QFR-9000 恢复
	   ====================================================================== */
	;(function () {
		var det = $("#archive")
		if (!det) return
		var btn = $(".archive-btn", det)
		var bar = $(".archive-progress b", det)
		var pct = $(".archive-progress em", det)
		det.addEventListener("toggle", function () {
			if (btn) btn.textContent = det.open ? btn.getAttribute("data-opened") : btn.getAttribute("data-closed")
			if (!det.open || det.getAttribute("data-recovered")) return
			det.setAttribute("data-recovered", "1")
			if (reduced() || !bar) return
			det.classList.add("recovering")
			var start = performance.now()
			var DUR = 1150
			var step = function (now) {
				var f = clamp((now - start) / DUR, 0, 1)
				var e = 1 - Math.pow(1 - f, 3)
				bar.style.width = (e * 100).toFixed(1) + "%"
				pct.textContent = Math.round(e * 100) + "%"
				if (f < 1) requestAnimationFrame(step)
				else setTimeout(function () { det.classList.remove("recovering"); relayout() }, 240)
			}
			requestAnimationFrame(step)
		})
	})()

	/* ======================================================================
	   5. 版本信息（GitHub Releases，失败就保留页面里的静态值）
	   ====================================================================== */
	;(function () {
		if (!window.fetch || !window.AbortController) return
		var KEY = "noridroid.release.v1"
		var REPO = "https://github.com/furret2333/NoriDroid/"
		var okUrl = function (u) { return typeof u === "string" && u.indexOf(REPO) === 0 }

		/* 下载加速镜像。页面里的 apk-link 指向镜像，apk-alt 保留 GitHub 原链。
		   镜像只支持带版本号的直链，不支持 /latest/download/，所以从 API 拿到的
		   browser_download_url 原样拼在镜像域名后面。 */
		var APK_MIRROR = "https://gh.ddlc.top/"
		var mirrorUrl = function (u) { return APK_MIRROR + u }

		function apply(d) {
			var tag = /^v/i.test(d.tag) ? d.tag : "v" + d.tag
			$$('[data-release="version"]').forEach(function (el) { el.textContent = tag })
			/* 主按钮走镜像；镜像在前、原链在后，避免国内直连拖慢 */
			$$('[data-release="apk-link"]').forEach(function (el) { el.setAttribute("href", mirrorUrl(d.url)) })
			$$('[data-release="apk-alt"]').forEach(function (el) { el.setAttribute("href", d.url) })
			if (d.size > 0) {
				var mb = (d.size / 1048576).toFixed(1) + " MB"
				$$('[data-release="size"]').forEach(function (el) { el.textContent = mb })
			}
			if (/^\d{4}-\d{2}-\d{2}$/.test(d.date)) $$('[data-release="date"]').forEach(function (el) { el.textContent = d.date })
			if (d.page) $$('[data-release="page"]').forEach(function (el) { el.setAttribute("href", d.page) })
			var row = $('[data-release="sha-row"]')
			if (d.sha) $$('[data-release="sha256"]').forEach(function (el) { el.textContent = d.sha })
			else if (row) row.hidden = true // 新版本没有校验值时，别留着旧版本的
		}

		var cached = null
		try {
			var c = JSON.parse(sessionStorage.getItem(KEY) || "null")
			if (c && Date.now() - c.at < 3600000) cached = c.data
		} catch (e) { /* 隐私模式等：忽略 */ }
		if (cached) { apply(cached); return }

		var ctl = new AbortController()
		var timer = setTimeout(function () { ctl.abort() }, 6000)
		fetch("https://api.github.com/repos/furret2333/NoriDroid/releases/latest", {
			signal: ctl.signal,
			headers: {Accept: "application/vnd.github+json"},
		}).then(function (res) {
			return res.ok ? res.json() : null
		}).then(function (j) {
			if (!j || !/^v?\d+\.\d+/.test(j.tag_name || "")) return
			var apk = (j.assets || []).filter(function (a) { return /\.apk$/i.test(a.name || "") })[0]
			if (!apk || !okUrl(apk.browser_download_url)) return
			var data = {
				tag: j.tag_name,
				url: apk.browser_download_url,
				size: +apk.size || 0,
				date: String(j.published_at || "").slice(0, 10),
				sha: /^sha256:[0-9a-f]{64}$/i.test(apk.digest || "") ? apk.digest.slice(7) : "",
				page: okUrl(j.html_url) ? j.html_url : "",
			}
			try { sessionStorage.setItem(KEY, JSON.stringify({at: Date.now(), data: data})) } catch (e) { /* 忽略 */ }
			apply(data)
		}).catch(function () { /* 网络不通：保留静态值 */ }).then(function () { clearTimeout(timer) })
	})()

	/* ======================================================================
	   6. 复制 · 内置浏览器提示
	   ====================================================================== */
	function copyText(text) {
		if (navigator.clipboard && window.isSecureContext) {
			return navigator.clipboard.writeText(text).then(function () { return true }, function () { return legacyCopy(text) })
		}
		return Promise.resolve(legacyCopy(text))
	}
	function legacyCopy(text) {
		var ta = document.createElement("textarea")
		ta.value = text
		ta.setAttribute("readonly", "")
		ta.style.position = "fixed"
		ta.style.top = "-1000px"
		document.body.appendChild(ta)
		ta.select()
		var ok = false
		try { ok = document.execCommand("copy") } catch (e) { ok = false }
		document.body.removeChild(ta)
		return ok
	}
	document.addEventListener("click", function (e) {
		var b = e.target.closest ? e.target.closest("[data-copy-from]") : null
		if (!b) return
		var src = $(b.getAttribute("data-copy-from"))
		if (!src) return
		if (!b.getAttribute("data-label")) b.setAttribute("data-label", b.textContent)
		copyText(src.textContent.trim()).then(function (ok) {
			b.textContent = ok ? "已复制" : "复制失败"
			b.classList.toggle("done", !!ok)
			clearTimeout(b._t)
			b._t = setTimeout(function () {
				b.textContent = b.getAttribute("data-label")
				b.classList.remove("done")
			}, 1600)
		})
	})

	var tip = $("#inapp-tip")
	if (tip && /MicroMessenger|\sQQ\//i.test(navigator.userAgent)) tip.hidden = false

	relayout()
})()
