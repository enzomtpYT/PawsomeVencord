/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { PawsomeDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import {
    ApplicationStreamingStore,
    ChannelRTCStore,
    PopoutWindowStore,
    RTCConnectionStore,
    SelectedChannelStore,
    UserStore
} from "@webpack/common";

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
    zoomToFill: {
        description: "Default to Zoom to Fill screen (Cover) instead of Fit (Contain)",
        type: OptionType.BOOLEAN,
        default: false,
    },
    autoHideControls: {
        description: "Auto-hide controls and cursor after 2 seconds of inactivity",
        type: OptionType.BOOLEAN,
        default: true,
    },
});

interface ActivePlayerSession {
    portal: HTMLElement;
    targetDoc: Document;
    sourceVideo: HTMLVideoElement;
    clonedVideo?: HTMLVideoElement;
    reparentedPlaceholder?: Comment;
    idleTimeout?: ReturnType<typeof setTimeout>;
    isCover: boolean;
}

let currentSession: ActivePlayerSession | null = null;
let lastHoveredTarget: HTMLElement | null = null;
let lastClickTime = 0;
let lastClickTile: HTMLElement | null = null;
const attachedWindows = new Set<Window>();

const FULLSCREEN_SVG = `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
</svg>
`;

const EXIT_SVG = `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
</svg>
`;

const FIT_SVG = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <line x1="2" y1="10" x2="22" y2="10"/>
</svg>
`;

const CROP_SVG = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 2v14a2 2 0 0 0 2 2h14"/>
    <path d="M18 22V8a2 2 0 0 0-2-2H2"/>
</svg>
`;

function resetPlayerIdleTimer() {
    if (!currentSession) return;

    if (currentSession.idleTimeout) {
        clearTimeout(currentSession.idleTimeout);
        currentSession.idleTimeout = undefined;
    }

    currentSession.portal.classList.remove("vc-tf-idle");

    if (settings.store.autoHideControls) {
        currentSession.idleTimeout = setTimeout(() => {
            if (currentSession) {
                currentSession.portal.classList.add("vc-tf-idle");
            }
        }, 2000);
    }
}

function onPlayerMouseMove() {
    resetPlayerIdleTimer();
}

function updateAspectRatio(btn: HTMLButtonElement, isCover: boolean) {
    if (!currentSession) return;
    currentSession.isCover = isCover;

    if (isCover) {
        currentSession.portal.classList.add("vc-tf-fit-cover");
        currentSession.portal.classList.remove("vc-tf-fit-contain");
        btn.innerHTML = `${FIT_SVG} Fit to Screen`;
        btn.title = "Switch to Letterboxed (Fit)";
    } else {
        currentSession.portal.classList.add("vc-tf-fit-contain");
        currentSession.portal.classList.remove("vc-tf-fit-cover");
        btn.innerHTML = `${CROP_SVG} Fill Screen`;
        btn.title = "Switch to Zoom to Fill (Cover)";
    }
}

function getStreamerTitle(tile: HTMLElement, doc: Document): string {
    const textNode = tile.querySelector<HTMLElement>(
        "[class*='overlayTitle_'], [class*='userName_'], [class*='overlay_'] [class*='text_'], [class*='headerText_']"
    );
    if (textNode?.textContent?.trim()) {
        return textNode.textContent.trim();
    }

    const channelId = SelectedChannelStore?.getVoiceChannelId?.();
    if (channelId && ApplicationStreamingStore && UserStore) {
        const streams = ApplicationStreamingStore.getAllActiveStreamsForChannel?.(channelId) || [];
        if (streams.length > 0 && streams[0]?.ownerId) {
            const user = UserStore.getUser?.(streams[0].ownerId);
            if (user?.globalName || user?.username) {
                const name = user.globalName || user.username;
                return `${name}'s Stream`;
            }
        }
    }

    const titleEl = doc.querySelector<HTMLElement>("[class*='title_'] [class*='text_']");
    if (titleEl?.textContent?.trim()) {
        return titleEl.textContent.trim();
    }

    return "Screenshare";
}

function exitTrueFullscreen() {
    if (!currentSession) return;

    const session = currentSession;
    currentSession = null;

    if (session.idleTimeout) {
        clearTimeout(session.idleTimeout);
        session.idleTimeout = undefined;
    }

    session.portal.removeEventListener("mousemove", onPlayerMouseMove);

    if (session.reparentedPlaceholder && session.sourceVideo) {
        session.reparentedPlaceholder.parentElement?.insertBefore(
            session.sourceVideo,
            session.reparentedPlaceholder
        );
        session.reparentedPlaceholder.remove();
    }

    if (session.clonedVideo) {
        session.clonedVideo.srcObject = null;
        session.clonedVideo.remove();
    }

    if (session.targetDoc.fullscreenElement) {
        try {
            void session.targetDoc.exitFullscreen();
        } catch {
            // Ignored
        }
    }

    session.portal.remove();
}

