/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    notifyStatus: {
        type: OptionType.BOOLEAN,
        description: "Notify on online status changes (online, idle, dnd, offline)",
        default: true
    },
    notifyVoice: {
        type: OptionType.BOOLEAN,
        description: "Notify on voice channel changes (join, leave, move)",
        default: true
    },
    notifyAvatar: {
        type: OptionType.BOOLEAN,
        description: "Notify when a user changes their profile avatar",
        default: true
    },
    notifyCustomStatus: {
        type: OptionType.BOOLEAN,
        description: "Notify when a user updates their custom text or emoji status",
        default: true
    },
    notifyActivity: {
        type: OptionType.BOOLEAN,
        description: "Notify when a user starts or stops playing a game or activity",
        default: true
    },
    notifySound: {
        type: OptionType.BOOLEAN,
        description: "Play sound effect on notification",
        default: false
    },
    persistNotifications: {
        type: OptionType.BOOLEAN,
        description: "Persist notifications until manually dismissed",
        default: false
    },
    userIds: {
        type: OptionType.STRING,
        description: "Watched user IDs (comma separated)",
        default: "",
        hidden: true
    }
});

export function getWatchedUserIds(): string[] {
    const raw = settings.store.userIds;
    if (!raw) return [];
    return raw
        .split(",")
        .map(id => id.trim())
        .filter(Boolean);
}

export function isUserWatched(userId: string): boolean {
    if (!userId) return false;
    return getWatchedUserIds().includes(userId);
}

export function addWatchedUser(userId: string): boolean {
    if (!userId || !/^\d{17,20}$/.test(userId)) return false;
    const current = getWatchedUserIds();
    if (current.includes(userId)) return false;

    current.push(userId);
    settings.store.userIds = current.join(",");
    return true;
}

export function removeWatchedUser(userId: string): boolean {
    if (!userId) return false;
    const current = getWatchedUserIds();
    const index = current.indexOf(userId);
    if (index === -1) return false;

    current.splice(index, 1);
    settings.store.userIds = current.join(",");
    return true;
}
