import { describe, expect, it, vi } from "vitest";
import { contentWorkflowCatalog } from "../../../src/api/contentWorkflowSchemas";
import {
  CREATOR_PRESETS,
  creatorPreset,
} from "../../../src/features/rooms/creatorPresets";
import { getContentWorkflowCatalog } from "../../src/core/content-workflow-catalog";

describe("content workflow reference catalog", () => {
  it("exposes only actual existing native starter definitions", () => {
    const catalog = getContentWorkflowCatalog();
    expect(contentWorkflowCatalog.safeParse(catalog).success).toBe(true);
    expect(catalog.native_presets).toHaveLength(6);
    expect(catalog.native_presets).toEqual(
      CREATOR_PRESETS.map((preset) => preset.id),
    );
    for (const id of catalog.native_presets)
      expect(creatorPreset(id).preset_id).toBe(id);
    expect(catalog.native_presets).not.toContain("comfyui");
    expect(catalog.native_presets).not.toContain("runway");
    expect(catalog.native_presets).not.toContain("higgsfield");
  });

  it("keeps studied providers and learning modules separate from execution and evaluated competence", () => {
    const catalog = getContentWorkflowCatalog();
    expect(
      catalog.providers.find((entry) => entry.id === "comfyui")?.status,
    ).toBe("inspect_only");
    for (const id of ["runway", "higgsfield"])
      expect(catalog.providers.find((entry) => entry.id === id)?.status).toBe(
        "learning_only",
      );
    expect(
      catalog.providers
        .filter((entry) => entry.status === "creator_capability_required")
        .map((entry) => entry.id),
    ).toEqual(["creator"]);
    expect(catalog.modules).toHaveLength(8);
    expect(new Set(catalog.modules.map((module) => module.id)).size).toBe(8);
    expect(
      catalog.modules.every(
        (module) =>
          module.status === "not_evaluated" &&
          module.deliverable.length > 0 &&
          module.acceptance.length > 0,
      ),
    ).toBe(true);
    expect(
      catalog.providers.every((entry) =>
        entry.sources.every(
          (source) => new URL(source.url).protocol === "https:",
        ),
      ),
    ).toBe(true);
  });

  it("does not discover providers or let one caller mutate another caller's catalog", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("Catalog reads are offline");
    });
    try {
      const first = getContentWorkflowCatalog();
      first.native_presets.splice(0);
      first.providers[0]!.summary = "caller edited";
      first.modules.splice(0);
      const second = getContentWorkflowCatalog();
      expect(second.native_presets).toHaveLength(6);
      expect(second.modules).toHaveLength(8);
      expect(second.providers[0]!.summary).not.toBe("caller edited");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
