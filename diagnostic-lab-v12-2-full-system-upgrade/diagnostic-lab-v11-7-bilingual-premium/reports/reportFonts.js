import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let cached = "";

export async function getEmbeddedReportFontCss() {
  if (cached) return cached;
  const faces = [
    ["Noto Sans Thai", "normal", 400, "@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff2", "U+02D7,U+0303,U+0331,U+0E01-0E5B,U+200C-200D,U+25CC"],
    ["Noto Sans Thai", "normal", 400, "@fontsource/noto-sans-thai/files/noto-sans-thai-latin-400-normal.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF"],
    ["Noto Sans Thai", "normal", 700, "@fontsource/noto-sans-thai/files/noto-sans-thai-thai-700-normal.woff2", "U+02D7,U+0303,U+0331,U+0E01-0E5B,U+200C-200D,U+25CC"],
    ["Noto Sans Thai", "normal", 700, "@fontsource/noto-sans-thai/files/noto-sans-thai-latin-700-normal.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF"],
    ["Noto Serif Thai", "normal", 400, "@fontsource/noto-serif-thai/files/noto-serif-thai-thai-400-normal.woff2", "U+02D7,U+0303,U+0331,U+0E01-0E5B,U+200C-200D,U+25CC"],
    ["Noto Serif Thai", "normal", 400, "@fontsource/noto-serif-thai/files/noto-serif-thai-latin-400-normal.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF"],
    ["Noto Serif Thai", "normal", 700, "@fontsource/noto-serif-thai/files/noto-serif-thai-thai-700-normal.woff2", "U+02D7,U+0303,U+0331,U+0E01-0E5B,U+200C-200D,U+25CC"],
    ["Noto Serif Thai", "normal", 700, "@fontsource/noto-serif-thai/files/noto-serif-thai-latin-700-normal.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF"]
  ];
  const css = [];
  for (const [family, style, weight, relative, unicodeRange] of faces) {
    const bytes = await readFile(path.join(root, "node_modules", relative));
    css.push(`@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2');unicode-range:${unicodeRange};}`);
  }
  cached = css.join("\n");
  return cached;
}
