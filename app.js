// =================================================================
// Main app — MA choropleth, scatter, and 15-yr trend line chart
// =================================================================
(async function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const D = window.MA_DATA;

  // ============ Load MA county GeoJSON ============
  const R = (window.__resources || {});
  const maGeo = await fetch(R.maCounties || 'data/ma-counties.json').then(r => r.json());
  const maState = await fetch(R.maState || 'data/ma-state.json').then(r => r.json());

  const W = 760, H = 460;
  const proj = d3.geoMercator().fitSize([W - 40, H - 40], maGeo);
  const tx = 20, ty = 20;
  const path = d3.geoPath(proj);

  // Domains from real data
  const obesityDomain = [22, 32];
  const incomeDomain = [115_000, 60_000];
  const ffDomain = [0.40, 1.60];

  // Colorblind-safe sequential scales (Okabe-Ito-aligned ramps)
  const obesityScale = d3.scaleSequential().domain(obesityDomain)
    .interpolator(d3.interpolateLab('#fff1d9', '#7a3500')); // yellow → vermillion-brown
  const incomeScale = d3.scaleSequential().domain(incomeDomain)
    .interpolator(d3.interpolateLab('#e6eef5', '#0a3e6e')); // light → deep blue
  const ffScale = d3.scaleSequential().domain(ffDomain)
    .interpolator(d3.interpolateLab('#f5e7ef', '#742862')); // light → reddish purple

  let activeLayer = 'obesity';
  let pinnedId = null;
  let povThreshold = 0;
  let brushedIds = new Set();

  // ============ MA map render ============
  const mapSvg = d3.select('#ma-map').attr('viewBox', `0 0 ${W} ${H}`);
  const mapG = mapSvg.append('g').attr('transform', `translate(${tx}, ${ty})`);

  const countyG = mapG.append('g').attr('class', 'counties');
  countyG.selectAll('path')
    .data(maGeo.features)
    .join('path')
    .attr('class', 'county')
    .attr('d', path)
    .attr('data-id', d => d.id)
    .on('mouseenter', function (evt, d) {
      d3.select(this).classed('is-hover', true);
      syncHoverScatter(d.id, true);
      syncHoverTrend(d.id, true);
      showTip(evt, d);
    })
    .on('mousemove', function (evt, d) { showTip(evt, d); })
    .on('mouseleave', function (evt, d) {
      d3.select(this).classed('is-hover', false);
      syncHoverScatter(d.id, false);
      syncHoverTrend(d.id, false);
      hideTip();
    })
    .on('click', function (evt, d) {
      pinnedId = (pinnedId === d.id) ? null : d.id;
      updatePin();
    });

  mapG.append('path').datum(maState).attr('class', 'state-outline').attr('d', path);

  // ============ Labels — counties that fit inside get a centroid label,
  // small/cramped ones get an outside label with a leader line. ============
  const labels = mapG.append('g').attr('class', 'labels');
  const leaders = mapG.append('g').attr('class', 'leaders');
  // [dx, dy] in svg units from centroid. Counties not in this map → centroid label.
  const LEADER_OFFSETS = {
    'Dukes':     [-36, 22],   // Martha's Vineyard — label SW into open ocean
    'Nantucket': [-36,-18],   // far island — label NW so it stays in frame
    'Suffolk':   [ 58,-22],   // Boston — push NE into open space
  };
  const featByName = Object.fromEntries(maGeo.features.map(f => [D[f.id].name, f]));

  function drawLabels() {
    labels.selectAll('text').remove();
    leaders.selectAll('*').remove();
    for (const f of maGeo.features) {
      const name = D[f.id].name;
      const [cx, cy] = path.centroid(f);
      const off = LEADER_OFFSETS[name];
      if (off) {
        const [lx, ly] = [cx + off[0], cy + off[1]];
        leaders.append('line').attr('class', 'label-leader')
          .attr('x1', cx).attr('y1', cy).attr('x2', lx).attr('y2', ly);
        leaders.append('circle').attr('class', 'label-leader-dot')
          .attr('cx', cx).attr('cy', cy).attr('r', 1.6);
        labels.append('text')
          .attr('class', 'county-label')
          .attr('data-id', f.id)
          .style('font-size', '9px')
          .attr('text-anchor', off[0] > 4 ? 'start' : off[0] < -4 ? 'end' : 'middle')
          .attr('x', lx + (off[0] > 4 ? 3 : off[0] < -4 ? -3 : 0))
          .attr('y', ly)
          .attr('dy', '0.32em')
          .text(name);
      } else {
        labels.append('text')
          .attr('class', 'county-label')
          .attr('data-id', f.id)
          .style('font-size', '10px')
          .attr('text-anchor', 'middle')
          .attr('x', cx).attr('y', cy).attr('dy', '0.32em')
          .text(name);
      }
    }
  }
  drawLabels();

  // ============ Legend ============
  function renderLegend() {
    const legend = $('#map-legend');
    let title, scale, ticks;
    if (activeLayer === 'obesity') {
      title = 'Adult obesity (%)';
      scale = d3.range(0, 8).map(i => obesityScale(obesityDomain[0] + (obesityDomain[1] - obesityDomain[0]) * i / 7));
      ticks = [`${obesityDomain[0]}%`, `${obesityDomain[1]}%`];
    } else if (activeLayer === 'income') {
      title = 'Median household income';
      scale = d3.range(0, 8).map(i => incomeScale(60_000 + (115_000 - 60_000) * i / 7));
      ticks = ['$60k', '$115k'];
    } else {
      title = 'Fast food per 1,000 residents';
      scale = d3.range(0, 8).map(i => ffScale(ffDomain[0] + (ffDomain[1] - ffDomain[0]) * i / 7));
      ticks = [ffDomain[0].toFixed(2), ffDomain[1].toFixed(2)];
    }
    legend.innerHTML = `
      <div class="lg-title">${title}</div>
      <div class="lg-scale">${scale.map(c => `<div style="background:${c}"></div>`).join('')}</div>
      <div class="lg-ticks"><span>${ticks[0]}</span><span>${ticks[1]}</span></div>`;
  }

  function applyLayer() {
    const fillFn = d => {
      const s = D[d.id];
      if (activeLayer === 'obesity') return obesityScale(s.obesity);
      if (activeLayer === 'income')  return incomeScale(s.income);
      return ffScale(s.ff);
    };
    const sel = countyG.selectAll('path.county');
    sel.interrupt();
    sel.attr('fill', fillFn);
    sel.transition().duration(250).attr('fill', fillFn);

    // Recolor labels: dark text on light tile, light text on dark tile.
    // Income's color ramp is inverted (low income → dark fill), so flip the comparison.
    labels.selectAll('text').each(function () {
      const id = this.getAttribute('data-id');
      const isLeader = !!LEADER_OFFSETS[D[id].name];
      if (isLeader) { this.setAttribute('class', 'county-label'); return; }
      const s = D[id];
      let needsLight;
      if (activeLayer === 'obesity')      needsLight = s.obesity >= 28;       // dark fill above 28%
      else if (activeLayer === 'income')  needsLight = s.income  <= 85_000;   // dark fill below $85k
      else /* fast food */                needsLight = s.ff      >= 1.05;     // dark fill above 1.05
      this.setAttribute('class', 'county-label' + (needsLight ? ' is-light' : ''));
    });

    renderLegend();
    applyDim();

    const t = $('#stage-title');
    if (activeLayer === 'obesity') t.innerHTML = 'Massachusetts — <span class="accent" style="color:var(--obesity)">adult obesity rate</span>';
    else if (activeLayer === 'income') t.innerHTML = 'Massachusetts — <span class="accent" style="color:var(--income)">median household income</span>';
    else t.innerHTML = 'Massachusetts — <span class="accent" style="color:var(--fastfood)">fast-food density</span>';
  }

  function applyDim() {
    countyG.selectAll('path.county')
      .classed('is-dim', d => {
        const s = D[d.id];
        if (s.poverty < povThreshold) return true;
        if (brushedIds.size > 0 && !brushedIds.has(d.id)) return true;
        return false;
      })
      .classed('is-pinned', d => d.id === pinnedId);
    d3.selectAll('.scatter-dot')
      .classed('is-dim', d => {
        if (d.poverty < povThreshold) return true;
        if (brushedIds.size > 0 && !brushedIds.has(d.id)) return true;
        return false;
      })
      .classed('is-pinned', d => d.id === pinnedId);
  }

  function syncHoverScatter(id, on) {
    d3.selectAll('.scatter-dot').classed('is-hover', d => on && d.id === id);
  }
  function syncHoverMap(id, on) {
    countyG.selectAll('path.county').classed('is-hover', d => on && d.id === id);
  }
  function syncHoverTrend(id, on) {
    d3.selectAll('.trend-line').classed('is-hover', d => on && d.id === id);
  }

  function updatePin() {
    const pinCard = $('#pin-card');
    const clearBtn = $('#clear-pin');
    if (!pinnedId) {
      pinCard.classList.add('empty');
      pinCard.querySelector('.pin-body').innerHTML = 'Click a county to pin it.';
      clearBtn.style.display = 'none';
    } else {
      const s = D[pinnedId];
      pinCard.classList.remove('empty');
      pinCard.querySelector('.pin-body').innerHTML = `
        <div class="pin-row"><span class="k">County</span><span class="v">${s.name}</span></div>
        <div class="pin-row"><span class="k">Obesity (2022)</span><span class="v">${s.obesity}%</span></div>
        <div class="pin-row"><span class="k">Fast food / 1k</span><span class="v">${s.ff.toFixed(2)}</span></div>
        <div class="pin-row"><span class="k">Income (2021)</span><span class="v">$${(s.income/1000).toFixed(0)}k</span></div>
        <div class="pin-row"><span class="k">Poverty (2021)</span><span class="v">${s.poverty.toFixed(1)}%</span></div>
        <div class="pin-row"><span class="k">Diabetes (2019)</span><span class="v">${s.diab19.toFixed(1)}%</span></div>`;
      clearBtn.style.display = '';
    }
    applyDim();
  }
  $('#clear-pin').addEventListener('click', () => { pinnedId = null; updatePin(); });

  // Tooltip
  const tip = $('#map-tooltip');
  function showTip(evt, d) {
    const s = D[d.id];
    const sr = $('#map-stage').getBoundingClientRect();
    tip.style.left = (evt.clientX - sr.left) + 'px';
    tip.style.top  = (evt.clientY - sr.top) + 'px';
    tip.innerHTML = `
      <div class="tip-name">${s.name}</div>
      <div class="tip-row"><span class="k">Obesity</span><span class="v">${s.obesity}%</span></div>
      <div class="tip-row"><span class="k">Fast food / 1k</span><span class="v">${s.ff.toFixed(2)}</span></div>
      <div class="tip-row"><span class="k">Income</span><span class="v">$${(s.income/1000).toFixed(0)}k</span></div>
      <div class="tip-row"><span class="k">Poverty</span><span class="v">${s.poverty.toFixed(1)}%</span></div>`;
    tip.classList.add('is-visible');
  }
  function hideTip() { tip.classList.remove('is-visible'); }

  // Layer buttons
  $$('.lt-item').forEach(btn => btn.addEventListener('click', () => {
    $$('.lt-item').forEach(b => b.classList.toggle('is-active', b === btn));
    activeLayer = btn.dataset.layer;
    applyLayer();
  }));
  // Poverty slider
  const povSlider = $('#pov-slider');
  const povReadout = $('#pov-readout');
  povSlider.addEventListener('input', () => {
    povThreshold = parseFloat(povSlider.value);
    povReadout.textContent = povThreshold.toFixed(1);
    applyDim();
  });
  povSlider.max = 18.5;

  applyLayer();
  buildScatter();
  buildTrends();
  buildMiniCorr();
  setupCounters();

  // ============ Scatter ============
  function buildScatter() {
    const data = Object.entries(D).map(([id, d]) => ({ id, ...d }));
    const SW = 640, SH = 460;
    const M = { top: 24, right: 24, bottom: 56, left: 64 };
    const iw = SW - M.left - M.right;
    const ih = SH - M.top - M.bottom;
    const svg = d3.select('#scatter-svg').attr('viewBox', `0 0 ${SW} ${SH}`);
    const x = d3.scaleLinear().domain([55_000, 120_000]).range([0, iw]);
    const y = d3.scaleLinear().domain([20, 34]).range([ih, 0]);
    const g = svg.append('g').attr('transform', `translate(${M.left}, ${M.top})`);

    g.append('g').attr('class', 'scatter-grid')
      .selectAll('line').data(y.ticks(6)).join('line')
      .attr('x1', 0).attr('x2', iw).attr('y1', d => y(d)).attr('y2', d => y(d));

    const axisX = d3.axisBottom(x).ticks(6).tickFormat(d => `$${d/1000}k`).tickSize(0);
    const axisY = d3.axisLeft(y).ticks(6).tickFormat(d => `${d}%`).tickSize(0);
    g.append('g').attr('class', 'scatter-axis').attr('transform', `translate(0, ${ih})`).call(axisX).select('path').remove();
    g.append('g').attr('class', 'scatter-axis').call(axisY).select('path').remove();

    g.append('text').attr('x', iw/2).attr('y', ih+44).attr('text-anchor', 'middle')
      .style('font-family', 'var(--stamp)').style('font-size', '10px')
      .style('letter-spacing', '0.16em').style('text-transform', 'uppercase')
      .style('fill', 'var(--ink-faint)').text('Median household income →');
    g.append('text').attr('transform', `translate(-46, ${ih/2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .style('font-family', 'var(--stamp)').style('font-size', '10px')
      .style('letter-spacing', '0.16em').style('text-transform', 'uppercase')
      .style('fill', 'var(--ink-faint)').text('Adult obesity (% in 2022) →');

    // Regression line
    const meanX = d3.mean(data, d => d.income), meanY = d3.mean(data, d => d.obesity);
    const slope = d3.sum(data, d => (d.income - meanX) * (d.obesity - meanY)) /
                  d3.sum(data, d => (d.income - meanX) ** 2);
    const intercept = meanY - slope * meanX;
    g.append('line').attr('class', 'regression-line')
      .attr('x1', x(55_000)).attr('x2', x(120_000))
      .attr('y1', y(slope * 55_000 + intercept))
      .attr('y2', y(slope * 120_000 + intercept));

    // Annotation arrow + handwritten note over Bristol (highest obesity in MA)
    const bristol = data.find(d => d.name === 'Bristol');
    const bx = x(bristol.income), by = y(bristol.obesity);
    g.append('text').attr('class', 'scatter-annot')
      .attr('x', bx + 18).attr('y', by - 22).text('Bristol → highest');
    g.append('text').attr('class', 'scatter-annot')
      .attr('x', bx + 18).attr('y', by - 6).text('obesity in MA (32%)');
    g.append('path')
      .attr('d', `M ${bx+14} ${by-2} q -6 8 -8 -2`)
      .attr('fill', 'none').attr('stroke', 'var(--red-marker)').attr('stroke-width', 1.5);

    // Brush
    const brushG = g.append('g').attr('class', 'brush-layer');
    let brushStart = null;
    const overlay = g.append('rect')
      .attr('width', iw).attr('height', ih)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair');
    overlay.on('mousedown', function (evt) {
      const [mx, my] = d3.pointer(evt, this);
      brushStart = [mx, my];
      brushG.selectAll('*').remove();
      brushG.append('rect').attr('class', 'brush-rect')
        .attr('x', mx).attr('y', my).attr('width', 0).attr('height', 0);
    });
    svg.on('mousemove', function (evt) {
      if (!brushStart) return;
      const [mx, my] = d3.pointer(evt, g.node());
      const x0 = Math.min(brushStart[0], mx), y0 = Math.min(brushStart[1], my);
      const x1 = Math.max(brushStart[0], mx), y1 = Math.max(brushStart[1], my);
      brushG.select('rect.brush-rect')
        .attr('x', x0).attr('y', y0).attr('width', x1-x0).attr('height', y1-y0);
      const newIds = new Set();
      data.forEach(d => {
        const dx = x(d.income), dy = y(d.obesity);
        if (dx>=x0 && dx<=x1 && dy>=y0 && dy<=y1) newIds.add(d.id);
      });
      brushedIds = newIds;
      applyDim();
    });
    svg.on('mouseup', function () {
      if (brushStart && brushedIds.size === 0) {
        brushG.selectAll('*').remove();
      }
      brushStart = null;
    });
    overlay.on('dblclick', function () {
      brushedIds.clear();
      brushG.selectAll('*').remove();
      applyDim();
    });

    g.append('g').selectAll('circle.scatter-dot')
      .data(data).join('circle')
      .attr('class', d => 'scatter-dot' + (d.poverty >= 12 ? ' is-poor' : ''))
      .attr('cx', d => x(d.income)).attr('cy', d => y(d.obesity))
      .attr('r', d => Math.max(5, Math.sqrt(d.pop) / 80))
      .on('mouseenter', function (evt, d) {
        d3.select(this).classed('is-hover', true);
        syncHoverMap(d.id, true);
        syncHoverTrend(d.id, true);
        const sr = $('#scatter-stage').getBoundingClientRect();
        tip.style.left = (evt.clientX - sr.left) + 'px';
        tip.style.top  = (evt.clientY - sr.top) + 'px';
        tip.innerHTML = `
          <div class="tip-name">${d.name}</div>
          <div class="tip-row"><span class="k">Obesity</span><span class="v">${d.obesity}%</span></div>
          <div class="tip-row"><span class="k">Income</span><span class="v">$${(d.income/1000).toFixed(0)}k</span></div>
          <div class="tip-row"><span class="k">Poverty</span><span class="v">${d.poverty.toFixed(1)}%</span></div>
          <div class="tip-row"><span class="k">Fast food / 1k</span><span class="v">${d.ff.toFixed(2)}</span></div>`;
        tip.classList.add('is-visible');
        $('#scatter-stage').appendChild(tip);
      })
      .on('mousemove', function (evt) {
        const sr = $('#scatter-stage').getBoundingClientRect();
        tip.style.left = (evt.clientX - sr.left) + 'px';
        tip.style.top  = (evt.clientY - sr.top) + 'px';
      })
      .on('mouseleave', function (evt, d) {
        d3.select(this).classed('is-hover', false);
        syncHoverMap(d.id, false);
        syncHoverTrend(d.id, false);
        tip.classList.remove('is-visible');
        $('#map-stage').appendChild(tip);
      })
      .on('click', function (evt, d) {
        pinnedId = (pinnedId === d.id) ? null : d.id;
        updatePin();
      });

    const labelMap = {
      'Bristol': [12, 6], 'Worcester': [10, -8], 'Hampden': [12, -6],
      'Norfolk': [12, 4], 'Middlesex': [-10, 4], 'Nantucket': [-10, -6],
      'Suffolk': [10, 4], 'Berkshire': [10, -8], 'Barnstable': [12, -2],
      'Franklin': [12, -4], 'Plymouth': [10, -8],
    };
    g.append('g').selectAll('text.scatter-label')
      .data(data.filter(d => labelMap[d.name])).join('text')
      .attr('class', 'scatter-label')
      .attr('x', d => x(d.income) + labelMap[d.name][0])
      .attr('y', d => y(d.obesity) + labelMap[d.name][1])
      .attr('text-anchor', d => labelMap[d.name][0] < 0 ? 'end' : 'start')
      .text(d => d.name);
  }

  // ============ Trends 2011–2025 line chart ============
  function buildTrends() {
    const years = window.TREND_YEARS;
    const trends = window.MA_TRENDS;
    const stateTrend = window.STATE_TREND;
    const series = Object.entries(trends).map(([id, vals]) => ({
      id, name: D[id].name, income: D[id].income,
      values: years.map((yr, i) => ({ year: yr, v: vals[i] })),
      start: vals[0], end: vals[vals.length - 1],
      delta: vals[vals.length - 1] - vals[0],
    }));

    let colorMode = 'income'; // income | single
    let focusedId = null;

    // Income tier color scale — 3 bins, Okabe-Ito (colorblind-safe)
    const tierColor = (income) => {
      if (income < 75_000) return '#d55e00';      // low — vermillion
      if (income < 95_000) return '#e69f00';      // mid — yellow/gold
      return '#0072b2';                            // high — blue
    };
    const lineColorFor = (d) => colorMode === 'income' ? tierColor(d.income) : '#1f1d1a';

    const TW = 760, TH = 440;
    const M = { top: 24, right: 110, bottom: 50, left: 56 };
    const iw = TW - M.left - M.right;
    const ih = TH - M.top - M.bottom;

    const svg = d3.select('#trends-svg').attr('viewBox', `0 0 ${TW} ${TH}`);
    const g = svg.append('g').attr('transform', `translate(${M.left}, ${M.top})`);

    const x = d3.scaleLinear().domain([d3.min(years), d3.max(years)]).range([0, iw]);
    const y = d3.scaleLinear().domain([16, 38]).range([ih, 0]);

    // Grid
    g.append('g').attr('class', 'scatter-grid')
      .selectAll('line.h').data(y.ticks(6)).join('line').attr('class', 'h')
      .attr('x1', 0).attr('x2', iw).attr('y1', d => y(d)).attr('y2', d => y(d));

    // Axes
    const axisX = d3.axisBottom(x).ticks(8).tickFormat(d3.format('d')).tickSize(0);
    const axisY = d3.axisLeft(y).ticks(6).tickFormat(d => `${d}%`).tickSize(0);
    g.append('g').attr('class', 'scatter-axis').attr('transform', `translate(0, ${ih})`).call(axisX).select('path').remove();
    g.append('g').attr('class', 'scatter-axis').call(axisY).select('path').remove();

    g.append('text').attr('x', iw/2).attr('y', ih+40).attr('text-anchor', 'middle')
      .style('font-family', 'var(--stamp)').style('font-size', '10px')
      .style('letter-spacing', '0.16em').style('text-transform', 'uppercase')
      .style('fill', 'var(--ink-faint)').text('Year →');
    g.append('text').attr('transform', `translate(-40, ${ih/2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .style('font-family', 'var(--stamp)').style('font-size', '10px')
      .style('letter-spacing', '0.16em').style('text-transform', 'uppercase')
      .style('fill', 'var(--ink-faint)').text('Adult obesity rate →');

    const line = d3.line().x(d => x(d.year)).y(d => y(d.v)).curve(d3.curveMonotoneX);

    // Statewide line (drawn first, behind)
    g.append('path')
      .datum(stateTrend.map((v, i) => ({ year: years[i], v })))
      .attr('class', 'trend-line trend-state')
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', '#1f1d1a')
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '5 4');
    // County lines
    const lineG = g.append('g').attr('class', 'trend-lines');
    const linesSel = lineG.selectAll('path.trend-line')
      .data(series, d => d.id)
      .join('path')
      .attr('class', 'trend-line')
      .attr('data-id', d => d.id)
      .attr('d', d => line(d.values))
      .attr('fill', 'none')
      .attr('stroke', lineColorFor)
      .attr('stroke-width', 2)
      .attr('opacity', 0.78)
      .style('cursor', 'pointer')
      .on('mouseenter', function (evt, d) {
        d3.select(this).classed('is-hover', true);
        syncHoverMap(d.id, true);
        d3.selectAll('.scatter-dot').classed('is-hover', x => x.id === d.id);
        showTrendTip(evt, d);
        showVerticalGuide(evt);
      })
      .on('mousemove', function (evt, d) { showTrendTip(evt, d); showVerticalGuide(evt); })
      .on('mouseleave', function (evt, d) {
        d3.select(this).classed('is-hover', false);
        syncHoverMap(d.id, false);
        d3.selectAll('.scatter-dot').classed('is-hover', false);
        $('#trends-tip').classList.remove('is-visible');
        hideGuide();
      })
      .on('click', function (evt, d) {
        focusedId = focusedId === d.id ? null : d.id;
        applyFocus();
      });

    // End-of-line labels — vertical de-overlap (both top-down and bottom-up)
    const endLabels = g.append('g').attr('class', 'trend-end-labels');
    function relax(rawData) {
      const sorted = rawData.slice().sort((a, b) => y(a.v) - y(b.v));
      const minGap = 12.5;
      // First pass: top-down
      let prev = -Infinity;
      for (const it of sorted) {
        let yp = y(it.v);
        if (yp - prev < minGap) yp = prev + minGap;
        it.yPos = yp; prev = yp;
      }
      // Second pass: bottom-up to prevent drift off-axis
      prev = Infinity;
      for (let i = sorted.length - 1; i >= 0; i--) {
        const it = sorted[i];
        if (prev - it.yPos < minGap) it.yPos = prev - minGap;
        prev = it.yPos;
      }
      return sorted;
    }
    const placed = relax(series.map(s => ({ id: s.id, name: s.name, v: s.end, income: s.income })));

    endLabels.selectAll('text')
      .data(placed).join('text')
      .attr('class', 'trend-end-label')
      .attr('x', x(years[years.length - 1]) + 6)
      .attr('y', d => d.yPos)
      .attr('dy', '0.32em')
      .attr('data-id', d => d.id)
      .attr('fill', d => lineColorFor(d))
      .text(d => d.name);

    // Place "MA state" label in the largest gap between county end-labels
    const sortedByY = placed.slice().sort((a, b) => a.yPos - b.yPos);
    let maxGap = -Infinity, stateY = y(stateTrend[stateTrend.length - 1]);
    for (let i = 1; i < sortedByY.length; i++) {
      const gap = sortedByY[i].yPos - sortedByY[i - 1].yPos;
      if (gap > maxGap) { maxGap = gap; stateY = (sortedByY[i].yPos + sortedByY[i - 1].yPos) / 2; }
    }
    g.append('text')
      .attr('x', x(years[years.length - 1]) + 6)
      .attr('y', stateY)
      .attr('dy', '0.32em')
      .style('font-family', 'var(--stamp)')
      .style('font-size', '10px')
      .style('letter-spacing', '0.12em')
      .style('text-transform', 'uppercase')
      .style('fill', '#1f1d1a')
      .text('MA state');

    // Vertical guide line for hover
    const guide = g.append('line')
      .attr('class', 'trend-guide')
      .attr('y1', 0).attr('y2', ih)
      .attr('stroke', '#1f1d1a').attr('stroke-width', 1).attr('stroke-dasharray', '3 4')
      .style('display', 'none');

    function showVerticalGuide(evt) {
      const [mx] = d3.pointer(evt, g.node());
      const yr = Math.round(x.invert(mx));
      const clamped = Math.max(years[0], Math.min(years[years.length - 1], yr));
      guide.attr('x1', x(clamped)).attr('x2', x(clamped)).style('display', null);
    }
    function hideGuide() { guide.style.display = 'none'; }

    function showTrendTip(evt, d) {
      const t = $('#trends-tip');
      const sr = $('#trends-stage').getBoundingClientRect();
      t.style.left = (evt.clientX - sr.left) + 'px';
      t.style.top  = (evt.clientY - sr.top) + 'px';
      // Figure out which year we're near
      const [mx] = d3.pointer(evt, g.node());
      const yr = Math.max(years[0], Math.min(years[years.length - 1], Math.round(x.invert(mx))));
      const pt = d.values.find(p => p.year === yr) || d.values[d.values.length - 1];
      const delta = d.end - d.start;
      const deltaStr = (delta >= 0 ? '+' : '') + delta + ' pts';
      t.innerHTML = `
        <div class="tip-name">${d.name}</div>
        <div class="tip-row"><span class="k">${pt.year}</span><span class="v">${pt.v}%</span></div>
        <div class="tip-row"><span class="k">2011 → 2025</span><span class="v">${d.start}% → ${d.end}%</span></div>
        <div class="tip-row"><span class="k">15-yr Δ</span><span class="v">${deltaStr}</span></div>
        <div class="tip-row"><span class="k">Income (2021)</span><span class="v">$${(d.income/1000).toFixed(0)}k</span></div>`;
      t.classList.add('is-visible');
    }

    function applyFocus() {
      linesSel
        .classed('is-focused', d => d.id === focusedId)
        .classed('is-dim', d => focusedId && d.id !== focusedId)
        .attr('stroke', lineColorFor)
        .attr('stroke-width', d => d.id === focusedId ? 3.5 : 2)
        .attr('opacity', d => focusedId ? (d.id === focusedId ? 1 : 0.15) : 0.78);
      endLabels.selectAll('text')
        .classed('is-dim', d => focusedId && d.id !== focusedId)
        .attr('font-weight', d => d.id === focusedId ? 700 : 400);
    }

    // Color mode toggle
    $$('#trends-color-toggle button').forEach(btn => btn.addEventListener('click', () => {
      $$('#trends-color-toggle button').forEach(b => b.classList.toggle('is-active', b === btn));
      colorMode = btn.dataset.mode;
      linesSel.transition().duration(280).attr('stroke', lineColorFor);
      endLabels.selectAll('text').transition().duration(280).attr('fill', lineColorFor);
      renderTrendsLegend();
    }));

    // Build legend
    function renderTrendsLegend() {
      const lg = $('#trends-legend');
      if (colorMode === 'income') {
        lg.innerHTML = `
          <div class="lg-h">Income tier (2021)</div>
          <div class="lg-r"><span class="sw" style="background:#d55e00"></span><span>Low</span><em>&lt; $75k</em></div>
          <div class="lg-r"><span class="sw" style="background:#e69f00"></span><span>Mid</span><em>$75k–$95k</em></div>
          <div class="lg-r"><span class="sw" style="background:#0072b2"></span><span>High</span><em>&gt; $95k</em></div>
          <div class="lg-r" style="margin-top:10px"><span class="sw dashed" style="background:#1f1d1a"></span><span>MA state</span><em></em></div>`;
      } else {
        lg.innerHTML = `
          <div class="lg-h">Counties</div>
          <div class="lg-r"><span class="sw" style="background:#1f1d1a"></span><span>All counties</span><em></em></div>
          <div class="lg-r"><span class="sw dashed" style="background:#1f1d1a"></span><span>MA state</span><em></em></div>`;
      }
    }
    renderTrendsLegend();

    // Build delta card — biggest 15-year swings
    const sorted = [...series].sort((a, b) => b.delta - a.delta);
    const top = sorted.slice(0, 3);
    const bot = sorted.slice(-3).reverse();
    const items = [...top, { sep: true }, ...bot];
    $('#deltacard-body').innerHTML = items.map(it => {
      if (it.sep) return '<div class="dc-sep"></div>';
      const sign = it.delta >= 0 ? '+' : '';
      const cls = it.delta >= 6 ? 'big-up' : it.delta <= 1 ? 'flat' : 'mid';
      return `<button class="dc-row" data-id="${it.id}">
        <span class="dc-swatch" style="background:${lineColorFor(it)}"></span>
        <span class="dc-name">${it.name}</span>
        <span class="dc-bar"><span style="width:${Math.min(100, Math.abs(it.delta) * 10)}%"></span></span>
        <span class="dc-delta ${cls}">${sign}${it.delta} pts</span>
      </button>`;
    }).join('');

    // Delta card hover/click
    $$('#deltacard-body .dc-row').forEach(row => {
      const id = row.dataset.id;
      row.addEventListener('mouseenter', () => {
        d3.select(`path.trend-line[data-id="${id}"]`).classed('is-hover', true);
        syncHoverMap(id, true);
      });
      row.addEventListener('mouseleave', () => {
        d3.select(`path.trend-line[data-id="${id}"]`).classed('is-hover', false);
        syncHoverMap(id, false);
      });
      row.addEventListener('click', () => {
        focusedId = focusedId === id ? null : id;
        applyFocus();
      });
    });
  }

  // ============ Hypothesis-card scatter plots in §01 ============
  function buildMiniCorr() {
    const data = Object.entries(D).map(([id, d]) => ({ id, ...d }));

    function fitLine(xs, ys) {
      const n = xs.length;
      const mx = xs.reduce((a,b)=>a+b, 0) / n;
      const my = ys.reduce((a,b)=>a+b, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - mx) * (ys[i] - my);
        den += (xs[i] - mx) ** 2;
      }
      const slope = num / den;
      return { slope, intercept: my - slope * mx };
    }

    const pairs = {
      ff: {
        xLabel: 'Fast food per 1,000 residents',
        xDomain: [0.3, 1.7],
        xTicks: [0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6],
        xFmt: v => v.toFixed(1),
        accessor: d => d.ff,
      },
      income: {
        xLabel: 'Median household income',
        xDomain: [55_000, 120_000],
        xTicks: [60_000, 70_000, 80_000, 90_000, 100_000, 110_000, 120_000],
        xFmt: v => '$' + (v / 1000).toFixed(0) + 'k',
        accessor: d => d.income,
      },
    };

    // Per-pair label offsets (in svg units relative to dot). Tweaked manually
    // to read the way the user's reference mockup does.
    const LABEL_OFFSETS = {
      ff: {
        'Bristol':    [-6,-10], 'Worcester':  [-12,-10],  'Hampden':    [-14,  3],
        'Plymouth':   [ 8, -2], 'Franklin':   [-6,-10],   'Dukes':      [ 8,  3],
        'Berkshire':  [-12,  4],'Essex':      [ 8, -2],   'Suffolk':    [ 8,  3],
        'Barnstable': [-14, -2],'Hampshire':  [-14,  4],  'Middlesex':  [ 8,  3],
        'Nantucket':  [-12,-10],'Norfolk':    [ 8, 10],
      },
      income: {
        'Bristol':    [-12,-10],'Worcester':  [ 10,  4],  'Hampden':    [ 10,  4],
        'Plymouth':   [ 10,  4],'Franklin':   [-12, -8],  'Dukes':      [ 10,  4],
        'Berkshire':  [-12, -2],'Essex':      [ 10, -4],  'Suffolk':    [-12,  8],
        'Barnstable': [-14, 10],'Hampshire':  [-12,  9],  'Middlesex':  [-14, -8],
        'Nantucket':  [ 10, -2],'Norfolk':    [ 10,  4],
      },
    };

    $$('.hypocard-chart').forEach(el => {
      const pair = el.dataset.pair;
      const cfg = pairs[pair];
      const offsets = LABEL_OFFSETS[pair];

      const W = 600, H = 320;
      const M = { top: 18, right: 22, bottom: 44, left: 46 };
      const iw = W - M.left - M.right;
      const ih = H - M.top - M.bottom;

      const yDomain = [20, 34];
      const yTicks = [20, 22, 24, 26, 28, 30, 32, 34];
      const xScale = v => M.left + (v - cfg.xDomain[0]) / (cfg.xDomain[1] - cfg.xDomain[0]) * iw;
      const yScale = v => M.top + (1 - (v - yDomain[0]) / (yDomain[1] - yDomain[0])) * ih;

      const xs = data.map(cfg.accessor);
      const ys = data.map(d => d.obesity);
      const { slope, intercept } = fitLine(xs, ys);
      const x1 = cfg.xDomain[0], x2 = cfg.xDomain[1];
      const y1 = slope * x1 + intercept;
      const y2 = slope * x2 + intercept;

      // Build grid lines (y only — feels cleaner than full grid)
      const grid = yTicks.map(t =>
        `<line x1="${M.left}" x2="${W - M.right}" y1="${yScale(t)}" y2="${yScale(t)}"></line>`
      ).join('');

      const xAxis = cfg.xTicks.map(t =>
        `<text x="${xScale(t)}" y="${H - M.bottom + 16}" text-anchor="middle">${cfg.xFmt(t)}</text>`
      ).join('');
      const yAxis = yTicks.map(t =>
        `<text x="${M.left - 8}" y="${yScale(t) + 3.5}" text-anchor="end">${t}%</text>`
      ).join('');

      const dots = data.map(d => {
        const xv = cfg.accessor(d), yv = d.obesity;
        const cx = xScale(xv), cy = yScale(yv);
        const off = offsets[d.name] || [8, 3];
        const lx = cx + off[0], ly = cy + off[1];
        const anchor = off[0] < 0 ? 'end' : 'start';
        return `
          <circle class="hc-dot" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5.5"></circle>
          <text class="hc-dot-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${d.name}</text>
        `;
      }).join('');

      el.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="hc-svg">
          <g class="hc-grid">${grid}</g>
          <line class="hc-reg"
            x1="${xScale(x1).toFixed(1)}" y1="${yScale(y1).toFixed(1)}"
            x2="${xScale(x2).toFixed(1)}" y2="${yScale(y2).toFixed(1)}"></line>
          ${dots}
          <g class="hc-axis">
            ${xAxis}
            ${yAxis}
          </g>
          <text class="hc-axis-title" x="${M.left + iw/2}" y="${H - 4}" text-anchor="middle">${cfg.xLabel}</text>
          <text class="hc-axis-title" transform="translate(${M.left - 32}, ${M.top + ih/2}) rotate(-90)" text-anchor="middle">Obesity rate</text>
        </svg>
      `;
    });
  }

  // ============ Number counters ============
  function setupCounters() {
    const els = $$('.count');
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !e.target.dataset.animated) {
          e.target.dataset.animated = '1';
          const target = parseFloat(e.target.dataset.target);
          const decimals = parseInt(e.target.dataset.decimals || '0', 10);
          const dur = 1200;
          const start = performance.now();
          function tick(now) {
            const t = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - t, 3);
            e.target.textContent = (target * eased).toFixed(decimals);
            if (t < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }
      });
    }, { threshold: 0.4 });
    els.forEach(el => io.observe(el));
  }
})();
