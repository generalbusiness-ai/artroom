/** The shell: top bar, navigation, theme, keyboard shortcuts, and the four screens. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { RoomAdapter } from "./room/adapter.ts";
import type { ActId, MemberId } from "./room/contract.ts";
import { ActsScreen } from "./screens/Acts.tsx";
import { NeedsYou } from "./screens/NeedsYou.tsx";
import { PolicyScreen } from "./screens/Policy.tsx";
import { ProposalScreen } from "./screens/Proposal.tsx";
import { RoomScreen } from "./screens/Room.tsx";
import { DevBar } from "./ui/DevBar.tsx";
import { WhyDialog } from "./ui/WhyDialog.tsx";
import { AppContext, useSnapshot } from "./ui/context.ts";
import { unpublished } from "./ui/format.ts";
import { Icon } from "./ui/icons.tsx";
import { href, useRoute, type Route } from "./ui/router.ts";

export type Theme = "system" | "light" | "dark";
const THEMES: Theme[] = ["system", "light", "dark"];

function storedTheme(): Theme {
  try {
    const t = localStorage.getItem("artroom-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function useTheme(initial?: Theme): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => initial ?? storedTheme());
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset["theme"];
    else root.dataset["theme"] = theme;
    try {
      localStorage.setItem("artroom-theme", theme);
    } catch {
      // Storage may be unavailable; the theme still applies for this page.
    }
  }, [theme]);
  return [theme, setTheme];
}

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

const TITLES: Record<Route["name"], string> = { needs: "Needs you", room: "Room", policy: "Policy", acts: "Acts", proposal: "Proposal" };

export function App({ adapter, dev = false, theme: initialTheme }: { adapter: RoomAdapter; dev?: boolean; theme?: Theme }) {
  const snap = useSnapshot(adapter);
  const route = useRoute();
  const [whyAct, setWhyAct] = useState<ActId | null>(null);
  const [devOpen, setDevOpen] = useState(dev);
  const [help, setHelp] = useState(false);
  const [theme, setTheme] = useTheme(initialTheme);
  const mainRef = useRef<HTMLElement>(null);
  const firstRoute = useRef(true);

  // Move focus to the page on navigation, so keyboard and screen reader users start at the top.
  const routeKey = JSON.stringify(route);
  // Layout effects run in the same commit, so focus never lands late and steals it back.
  useLayoutEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    if (route.name === "proposal" && route.focus === "review") return;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [routeKey]);

  useEffect(() => {
    if (snap) document.title = `${TITLES[route.name]} · ${snap.room.name} · Artroom`;
  }, [route.name, snap?.room.name]);

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const go = (h: string) => {
        location.hash = h;
        e.preventDefault();
      };
      if (e.key === "1") go(href.needs());
      else if (e.key === "2") go(href.room());
      else if (e.key === "3") go(href.policy());
      else if (e.key === "4") go(href.acts());
      else if (e.key === "?") setHelp((h) => !h);
      else if (e.key === "d" && adapter.timeline) setDevOpen((d) => !d);
      else if ((e.key === "," || e.key === ".") && adapter.timeline && devOpen) {
        adapter.timeline.go(adapter.timeline.step + (e.key === "." ? 1 : -1));
      } else if (e.key === "j" || e.key === "k") {
        const items = [...document.querySelectorAll<HTMLElement>("main [data-nav='item']")];
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "j" ? Math.min(items.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
        items[next]!.focus();
        items[next]!.scrollIntoView({ block: "nearest" });
        e.preventDefault();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [adapter, devOpen]);

  const state = useMemo(() => (snap ? { adapter, snap, why: setWhyAct } : null), [adapter, snap]);
  if (!state || !snap) {
    return (
      <main>
        <p class="muted">Connecting to the room…</p>
      </main>
    );
  }
  const open = snap.attention.filter((a) => a.open).length;
  const nav: { name: Route["name"]; label: string; href: string; icon: "inbox" | "room" | "shield" | "commit" }[] = [
    { name: "needs", label: "Needs you", href: href.needs(), icon: "inbox" },
    { name: "room", label: "Room", href: href.room(), icon: "room" },
    { name: "policy", label: "Policy", href: href.policy(), icon: "shield" },
    { name: "acts", label: "Acts", href: href.acts(), icon: "commit" },
  ];
  const lag = unpublished(snap);

  return (
    <AppContext.Provider value={state}>
      <a class="skip-link" href="#main" onClick={(e) => (e.preventDefault(), mainRef.current?.focus())}>
        Skip to content
      </a>
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href={href.needs()} aria-label={`Artroom, ${snap.room.name}`}>
            <span class="brand-mark" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 20 12 4l7 16M8.2 14h7.6" />
              </svg>
            </span>
            <span class="brand-name">Artroom</span>
            <span class="brand-room">{snap.room.name}</span>
          </a>
          <nav class="nav" aria-label="Screens">
            {nav.map((n) => (
              <a key={n.name} href={n.href} aria-current={route.name === n.name ? "page" : undefined}>
                <Icon name={n.icon} />
                {n.label}
                {n.name === "needs" && (
                  <span class={`count${open ? "" : " zero"}`} aria-label={`${open}${snap.coverage.attention ? "" : " or more"} open`}>
                    {open}
                    {snap.coverage.attention ? "" : "+"}
                  </span>
                )}
              </a>
            ))}
          </nav>
          <div class="topbar-right">
            <span class="live" title={`Log entry ${snap.log.head}; published through ${snap.log.publishedThrough}`}>
              <span class={`live-dot${snap.source.status === "offline" ? " offline" : ""}`} aria-hidden="true" />
              <span class="live-text">
                {snap.source.status === "offline" ? "Offline" : "Live"} · {lag ? `${lag} unpublished` : "all published"}
              </span>
            </span>
            {adapter.viewers.length > 1 && (
              <>
                <label class="visually-hidden" for="viewer">
                  Viewing as
                </label>
                <select id="viewer" class="select" value={snap.viewer} onChange={(e) => adapter.setViewer(e.currentTarget.value as MemberId)} title="Viewing as">
                  <optgroup label="People">
                    {snap.people
                      .filter((p) => p.kind === "person")
                      .map((p) => (
                        <option key={p.handle} value={p.handle}>
                          {p.handle} · {p.name.split(" ")[0]}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Agents">
                    {snap.people
                      .filter((p) => p.kind === "agent")
                      .map((p) => (
                        <option key={p.handle} value={p.handle}>
                          {p.handle} · agent
                        </option>
                      ))}
                  </optgroup>
                </select>
              </>
            )}
            <button
              class="btn quiet icon-btn"
              type="button"
              onClick={() => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!)}
              aria-label={`Theme: ${theme}. Change theme`}
              title={`Theme: ${theme}`}
            >
              <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"} />
            </button>
          </div>
        </div>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} style={{ outline: "none" }}>
        {route.name === "needs" && <NeedsYou />}
        {route.name === "room" && <RoomScreen />}
        {route.name === "policy" && <PolicyScreen />}
        {route.name === "acts" && <ActsScreen {...(route.kind ? { kind: route.kind } : {})} />}
        {route.name === "proposal" && <ProposalScreen key={route.lane} laneId={route.lane} {...(route.generation ? { generation: route.generation } : {})} {...(route.focus ? { focus: route.focus } : {})} />}
      </main>

      <footer class="footer">
        {snap.source.kind === "mock" ? <span>{snap.source.note === "Scripted scenario" ? "A scripted demo room: three agents, two people, one checker." : "A demo room that declares its own acts."}</span> : <span>Connected to {snap.room.name}.</span>}
        {adapter.timeline && (
          <button class="btn quiet small" type="button" onClick={() => setDevOpen(!devOpen)} aria-pressed={devOpen}>
            <Icon name="play" /> {devOpen ? "Hide" : "Replay"} the scenario
          </button>
        )}
        <button class="btn quiet small" type="button" onClick={() => setHelp(!help)} aria-expanded={help}>
          <Icon name="keyboard" /> Keyboard
        </button>
        {help && (
          <p class="small" role="note">
            <kbd>1</kbd> Needs you · <kbd>2</kbd> Room · <kbd>3</kbd> Policy · <kbd>4</kbd> Acts · <kbd>j</kbd>/<kbd>k</kbd> next and previous item · <kbd>?</kbd> this help
            {adapter.timeline && (
              <>
                {" "}· <kbd>d</kbd> demo timeline · <kbd>,</kbd>/<kbd>.</kbd> step back and forward
              </>
            )}
          </p>
        )}
      </footer>

      {devOpen && adapter.timeline && <DevBar timeline={adapter.timeline} onClose={() => setDevOpen(false)} />}
      <WhyDialog act={whyAct} onClose={() => setWhyAct(null)} />
    </AppContext.Provider>
  );
}
