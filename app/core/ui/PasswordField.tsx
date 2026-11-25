import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { t } from "~/core/i18n";

import { TextField } from "./TextField";

type PasswordFieldProps = Omit<ComponentProps<typeof TextField>, "type" | "trailing">;

/** A password field with a button that reveals and hides what was typed. */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-md text-text-lighter hover:text-on-bg"
          aria-label={visible ? t("hidePassword") : t("showPassword")}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
        >
          <Icon size={18} aria-hidden />
        </button>
      }
    />
  );
}
