import {
  ALargeSmall,
  ArrowDownAZ,
  ArrowDownUp,
  ArrowLeft,
  Bell,
  Bold,
  Bolt,
  CalendarArrowDown,
  ChartScatter,
  ChevronDown,
  ChevronRight,
  CircleArrowLeft,
  CircleArrowRight,
  CirclePlus,
  ClipboardCopy,
  ClockArrowDown,
  CloudDownload,
  Command,
  Contrast,
  Crosshair,
  Droplet,
  Ellipsis,
  EllipsisVertical,
  Eye,
  EyeClosed,
  FileDown,
  FileMinus,
  FileUp,
  FolderOpen,
  FolderSync,
  Heart,
  Highlighter,
  House,
  Image,
  Italic,
  LayoutGrid,
  LayoutPanelLeft,
  Link,
  type LucideIcon,
  Moon,
  MoveLeft,
  NotebookText,
  PencilLine,
  Play,
  Plus,
  Redo2,
  Rows3,
  Save,
  Search,
  SquareCode,
  Sun,
  Trash2,
  Underline,
  Undo2,
  User,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";

import { argbToCss, type Icon } from "~/core/models";

/**
 * The icons a folder or a document can have. An icon is stored as its name here and a tint;
 * the names are the ones of WrIcons.allIcons of the Compose app (and MenuIcons.swift), drawn
 * with the same Lucide icons, so an icon chosen in one app shows in the others.
 */
export const MENU_ICONS: Readonly<Record<string, LucideIcon>> = {
  settings: Bolt,
  home: House,
  search: Search,
  notifications: Bell,
  favorites: Heart,
  file: FileMinus,
  fileDownload: FileDown,
  folder: FolderOpen,
  exportFile: FileUp,
  save: Save,
  sync: FolderSync,
  moreVert: EllipsisVertical,
  moreHoriz: Ellipsis,
  sort: ArrowDownUp,
  colorModeLight: Sun,
  colorModeDark: Moon,
  colorModeSystem: Contrast,
  bold: Bold,
  italic: Italic,
  underline: Underline,
  textStyle: ALargeSmall,
  pageStyle: NotebookText,
  code: SquareCode,
  addCircle: CirclePlus,
  add: Plus,
  target: Crosshair,
  layoutStaggeredGrid: LayoutPanelLeft,
  layoutGrid: LayoutGrid,
  layoutList: Rows3,
  close: X,
  delete: Trash2,
  transparent: Droplet,
  person: User,
  smallArrowRight: ChevronRight,
  smallArrowDown: ChevronDown,
  undo: Undo2,
  redo: Redo2,
  sortByName: ArrowDownAZ,
  sortByCreated: CalendarArrowDown,
  sortByUpdate: ClockArrowDown,
  backArrowDesktop: MoveLeft,
  backArrowAndroid: ArrowLeft,
  play: Play,
  circularArrowLeft: CircleArrowLeft,
  circularArrowRight: CircleArrowRight,
  visibilityOn: Eye,
  visibilityOff: EyeClosed,
  image: Image,
  zap: Zap,
  move: ClipboardCopy,
  download: CloudDownload,
  ai: WandSparkles,
  command: Command,
  chart: ChartScatter,
  link: Link,
  highlight: Highlighter,
  drawing: PencilLine,
};

export const MENU_ICON_NAMES: readonly string[] = Object.keys(MENU_ICONS);

/** The tints of ColorUtils.tintColors(), as the ARGB integers the apps store. */
export const ICON_TINTS: readonly number[] = [
  0xffcccccc, // light gray
  0xff444444, // dark gray
  0xff0000ff, // blue
  0xff888888, // gray
  0xffffff00, // yellow
  0xffff0000, // red
  0xffff00ff, // magenta
].map((color) => color | 0);

type ItemIconProps = {
  icon: Icon | null;
  /** What the icon is of: it decides the drawing when there is no icon, or an unknown one. */
  kind: "folder" | "document";
  size?: number;
  className?: string;
};

/**
 * The icon of a folder or a document in its tint. Without an icon a folder shows the open
 * folder in the accent color and a document the plain page.
 */
export function ItemIcon({ icon, kind, size = 18, className }: ItemIconProps) {
  const Drawing = (icon && MENU_ICONS[icon.label]) ?? (kind === "folder" ? FolderOpen : FileMinus);
  const tint = icon?.tint ?? null;

  return (
    <Drawing
      size={size}
      aria-hidden
      className={className ?? (kind === "folder" ? "text-accent" : "text-text-lighter")}
      style={tint === null ? undefined : { color: argbToCss(tint) }}
    />
  );
}
