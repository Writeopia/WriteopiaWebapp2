/**
 * The force layout of the documents graph, ported from ForceLayout.kt (itself after d3-force):
 * links pull to a distance, nodes push each other away, the graph is kept centred, and a cooling
 * alpha scales every force so the layout comes to rest.
 *
 * The hubs (folders, tags) make it read as clusters: a hub's documents hang close to it, while
 * the link between two hubs is long enough for both clusters to fit side by side. The nodes
 * start where the layout will roughly put them (placeRadially) and most of the cooling runs
 * before the first frame (warmUp). Distances are in CSS pixels.
 */

export type GraphNode = {
  id: string;
  label: string;
  /** A folder or a tag: a hub that documents hang from. */
  isFolder: boolean;
  isTag: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isDragged: boolean;
};

export type GraphLink = { source: GraphNode; target: GraphNode };

export const LEAF_DISTANCE = 44;
export const LEAF_SPREAD = 9;
export const HUB_RADIUS = 20;
export const HUB_GAP = 70;
const LEAF_CHARGE = -40;
const HUB_CHARGE = -160;
const GRAVITY = 0.05;
const COLLISION_DISTANCE = 34;
const COLLISION_STRENGTH = 0.7;
const VELOCITY_DECAY = 0.4;
export const ALPHA_MIN = 0.001;
const COOLING_TICKS = 300;
export const DRAG_ALPHA = 0.3;
const WARM_UP_TICKS = 200;
const WARM_UP_BUDGET = 40_000_000;
const MIN_DISTANCE = 1;
/** π(3 − √5): the angle between neighbours on a sunflower spiral. */
const GOLDEN_ANGLE = 2.3999632;

export class ForceLayout {
  alpha = 1;
  private alphaTarget = 0;
  private readonly alphaDecay = 1 - Math.pow(ALPHA_MIN, 1 / COOLING_TICKS);
  private readonly sourceIndex: number[];
  private readonly targetIndex: number[];
  private readonly degree: number[];
  private readonly leafCount: number[];
  private readonly linkDistance: number[];
  private readonly linkStrength: number[];
  private readonly linkBias: number[];
  private readonly isTop: boolean[];
  private readonly charge: number[];

  constructor(
    readonly nodes: GraphNode[],
    readonly links: GraphLink[],
  ) {
    const indexOf = new Map(nodes.map((node, index) => [node, index]));
    this.sourceIndex = links.map((link) => indexOf.get(link.source)!);
    this.targetIndex = links.map((link) => indexOf.get(link.target)!);

    this.degree = nodes.map(() => 0);
    this.leafCount = nodes.map(() => 0);
    this.isTop = nodes.map(() => true);
    links.forEach((_, i) => {
      const source = this.sourceIndex[i]!;
      const target = this.targetIndex[i]!;
      this.degree[source]!++;
      this.degree[target]!++;
      if (!nodes[target]!.isFolder) this.leafCount[source]!++;
      this.isTop[target] = false;
    });

    this.linkDistance = links.map((_, i) => {
      const source = this.sourceIndex[i]!;
      const target = this.targetIndex[i]!;
      return nodes[source]!.isFolder && nodes[target]!.isFolder
        ? this.clusterRadius(source) + this.clusterRadius(target) + HUB_GAP
        : LEAF_DISTANCE;
    });
    // Like d3: a link pulls less on a node with many links, so a hub is not dragged around by
    // its documents, and the node with fewer links moves more.
    this.linkStrength = links.map(
      (_, i) =>
        1 /
        Math.max(
          Math.min(this.degree[this.sourceIndex[i]!]!, this.degree[this.targetIndex[i]!]!),
          1,
        ),
    );
    this.linkBias = links.map((_, i) => {
      const source = this.degree[this.sourceIndex[i]!]!;
      return source / (source + this.degree[this.targetIndex[i]!]!);
    });
    this.charge = nodes.map((node) => (node.isFolder ? HUB_CHARGE : LEAF_CHARGE));
  }

  /** Whether the layout has come to rest; nothing moves until a node is dragged. */
  get isSettled(): boolean {
    return this.alpha < ALPHA_MIN && this.alphaTarget === 0;
  }

  /** The radius of the ring of documents around a node. */
  clusterRadius(index: number): number {
    const leaves = this.leafCount[index] ?? 0;
    return leaves === 0 ? HUB_RADIUS : LEAF_DISTANCE + LEAF_SPREAD * Math.sqrt(leaves);
  }

  /** Runs the first ticks before anything is drawn, bounded by pair visits on large graphs. */
  warmUp(centerX: number, centerY: number, budget = WARM_UP_BUDGET): void {
    const pairs = this.nodes.length * this.nodes.length;
    const ticks = pairs === 0 ? 0 : Math.min(WARM_UP_TICKS, Math.floor(budget / pairs));
    for (let i = 0; i < ticks; i++) this.tick(centerX, centerY);
  }

