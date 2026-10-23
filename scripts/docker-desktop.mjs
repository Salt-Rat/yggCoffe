import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";

// Select Desktop explicitly without changing the user's global Docker context.
const root = fileURLToPath(new URL("../", import.meta.url));
const windowsCli =
  "/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe";
const useWindows =
  process.platform === "linux" &&
  process.env.WSL_DISTRO_NAME &&
  existsSync(windowsCli);
const executable = useWindows ? windowsCli : "docker";
const projectDirectory = useWindows
  ? `\\\\wsl.localhost\\${process.env.WSL_DISTRO_NAME}${root.replaceAll("/", "\\")}`
  : root;
const check = spawnSync(
  executable,
  ["info", "--format", "{{.OperatingSystem}}"],
  { encoding: "utf8", timeout: 20000 },
);
if (check.status !== 0 || !check.stdout.includes("Docker Desktop")) {
  console.error(
    "Docker Desktop indisponível. Abra-o e habilite a integração WSL; nenhum outro engine foi alterado.",
  );
  process.exit(1);
}
const args = process.argv.slice(2);
const child = spawn(
  executable,
  [
    "compose",
    "--project-directory",
    projectDirectory,
    "--project-name",
    "yggcoffe",
    "--profile",
    "store",
    ...(args.length ? args : ["ps"]),
  ],
  { stdio: "inherit" },
);
child.on("error", () => {
  console.error("Não foi possível executar o Compose do Docker Desktop.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
