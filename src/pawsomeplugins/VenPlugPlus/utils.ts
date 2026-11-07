/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { Logger } from "@utils/Logger";
import type { Message } from "@vencord/discord-types";
import { FluxDispatcher } from "@webpack/common";
import type { PartialDeep } from "type-fest";

import type { DebugLevel, DiscordMessage } from "./types";

export const logger = new Logger("VenPlugPlus");

let debugConfigGetter: (() => { debugMode: boolean; debugLogLevel: string; }) | null = null;

export function setDebugConfigGetter(getter: () => { debugMode: boolean; debugLogLevel: string; }) {
    debugConfigGetter = getter;
}

export function isValidWebSocketUrl(url: string): boolean {
    const webSocketUrlPattern = /^wss?:\/\/[^\s/$.?#].[^\s]*$/;
    return webSocketUrlPattern.test(url);
}

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function getMessageLink(message: DiscordMessage): string {
    const guildId = message.guild_id || "@me";
    return `https://discord.com/channels/${guildId}/${message.channel_id}/${message.id}`;
}

const DEBUG_LEVELS: DebugLevel[] = ["silent", "error", "warn", "info", "verbose"];

export function debugLog(message: string, data?: unknown, level: DebugLevel = "info") {
    const config = debugConfigGetter?.();
    if (!config?.debugMode) return;

    const currentLevel = (config.debugLogLevel || "error") as DebugLevel;
    const currentLevelIndex = DEBUG_LEVELS.indexOf(currentLevel);
    const messageLevelIndex = DEBUG_LEVELS.indexOf(level);

    if (messageLevelIndex <= currentLevelIndex) {
        const prefix = level === "error" ? "❌" : level === "warn" ? "⚠️" : level === "info" ? "ℹ️" : "🔍";
        logger.info(`[Debug ${prefix}] ${message}`, data ?? "");

        if (level === "error" || level === "warn") {
            showNotification({
                title: `VenPlugPlus Debug (${level.toUpperCase()})`,
                body: message,
                permanent: false,
                noPersist: false,
            });
        }
    }
}

export function editMessage(message: PartialDeep<Message>, content: string): Message {
    message.content = content;
    FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", message });
    return message as Message;
}

export function formatBatteryLevel(rawLevel: number): string {
    const percent = rawLevel <= 1 ? Math.round(rawLevel * 100) : Math.round(rawLevel);
    return `${percent}%`;
}

export function isBatteryLow(rawLevel: number): boolean {
    return rawLevel <= 1 ? rawLevel < 0.1 : rawLevel < 10;
}
