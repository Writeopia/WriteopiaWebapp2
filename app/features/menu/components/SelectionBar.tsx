import { Copy, FolderInput, Heart, Trash2, WandSparkles, X } from "lucide-react";
import type { ReactNode } from "react";

import { t } from "~/core/i18n";

type SelectionBarProps = {
  count: number;
  /** Duplicate and Summarize work on documents: they wait for one to be selected. */
  hasDocuments: boolean;
  summarizing: boolean;
  onFavorite: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  onSummarize: () => void;
  onDelete: () => void;
  onClear: () => void;
};

/** What can be done with the selected entries, shown while there are any. */
export function SelectionBar(props: SelectionBarProps) {
  const size = 18;

  return (
    <div
      role="toolbar"
      aria-label={t("selectedCount", { count: props.count })}
      className="fixed inset-x-0 bottom-16 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-1 rounded-lg border border-card-border bg-card-bg px-3 py-2 shadow-xl"
    >
      <span className="px-2 text-sm font-medium whitespace-nowrap">
        {t("selectedCount", { count: props.count })}
      </span>
      <BarButton label={t("favorite")} onClick={props.onFavorite}>
        <Heart size={size} aria-hidden />
      </BarButton>
      <BarButton label={t("duplicate")} onClick={props.onDuplicate} disabled={!props.hasDocuments}>
        <Copy size={size} aria-hidden />
      </BarButton>
      <BarButton label={t("moveTo")} onClick={props.onMove}>
        <FolderInput size={size} aria-hidden />
      </BarButton>
      <BarButton
        label={t("summarize")}
        onClick={props.onSummarize}
        disabled={!props.hasDocuments || props.summarizing}
      >
        <WandSparkles size={size} aria-hidden />
      </BarButton>
      <BarButton label={t("delete")} onClick={props.onDelete} danger>
        <Trash2 size={size} aria-hidden />
      </BarButton>
      <span aria-hidden className="mx-1 h-6 w-px bg-divider" />
      <BarButton label={t("clearSelection")} onClick={props.onClear}>
        <X size={size} aria-hidden />
      </BarButton>
    </div>
  );
}

type BarButtonProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
};

function BarButton({ label, onClick, disabled, danger, children }: BarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        "flex size-9 items-center justify-center rounded-md hover:bg-options-selector " +
        "disabled:cursor-not-allowed disabled:opacity-40 " +
        (danger ? "text-error" : "")
      }
    >
      {children}
    </button>
  );
}
