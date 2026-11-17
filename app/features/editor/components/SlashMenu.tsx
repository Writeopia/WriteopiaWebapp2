import { Calendar, CheckSquare, Clock, List, Minus, Square, SquareDashed } from "lucide-react";
import { type RefObject, useLayoutEffect, useState } from "react";

import { t } from "~/core/i18n";
import { cn } from "~/core/ui";

import { textElement } from "../blocks/EditableText";
import { slashDescription, slashName } from "../blocks/slashNames";
import { caretRect } from "../dom/caret";
import { filterSlashCommands, type SlashCommandId } from "../state/commands";
import { useEditor } from "../state/store";

const ICONS: Record<SlashCommandId, typeof Calendar> = {
  today: Calendar,
  now: Clock,
  checkbox: CheckSquare,
  list: List,
  box: SquareDashed,
  card: Square,
  divider: Minus,
};

/**
 * The popup of the "/" commands under the caret (SlashCommandPopup.kt), filtered by what is
 * typed after the slash. The keys are handled by the text itself; this draws and takes clicks.
 */
export function SlashMenu({ canvas }: { canvas: RefObject<HTMLDivElement | null> }) {
  const slash = useEditor((store) => store.state.slash);
  const dispatch = useEditor((store) => store.dispatch);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  const commands = slash ? filterSlashCommands(slash.filter, slashName) : [];

  useLayoutEffect(() => {
    const container = canvas.current;
    const element = slash && container ? textElement(container, slash.id) : null;
    if (!container || !element) return;
    const box = container.getBoundingClientRect();
    const rect = caretRect(element) ?? element.getBoundingClientRect();
    // Measured from the page once it is drawn: what a layout effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosition({ left: rect.left - box.left, top: rect.bottom - box.top + 4 });
  }, [slash, canvas]);

  if (!slash || commands.length === 0) return null;
  const highlight = Math.min(slash.highlight, commands.length - 1);

  return (
    <div
      role="listbox"
      aria-label={t("editorSlashMenu")}
      className="absolute z-20 w-64 overflow-hidden rounded-lg border border-card-border bg-card-bg py-1 shadow-lg"
      style={position}
    >
      {commands.map((command, index) => {
        const Icon = ICONS[command.id];
        return (
          <div
            key={command.id}
            role="option"
            aria-selected={index === highlight}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() =>
              index !== highlight &&
              dispatch({
                type: "slashHighlight",
                offset: index - highlight,
                count: commands.length,
              })
            }
            onClick={() => dispatch({ type: "slashPick", command, now: new Date() })}
            onKeyDown={undefined}
            className={cn(
              "flex cursor-pointer items-center gap-3 px-3 py-1.5",
              index === highlight && "bg-options-selector",
            )}
          >
            <Icon size={16} aria-hidden className="shrink-0 text-text-lighter" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm">{slashName(command.id)}</span>
              <span className="truncate text-xs text-text-lighter">
                {slashDescription(command.id)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
