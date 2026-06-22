#!/usr/bin/env node

// npm install && npm run smoke-test

import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const ROOT = process.cwd();
const EXAMPLES_DIR = path.join(ROOT, "examples");

function clone(obj) {
  return structuredClone(obj);
}

function convertSimpleYaml(data) {
  if (("lmm_layout_gen" in data) === false) {
    throw new TypeError("Not a stripe YAML file: expected lmm_layout_gen");
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

  const pushComponent = (componentData) => {
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
  };

  if (("components" in data) === false) {
    for (const value of Object.values(data)) {
      if (value && typeof value === "object") {
        pushComponent(value);
      }
    }
  } else {
    for (const componentData of data.components) {
      pushComponent(componentData);
    }
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
      const sublayout = componentData.sub_layout || {};
      const size = Number(sublayout.lmm_extension_size || sublayout.lmm_stripe_size || 0);
      const stripeCount = Number(sublayout.lmm_stripe_count || 0);
      const start = Number(componentData.lcme_extent.e_start || 0);
      const end = componentData.lcme_extent.e_end;

      const eofend = end === "EOF" ? start + stripeCount * size : Number(end);

      components.push({
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
        stripes: Array.isArray(sublayout.lmm_objects)
          ? sublayout.lmm_objects.map((stripeData) => ({
              l_ost_idx: Number(stripeData.l_ost_idx || 0),
              l_fid: stripeData.l_fid || ""
            }))
          : []
      });
    }
  }

  return components;
}

function maxExtent(components) {
  return components.reduce((acc, c) => Math.max(acc, Number(c.eofend || 0)), 0);
}

async function main() {
  const allFiles = await fs.readdir(EXAMPLES_DIR);
  const yamlFiles = allFiles.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml")).sort();

  if (yamlFiles.length === 0) {
    throw new Error("No YAML files found in examples/");
  }

  let passCount = 0;
  for (const file of yamlFiles) {
    const abs = path.join(EXAMPLES_DIR, file);
    const raw = await fs.readFile(abs, "utf8");
    const parsed = yaml.load(raw);
    const normalized = parsed?.mirrors ? parsed : convertYaml(clone(parsed));
    const components = parseYaml(normalized);
    const extent = maxExtent(components);

    if (!components.length) {
      throw new Error(`${file}: no components parsed`);
    }
    if (!(extent > 0)) {
      throw new Error(`${file}: extent is not positive`);
    }

    const badComponent = components.find((c) => Number.isNaN(c.start) || Number.isNaN(c.mirror));
    if (badComponent) {
      throw new Error(`${file}: invalid component fields`);
    }

    passCount += 1;
    console.log(`PASS ${file} components=${components.length} extent=${extent}`);
  }

  console.log(`\nSmoke test passed: ${passCount}/${yamlFiles.length} YAML files`);
}

main().catch((err) => {
  console.error(`\nSmoke test failed: ${err.message || err}`);
  process.exit(1);
});
