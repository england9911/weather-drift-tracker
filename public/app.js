const SVG_NS = "http://www.w3.org/2000/svg";

function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function niceTicks(min, max, count) {
  if (min === max) return [min];
  const span = max - min;
  const rawStep = span / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
  const ticks = [];
  const start = Math.ceil(min / step) * step;
  for (let t = start; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  return ticks;
}

function formatSignedTemp(v) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}°C`;
}

function formatTemp(v) {
  return `${v.toFixed(1)}°C`;
}

function formatDayMonth(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addLine(svg, x1, y1, x2, y2, cls) {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("class", cls);
  svg.appendChild(line);
  return line;
}

function addText(svg, x, y, text, anchor) {
  const t = document.createElementNS(SVG_NS, "text");
  t.setAttribute("x", x);
  t.setAttribute("y", y);
  t.setAttribute("text-anchor", anchor);
  t.textContent = text;
  svg.appendChild(t);
  return t;
}

function addDot(svg, x, y, color, r) {
  const surface = cssVar("--surface-1");
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", x);
  dot.setAttribute("cy", y);
  dot.setAttribute("r", r);
  dot.setAttribute("fill", color);
  dot.setAttribute("stroke", surface);
  dot.setAttribute("stroke-width", 2);
  svg.appendChild(dot);
  return dot;
}

function addRing(svg, x, y, color, r) {
  const surface = cssVar("--surface-1");
  // Invisible oversized hit target first (bigger than the mark), so touch/mouse
  // hover is easy to land on even though the visible ring stays small.
  const hit = document.createElementNS(SVG_NS, "circle");
  hit.setAttribute("cx", x);
  hit.setAttribute("cy", y);
  hit.setAttribute("r", Math.max(r + 8, 12));
  hit.setAttribute("fill", "transparent");
  svg.appendChild(hit);

  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("cx", x);
  ring.setAttribute("cy", y);
  ring.setAttribute("r", r);
  ring.setAttribute("fill", surface);
  ring.setAttribute("stroke", color);
  ring.setAttribute("stroke-width", 2.5);
  ring.setAttribute("tabindex", "0");
  svg.appendChild(ring);
  return { ring, hit };
}

function addDiamondMarker(svg, x, y, color, r) {
  const surface = cssVar("--surface-1");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", `M${x},${y - r} L${x + r},${y} L${x},${y + r} L${x - r},${y} Z`);
  path.setAttribute("fill", surface);
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", 2.5);
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return path;
}

function addRingMarker(svg, x, y, color, r) {
  const surface = cssVar("--surface-1");
  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("cx", x);
  ring.setAttribute("cy", y);
  ring.setAttribute("r", r);
  ring.setAttribute("fill", surface);
  ring.setAttribute("stroke", color);
  ring.setAttribute("stroke-width", 2.5);
  svg.appendChild(ring);
  return ring;
}

function getTooltipEl(container) {
  let el = container.querySelector(".tooltip");
  if (!el) {
    el = document.createElement("div");
    el.className = "tooltip";
    container.appendChild(el);
  }
  return el;
}

function showTooltip(tooltipEl, wrapEl, clientX, clientY, headerText, rows, valueFormatter) {
  tooltipEl.innerHTML = "";
  const header = document.createElement("div");
  header.className = "t-date";
  header.textContent = headerText;
  tooltipEl.appendChild(header);
  for (const row of rows) {
    if (row.divider) {
      const divider = document.createElement("div");
      divider.className = "t-divider";
      tooltipEl.appendChild(divider);
      continue;
    }
    const rowEl = document.createElement("div");
    rowEl.className = "t-row";
    const key = document.createElement("span");
    key.className = "t-key";
    key.style.background = row.color;
    const value = document.createElement("span");
    value.className = "t-value";
    value.textContent = valueFormatter(row.value);
    const label = document.createElement("span");
    label.className = "t-label";
    label.textContent = row.label;
    rowEl.append(key, value, label);
    tooltipEl.appendChild(rowEl);
  }
  const wrapRect = wrapEl.getBoundingClientRect();
  tooltipEl.style.left = `${clientX - wrapRect.left + 14}px`;
  tooltipEl.style.top = `${clientY - wrapRect.top - 12}px`;
  tooltipEl.classList.add("visible");
}

function hideTooltip(tooltipEl) {
  tooltipEl.classList.remove("visible");
}

/**
 * Generic multi-series line chart over a numeric x domain, with optional
 * off-series ring markers (used for "Observed" points at a different x).
 */
function createLineChart(mountEl, opts) {
  const { xDomainValues, series, markers = [], zeroLine = false, xTicks, yTickFormat, tooltipHeader } = opts;
  const width = 860;
  const height = 300;
  const margin = { top: 16, right: 16, bottom: 32, left: 46 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const allX = xDomainValues.concat(markers.map((m) => m.x));
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const xSpan = xMax - xMin || 1;
  const xScale = (x) => margin.left + ((x - xMin) / xSpan) * plotW;

  let allY = series.flatMap((s) => s.values).concat(markers.flatMap((m) => m.items.map((i) => i.value)));
  if (zeroLine) allY = allY.concat([0]);
  const yMinRaw = Math.min(...allY);
  const yMaxRaw = Math.max(...allY);
  const yPad = (yMaxRaw - yMinRaw) * 0.2 || 1;
  const yMin = yMinRaw - yPad;
  const yMax = yMaxRaw + yPad;
  const yScale = (y) => margin.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", opts.ariaLabel || "Chart");

  for (const t of niceTicks(yMin, yMax, 4)) {
    const gy = yScale(t);
    addLine(svg, margin.left, gy, width - margin.right, gy, "gridline");
    addText(svg, margin.left - 8, gy + 3, yTickFormat(t), "end");
  }

  if (zeroLine) {
    addLine(svg, margin.left, yScale(0), width - margin.right, yScale(0), "zero-line");
  }

  addLine(svg, margin.left, margin.top + plotH, width - margin.right, margin.top + plotH, "axis-line");
  for (const tick of xTicks) {
    addText(svg, xScale(tick.x), margin.top + plotH + 18, tick.label, "middle");
  }

  for (const s of series) {
    const d = xDomainValues.map((x, i) => `${i === 0 ? "M" : "L"}${xScale(x)},${yScale(s.values[i])}`).join(" ");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", s.color);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);
    xDomainValues.forEach((x, i) => addDot(svg, xScale(x), yScale(s.values[i]), s.color, 4));
  }

  const tooltipEl = getTooltipEl(mountEl);

  for (const m of markers) {
    for (const item of m.items) {
      const { ring, hit: markerHit } = addRing(svg, xScale(m.x), yScale(item.value), item.color, 5);
      const showForMarker = (clientX, clientY) => {
        showTooltip(tooltipEl, mountEl, clientX, clientY, m.label, [item], yTickFormat);
      };
      markerHit.addEventListener("pointerenter", (e) => showForMarker(e.clientX, e.clientY));
      markerHit.addEventListener("pointerdown", (e) => showForMarker(e.clientX, e.clientY));
      markerHit.addEventListener("pointerleave", () => hideTooltip(tooltipEl));
      ring.addEventListener("focus", () => {
        const rect = ring.getBoundingClientRect();
        showForMarker(rect.left, rect.top);
      });
      ring.addEventListener("blur", () => hideTooltip(tooltipEl));
    }
  }

  const crosshair = document.createElementNS(SVG_NS, "line");
  crosshair.setAttribute("class", "crosshair");
  crosshair.setAttribute("y1", margin.top);
  crosshair.setAttribute("y2", margin.top + plotH);
  svg.appendChild(crosshair);

  const hit = document.createElementNS(SVG_NS, "rect");
  hit.setAttribute("x", margin.left);
  hit.setAttribute("y", margin.top);
  hit.setAttribute("width", plotW);
  hit.setAttribute("height", plotH);
  hit.setAttribute("class", "hit-layer");
  svg.appendChild(hit);

  function nearestIndex(clientX) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = 0;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    let best = 0;
    let bestDist = Infinity;
    xDomainValues.forEach((x, i) => {
      const dist = Math.abs(xScale(x) - loc.x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }

  const handleHitPoint = (e) => {
    const idx = nearestIndex(e.clientX);
    const x = xDomainValues[idx];
    crosshair.setAttribute("x1", xScale(x));
    crosshair.setAttribute("x2", xScale(x));
    crosshair.style.opacity = 1;
    const rows = series.map((s) => ({ color: s.color, label: s.label, value: s.values[idx] }));
    showTooltip(tooltipEl, mountEl, e.clientX, e.clientY, tooltipHeader(x), rows, yTickFormat);
  };
  mountEl._activeCrosshairHide = () => {
    crosshair.style.opacity = 0;
  };
  hit.addEventListener("pointermove", handleHitPoint);
  hit.addEventListener("pointerdown", handleHitPoint);
  hit.addEventListener("pointerleave", () => {
    mountEl._activeCrosshairHide();
    hideTooltip(tooltipEl);
  });
  if (!mountEl._outsideDismissWired) {
    mountEl._outsideDismissWired = true;
    document.addEventListener("pointerdown", (e) => {
      if (!mountEl.contains(e.target)) {
        mountEl._activeCrosshairHide();
        hideTooltip(tooltipEl);
      }
    });
  }

  mountEl.querySelectorAll("svg").forEach((old) => old.remove());
  mountEl.insertBefore(svg, mountEl.firstChild);
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function computePresetRange(preset, customStart, customEnd) {
  const today = new Date().toISOString().slice(0, 10);
  switch (preset) {
    case "last14":
      return { start: addDaysIso(today, -13), end: today };
    case "last30":
      return { start: addDaysIso(today, -29), end: today };
    case "all":
      return { start: "0000-01-01", end: "9999-12-31" };
    case "custom":
      return { start: customStart || today, end: customEnd || today };
    case "next14":
    default:
      return { start: today, end: addDaysIso(today, 13) };
  }
}

function formatRangeLabel(range, preset) {
  if (preset === "all") return "Showing all tracked dates.";
  return `Showing ${formatDayMonth(range.start)} – ${formatDayMonth(range.end)}.`;
}

function setupRangeFilter(dates) {
  const presetSelect = document.getElementById("range-preset");
  const customInputs = document.getElementById("custom-range-inputs");
  const startInput = document.getElementById("range-start");
  const endInput = document.getElementById("range-end");
  const outlookLabel = document.getElementById("outlook-range-label");
  const shapeLabel = document.getElementById("shape-range-label");

  function rerender() {
    const preset = presetSelect.value;
    const range = computePresetRange(preset, startInput.value, endInput.value);
    const label = formatRangeLabel(range, preset);
    outlookLabel.textContent = label;
    shapeLabel.textContent = label;
    renderOutlookChart(dates, range);
    renderShapeTable(dates, range, (targetDate) => selectDateInRevisionChart(dates, targetDate));
  }

  presetSelect.addEventListener("change", () => {
    const isCustom = presetSelect.value === "custom";
    customInputs.classList.toggle("hidden", !isCustom);
    if (isCustom && !startInput.value) {
      const fallback = computePresetRange("next14");
      startInput.value = fallback.start;
      endInput.value = fallback.end;
    }
    rerender();
  });
  startInput.addEventListener("change", rerender);
  endInput.addEventListener("change", rerender);

  rerender();
}

function computeOutlookRows(dates, range) {
  return dates
    .filter((d) => d.targetDate >= range.start && d.targetDate <= range.end && d.snapshots.length > 0)
    .sort((a, b) => (a.targetDate < b.targetDate ? -1 : 1))
    .map((d) => {
      const snaps = d.snapshots;
      const first = snaps[0];
      const current = snaps[snaps.length - 1];

      let highest = snaps[0];
      let lowest = snaps[0];
      for (const s of snaps) {
        if (s.maxTempC > highest.maxTempC) highest = s;
        if (s.minTempC < lowest.minTempC) lowest = s;
      }

      return {
        targetDate: d.targetDate,
        firstHigh: first.maxTempC,
        firstHighAt: first.fetchedAt,
        firstLow: first.minTempC,
        firstLowAt: first.fetchedAt,
        currentHigh: current.maxTempC,
        currentHighAt: current.fetchedAt,
        currentLow: current.minTempC,
        currentLowAt: current.fetchedAt,
        extremeHigh: highest.maxTempC,
        extremeHighAt: highest.fetchedAt,
        extremeLow: lowest.minTempC,
        extremeLowAt: lowest.fetchedAt,
      };
    });
}

function renderOutlookChart(dates, range) {
  const wrap = document.getElementById("outlook-chart-wrap");
  const tableWrap = document.getElementById("outlook-table-wrap");
  const rows = computeOutlookRows(dates, range);
  if (!rows.length) {
    wrap.innerHTML = '<p class="card-sub">No dates tracked in this period.</p>';
    tableWrap.innerHTML = "";
    return;
  }

  const highColor = cssVar("--series-high");
  const lowColor = cssVar("--series-low");
  const highWash = cssVar("--series-high-wash");
  const lowWash = cssVar("--series-low-wash");

  const width = 860;
  const height = 320;
  const margin = { top: 16, right: 16, bottom: 32, left: 46 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const n = rows.length;
  const xPos = (i) => margin.left + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));

  const allY = rows.flatMap((r) => [r.firstHigh, r.currentHigh, r.extremeHigh, r.firstLow, r.currentLow, r.extremeLow]);
  const yMinRaw = Math.min(...allY);
  const yMaxRaw = Math.max(...allY);
  const yPad = (yMaxRaw - yMinRaw) * 0.2 || 1;
  const yMin = yMinRaw - yPad;
  const yMax = yMaxRaw + yPad;
  const yScale = (y) => margin.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Next 14 days: current, first-seen, and most extreme forecast");

  for (const t of niceTicks(yMin, yMax, 4)) {
    const gy = yScale(t);
    addLine(svg, margin.left, gy, width - margin.right, gy, "gridline");
    addText(svg, margin.left - 8, gy + 3, formatTemp(t), "end");
  }
  addLine(svg, margin.left, margin.top + plotH, width - margin.right, margin.top + plotH, "axis-line");
  rows.forEach((r, i) => addText(svg, xPos(i), margin.top + plotH + 18, formatDayMonth(r.targetDate), "middle"));

  // Band spans the historical extreme down to today's forecast (extreme always
  // dominates current by construction), so band height = size of the gap.
  function bandPath(getA, getB) {
    const forward = rows.map((r, i) => `${i === 0 ? "M" : "L"}${xPos(i)},${yScale(getA(r))}`).join(" ");
    const backward = rows
      .map((r, i) => ({ r, i }))
      .reverse()
      .map(({ r, i }) => `L${xPos(i)},${yScale(getB(r))}`)
      .join(" ");
    return `${forward} ${backward} Z`;
  }

  function addBand(getA, getB, wash) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", bandPath(getA, getB));
    path.setAttribute("fill", wash);
    path.setAttribute("stroke", "none");
    svg.appendChild(path);
  }

  addBand((r) => r.extremeHigh, (r) => r.currentHigh, highWash);
  addBand((r) => r.extremeLow, (r) => r.currentLow, lowWash);

  function addSeriesLine(getValue, color, style) {
    const d = rows.map((r, i) => `${i === 0 ? "M" : "L"}${xPos(i)},${yScale(getValue(r))}`).join(" ");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    if (style === "dashed") path.setAttribute("stroke-dasharray", "5,4");
    if (style === "dotted") path.setAttribute("stroke-dasharray", "0.1,5");
    svg.appendChild(path);
  }

  addSeriesLine((r) => r.firstHigh, highColor, "dashed");
  addSeriesLine((r) => r.firstLow, lowColor, "dashed");
  addSeriesLine((r) => r.extremeHigh, highColor, "dotted");
  addSeriesLine((r) => r.extremeLow, lowColor, "dotted");
  addSeriesLine((r) => r.currentHigh, highColor, "solid");
  addSeriesLine((r) => r.currentLow, lowColor, "solid");

  rows.forEach((r, i) => {
    addRingMarker(svg, xPos(i), yScale(r.firstHigh), highColor, 4);
    addRingMarker(svg, xPos(i), yScale(r.firstLow), lowColor, 4);
  });
  rows.forEach((r, i) => {
    addDiamondMarker(svg, xPos(i), yScale(r.extremeHigh), highColor, 5);
    addDiamondMarker(svg, xPos(i), yScale(r.extremeLow), lowColor, 5);
  });
  rows.forEach((r, i) => {
    addDot(svg, xPos(i), yScale(r.currentHigh), highColor, 4);
    addDot(svg, xPos(i), yScale(r.currentLow), lowColor, 4);
  });

  const tooltipEl = getTooltipEl(wrap);

  const crosshair = document.createElementNS(SVG_NS, "line");
  crosshair.setAttribute("class", "crosshair");
  crosshair.setAttribute("y1", margin.top);
  crosshair.setAttribute("y2", margin.top + plotH);
  svg.appendChild(crosshair);

  const hit = document.createElementNS(SVG_NS, "rect");
  hit.setAttribute("x", margin.left);
  hit.setAttribute("y", margin.top);
  hit.setAttribute("width", plotW);
  hit.setAttribute("height", plotH);
  hit.setAttribute("class", "hit-layer");
  svg.appendChild(hit);

  function nearestIndex(clientX) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = 0;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    let best = 0;
    let bestDist = Infinity;
    rows.forEach((r, i) => {
      const dist = Math.abs(xPos(i) - loc.x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }

  const handleHitPoint = (e) => {
    const idx = nearestIndex(e.clientX);
    const r = rows[idx];
    crosshair.setAttribute("x1", xPos(idx));
    crosshair.setAttribute("x2", xPos(idx));
    crosshair.style.opacity = 1;
    const tooltipRows = [
      { color: highColor, label: `Current high (${formatDateTime(r.currentHighAt)})`, value: r.currentHigh },
      { color: highColor, label: `First-seen high (${formatDateTime(r.firstHighAt)})`, value: r.firstHigh },
      { color: highColor, label: `Highest-ever high (${formatDateTime(r.extremeHighAt)})`, value: r.extremeHigh },
      { divider: true },
      { color: lowColor, label: `Current low (${formatDateTime(r.currentLowAt)})`, value: r.currentLow },
      { color: lowColor, label: `First-seen low (${formatDateTime(r.firstLowAt)})`, value: r.firstLow },
      { color: lowColor, label: `Lowest-ever low (${formatDateTime(r.extremeLowAt)})`, value: r.extremeLow },
    ];
    showTooltip(tooltipEl, wrap, e.clientX, e.clientY, formatDayMonth(r.targetDate), tooltipRows, formatTemp);
  };
  wrap._activeCrosshairHide = () => {
    crosshair.style.opacity = 0;
  };
  hit.addEventListener("pointermove", handleHitPoint);
  hit.addEventListener("pointerdown", handleHitPoint);
  hit.addEventListener("pointerleave", () => {
    wrap._activeCrosshairHide();
    hideTooltip(tooltipEl);
  });
  if (!wrap._outsideDismissWired) {
    wrap._outsideDismissWired = true;
    document.addEventListener("pointerdown", (e) => {
      if (!wrap.contains(e.target)) {
        wrap._activeCrosshairHide();
        hideTooltip(tooltipEl);
      }
    });
  }

  wrap.querySelectorAll("svg").forEach((old) => old.remove());
  wrap.insertBefore(svg, wrap.firstChild);

  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>Date</th><th>First high</th><th>Highest-ever high</th><th>Current high</th><th>&Delta; vs peak</th>" +
    "<th>First low</th><th>Lowest-ever low</th><th>Current low</th><th>&Delta; vs trough</th></tr>";
  const tbody = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    const cells = [
      formatDayMonth(r.targetDate),
      formatTemp(r.firstHigh),
      formatTemp(r.extremeHigh),
      formatTemp(r.currentHigh),
      formatSignedTemp(r.currentHigh - r.extremeHigh),
      formatTemp(r.firstLow),
      formatTemp(r.extremeLow),
      formatTemp(r.currentLow),
      formatSignedTemp(r.currentLow - r.extremeLow),
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  tableWrap.innerHTML = "";
  tableWrap.appendChild(table);
}

function computeShapeRows(dates, range) {
  return dates
    .filter((d) => d.targetDate >= range.start && d.targetDate <= range.end && d.snapshots.length > 0)
    .sort((a, b) => (a.targetDate < b.targetDate ? -1 : 1));
}

// A self-scaled mini trend line (Tufte-style sparkline) — shows the shape of every
// revision for one date, not just first/extreme/current, so a steady creep and a
// dip-then-recovery (which can share the same summary numbers) read differently.
function buildSparklineSvg(snaps) {
  const width = 120;
  const height = 32;
  const pad = 3;
  const highColor = cssVar("--series-high");
  const lowColor = cssVar("--series-low");

  const allVals = snaps.flatMap((s) => [s.maxTempC, s.minTempC]);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const span = max - min || 1;

  const xFor = (i) =>
    pad + (snaps.length === 1 ? (width - pad * 2) / 2 : ((width - pad * 2) * i) / (snaps.length - 1));
  const yFor = (v) => height - pad - ((v - min) / span) * (height - pad * 2);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("class", "spark-svg");
  svg.setAttribute("role", "img");

  const firstHigh = snaps[0].maxTempC;
  const lastHigh = snaps[snaps.length - 1].maxTempC;
  const firstLow = snaps[0].minTempC;
  const lastLow = snaps[snaps.length - 1].minTempC;
  svg.setAttribute(
    "aria-label",
    `High went from ${formatTemp(firstHigh)} to ${formatTemp(lastHigh)}; low went from ${formatTemp(
      firstLow
    )} to ${formatTemp(lastLow)}, across ${snaps.length} snapshot${snaps.length === 1 ? "" : "s"}.`
  );

  function addSparkLine(getValue, color) {
    const d = snaps.map((s, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(getValue(s))}`).join(" ");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);

    const lastIdx = snaps.length - 1;
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", xFor(lastIdx));
    dot.setAttribute("cy", yFor(getValue(snaps[lastIdx])));
    dot.setAttribute("r", 2);
    dot.setAttribute("fill", color);
    svg.appendChild(dot);
  }

  addSparkLine((s) => s.maxTempC, highColor);
  addSparkLine((s) => s.minTempC, lowColor);

  return svg;
}