function enterTrueFullscreen(tile: HTMLElement) {
    if (currentSession) {
        exitTrueFullscreen();
    }

    const sourceVideo = tile.querySelector<HTMLVideoElement>("video");
    if (!sourceVideo) return;

    const targetDoc = sourceVideo.ownerDocument || tile.ownerDocument || document;

    const portal = targetDoc.createElement("div");
    portal.id = "vc-tf-player-portal";

    const initialCover = settings.store.zoomToFill;
    portal.className = initialCover ? "vc-tf-fit-cover" : "vc-tf-fit-contain";

    let clonedVideo: HTMLVideoElement | undefined;
    let reparentedPlaceholder: Comment | undefined;

    const mediaStream = sourceVideo.srcObject as MediaStream | null;
    if (mediaStream && mediaStream.active) {
        clonedVideo = targetDoc.createElement("video");
        clonedVideo.srcObject = mediaStream;
        clonedVideo.autoplay = true;
        clonedVideo.playsInline = true;
        clonedVideo.muted = true; // Audio is already played by original Discord WebRTC audio
        portal.appendChild(clonedVideo);
        clonedVideo.play().catch(() => {});
    } else {
        reparentedPlaceholder = targetDoc.createComment("vc-tf-video-placeholder");
        sourceVideo.parentElement?.insertBefore(reparentedPlaceholder, sourceVideo);
        portal.appendChild(sourceVideo);
    }

    // Top Bar
    const topBar = targetDoc.createElement("div");
    topBar.className = "vc-tf-player-topbar";

    const streamerInfo = targetDoc.createElement("div");
    streamerInfo.className = "vc-tf-streamer-info";

    const streamerTitle = targetDoc.createElement("div");
    streamerTitle.className = "vc-tf-streamer-title";
    streamerTitle.textContent = getStreamerTitle(tile, targetDoc);
    streamerInfo.appendChild(streamerTitle);

    const actions = targetDoc.createElement("div");
    actions.className = "vc-tf-player-actions";

    const aspectBtn = targetDoc.createElement("button");
    aspectBtn.className = "vc-tf-action-btn";
    aspectBtn.addEventListener("click", e => {
        e.stopPropagation();
        if (currentSession) {
            updateAspectRatio(aspectBtn, !currentSession.isCover);
        }
    });

    const exitBtn = targetDoc.createElement("button");
    exitBtn.className = "vc-tf-action-btn vc-tf-action-exit";
    exitBtn.innerHTML = `${EXIT_SVG} Exit (Esc)`;
    exitBtn.title = "Exit True Fullscreen (Esc or F)";
    exitBtn.addEventListener("click", e => {
        e.stopPropagation();
        exitTrueFullscreen();
    });

    actions.appendChild(aspectBtn);
    actions.appendChild(exitBtn);

    topBar.appendChild(streamerInfo);
    topBar.appendChild(actions);
    portal.appendChild(topBar);

    currentSession = {
        portal,
        targetDoc,
        sourceVideo,
        clonedVideo,
        reparentedPlaceholder,
        isCover: initialCover,
    };

    updateAspectRatio(aspectBtn, initialCover);

    portal.addEventListener("mousemove", onPlayerMouseMove);

    portal.addEventListener("dblclick", e => {
        e.preventDefault();
        e.stopPropagation();
        exitTrueFullscreen();
    });

    targetDoc.body.appendChild(portal);
    resetPlayerIdleTimer();

    if (portal.requestFullscreen) {
        portal.requestFullscreen().catch(() => {});
    }
}

function isCallActive(doc: Document): boolean {
    const win = doc.defaultView || window;
    if (win !== window) {
        return true;
    }
    try {
        return Boolean(
            RTCConnectionStore?.isConnected?.() ||
            SelectedChannelStore?.getVoiceChannelId?.()
        );
    } catch {
        return false;
    }
}

function isScreenshareTile(tile: HTMLElement, doc: Document): boolean {
    const win = doc.defaultView || window;

    if (win !== window) {
        return Boolean(tile.querySelector("video"));
    }

    if (!tile.closest("[class*='callContainer_'], [class*='videoGrid_'], div[data-selenium-video-tile]")) {
        return false;
    }

    if (!tile.querySelector("video")) {
        return false;
    }

    const channelId = SelectedChannelStore?.getVoiceChannelId?.();
    if (!channelId) {
        return false;
    }

    const streams =
        ApplicationStreamingStore?.getAllActiveStreamsForChannel?.(channelId) ||
        ChannelRTCStore?.getStreamParticipants?.(channelId) ||
        [];

    if (streams.length === 0) {
        return false;
    }

    const hasLiveBadge = Boolean(
        tile.querySelector(
            "[class*='liveIndicator'], [class*='liveShape'], [class*='liveBadge'], [class*='live_'], [aria-label*='Live'], [aria-label*='LIVE']"
        )
    );

    return hasLiveBadge || streams.length === 1;
}

