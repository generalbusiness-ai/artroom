import { createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import type { RoomAdapter, RoomSnapshot } from "../room/adapter.ts";
import type { ActId } from "../room/contract.ts";

export interface AppState {
  readonly adapter: RoomAdapter;
  readonly snap: RoomSnapshot;
  /** Open the "why" panel for an act. */
  readonly why: (act: ActId) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(AppContext);
  if (!v) throw new Error("useApp outside AppContext");
  return v;
}

/** Follow an adapter's snapshot. */
export function useSnapshot(adapter: RoomAdapter): RoomSnapshot | null {
  const [snap, setSnap] = useState(() => adapter.snapshot());
  useEffect(() => {
    setSnap(adapter.snapshot());
    return adapter.subscribe(() => setSnap(adapter.snapshot()));
  }, [adapter]);
  return snap;
}