function renderShapeTable(dates, range, onSelectDate) {
  const wrap = document.getElementById("shape-table-wrap");
  const rows = computeShapeRows(dates, range);
  if (!rows.length) {
    wrap.innerHTML = '<p class="card-sub">No dates tracked in this period.</p>';
    return;
  }

  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>Date</th><th>Shape (high / low)</th><th>First high</th><th>Current high</th><th>First low</th><th>Current low</th></tr>";
  const tbody = document.createElement("tbody");

  for (const d of rows) {
    const snaps = d.snapshots;
    const first = snaps[0];
    const current = snaps[snaps.length - 1];

    const tr = document.createElement("tr");
    tr.className = "spark-row";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-label", `View revision history for ${formatDayMonth(d.targetDate)}`);

    const dateTd = document.createElement("td");
    dateTd.textContent = formatDayMonth(d.targetDate);

    const sparkTd = document.createElement("td");
    sparkTd.appendChild(buildSparklineSvg(snaps));

    const valueCells = [
      formatTemp(first.maxTempC),
      formatTemp(current.maxTempC),
      formatTemp(first.minTempC),
      formatTemp(current.minTempC),
    ].map((c) => {
      const td = document.createElement("td");
      td.textContent = c;
      return td;
    });

    tr.append(dateTd, sparkTd, ...valueCells);
    tr.addEventListener("click", () => onSelectDate(d.targetDate));
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelectDate(d.targetDate);
      }
    });
    tbody.appendChild(tr);
  }

  table.append(thead, tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

function computeBiasBuckets(dates) {
  const buckets = new Map();
  for (const d of dates) {
    if (!d.actual) continue;
    const byBucket = new Map();
    for (const s of d.snapshots) {
      if (s.daysAhead < 0) continue;
      byBucket.set(s.daysAhead, s);
    }
    for (const [bucket, snap] of byBucket) {
      const b = buckets.get(bucket) ?? { highSum: 0, lowSum: 0, n: 0 };
      b.highSum += snap.maxTempC - d.actual.observedMaxC;
      b.lowSum += snap.minTempC - d.actual.observedMinC;
      b.n += 1;
      buckets.set(bucket, b);
    }
  }
  return [...buckets.entries()]
    .map(([bucket, b]) => ({ bucket, avgHighBias: b.highSum / b.n, avgLowBias: b.lowSum / b.n, n: b.n }))
    .sort((a, b) => b.bucket - a.bucket);
}

function statTile(label, value, n) {
  const tile = document.createElement("div");
  tile.className = "stat-tile";
  const labelEl = document.createElement("div");
  labelEl.className = "label";
  labelEl.textContent = label;
  const valueEl = document.createElement("div");
  valueEl.className = "value";
  valueEl.textContent = formatSignedTemp(value);
  const nEl = document.createElement("div");
  nEl.className = "n";
  nEl.textContent = `n=${n} date${n === 1 ? "" : "s"}`;
  tile.append(labelEl, valueEl, nEl);
  return tile;
}

function renderStatTiles(dates) {
  const buckets = computeBiasBuckets(dates);
  const row = document.getElementById("stat-row");
  row.innerHTML = "";
  if (!buckets.length) return;
  const furthest = buckets[0];
  const dayOf = buckets.find((b) => b.bucket === 0);
  row.appendChild(statTile(`High bias, ${furthest.bucket}d out`, furthest.avgHighBias, furthest.n));
  if (dayOf) row.appendChild(statTile("High bias, day of", dayOf.avgHighBias, dayOf.n));
  row.appendChild(statTile(`Low bias, ${furthest.bucket}d out`, furthest.avgLowBias, furthest.n));
  if (dayOf) row.appendChild(statTile("Low bias, day of", dayOf.avgLowBias, dayOf.n));
}

function renderBiasChart(dates) {
  const buckets = computeBiasBuckets(dates);
  const wrap = document.getElementById("bias-chart-wrap");
  const tableWrap = document.getElementById("bias-table-wrap");
  if (!buckets.length) {
    wrap.innerHTML = '<p class="card-sub">No completed dates with an actual yet.</p>';
    tableWrap.innerHTML = "";
    return;
  }

  const highColor = cssVar("--series-high");
  const lowColor = cssVar("--series-low");
  const xDomainValues = buckets.map((b) => b.bucket);

  createLineChart(wrap, {
    xDomainValues,
    series: [
      { color: highColor, label: "High bias", values: buckets.map((b) => b.avgHighBias) },
      { color: lowColor, label: "Low bias", values: buckets.map((b) => b.avgLowBias) },
    ],
    zeroLine: true,
    xTicks: buckets.map((b) => ({ x: b.bucket, label: b.bucket === 0 ? "Day of" : `${b.bucket}d out` })),
    yTickFormat: formatSignedTemp,
    tooltipHeader: (x) => (x === 0 ? "Day of" : `${x} days out`),
    ariaLabel: "Average forecast bias by lead time",
  });

  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Lead time</th><th>Avg high bias</th><th>Avg low bias</th><th>Dates</th></tr>";
  const tbody = document.createElement("tbody");
  for (const b of buckets) {
    const tr = document.createElement("tr");
    const cells = [
      b.bucket === 0 ? "Day of" : `${b.bucket} days out`,
      formatSignedTemp(b.avgHighBias),
      formatSignedTemp(b.avgLowBias),
      String(b.n),
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  tableWrap.innerHTML = "";
  tableWrap.appendChild(table);
}

function renderRevisionChart(dateEntry) {
  const wrap = document.getElementById("revision-chart-wrap");
  const tableWrap = document.getElementById("revision-table-wrap");
  const snaps = dateEntry.snapshots;
  if (!snaps.length) {
    wrap.innerHTML = '<p class="card-sub">No snapshots for this date.</p>';
    tableWrap.innerHTML = "";
    return;
  }

  const highColor = cssVar("--series-high");
  const lowColor = cssVar("--series-low");
  const xDomainValues = snaps.map((s) => Date.parse(s.fetchedAt));

  const markers = [];
  if (dateEntry.actual) {
    // Placed just after the last snapshot, not at a fixed clock time — the actual
    // is only knowable once every revision for the date is in, so it belongs at
    // the end of the line. BBC sometimes keeps revising a date's forecast for
    // hours past midnight, so a fixed time (e.g. "noon") can land surprisingly
    // early relative to how far the snapshots actually stretch.
    const firstSnapTime = xDomainValues[0];
    const lastSnapTime = xDomainValues[xDomainValues.length - 1];
    const span = lastSnapTime - firstSnapTime;
    const offset = Math.max(span * 0.08, 2 * 60 * 60 * 1000);
    const actualX = lastSnapTime + offset;
    markers.push({
      x: actualX,
      label: "Observed",
      items: [
        { color: highColor, value: dateEntry.actual.observedMaxC, label: "Observed high" },
        { color: lowColor, value: dateEntry.actual.observedMinC, label: "Observed low" },
      ],
    });
  }

  const uniqueDayTicks = [];
  const seenDays = new Set();
  xDomainValues.forEach((x) => {
    const day = new Date(x).toISOString().slice(0, 10);
    if (!seenDays.has(day)) {
      seenDays.add(day);
      uniqueDayTicks.push({ x, label: formatDayMonth(day) });
    }
  });

  createLineChart(wrap, {
    xDomainValues,
    series: [
      { color: highColor, label: "Predicted high", values: snaps.map((s) => s.maxTempC) },
      { color: lowColor, label: "Predicted low", values: snaps.map((s) => s.minTempC) },
    ],
    markers,
    xTicks: uniqueDayTicks,
    yTickFormat: formatTemp,
    tooltipHeader: (x) => formatDateTime(new Date(x).toISOString()),
    ariaLabel: `Forecast revisions for ${dateEntry.targetDate}`,
  });

  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Fetched at</th><th>Predicted high</th><th>Predicted low</th></tr>";
  const tbody = document.createElement("tbody");
  for (const s of snaps) {
    const tr = document.createElement("tr");
    [formatDateTime(s.fetchedAt), formatTemp(s.maxTempC), formatTemp(s.minTempC)].forEach((c) => {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  if (dateEntry.actual) {
    const tr = document.createElement("tr");
    ["Observed (actual)", formatTemp(dateEntry.actual.observedMaxC), formatTemp(dateEntry.actual.observedMinC)].forEach(
      (c) => {
        const td = document.createElement("td");
        td.textContent = c;
        tr.appendChild(td);
      }
    );
    tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  tableWrap.innerHTML = "";
  tableWrap.appendChild(table);
}

function populateDateSelect(dates) {
  const select = document.getElementById("date-select");
  select.innerHTML = "";
  const sorted = [...dates].sort((a, b) => (a.targetDate < b.targetDate ? 1 : -1));
  for (const d of sorted) {
    const opt = document.createElement("option");
    opt.value = d.targetDate;
    opt.textContent = `${formatDayMonth(d.targetDate)}${d.actual ? "" : " (pending)"}`;
    select.appendChild(opt);
  }
  const defaultEntry = sorted.find((d) => d.actual) ?? sorted[0];
  select.value = defaultEntry.targetDate;
  renderRevisionChart(defaultEntry);
  select.addEventListener("change", () => {
    const entry = dates.find((d) => d.targetDate === select.value);
    if (entry) renderRevisionChart(entry);
  });
}

function selectDateInRevisionChart(dates, targetDate) {
  const select = document.getElementById("date-select");
  const entry = dates.find((d) => d.targetDate === targetDate);
  if (!entry || !select) return;
  select.value = targetDate;
  renderRevisionChart(entry);
  document.getElementById("revision-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderFooter(json) {
  const footer = document.getElementById("footer-note");
  const pending = json.dates.filter((d) => !d.actual).length;
  footer.textContent = `Last updated ${formatDateTime(json.generatedAt)}. ${json.dates.length} date${
    json.dates.length === 1 ? "" : "s"
  } tracked, ${pending} pending an actual.`;
}

function onToggleTable(e) {
  const target = e.currentTarget.dataset.target;
  const chartWrap = document.getElementById(`${target}-chart-wrap`);
  const tableWrap = document.getElementById(`${target}-table-wrap`);
  const showingTable = !tableWrap.classList.contains("hidden");
  chartWrap.classList.toggle("hidden", !showingTable);
  tableWrap.classList.toggle("hidden", showingTable);
  e.currentTarget.textContent = showingTable ? "Table view" : "Chart view";
}

async function main() {
  const res = await fetch("/api/data");
  const json = await res.json();

  if (!json.dates.length) {
    document.getElementById("empty-state").classList.remove("hidden");
    document.getElementById("content").classList.add("hidden");
    return;
  }

  setupRangeFilter(json.dates);
  renderStatTiles(json.dates);
  renderBiasChart(json.dates);
  populateDateSelect(json.dates);
  renderFooter(json);

  document.querySelectorAll(".table-toggle").forEach((btn) => btn.addEventListener("click", onToggleTable));
}

main();