function findScreenshareTile(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;

    if (
        target.closest(
            "[class*='message_'], [class*='chatContent_'], [class*='userProfile_'], [class*='banner_'], [class*='avatar_'], [class*='profile_'], [class*='members_'], [class*='sidebar_'], [class*='guilds_']"
        )
    ) {
        return null;
    }

    const doc = target.ownerDocument || document;
    if (!isCallActive(doc)) {
        return null;
    }

    const tile = target.closest<HTMLElement>(
        "div[data-selenium-video-tile], [class*='videoWrapper_'], [class*='tile_']"
    );

    if (tile && isScreenshareTile(tile, doc)) {
        return tile;
    }

    if (target instanceof HTMLVideoElement && target.parentElement) {
        if (isScreenshareTile(target.parentElement, doc)) {
            return target.parentElement;
        }
    }

    return null;
}

function ensureButton(tile: HTMLElement) {
    if (tile.querySelector(".vc-tf-button")) return;

    const btn = tile.ownerDocument.createElement("button");
    btn.className = "vc-tf-button";
    btn.innerHTML = FULLSCREEN_SVG;
    btn.title = "True Fullscreen (F)";

    btn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        enterTrueFullscreen(tile);
    });

    tile.appendChild(btn);
}

function onWindowClick(e: MouseEvent) {
    if (!settings.store.enableDoubleClick) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    if (target.closest("#vc-tf-player-portal")) {
        return;
    }

    if (
        target.closest(
            "button, a, input, textarea, select, [role='button'], [role='slider'], [role='menuitem'], [class*='button_']"
        )
    ) {
        return;
    }

    const tile = findScreenshareTile(target);
    if (!tile) return;

    const now = Date.now();
    if (now - lastClickTime <= 350 && lastClickTile === tile) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        lastClickTime = 0;
        lastClickTile = null;
        enterTrueFullscreen(tile);
        return;
    }

    lastClickTime = now;
    lastClickTile = tile;
}

function onDoubleClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (target && findScreenshareTile(target)) {
        e.preventDefault();
        e.stopPropagation();
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

    if (currentSession) {
        if (e.code === "Escape" || e.code === settings.store.keybind) {
            e.preventDefault();
            exitTrueFullscreen();
        }
        return;
    }

    if (e.code !== settings.store.keybind) {
        return;
    }

    const doc = (e.target as HTMLElement | null)?.ownerDocument || document;
    if (!isCallActive(doc)) {
        return;
    }

    let tile: HTMLElement | null = null;
    if (lastHoveredTarget) {
        tile = findScreenshareTile(lastHoveredTarget);
    }

    if (!tile) {
        const candidates = doc.querySelectorAll<HTMLElement>(
            "div[data-selenium-video-tile], [class*='videoWrapper_'], [class*='tile_']"
        );
        for (const candidate of candidates) {
            if (isScreenshareTile(candidate, doc)) {
                tile = candidate;
                break;
            }
        }
    }

    if (!tile) {
        const video = doc.querySelector<HTMLVideoElement>("video");
        if (video?.parentElement && isScreenshareTile(video.parentElement, doc)) {
            tile = video.parentElement;
        }
    }

    if (tile) {
        e.preventDefault();
        enterTrueFullscreen(tile);
    }
}

function onFullscreenChange(e: Event) {
    const doc =
        (e.target as Document | null) ||
        (currentSession ? currentSession.targetDoc : document);

    if (currentSession && currentSession.targetDoc === doc && !doc.fullscreenElement) {
        exitTrueFullscreen();
    }
}

function onMouseOver(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    lastHoveredTarget = target;

    const tile = findScreenshareTile(target);
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

    win.addEventListener("click", onWindowClick, true);
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

    if (currentSession && currentSession.targetDoc === win.document) {
        exitTrueFullscreen();
    }

    try {
        win.removeEventListener("click", onWindowClick, true);
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
        RTC_CONNECTION_STATE(e: { state: string }) {
            if (e.state === "DISCONNECTED" && currentSession) {
                exitTrueFullscreen();
            }
        },
        VOICE_CHANNEL_SELECT() {
            if (currentSession) {
                exitTrueFullscreen();
            }
        },
    },

    start() {
        attachWindow(window);
        attachAllPopouts();

        window.addEventListener("message", onWindowMessage);
        window.addEventListener("focus", onWindowFocus);
    },

    stop() {
        if (currentSession) {
            exitTrueFullscreen();
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
