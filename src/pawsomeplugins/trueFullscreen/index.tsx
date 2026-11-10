/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { PawsomeDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { PopoutWindowStore } from "@webpack/common";

import style from "./style.css?managed";

const settings = definePluginSettings({
    enableDoubleClick: {
        description: "Double-click video to enter/exit True Fullscreen",
        type: OptionType.BOOLEAN,
        default: true,
    },
    keybind: {
        description: "Hotkey to toggle True Fullscreen",
        type: OptionType.STRING,
        default: "KeyF",
    },
    hideLiveBadge: {
        description: "Hide the LIVE badge overlay",
        type: OptionType.BOOLEAN,
        default: true,
    },
    zoomToFill: {
        description: "Zoom to fill screen (Cover) instead of containing",
        type: OptionType.BOOLEAN,
        default: false,
    },
    autoHideControls: {
        description: "Auto-hide controls and cursor after inactivity",
        type: OptionType.BOOLEAN,
        default: true,
    },
});

let activeTile: HTMLElement | null = null;
let idleTimeout: ReturnType<typeof setTimeout> | undefined;
const attachedWindows = new Set<Window>();

const FULLSCREEN_SVG = `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
</svg>
`;

const EXIT_FULLSCREEN_SVG = `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
</svg>
`;

function resetIdleTimer() {
    if (idleTimeout) {
        clearTimeout(idleTimeout);
        idleTimeout = undefined;
    }
    if (activeTile) {
        activeTile.classList.remove("vc-tf-idle");
        if (settings.store.autoHideControls) {
            idleTimeout = setTimeout(() => {
                if (activeTile) {
                    activeTile.classList.add("vc-tf-idle");
                }
            }, 2000);
        }
    }
}

function onMouseMove() {
    resetIdleTimer();
}

function updateButtonIcon(btn: HTMLElement, isFullscreen: boolean) {
    btn.innerHTML = isFullscreen ? EXIT_FULLSCREEN_SVG : FULLSCREEN_SVG;
    btn.title = isFullscreen ? "Exit True Fullscreen (Esc / F)" : "Enter True Fullscreen (F)";
}

function applyTileClasses(tile: HTMLElement) {
    tile.classList.add("vc-tf-active");
    if (settings.store.hideLiveBadge) {
        tile.classList.add("vc-tf-hide-live");
    } else {
        tile.classList.remove("vc-tf-hide-live");
    }

    if (settings.store.zoomToFill) {
        tile.classList.add("vc-tf-zoom-cover");
        tile.classList.remove("vc-tf-zoom-contain");
    } else {
        tile.classList.add("vc-tf-zoom-contain");
        tile.classList.remove("vc-tf-zoom-cover");
    }

    const btn = tile.querySelector<HTMLElement>(".vc-tf-button");
    if (btn) updateButtonIcon(btn, true);
}

function removeTileClasses(tile: HTMLElement) {
    tile.classList.remove(
        "vc-tf-active",
        "vc-tf-hide-live",
        "vc-tf-zoom-cover",
        "vc-tf-zoom-contain",
        "vc-tf-idle"
    );
    const btn = tile.querySelector<HTMLElement>(".vc-tf-button");
    if (btn) updateButtonIcon(btn, false);
}

async function enterTrueFullscreen(tile: HTMLElement) {
    if (activeTile && activeTile !== tile) {
        await exitTrueFullscreen();
    }

    activeTile = tile;
    applyTileClasses(tile);
    tile.addEventListener("mousemove", onMouseMove);
    resetIdleTimer();

    const doc = tile.ownerDocument;
    try {
        if (tile.requestFullscreen && !doc.fullscreenElement) {
            await tile.requestFullscreen();
        }
    } catch {
        // Fallback to CSS fullscreen (.vc-tf-active)
    }
}

async function exitTrueFullscreen() {
    if (!activeTile) return;

    const tile = activeTile;
    const doc = tile.ownerDocument;
    removeTileClasses(tile);
    tile.removeEventListener("mousemove", onMouseMove);
    activeTile = null;

    if (idleTimeout) {
        clearTimeout(idleTimeout);
        idleTimeout = undefined;
    }

    if (doc.fullscreenElement) {
        try {
            await doc.exitFullscreen();
        } catch {
            // Ignored
        }
    }
}

function toggleTrueFullscreen(tile: HTMLElement) {
    if (activeTile === tile) {
        void exitTrueFullscreen();
    } else {
        void enterTrueFullscreen(tile);
    }
}

function findVideoTile(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;

    const tile = target.closest<HTMLElement>(
        "div[data-selenium-video-tile], [class*='videoWrapper_'], [class*='tile_'], [class*='callContainer_']"
    );
    if (tile && tile.querySelector("video")) return tile;

    const video =
        target instanceof HTMLVideoElement
            ? target
            : target.querySelector("video") || target.closest("div")?.querySelector("video");
    if (video) {
        return (
            video.closest<HTMLElement>(
                "div[data-selenium-video-tile], [class*='videoWrapper_'], [class*='wrapper_'], [class*='tile_'], [class*='video_']"
            ) || video.parentElement
        );
    }

    const doc = target.ownerDocument;
    const docVideos = doc.querySelectorAll("video");
    if (docVideos.length === 1) {
        const singleVideo = docVideos[0];
        return (
            singleVideo.closest<HTMLElement>(
                "div[data-selenium-video-tile], [class*='videoWrapper_'], [class*='wrapper_'], [class*='tile_']"
            ) || singleVideo.parentElement
        );
    }

    return null;
}

function ensureButton(tile: HTMLElement) {
    if (tile.querySelector(".vc-tf-button")) return;

    const btn = tile.ownerDocument.createElement("button");
    btn.className = "vc-tf-button";
    updateButtonIcon(btn, activeTile === tile);

    btn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        toggleTrueFullscreen(tile);
    });

    tile.appendChild(btn);
}

