// sysprims is a native addon. Keep it optional and lazy-loaded.

import type {
  PortBindingsSnapshot,
  PortFilter,
  ProcessFilter,
  ProcessInfo,
  ProcessSnapshot,
  TerminateTreeConfig,
  TerminateTreeResult,
} from "@3leaps/sysprims";

type SysprimsModule = typeof import("@3leaps/sysprims");

export type SysprimsAvailability =
  | { available: true; sysprims: SysprimsModule }
  | { available: false; reason: string };

let _sysprimsPromise: Promise<SysprimsAvailability> | null = null;

export async function getSysprims(): Promise<SysprimsAvailability> {
  if (_sysprimsPromise) return _sysprimsPromise;

  _sysprimsPromise = (async () => {
    try {
      const sysprims = (await import("@3leaps/sysprims")) as SysprimsModule;
      // Touch a cheap export to surface load errors early.
      if (typeof sysprims.procGet !== "function") {
        return { available: false, reason: "sysprims loaded but exports are missing" };
      }
      return { available: true, sysprims };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  })();

  return _sysprimsPromise;
}

export async function sysprimsTryProcGet(pid: number): Promise<ProcessInfo | null> {
  const s = await getSysprims();
  if (!s.available) return null;
  try {
    return s.sysprims.procGet(pid);
  } catch {
    return null;
  }
}

export async function sysprimsTryProcessList(
  filter?: ProcessFilter,
): Promise<ProcessSnapshot | null> {
  const s = await getSysprims();
  if (!s.available) return null;
  try {
    return s.sysprims.processList(filter);
  } catch {
    return null;
  }
}

export async function sysprimsTryListeningPorts(
  filter?: PortFilter,
): Promise<PortBindingsSnapshot | null> {
  const s = await getSysprims();
  if (!s.available) return null;
  try {
    return s.sysprims.listeningPorts(filter);
  } catch {
    return null;
  }
}

export async function sysprimsTryListeningPids(
  port: number,
): Promise<{ pids: number[]; warnings: string[] } | null> {
  const snapshot = await sysprimsTryListeningPorts({ protocol: "tcp", local_port: port });
  if (!snapshot) return null;

  const pids = Array.from(
    new Set(
      snapshot.bindings
        .map((b) => (typeof b.pid === "number" ? b.pid : null))
        .filter((pid): pid is number => typeof pid === "number"),
    ),
  );

  return { pids, warnings: snapshot.warnings };
}

export async function sysprimsTryTerminateTree(
  pid: number,
  config?: TerminateTreeConfig,
): Promise<TerminateTreeResult | null> {
  const s = await getSysprims();
  if (!s.available) return null;
  try {
    return s.sysprims.terminateTree(pid, config);
  } catch {
    return null;
  }
}
