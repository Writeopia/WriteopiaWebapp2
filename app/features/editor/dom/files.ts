/** Whether a file becomes an image or a video block. */
export function isMedia(file: File): boolean {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

/** Opens the file picker of [input] for the files of [accept]: pictures or videos. */
export function pickFiles(input: HTMLInputElement | null, accept: string) {
  if (!input) return;
  input.accept = accept;
  input.click();
}
