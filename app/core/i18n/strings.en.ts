/**
 * English strings. Keys follow the names in the Compose app's strings.xml
 * (Writeopia/application/core/resources) so the two stay easy to compare.
 */
export const en = {
  appName: "Writeopia",
  tagline: "Write like nobody’s watching. Because they aren’t.",
  loading: "Loading",
  close: "Close",
  cancel: "Cancel",
  confirm: "Confirm",
  ok: "OK",
  retry: "Retry",
  dismiss: "Dismiss",
  colorTheme: "Color theme",
  lightTheme: "Light",
  darkTheme: "Dark",
  systemTheme: "System",
  accentColor: "Accent color",
  accentPurple: "Purple",
  accentBlue: "Blue",
  accentGreen: "Green",
  accentOrange: "Orange",
  errorTitle: "Something went wrong",
  errorNotFound: "This page does not exist.",
  errorUnexpected: "An unexpected error happened. Try again.",
  foundationReady: "The foundation is in place. Features land here next.",
  showToast: "Show a toast",
  toastExample: "Toasts work.",
  openDialog: "Open a dialog",
  dialogExampleTitle: "A dialog",
  dialogExampleBody: "Dialogs trap focus and close with Escape.",
  moreOptions: "More options",
  version: "Version {version}",
} as const;

export type StringKey = keyof typeof en;