  /**
   * Heats the layout to at least [alpha]. A dropped node does it: a quick drag barely warms the
   * layout, and its neighbours would otherwise stay where the drag left them.
   */
  reheat(alpha = 1): void {
    this.alpha = Math.max(this.alpha, alpha);
  }

  /** One step of the simulation. A dragged node heats it again, like d3's alphaTarget. */
  tick(centerX: number, centerY: number): void {
    this.alphaTarget = this.nodes.some((node) => node.isDragged) ? DRAG_ALPHA : 0;
    if (this.isSettled) return;

    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;

    this.applyLinks();
    this.applyCharge();
    this.applyCollision();
    this.applyGravity(centerX, centerY);

    for (const node of this.nodes) {
      if (node.isDragged) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx *= 1 - VELOCITY_DECAY;
      node.vy *= 1 - VELOCITY_DECAY;
      node.x += node.vx;
      node.y += node.vy;
    }

    this.applyCentre(centerX, centerY);
  }

  private applyLinks(): void {
    this.links.forEach((link, i) => {
      const { source, target } = link;
      let dx = target.x + target.vx - source.x - source.vx;
      let dy = target.y + target.vy - source.y - source.vy;
      const distance = Math.max(Math.sqrt(dx * dx + dy * dy), MIN_DISTANCE);
      const pull =
        ((distance - this.linkDistance[i]!) / distance) * this.alpha * this.linkStrength[i]!;
      dx *= pull;
      dy *= pull;

      const bias = this.linkBias[i]!;
      target.vx -= dx * bias;
      target.vy -= dy * bias;
      source.vx += dx * (1 - bias);
      source.vy += dy * (1 - bias);
    });
  }

