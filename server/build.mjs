// Compila o site para rodar em Node (Render) junto com o servidor.
// Funciona igual no Windows, Mac e Linux.
import { spawn } from "node:child_process";

const preset = process.argv.includes("--vercel")
  ? "vercel"
  : (process.env.NITRO_PRESET || "node-middleware");

const child = spawn("npx", ["vite", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NITRO_PRESET: preset },
});
child.on("exit", (code) => process.exit(code ?? 1));
