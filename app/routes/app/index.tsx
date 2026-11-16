import { redirect } from "react-router";

import { appPaths } from "~/features/menu/paths";

/** The app opens on the root folder. */
export function clientLoader() {
  return redirect(appPaths.home);
}

export default function AppIndex() {
  return null;
}
