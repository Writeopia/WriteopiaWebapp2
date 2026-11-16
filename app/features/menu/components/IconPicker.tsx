import { t } from "~/core/i18n";
import { argbToCss, type Icon } from "~/core/models";
import { cn } from "~/core/ui";

import { ICON_TINTS, MENU_ICON_NAMES, MENU_ICONS } from "../icons";

type IconPickerProps = {
  value: Icon | null;
  onChange: (icon: Icon | null) => void;
  /** Offers "Remove icon". A folder cannot lose its icon once it has one. */
  allowRemove?: boolean;
};

/** The choice of an icon and its color, for a folder or a document. */
export function IconPicker({ value, onChange, allowRemove = false }: IconPickerProps) {
  const tint = value?.tint ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label={t("iconTint")}
        className="flex flex-wrap items-center gap-2"
      >
        <TintSwatch
          label={t("iconNoTint")}
          selected={tint === null}
          disabled={!value}
          onSelect={() => value && onChange({ ...value, tint: null })}
        />
        {ICON_TINTS.map((color) => (
          <TintSwatch
            key={color}
            label={argbToCss(color)}
            color={argbToCss(color)}
            selected={tint === color}
            disabled={!value}
            onSelect={() => value && onChange({ ...value, tint: color })}
          />
        ))}
      </div>

      <div
        role="radiogroup"
        aria-label={t("documentIcon")}
        className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1 overflow-y-auto"
      >
        {MENU_ICON_NAMES.map((name) => {
          const Drawing = MENU_ICONS[name]!;
          const selected = value?.label === name;

          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={name}
              title={name}
              onClick={() => onChange({ label: name, tint })}
              className={cn(
                "flex size-9 items-center justify-center rounded-md hover:bg-options-selector",
                selected && "bg-selected-bg ring-1 ring-accent",
              )}
            >
              <Drawing
                size={18}
                aria-hidden
                style={selected && tint !== null ? { color: argbToCss(tint) } : undefined}
              />
            </button>
          );
        })}
      </div>

      {allowRemove && value && (
        <button
          type="button"
          className="self-start text-sm text-link underline"
          onClick={() => onChange(null)}
        >
          {t("documentIconRemove")}
        </button>
      )}
    </div>
  );
}

type TintSwatchProps = {
  label: string;
  color?: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
};

function TintSwatch({ label, color, selected, disabled, onSelect }: TintSwatchProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "size-6 rounded-full border border-card-border disabled:opacity-40",
        selected && "ring-2 ring-accent ring-offset-2 ring-offset-card-bg",
        // No color: the icon keeps the color of the text around it.
        !color &&
          "bg-[linear-gradient(135deg,var(--wr-card-bg)_45%,var(--wr-error)_50%,var(--wr-card-bg)_55%)]",
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
