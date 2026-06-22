(function () {
  "use strict";

  const MB = 1048576;
  const MIN_LAYOUT_BYTES = 1;

  const palette = [
    "#90be6d", "#f8961e", "#f9c74f", "#43aa8b", "#4d908e", "#577590",
    "#277da1", "#f9844a", "#7fb069", "#bc4749", "#a7c957", "#8ecae6"
  ];

  const stripePalette = [
    "#118ab2", "#06d6a0", "#ffd166", "#ef476f", "#8338ec", "#3a86ff",
    "#8ac926", "#ffbe0b", "#ff595e", "#1982c4", "#6a4c93", "#2a9d8f",
    "#e76f51", "#ff7f51", "#5e60ce", "#80ed99", "#00bbf9", "#f72585",
    "#9b5de5", "#f15bb5"
  ];

  const dom = {
    yamlInput: document.getElementById("yamlInput"),
    yamlFile: document.getElementById("yamlFile"),
    renderBtn: document.getElementById("renderBtn"),
    sampleBtn: document.getElementById("sampleBtn"),
    clearBtn: document.getElementById("clearBtn"),
    status: document.getElementById("status"),
    summary: document.getElementById("summary"),
    chart: document.getElementById("chart"),
    downloadSvgBtn: document.getElementById("downloadSvgBtn"),
    downloadPngBtn: document.getElementById("downloadPngBtn")
  };

  let lastFileBaseName = "stripe-layout";

  wireEvents();

  function wireEvents() {
    dom.renderBtn.addEventListener("click", renderFromInput);
    dom.sampleBtn.addEventListener("click", loadSample);
    dom.clearBtn.addEventListener("click", clearAll);
    dom.yamlFile.addEventListener("change", onFileSelected);
    dom.downloadSvgBtn.addEventListener("click", () => downloadSvg(lastFileBaseName + ".svg"));
    dom.downloadPngBtn.addEventListener("click", () => downloadPng(lastFileBaseName + ".png"));
  }

  async function onFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    lastFileBaseName = file.name.replace(/\.[^.]+$/, "") || "stripe-layout";
    const text = await file.text();
    dom.yamlInput.value = text;
    setStatus("Loaded " + file.name + ".", false);
  }

  async function loadSample() {
    setStatus("Loading sample YAML...", false);
    try {
      const response = await fetch("examples/simple.yaml");
      if (!response.ok) {
        throw new Error("Could not fetch examples/simple.yaml");
      }
      dom.yamlInput.value = await response.text();
      lastFileBaseName = "simple";
      setStatus("Sample YAML loaded.", false);
    } catch (err) {
      setStatus(String(err.message || err), true);
    }
  }

  function clearAll() {
    dom.yamlInput.value = "";
    dom.summary.textContent = "";
    setStatus("", false);
    resetSvg();
    dom.downloadSvgBtn.disabled = true;
    dom.downloadPngBtn.disabled = true;
  }

  function renderFromInput() {
    setStatus("", false);

    const rawText = dom.yamlInput.value.trim();
    if (!rawText) {
      setStatus("Paste YAML or open a YAML file first.", true);
      return;
    }

    let yamlData;
    try {
      yamlData = globalThis.jsyaml.load(rawText);
    } catch (err) {
      setStatus("YAML parse error: " + (err.message || err), true);
      return;
    }

    if (!yamlData || typeof yamlData !== "object") {
      setStatus("YAML did not produce an object.", true);
      return;
    }

    const normalized = yamlData.mirrors ? yamlData : convertYaml(clone(yamlData));
    if (!normalized) {
      return;
    }

    let components;
    try {
      components = parseYaml(normalized);
    } catch (err) {
      setStatus("Layout parse error: " + (err.message || err), true);
      return;
    }

    if (!components.length) {
      setStatus("No components found after parsing.", true);
      return;
    }

    drawExtentDiagram(components);
    dom.downloadSvgBtn.disabled = false;
    dom.downloadPngBtn.disabled = false;

    const mirrorSet = new Set(components.map((c) => c.mirror));
    dom.summary.innerHTML =
      "<strong>Components:</strong> " + components.length +
      " | <strong>Mirrors:</strong> " + mirrorSet.size +
      " | <strong>Total extent:</strong> " + formatBytes(maxExtent(components));

    setStatus("Rendered layout successfully.", false);
  }

  function convertSimpleYaml(data) {
    if (("lmm_layout_gen" in data) === false) {
      setStatus("Error: Not a stripe YAML file. Expected lmm_layout_gen.", true);
      return null;
    }

    return {
      lcm_layout_gen: data.lmm_layout_gen,
      lcm_mirror_count: 1,
      lcm_entry_count: 1,
      mirrors: [
        {
          lcme_mirror_id: 1,
          components: [
            {
              lcme_extent: { e_start: 0, e_end: "EOF" },
              lcme_id: 0,
              lcme_flags: 0,
              sub_layout: data
            }
          ]
        }
      ]
    };
  }

  function convertYaml(data) {
    if (("lcm_layout_gen" in data) === false) {
      return convertSimpleYaml(data);
    }

    const lcmLayoutGen = data.lcm_layout_gen;
    const lcmMirrorCount = data.lcm_mirror_count;
    const lcmEntryCount = data.lcm_entry_count;

    delete data.lcm_layout_gen;
    delete data.lcm_mirror_count;
    delete data.lcm_entry_count;

    const mirrors = new Map();

    if (("components" in data) === false) {
      Object.keys(data).forEach((key) => {
        const componentData = data[key];
        if (!componentData || typeof componentData !== "object") {
          return;
        }

        const mirrorId = componentData.lcme_mirror_id;
        const transformed = {
          ...componentData,
          lcme_extent: {
            e_start: componentData["lcme_extent.e_start"],
            e_end: componentData["lcme_extent.e_end"]
          }
        };

        delete transformed.lcme_mirror_id;
        delete transformed["lcme_extent.e_start"];
        delete transformed["lcme_extent.e_end"];

        if (!mirrors.has(mirrorId)) {
          mirrors.set(mirrorId, { lcme_mirror_id: mirrorId, components: [] });
        }
        mirrors.get(mirrorId).components.push(transformed);
      });
    } else {
      data.components.forEach((componentData) => {
        const mirrorId = componentData.lcme_mirror_id;
        const transformed = {
          ...componentData,
          lcme_extent: {
            e_start: componentData["lcme_extent.e_start"],
            e_end: componentData["lcme_extent.e_end"]
          }
        };

        delete transformed.lcme_mirror_id;
        delete transformed["lcme_extent.e_start"];
        delete transformed["lcme_extent.e_end"];

        if (!mirrors.has(mirrorId)) {
          mirrors.set(mirrorId, { lcme_mirror_id: mirrorId, components: [] });
        }
        mirrors.get(mirrorId).components.push(transformed);
      });
    }

    return {
      lcm_layout_gen: lcmLayoutGen,
      lcm_mirror_count: lcmMirrorCount,
      lcm_entry_count: lcmEntryCount,
      mirrors: Array.from(mirrors.values())
    };
  }

  function parseYaml(data) {
    if (!Array.isArray(data.mirrors)) {
      throw new TypeError("YAML missing mirrors array");
    }

    const components = [];

    for (const mirrorData of data.mirrors) {
      const mirrorComponents = Array.isArray(mirrorData.components) ? mirrorData.components : [];
      for (const componentData of mirrorComponents) {
        components.push(buildComponent(mirrorData, componentData));
      }
    }

    return components;
  }

  function buildComponent(mirrorData, componentData) {
    const sublayout = componentData.sub_layout || {};
    const size = Number(sublayout.lmm_extension_size || sublayout.lmm_stripe_size || 0);
    const stripeCount = Number(sublayout.lmm_stripe_count || 0);
    const start = Number(componentData.lcme_extent.e_start || 0);
    const end = componentData.lcme_extent.e_end;

    const eofend = end === "EOF" ? start + stripeCount * size : Number(end);
    const objects = Array.isArray(sublayout.lmm_objects) ? sublayout.lmm_objects : [];

    return {
      id: Number(componentData.lcme_id || 0),
      mirror: Number(mirrorData.lcme_mirror_id || 1),
      start,
      end,
      flags: Number(componentData.lcme_flags || 0),
      stripeSize: size,
      eofend,
      pattern: String(sublayout.lmm_pattern || "unknown"),
      pool: String(sublayout.lmm_pool || sublayout.lmm_pattern || "unknown"),
      count: stripeCount,
      stripes: objects.map((stripeData) => ({
        l_ost_idx: Number(stripeData.l_ost_idx || 0),
        l_fid: stripeData.l_fid || ""
      }))
    };
  }

  function drawExtentDiagram(components) {
    resetSvg();

    const width = 1500;
    const margin = { top: 30, right: 30, bottom: 80, left: 70 };
    const rowHeight = 84;

    const maxext = Math.max(maxExtent(components), MIN_LAYOUT_BYTES);
    const mirrorIds = Array.from(
      new Set(components.map((c) => Math.max(Number(c.mirror) || 1, 1)))
    ).sort((a, b) => a - b);
    const mirrorRowById = new Map(mirrorIds.map((id, idx) => [id, idx]));
    const mirrorCount = mirrorIds.length;
    const height = margin.top + margin.bottom + mirrorCount * rowHeight;
    const plotWidth = width - margin.left - margin.right;

    dom.chart.setAttribute("viewBox", "0 0 " + width + " " + height);
    dom.chart.setAttribute("width", String(width));
    dom.chart.setAttribute("height", String(height));

    const bg = svgEl("rect", {
      x: 0,
      y: 0,
      width,
      height,
      fill: "#fbfffc"
    });
    dom.chart.appendChild(bg);

    for (let row = 0; row < mirrorCount; row++) {
      const mirrorId = mirrorIds[row];
      const y = margin.top + row * rowHeight;
      dom.chart.appendChild(svgEl("rect", {
        x: margin.left,
        y,
        width: plotWidth,
        height: rowHeight - 10,
        fill: row % 2 ? "#f4faf5" : "#eef6f0"
      }));

      dom.chart.appendChild(svgEl("text", {
        x: margin.left - 12,
        y: y + (rowHeight - 10) / 2 + 4,
        fill: "#2a4a3a",
        "font-size": "12",
        "font-family": "IBM Plex Mono, monospace",
        "text-anchor": "end"
      }, "M" + mirrorId));
    }

    components.forEach((component, idx) => {
      const start = clamp(component.start, 0, maxext);
      const resolvedEnd = component.end === "EOF" ? maxext : Number(component.end);
      const end = clamp(resolvedEnd, start, maxext);

      const x0 = margin.left + (start / maxext) * plotWidth;
      const x1 = margin.left + (end / maxext) * plotWidth;
      const compW = Math.max(1, x1 - x0);

      const mirrorIdx = mirrorRowById.get(Math.max(Number(component.mirror) || 1, 1)) ?? 0;
      const y = margin.top + mirrorIdx * rowHeight;
      const yComp = y + 3;
      const hComp = rowHeight - 16;

      const compColor = palette[idx % palette.length];
      dom.chart.appendChild(svgEl("rect", {
        x: x0,
        y: yComp,
        width: compW,
        height: hComp,
        rx: 4,
        fill: compColor,
        stroke: "#244133",
        "stroke-opacity": "0.3"
      }));

      const label = component.pattern === "mdt"
        ? "mdt"
        : "#" + idx + " pool:" + component.pool + " id:" + component.id;

      dom.chart.appendChild(svgEl("text", {
        x: x0 + 4,
        y: yComp + 14,
        fill: "#102a1f",
        "font-size": "12",
        "font-family": "Space Grotesk, sans-serif"
      }, label));

      drawStripes(component, x0, x1, yComp, hComp, maxext, plotWidth);
    });

    drawAxis(maxext, margin, plotWidth, height);
  }

  function drawStripes(component, x0, x1, yComp, hComp, maxext, plotWidth) {
    if (!component.stripes?.length || component.stripeSize <= 0 || component.count <= 0) {
      return;
    }

    const start = component.start;
    const end = component.end === "EOF" ? maxext : Number(component.end);
    const span = Math.max(0, end - start);
    const stripePixel = (component.stripeSize / maxext) * plotWidth;

    const stripeY = yComp + Math.floor(hComp * 0.38);
    const stripeH = Math.max(8, Math.floor(hComp * 0.55));

    if (stripePixel < 2.5) {
      drawCollapsedStripeSummary(x0, x1, stripeY, stripeH, span, component.stripeSize);
      return;
    }

    drawDetailedStripes(component, start, end, stripeY, stripeH, maxext, plotWidth);
  }

  function drawCollapsedStripeSummary(x0, x1, stripeY, stripeH, span, stripeSize) {
    dom.chart.appendChild(svgEl("rect", {
      x: x0,
      y: stripeY,
      width: Math.max(1, x1 - x0),
      height: stripeH,
      fill: "#e7c98d",
      stroke: "#243428",
      "stroke-width": "0.5"
    }));

    const approxStripes = Math.max(1, Math.floor(span / stripeSize));
    dom.chart.appendChild(svgEl("text", {
      x: x0 + 4,
      y: stripeY + stripeH - 3,
      fill: "#243428",
      "font-size": "11",
      "font-family": "IBM Plex Mono, monospace"
    }, approxStripes + " stripes"));
  }

  function drawDetailedStripes(component, start, end, stripeY, stripeH, maxext, plotWidth) {
    let stripeStart = start;
    let firstCycle = true;

    while (stripeStart < end) {
      for (let i = 0; i < component.count; i++) {
        const stripeEnd = Math.min(stripeStart + component.stripeSize, end);
        const sx0 = xToPx(stripeStart, maxext, plotWidth);
        const sx1 = xToPx(stripeEnd, maxext, plotWidth);
        const sw = Math.max(1, sx1 - sx0);

        let color = "#8a8a8a";
        let text = "";

        if (i < component.stripes.length) {
          const stripe = component.stripes[i];
          color = stripePalette[stripe.l_ost_idx % stripePalette.length];
          text = toHex4(stripe.l_ost_idx);
        }

        dom.chart.appendChild(svgEl("rect", {
          x: sx0,
          y: stripeY,
          width: sw,
          height: stripeH,
          fill: color,
          stroke: "#1c3024",
          "stroke-width": "0.35"
        }));

        if (firstCycle && text && sw > 14) {
          dom.chart.appendChild(svgEl("text", {
            x: sx0 + sw / 2,
            y: stripeY + stripeH / 2 + 4,
            fill: "#0e0e0e",
            "font-size": "10",
            "font-family": "IBM Plex Mono, monospace",
            "text-anchor": "middle"
          }, text));
        }

        stripeStart += component.stripeSize;
        if (stripeStart >= end) {
          break;
        }
      }
      firstCycle = false;
    }
  }

  function drawAxis(maxext, margin, plotWidth, height) {
    const y = height - margin.bottom + 16;
    dom.chart.appendChild(svgEl("line", {
      x1: margin.left,
      y1: y,
      x2: margin.left + plotWidth,
      y2: y,
      stroke: "#3c5547",
      "stroke-width": "1"
    }));

    const maxMb = Math.ceil(maxext / MB);
    const stepMb = Math.max(1, Math.ceil(maxMb / 10));

    for (let mb = 0; mb <= maxMb; mb += stepMb) {
      const bytes = Math.min(maxext, mb * MB);
      const x = margin.left + (bytes / maxext) * plotWidth;

      dom.chart.appendChild(svgEl("line", {
        x1: x,
        y1: y,
        x2: x,
        y2: y + 5,
        stroke: "#3c5547",
        "stroke-width": "1"
      }));

      const label = svgEl("text", {
        x,
        y: y + 20,
        fill: "#2e4338",
        "font-size": "11",
        "font-family": "IBM Plex Mono, monospace",
        transform: "rotate(38 " + x + " " + (y + 20) + ")"
      }, mb + " MB");
      dom.chart.appendChild(label);
    }

    dom.chart.appendChild(svgEl("text", {
      x: margin.left,
      y: y + 40,
      fill: "#2e4338",
      "font-size": "12",
      "font-family": "Space Grotesk, sans-serif"
    }, "Extent"));
  }

  function xToPx(value, maxext, plotWidth) {
    const marginLeft = 70;
    return marginLeft + (value / maxext) * plotWidth;
  }

  function maxExtent(components) {
    return components.reduce((acc, c) => Math.max(acc, Number(c.eofend || 0)), 0);
  }

  function formatBytes(bytes) {
    return Math.round(bytes / MB) + " MB";
  }

  function toHex4(value) {
    const n = Number(value || 0);
    return n.toString(16).padStart(4, "0");
  }

  function resetSvg() {
    while (dom.chart.firstChild) {
      dom.chart.firstChild.remove();
    }
  }

  function setStatus(message, isError) {
    dom.status.textContent = message;
    dom.status.classList.toggle("error", Boolean(isError));
  }

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function clone(obj) {
    return structuredClone(obj);
  }

  function svgEl(name, attrs, text) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs || {}).forEach((key) => el.setAttribute(key, String(attrs[key])));
    if (typeof text === "string") {
      el.textContent = text;
    }
    return el;
  }

  function downloadSvg(filename) {
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(dom.chart);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    triggerDownload(blob, filename);
  }

  function downloadPng(filename) {
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(dom.chart);
    const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = dom.chart.viewBox.baseVal.width || dom.chart.clientWidth || 1500;
      canvas.height = dom.chart.viewBox.baseVal.height || dom.chart.clientHeight || 500;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fbfffc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (blob) {
          triggerDownload(blob, filename);
        }
      }, "image/png");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
})();
