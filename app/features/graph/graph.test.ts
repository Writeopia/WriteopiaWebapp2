import { describe, expect, it } from "vitest";

import type { DocumentTag } from "~/core/models";

import { aDocument, aFolder, WORKSPACE_ID } from "../../../test/fixtures";
import { ForceLayout, LEAF_DISTANCE } from "./layout";
import { buildGraph, itemDetails, type WorkspaceGraphData } from "./model";

const tag = (id: string, name: string): DocumentTag => ({
  id,
  workspaceId: WORKSPACE_ID,
  name,
  description: `About ${name}`,
  createdAt: 0,
  lastUpdatedAt: 0,
  deleted: false,
});

const data: WorkspaceGraphData = {
  folders: [
    aFolder({ id: "work", title: "Work", parentId: "root" }),
    aFolder({ id: "plans", title: "Plans", parentId: "work" }),
  ],
  documents: [
    aDocument({ id: "groceries", title: "Groceries", parentId: "root", tagIds: ["home"] }),
    aDocument({ id: "report", title: "Report", parentId: "work", tagIds: ["home", "job"] }),
    aDocument({ id: "q3", title: "Q3", parentId: "plans", lastUpdatedAt: 42 }),
  ],
  tags: [tag("home", "Home"), tag("job", "Job")],
};

const edges = (graph: ReturnType<typeof buildGraph>) =>
  graph.links.map((link) => `${link.source.id}>${link.target.id}`).sort();

describe("the graph of a workspace", () => {
  it("links each folder to what it holds; the root is no node", () => {
    const graph = buildGraph(data, "folders");

    expect(graph.nodes.map((node) => node.id).sort()).toEqual([
      "groceries",
      "plans",
      "q3",
      "report",
      "work",
    ]);
    expect(edges(graph)).toEqual(["plans>q3", "work>plans", "work>report"]);
    expect(graph.nodes.find((node) => node.id === "work")).toMatchObject({
      isFolder: true,
      isTag: false,
    });
  });

  it("links each tag to the documents that carry it, one node per document", () => {
    const graph = buildGraph(data, "tags");

    expect(graph.nodes.map((node) => node.id).sort()).toEqual([
      "groceries",
      "home",
      "job",
      "q3",
      "report",
    ]);
    expect(edges(graph)).toEqual(["home>groceries", "home>report", "job>report"]);
    expect(graph.nodes.find((node) => node.id === "home")).toMatchObject({
      isFolder: true,
      isTag: true,
    });
  });

  it("describes a document, a folder and a tag", () => {
    expect(itemDetails(data, "q3")).toEqual({
      kind: "document",
      id: "q3",
      title: "Q3",
      lastUpdatedAt: 42,
      folderName: "Plans",
      tagNames: [],
    });
    expect(itemDetails(data, "report")).toMatchObject({
      folderName: "Work",
      tagNames: ["Home", "Job"],
    });
    expect(itemDetails(data, "groceries")).toMatchObject({ folderName: null });
    expect(itemDetails(data, "work")).toEqual({
      kind: "folder",
      id: "work",
      title: "Work",
      folderCount: 1,
      documentCount: 1,
    });
    expect(itemDetails(data, "home")).toEqual({
      kind: "tag",
      id: "home",
      title: "Home",
      description: "About Home",
      documentIds: ["groceries", "report"],
    });
    expect(itemDetails(data, "missing")).toBeNull();
  });
});

describe("the force layout", () => {
  it("comes to rest with every node placed apart and documents near their folder", () => {
    const graph = buildGraph(data, "folders");
    const layout = new ForceLayout(graph.nodes, graph.links);

    layout.placeRadially(400, 300);
    layout.warmUp(400, 300);
    for (let i = 0; i < 500 && !layout.isSettled; i++) layout.tick(400, 300);

    expect(layout.isSettled).toBe(true);
    for (const node of graph.nodes) {
      expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
    }
    const at = (id: string) => graph.nodes.find((node) => node.id === id)!;
    const distance = (a: string, b: string) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
    expect(distance("plans", "q3")).toBeLessThan(LEAF_DISTANCE * 2);
    expect(distance("work", "plans")).toBeGreaterThan(distance("plans", "q3"));
    const positions = new Set(
      graph.nodes.map((node) => `${Math.round(node.x)},${Math.round(node.y)}`),
    );
    expect(positions.size).toBe(graph.nodes.length);
  });

  it("wakes up while a node is dragged", () => {
    const graph = buildGraph(data, "folders");
    const layout = new ForceLayout(graph.nodes, graph.links);
    layout.placeRadially(0, 0);
    for (let i = 0; i < 2000 && !layout.isSettled; i++) layout.tick(0, 0);
    expect(layout.isSettled).toBe(true);

    graph.nodes[0]!.isDragged = true;
    layout.tick(0, 0);
    expect(layout.isSettled).toBe(false);
  });

  it("is heated again when a node is dropped, never cooled by it", () => {
    const layout = new ForceLayout([], []);
    layout.alpha = 0.0005;
    layout.reheat(0.3);
    expect(layout.alpha).toBe(0.3);
    layout.reheat(0.1);
    expect(layout.alpha).toBe(0.3);
  });

  it("handles an empty graph", () => {
    const layout = new ForceLayout([], []);
    layout.placeRadially(0, 0);
    layout.warmUp(0, 0);
    expect(layout.nodes).toEqual([]);
  });
});