  /** Falls with the distance, not its square: it reaches far enough to keep clusters apart. */
  private applyCharge(): void {
    const { nodes } = this;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        if (dx === 0 && dy === 0) {
          dx = jiggle(i, j);
          dy = jiggle(j, i);
        }
        const distanceSq = Math.max(dx * dx + dy * dy, MIN_DISTANCE * MIN_DISTANCE);
        const scale = this.alpha / distanceSq;

        a.vx += dx * this.charge[j]! * scale;
        a.vy += dy * this.charge[j]! * scale;
        b.vx -= dx * this.charge[i]! * scale;
        b.vy -= dy * this.charge[i]! * scale;
      }
    }
  }

  /** Keeps the nodes, and the names drawn under them, from sitting on top of each other. */
  private applyCollision(): void {
    const { nodes } = this;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]!;
        const dx = b.x + b.vx - a.x - a.vx;
        const dy = b.y + b.vy - a.y - a.vy;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq >= COLLISION_DISTANCE * COLLISION_DISTANCE) continue;

        const distance = Math.max(Math.sqrt(distanceSq), MIN_DISTANCE);
        const push = (((COLLISION_DISTANCE - distance) / distance) * COLLISION_STRENGTH) / 2;
        a.vx -= dx * push;
        a.vy -= dy * push;
        b.vx += dx * push;
        b.vy += dy * push;
      }
    }
  }

  /** Pulls only the top nodes to the centre: documents follow their hub through its links. */
  private applyGravity(centerX: number, centerY: number): void {
    this.nodes.forEach((node, i) => {
      if (!this.isTop[i]) return;
      node.vx += (centerX - node.x) * GRAVITY * this.alpha;
      node.vy += (centerY - node.y) * GRAVITY * this.alpha;
    });
  }

  /** Moves the whole graph so its mean sits at the centre; unlike a pull, it squeezes nothing. */
  private applyCentre(centerX: number, centerY: number): void {
    const { nodes } = this;
    if (nodes.length === 0 || nodes.some((node) => node.isDragged)) return;

    const shiftX = centerX - nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length;
    const shiftY = centerY - nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length;
    for (const node of nodes) {
      node.x += shiftX;
      node.y += shiftY;
    }
  }

  /**
   * Puts the nodes near where the forces will settle them: the documents at the root in the
   * centre, the top hubs on a ring around them, each hub's own hubs out from it within a wedge
   * sized by how many nodes hang under them, and the documents of a hub on a sunflower around
   * it. Nodes only reached through a cycle go on an outer ring.
   */
  placeRadially(centerX: number, centerY: number): void {
    const { nodes } = this;
    if (nodes.length === 0) return;

    const children: number[][] = nodes.map(() => []);
    this.links.forEach((_, i) => children[this.sourceIndex[i]!]!.push(this.targetIndex[i]!));

    const placed = nodes.map(() => false);
    const weight = nodes.map(() => 0);
    const visiting = nodes.map(() => false);

    const weigh = (index: number): number => {
      if (visiting[index]) return 0;
      visiting[index] = true;
      weight[index] = 1 + children[index]!.reduce((sum, child) => sum + weigh(child), 0);
      return weight[index];
    };

    const place = (index: number, x: number, y: number, wedgeStart: number, wedgeSize: number) => {
      placed[index] = true;
      nodes[index]!.x = x;
      nodes[index]!.y = y;

      const leaves = children[index]!.filter((child) => !nodes[child]!.isFolder && !placed[child]);
      leaves.forEach((leaf, k) => {
        const radius = LEAF_DISTANCE + LEAF_SPREAD * Math.sqrt(k + 0.5);
        const angle = k * GOLDEN_ANGLE;
        placed[leaf] = true;
        nodes[leaf]!.x = x + Math.cos(angle) * radius;
        nodes[leaf]!.y = y + Math.sin(angle) * radius;
      });

      const hubs = children[index]!.filter((child) => nodes[child]!.isFolder && !placed[child]);
      const total = Math.max(
        hubs.reduce((sum, hub) => sum + weight[hub]!, 0),
        1,
      );
      let start = wedgeStart;
      for (const hub of hubs) {
        if (placed[hub]) continue;
        const size = (wedgeSize * weight[hub]!) / total;
        const angle = start + size / 2;
        const distance = this.clusterRadius(index) + this.clusterRadius(hub) + HUB_GAP;
        // A hub's own hubs fan out away from its parent, within at most half a turn.
        const childWedge = Math.min(size, Math.PI);
        place(
          hub,
          x + Math.cos(angle) * distance,
          y + Math.sin(angle) * distance,
          angle - childWedge / 2,
          childWedge,
        );
        start += size;
      }
    };

    const tops = nodes.map((_, i) => i).filter((i) => this.isTop[i]);
    tops.forEach((index) => weigh(index));

    // The documents at the root sit in the middle, where the root would be.
    const loose = tops.filter((i) => children[i]!.length === 0 && !nodes[i]!.isFolder);
    loose.forEach((index, k) => {
      const radius = LEAF_SPREAD * 2 * Math.sqrt(k + 0.5);
      const angle = k * GOLDEN_ANGLE;
      placed[index] = true;
      nodes[index]!.x = centerX + Math.cos(angle) * radius;
      nodes[index]!.y = centerY + Math.sin(angle) * radius;
    });
    const looseRadius = loose.length === 0 ? 0 : LEAF_SPREAD * 2 * Math.sqrt(loose.length);

    // The other pieces on a ring around them, each with an arc as wide as its cluster.
    const clusters = tops.filter((i) => !placed[i]).sort((a, b) => weight[b]! - weight[a]!);
    if (clusters.length === 1 && loose.length === 0) {
      place(clusters[0]!, centerX, centerY, 0, 2 * Math.PI);
    } else if (clusters.length > 0) {
      const arcs = clusters.map((i) => 2 * this.clusterRadius(i) + HUB_GAP);
      const total = arcs.reduce((sum, arc) => sum + arc, 0);
      const ringRadius = Math.max(
        looseRadius + this.clusterRadius(clusters[0]!) + HUB_GAP,
        total / (2 * Math.PI),
      );
      let start = 0;
      clusters.forEach((index, k) => {
        const size = (2 * Math.PI * arcs[k]!) / total;
        const angle = start + size / 2;
        const childWedge = Math.min(size, Math.PI);
        place(
          index,
          centerX + Math.cos(angle) * ringRadius,
          centerY + Math.sin(angle) * ringRadius,
          angle - childWedge / 2,
          childWedge,
        );
        start += size;
      });
    }

    const placedIndexes = nodes.map((_, i) => i).filter((i) => placed[i]);
    const outerRadius =
      (placedIndexes.length === 0
        ? 0
        : Math.max(
            ...placedIndexes.map((i) => Math.hypot(nodes[i]!.x - centerX, nodes[i]!.y - centerY)),
          )) + LEAF_DISTANCE;
    const unreached = nodes.map((_, i) => i).filter((i) => !placed[i]);
    unreached.forEach((index, k) => {
      const angle = (2 * Math.PI * k) / unreached.length;
      nodes[index]!.x = centerX + Math.cos(angle) * outerRadius;
      nodes[index]!.y = centerY + Math.sin(angle) * outerRadius;
    });

    for (const node of nodes) {
      node.vx = 0;
      node.vy = 0;
    }
  }
}

function jiggle(i: number, j: number): number {
  return (((i * 31 + j * 17) % 7) - 3) * 1e-3 + 1e-4;
}
