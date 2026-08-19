/* ==========================================================================
   OpsDesk Knowledge Base — graph rendering (canvas + d3-force).

   Exposes window.OpsDesk.graph with:
     renderGraph(canvas, nodes, edges, opts)
     renderLocalGraph(canvas, nodes, edges, opts)

   opts = {
     onSelect(id),          // called on double-click of a node
     highlightTerm,         // string — nodes whose title contains it get a bright stroke
     folderFilter,          // folder id — non-matching nodes are dimmed
     tagFilter,             // tag string — non-matching nodes are dimmed
     colorBy: "folder"|"tag",
   }
   ========================================================================== */
(function () {
  "use strict";
  window.OpsDesk = window.OpsDesk || {};
  const OD = window.OpsDesk;

  const PALETTE = [
    "#003d9b", "#7b2600", "#1f7a3d", "#9a6700", "#5b3fb0",
    "#0a7ea4", "#b3266e", "#3d5a00", "#a33300", "#1f6f8b",
  ];

  function getCtx(canvas) {
    return canvas.getContext("2d");
  }

  // Build a stable color per folder (or tag) id.
  function colorFor(nodes, opts) {
    const map = new Map();
    let i = 0;
    const keyOf = (n) => {
      if (opts && opts.colorBy === "tag" && n.tags && n.tags.length) return "t:" + n.tags[0];
      return "f:" + (n.folder_id != null ? n.folder_id : "none");
    };
    nodes.forEach((n) => {
      const k = keyOf(n);
      if (!map.has(k)) { map.set(k, PALETTE[i % PALETTE.length]); i++; }
      n._color = map.get(k);
    });
  }

  function draw(canvas, rawNodes, rawEdges, opts) {
    opts = opts || {};
    const ctx = getCtx(canvas);
    const dpr = window.devicePixelRatio || 1;
    let W = canvas.clientWidth || canvas.width || 600;
    let H = canvas.clientHeight || canvas.height || 400;

    // Clone so repeated renders don't corrupt d3's internal fields.
    const nodes = rawNodes.map((n) => Object.assign({}, n));
    const edges = rawEdges.map((e) => Object.assign({}, e));

    nodes.forEach((n) => { n.r = 3 + Math.sqrt(n.link_count || 0) * 2; });
    colorFor(nodes, opts);

    let transform = { x: 0, y: 0, k: 1 };

    function sizeCanvas() {
      W = canvas.clientWidth || W;
      H = canvas.clientHeight || H;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    sizeCanvas();

    const sim = d3.forceSimulation(nodes)
      .force("charge", d3.forceManyBody().strength(-150))
      .force("link", d3.forceLink(edges).id((d) => d.id).distance(80))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide().radius((d) => d.r + 4));

    function matches(n) {
      if (opts.folderFilter != null && n.folder_id != null && n.folder_id !== opts.folderFilter) return false;
      if (opts.tagFilter && (!n.tags || !n.tags.includes(opts.tagFilter))) return false;
      return true;
    }
    function isHighlight(n) {
      if (!opts.highlightTerm) return false;
      return (n.title || "").toLowerCase().includes(String(opts.highlightTerm).toLowerCase());
    }

    function paint() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);
      ctx.lineWidth = 1 / transform.k;

      // edges
      edges.forEach((e) => {
        if (e.source.x == null || e.target.x == null) return;
        const ok = matches(e.source) && matches(e.target);
        ctx.strokeStyle = ok ? "rgba(120,130,160,0.35)" : "rgba(120,130,160,0.08)";
        ctx.beginPath();
        ctx.moveTo(e.source.x, e.source.y);
        ctx.lineTo(e.target.x, e.target.y);
        ctx.stroke();
      });

      // nodes
      nodes.forEach((n) => {
        if (n.x == null) return;
        const ok = matches(n);
        const hi = isHighlight(n);
        ctx.globalAlpha = ok ? 1 : 0.18;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n._color || "#888";
        ctx.fill();
        if (hi) {
          ctx.lineWidth = 3 / transform.k;
          ctx.strokeStyle = "#ffd54a";
          ctx.stroke();
        } else {
          ctx.lineWidth = 1 / transform.k;
          ctx.strokeStyle = "rgba(255,255,255,0.7)";
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
      ctx.restore();
    }

    sim.on("tick", paint);

    // ---- interaction: wheel zoom + drag/pan ----
    function toWorld(ev) {
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      return { x: (sx - transform.x) / transform.k, y: (sy - transform.y) / transform.k, sx, sy };
    }
    function nodeAt(ev) {
      const p = toWorld(ev);
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.x == null) continue;
        const dx = n.x - p.x, dy = n.y - p.y;
        if (dx * dx + dy * dy <= (n.r + 3) * (n.r + 3)) return n;
      }
      return null;
    }

    let dragNode = null;
    let panning = false;
    let last = null;

    canvas.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
      const nk = Math.max(0.2, Math.min(4, transform.k * factor));
      // keep point under cursor stationary
      transform.x = mx - (mx - transform.x) * (nk / transform.k);
      transform.y = my - (my - transform.y) * (nk / transform.k);
      transform.k = nk;
      paint();
    }, { passive: false });

    canvas.addEventListener("mousedown", (ev) => {
      const n = nodeAt(ev);
      if (n) {
        dragNode = n;
        n.fx = n.x; n.fy = n.y;
      } else {
        panning = true;
        const p = toWorld(ev);
        last = p;
      }
    });
    window.addEventListener("mousemove", (ev) => {
      if (dragNode) {
        const p = toWorld(ev);
        dragNode.fx = p.x; dragNode.fy = p.y;
      } else if (panning) {
        const p = toWorld(ev);
        transform.x += (p.x - last.x) * transform.k;
        transform.y += (p.y - last.y) * transform.k;
        paint();
      }
    });
    window.addEventListener("mouseup", () => {
      if (dragNode) { dragNode.fx = null; dragNode.fy = null; dragNode = null; sim.alphaTarget(0.3).restart(); }
      panning = false;
    });
    canvas.addEventListener("dblclick", (ev) => {
      const n = nodeAt(ev);
      if (n && typeof opts.onSelect === "function") opts.onSelect(n.id);
    });

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => { sizeCanvas(); sim.force("center", d3.forceCenter(W / 2, H / 2)); sim.alpha(0.2).restart(); });
      ro.observe(canvas);
    }

    return {
      destroy() { sim.stop(); },
      recenter() { transform = { x: 0, y: 0, k: 1 }; paint(); },
    };
  }

  OD.graph = {
    renderGraph: (canvas, nodes, edges, opts) => draw(canvas, nodes, edges, opts),
    renderLocalGraph: (canvas, nodes, edges, opts) => draw(canvas, nodes, edges, opts),
  };
})();
