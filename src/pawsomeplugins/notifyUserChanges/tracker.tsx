/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { shouldBeNative, showNotification } from "@api/Notifications";
import { PlatformIndicator } from "@plugins/platformIndicators";
import type { PresenceUpdate, User, VoiceState } from "@vencord/discord-types";
import { ChannelStore, React, SelectedChannelStore, UserStore } from "@webpack/common";

import { isUserWatched, settings } from "./settings";

interface TrackedState {
    status?: string;
    avatar?: string;
    customStatus?: string;
    primaryActivity?: string;
    voiceChannelId?: string | null;
}

const trackedUsers = new Map<string, TrackedState>();

export function resetTrackerState() {
    trackedUsers.clear();
}

function playNotificationSound() {
    if (!settings.store.notifySound) return;

    try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.25);
    } catch {
        // Ignored if browser audio policy restricts playback before user gesture
    }
}

function getUserDisplayName(user: User): string {
    const obj = user as User & { globalName?: string };
    return obj.globalName || obj.username || "User";
}

function renderRichBody(user: User, text: string) {
    return (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
            <div style={{ position: "relative" }}>
                <img
                    src={user.getAvatarURL(undefined, 80, true)}
                    style={{ width: "48px", height: "48px", borderRadius: "50%" }}
                    alt={`${user.username}'s avatar`}
                />
                <div style={{ position: "absolute", top: "-4px", right: "-4px" }}>
                    <PlatformIndicator user={user} />
                </div>
            </div>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>{text}</span>
        </div>
    );
}

function dispatchNotification(user: User, title: string, body: string, richText: string) {
    playNotificationSound();

    showNotification({
        title: shouldBeNative() ? `${getUserDisplayName(user)}: ${title}` : title,
        body,
        noPersist: !settings.store.persistNotifications,
        richBody: renderRichBody(user, richText)
    });
}

interface ActivityLike {
    type: number;
    name?: string;
    details?: string;
    state?: string;
    emoji?: { name?: string; };
}

function formatCustomStatus(activity?: ActivityLike): string | undefined {
    if (!activity || activity.type !== 4) return undefined;

    const parts: string[] = [];
    if (activity.emoji?.name) parts.push(activity.emoji.name);
    if (activity.state) parts.push(activity.state);

    return parts.length ? parts.join(" ") : undefined;
}

function formatPrimaryActivity(activity?: ActivityLike): string | undefined {
    if (!activity || activity.type === 4 || !activity.name) return undefined;

    switch (activity.type) {
        case 0:
            return `playing ${activity.name}`;
        case 1:
            return `streaming ${activity.name}`;
        case 2:
            return activity.details && activity.state
                ? `listening to "${activity.details}" by ${activity.state}`
                : `listening to ${activity.name}`;
        case 3:
            return `watching ${activity.name}`;
        case 5:
            return `competing in ${activity.name}`;
        default:
            return activity.name;
    }
}

export function handlePresenceUpdates(updates: PresenceUpdate[]) {
    for (const { user: { id: userId }, status, clientStatus, activities } of updates) {
        if (!isUserWatched(userId)) continue;

        const user = UserStore.getUser(userId);
        if (!user) continue;

        const name = getUserDisplayName(user);
        let tracked = trackedUsers.get(userId);
        if (!tracked) {
            tracked = {};
            trackedUsers.set(userId, tracked);
        }

        // Online Status Change
        if (settings.store.notifyStatus && clientStatus) {
            if (tracked.status && tracked.status !== status) {
                dispatchNotification(
                    user,
                    "Status Change",
                    `Now ${status}`,
                    `${name} is now ${status}`
                );
            }
            tracked.status = status;
        }

        // Custom Status Change
        if (settings.store.notifyCustomStatus && activities) {
            const currentCustom = formatCustomStatus(activities.find(a => a.type === 4));
            if (tracked.customStatus !== undefined && tracked.customStatus !== currentCustom) {
                if (currentCustom) {
                    dispatchNotification(
                        user,
                        "Custom Status",
                        currentCustom,
                        `${name} set status to: "${currentCustom}"`
                    );
                } else {
                    dispatchNotification(
                        user,
                        "Custom Status Cleared",
                        "Cleared custom status",
                        `${name} cleared their custom status`
                    );
                }
            }
            tracked.customStatus = currentCustom;
        }

        // Activity / Game Change
        if (settings.store.notifyActivity && activities) {
            const currentActivity = formatPrimaryActivity(activities.find(a => a.type !== 4));
            if (tracked.primaryActivity !== undefined && tracked.primaryActivity !== currentActivity) {
                if (currentActivity) {
                    dispatchNotification(
                        user,
                        "Activity Started",
                        currentActivity,
                        `${name} started ${currentActivity}`
                    );
                } else if (tracked.primaryActivity) {
                    dispatchNotification(
                        user,
                        "Activity Stopped",
                        `Stopped ${tracked.primaryActivity}`,
                        `${name} stopped ${tracked.primaryActivity}`
                    );
                }
            }
            tracked.primaryActivity = currentActivity;
        }
    }
}

export function handleUserUpdate(user: User) {
    if (!user || !isUserWatched(user.id)) return;

    let tracked = trackedUsers.get(user.id);
    if (!tracked) {
        tracked = {};
        trackedUsers.set(user.id, tracked);
    }

    if (settings.store.notifyAvatar) {
        if (tracked.avatar && tracked.avatar !== user.avatar) {
            const name = getUserDisplayName(user);
            dispatchNotification(
                user,
                "Avatar Changed",
                "Updated their profile picture",
                `${name} changed their avatar`
            );
        }
        tracked.avatar = user.avatar;
    }
}

export function handleVoiceStateUpdates(voiceStates: VoiceState[]) {
    if (!settings.store.notifyVoice) return;

    const myChanId = SelectedChannelStore.getVoiceChannelId();

    for (const { userId, channelId, oldChannelId } of voiceStates) {
        if (!isUserWatched(userId)) continue;
        if (channelId === oldChannelId) continue;

        const user = UserStore.getUser(userId);
        if (!user) continue;

        const name = getUserDisplayName(user);
        let tracked = trackedUsers.get(userId);
        if (!tracked) {
            tracked = {};
            trackedUsers.set(userId, tracked);
        }

        if (channelId && oldChannelId) {
            const oldChan = ChannelStore.getChannel(oldChannelId)?.name ?? "channel";
            const newChan = ChannelStore.getChannel(channelId)?.name ?? "channel";
            dispatchNotification(
                user,
                "Voice Channel Moved",
                `Moved to #${newChan}`,
                `${name} moved from #${oldChan} to #${newChan}`
            );
        } else if (channelId && channelId !== myChanId) {
            const newChan = ChannelStore.getChannel(channelId)?.name ?? "channel";
            dispatchNotification(
                user,
                "Voice Channel Joined",
                `Joined #${newChan}`,
                `${name} joined #${newChan}`
            );
        } else if (oldChannelId) {
            const oldChan = ChannelStore.getChannel(oldChannelId)?.name ?? "channel";
            dispatchNotification(
                user,
                "Voice Channel Left",
                `Left #${oldChan}`,
                `${name} left #${oldChan}`
            );
        }

        tracked.voiceChannelId = channelId;
    }
}