function onDoubleClick(e: MouseEvent) {
    if (!settings.store.enableDoubleClick) return;
    const tile = findVideoTile(e.target);
    if (tile) {
        e.preventDefault();
        e.stopPropagation();
        toggleTrueFullscreen(tile);
    }
}

function onKeyDown(e: KeyboardEvent) {
    if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement | null)?.isContentEditable
    ) {
        return;
    }

    const doc = (e.target as HTMLElement | null)?.ownerDocument || document;

    if (e.code === settings.store.keybind) {
        const tile =
            activeTile ||
            findVideoTile(e.target) ||
            doc.querySelector<HTMLElement>(
                "div[data-selenium-video-tile], [class*='videoWrapper_'], [class*='tile_']"
            ) ||
            doc.querySelector("video")?.parentElement;
        if (tile) {
            e.preventDefault();
            toggleTrueFullscreen(tile);
        }
    } else if (e.code === "Escape" && activeTile) {
        e.preventDefault();
        void exitTrueFullscreen();
    }
}

function onFullscreenChange(e: Event) {
    const doc =
        (e.target as Document | null) ||
        (activeTile ? activeTile.ownerDocument : document);
    if (!doc.fullscreenElement && activeTile && activeTile.ownerDocument === doc) {
        void exitTrueFullscreen();
    }
}

function onMouseOver(e: MouseEvent) {
    const tile = findVideoTile(e.target);
    if (tile) {
        ensureButton(tile);
    }
}

function ensureStylesInDocument(doc: Document) {
    if (doc === document) return;
    if (doc.getElementById("vc-tf-style")) return;

    const mainStyles = document.querySelectorAll<HTMLStyleElement>("style");
    let cssText = "";
    for (const s of mainStyles) {
        if (s.textContent?.includes("vc-tf-")) {
            cssText += s.textContent + "\n";
        }
    }
    if (cssText) {
        const styleEl = doc.createElement("style");
        styleEl.id = "vc-tf-style";
        styleEl.textContent = cssText;
        doc.head?.appendChild(styleEl);
    }
}

function attachWindow(win: Window) {
    if (!win || attachedWindows.has(win)) return;
    try {
        if (!win.document) return;
    } catch {
        return;
    }

    attachedWindows.add(win);

    win.addEventListener("keydown", onKeyDown, true);
    win.document.addEventListener("dblclick", onDoubleClick, true);
    win.document.addEventListener("mouseover", onMouseOver, true);
    win.document.addEventListener("fullscreenchange", onFullscreenChange);
    win.addEventListener("beforeunload", () => detachWindow(win));

    ensureStylesInDocument(win.document);
}

function detachWindow(win: Window) {
    if (!attachedWindows.has(win)) return;
    attachedWindows.delete(win);

    if (activeTile && activeTile.ownerDocument === win.document) {
        activeTile = null;
        if (idleTimeout) {
            clearTimeout(idleTimeout);
            idleTimeout = undefined;
        }
    }

    try {
        win.removeEventListener("keydown", onKeyDown, true);
        win.document.removeEventListener("dblclick", onDoubleClick, true);
        win.document.removeEventListener("mouseover", onMouseOver, true);
        win.document.removeEventListener("fullscreenchange", onFullscreenChange);
    } catch {
        // Ignored if window already closed
    }
}

function cleanupClosedPopouts() {
    for (const win of attachedWindows) {
        if (win.closed) {
            detachWindow(win);
        }
    }
}

function attachAllPopouts() {
    if (!PopoutWindowStore) return;
    try {
        const keys = PopoutWindowStore.getWindowKeys?.() || [];
        for (const key of keys) {
            const popWin = PopoutWindowStore.getWindow?.(key);
            if (popWin && !popWin.closed) {
                attachWindow(popWin);
            }
        }
    } catch {
        // Ignored
    }
}

function onWindowMessage(event: MessageEvent) {
    const { discordPopoutEvent } = event.data || {};
    if (discordPopoutEvent?.type === "loaded") {
        setTimeout(attachAllPopouts, 100);
    }
}

function onWindowFocus() {
    attachAllPopouts();
}

export default definePlugin({
    name: "TrueFullscreen",
    description: "Enables an immersive true fullscreen mode for streams and screenshares.",
    settings,
    authors: [PawsomeDevs.enzomtp],
    managedStyle: style,

    flux: {
        POPOUT_WINDOW_OPEN() {
            setTimeout(attachAllPopouts, 150);
            setTimeout(attachAllPopouts, 500);
        },
        POPOUT_WINDOW_CLOSE() {
            cleanupClosedPopouts();
        },
    },

    start() {
        attachWindow(window);
        attachAllPopouts();

        window.addEventListener("message", onWindowMessage);
        window.addEventListener("focus", onWindowFocus);
    },

    stop() {
        if (activeTile) {
            void exitTrueFullscreen();
        }

        window.removeEventListener("message", onWindowMessage);
        window.removeEventListener("focus", onWindowFocus);

        for (const win of [...attachedWindows]) {
            detachWindow(win);
        }

        for (const btn of document.querySelectorAll(".vc-tf-button")) {
            btn.remove();
        }
    },
});
