import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Sparkles } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";

import { t } from "~/core/i18n";
import { argbToCss } from "~/core/models";
import { Button, cn, Dialog, Spinner } from "~/core/ui";
import { isTitle } from "~/features/editor/state/blocks";
import { ordered } from "~/features/editor/state/reducer";
import { useEditor } from "~/features/editor/state/store";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { generateHeaderImage, GenerationError, getHeaderImages, saveHeaderImage } from "../api";
import { useDocumentOptions } from "../context";
import { generationReducer } from "../generation";
import { HEADER_COLORS, headerOf, withHeaderColor, withHeaderPicture } from "../header";
import { HeaderPicture } from "./HeaderPicture";

/** The most the user can write to ask for a picture; the backend cuts at the same size. */
export const INSTRUCTIONS_LIMIT = 500;

export function headerImagesKey(workspaceId: string) {
  return ["headerImages", workspaceId] as const;
}

/**
 * The header of the document (HeaderEditionOptions.kt): no header, a color, a picture of the
 * workspace, or a picture the AI draws for the document, to use or to draw again.
 */
export function HeaderEditorDialog({ onClose }: { onClose: () => void }) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { canUseAi, isPremium, currentText } = useDocumentOptions();
  const title = useEditor((store) => ordered(store.state).find(isTitle));
  const dispatch = useEditor((store) => store.dispatch);
  const [generation, send] = useReducer(generationReducer, { kind: "idle" });
  const [instructions, setInstructions] = useState("");
  const request = useRef<AbortController | null>(null);

  const images = useQuery({
    queryKey: headerImagesKey(workspace.id),
    queryFn: ({ signal }) => getHeaderImages(workspace.id, signal),
    enabled: isPremium,
    staleTime: 0,
  });

  // A picture still being drawn when the dialog closes is not wanted any more.
  useEffect(() => () => request.current?.abort(), []);

  if (!title) return null;
  const header = headerOf(title);

  const apply = (next: typeof title) =>
    dispatch({
      type: "updateBlock",
      id: title.id,
      changes: { url: next.url, decoration: next.decoration },
    });

  const generate = () => {
    if (generation.kind === "generating") return;
    send({ type: "start" });
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { title: documentTitle, text } = currentText();

    generateHeaderImage(
      {
        workspaceId: workspace.id,
        documentTitle,
        documentText: text,
        instructions: instructions.trim(),
      },
      controller.signal,
    )
      .then((url) => send({ type: "succeeded", url }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        send({ type: "failed", message: error instanceof GenerationError ? error.reason : null });
      });
  };

  const keep = (url: string) => {
    send({ type: "saving" });
    saveHeaderImage(workspace.id, url)
      .then(() => {
        send({ type: "saved", url });
        void queryClient.invalidateQueries({ queryKey: headerImagesKey(workspace.id) });
      })
      .catch(() => send({ type: "saveFailed", url }));
  };

  const use = (url: string) => {
    apply(withHeaderPicture(title, url));
    keep(url);
  };

  const discard = () => {
    request.current?.abort();
    request.current = null;
    send({ type: "discard" });
  };

  const pictures = images.data ?? [];
  const selectedPicture = header.kind === "picture" ? header.url : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("headerTitle")}
      className="w-[min(40rem,calc(100vw-2rem))]"
      // The buttons for the drawn picture sit in the same row as Done.
      actions={
        <>
          {generation.kind !== "idle" && (
            <>
              <Button variant="secondary" onClick={discard}>
                {generation.kind === "generating" ? t("cancel") : t("headerDiscard")}
              </Button>
              {generation.kind !== "generating" && (
                <Button
                  variant="secondary"
                  onClick={generate}
                  disabled={generation.kind === "generated" && generation.saving}
                >
                  {generation.kind === "failed" ? t("retry") : t("headerTryAnother")}
                </Button>
              )}
              {generation.kind === "generated" &&
                (generation.saveFailed ? (
                  <Button onClick={() => keep(generation.url)}>{t("headerSaveAgain")}</Button>
                ) : (
                  <Button loading={generation.saving} onClick={() => use(generation.url)}>
                    {t("headerUseImage")}
                  </Button>
                ))}
            </>
          )}
          <Button onClick={onClose}>{t("done")}</Button>
        </>
      }
    >
      <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto">
        <div role="radiogroup" aria-label={t("headerColors")} className="flex flex-wrap gap-3">
          <Swatch
            label={t("headerNoColor")}
            selected={header.kind === "none"}
            onSelect={() => apply(withHeaderColor(title, null))}
          />
          {HEADER_COLORS.map((color) => (
            <Swatch
              key={color}
              label={argbToCss(color)}
              color={argbToCss(color)}
              selected={header.kind === "color" && header.color === color}
              onSelect={() => apply(withHeaderColor(title, color))}
            />
          ))}
        </div>

        {(pictures.length > 0 || canUseAi) && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-on-bg">{t("headerImages")}</h3>
            {images.isPending && isPremium && <Spinner />}
            {pictures.length > 0 && (
              <div
                role="radiogroup"
                aria-label={t("headerImages")}
                className="grid max-h-52 grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-3 overflow-y-auto p-0.5"
              >
                {pictures.map((url) => (
                  <button
                    key={url}
                    type="button"
                    role="radio"
                    aria-checked={url === selectedPicture}
                    aria-label={t("headerImageChoose")}
                    onClick={() => apply(withHeaderPicture(title, url))}
                    className={cn(
                      "h-14 overflow-hidden rounded-xl border border-divider",
                      url === selectedPicture && "border-2 border-accent",
                    )}
                  >
                    <img src={url} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {canUseAi && (
          <section className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold text-on-bg">{t("headerInstructions")}</span>
              <textarea
                value={instructions}
                maxLength={INSTRUCTIONS_LIMIT}
                rows={2}
                disabled={generation.kind === "generating"}
                placeholder={t("headerInstructionsHint")}
                onChange={(event) =>
                  setInstructions(event.target.value.slice(0, INSTRUCTIONS_LIMIT))
                }
                className="resize-none rounded-xl border border-card-border bg-global-bg px-3 py-2 text-on-bg"
              />
            </label>
            <p className="text-xs text-text-lighter">{t("headerImageCost")}</p>
            <Button onClick={generate} disabled={generation.kind === "generating"}>
              <Sparkles size={16} aria-hidden />
              {t("headerGenerate")}
            </Button>
          </section>
        )}

        {generation.kind !== "idle" && (
          <section aria-label={t("headerGenerated")} className="flex flex-col gap-2">
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-light-bg">
              {generation.kind === "generating" && (
                <div role="status" className="flex flex-col items-center gap-2 text-sm">
                  <Spinner />
                  {t("headerGenerating")}
                </div>
              )}
              {generation.kind === "failed" && (
                <p role="alert" className="p-4 text-sm text-error">
                  {generation.message ?? t("headerGenerateFailed")}
                </p>
              )}
              {generation.kind === "generated" && (
                <HeaderPicture
                  url={generation.url}
                  alt={t("headerGeneratedAlt")}
                  className="size-full"
                />
              )}
            </div>

            {generation.kind === "generated" && generation.saveFailed && (
              <p role="alert" className="text-sm text-error">
                {t("headerSaveFailed")}
              </p>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}

type SwatchProps = { label: string; color?: string; selected: boolean; onSelect: () => void };

/** A color of the header; the chosen one is wider with rounder corners. */
function Swatch({ label, color, selected, onSelect }: SwatchProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={cn(
        "flex h-10 items-center justify-center border border-divider transition-all",
        selected ? "w-12 rounded-xl ring-2 ring-accent" : "w-10 rounded-full",
      )}
      style={color ? { backgroundColor: color } : undefined}
    >
      {!color && <Ban size={20} aria-hidden className="text-on-bg" />}
    </button>
  );
}
