import { useState } from "react";

import { t } from "~/core/i18n";
import { Button, Dialog, TextField } from "~/core/ui";

import { safeHref } from "../dom/spansToDom";

type LinkDialogProps = {
  open: boolean;
  /** The address of the link already there, if any. */
  initial: string;
  onSave: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
};

/** An address without a scheme is a web address. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** The address of a link on the selected text (the link button, ⌘L). */
export function LinkDialog({ open, initial, onSave, onRemove, onClose }: LinkDialogProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const url = normalizeUrl(value);
    if (value.trim() === "" || !safeHref(url)) {
      setError(t("editorLinkInvalid"));
      return;
    }
    onSave(url);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("editorLinkTitle")}
      actions={
        <>
          {initial && (
            <Button variant="ghost" onClick={onRemove}>
              {t("editorLinkRemove")}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={save}>{t("save")}</Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <TextField
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog opens to be typed in
          autoFocus
          label={t("editorLinkAddress")}
          type="url"
          inputMode="url"
          placeholder="https://"
          value={value}
          error={error ?? undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
        />
      </form>
    </Dialog>
  );
}
