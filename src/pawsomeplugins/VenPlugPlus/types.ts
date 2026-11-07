/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// extend buttplug device interface to track battery warning state
declare module "buttplug" {
    interface ButtplugClientDevice {
        warnedLowBattery?: boolean;
    }
}

export type DebugLevel = "silent" | "error" | "warn" | "info" | "verbose";

export interface DiscordUser {
    avatar: string;
    username: string;
    id: string;
    bot: boolean;
}

export interface DiscordMessage {
    content: string;
    mentions?: DiscordUser[];
    member: DiscordUser;
    message_reference?: {
        channel_id: string;
        guild_id: string;
        message_id: string;
    };
    referenced_message?: DiscordMessage;
    author: DiscordUser;
    guild_id?: string;
    channel_id: string;
    id: string;
    type: number;
    channel: {
        id: string;
    };
    state?: string;
}

export interface FluxMessageCreate {
    type: "MESSAGE_CREATE";
    channelId: string;
    guildId?: string;
    isPushNotification: boolean;
    message: DiscordMessage;
    optimistic: boolean;
}

export interface VibrateEvent {
    duration: number;
    strength: number;
    deviceId?: number;
    oscillationSpeed?: number | number[];
}

export const ActivityType = {
    PLAYING: 0,
    STREAMING: 1,
    LISTENING: 2,
    WATCHING: 3,
    COMPETING: 5,
} as const;

export type ActivityType = typeof ActivityType[keyof typeof ActivityType];

export interface ActivityAssets {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
}

export interface Activity {
    state?: string;
    details?: string;
    timestamps?: {
        start?: number;
        end?: number;
    };
    assets?: ActivityAssets;
    buttons?: string[];
    name: string;
    application_id: string;
    metadata?: {
        button_urls?: string[];
    };
    type: ActivityType;
    url?: string;
    flags: number;
    [key: string]: unknown;
}

export interface RpcData {
    appName?: string;
    details?: string;
    state?: string;
    type?: ActivityType;
    imageBig?: string;
    imageBigTooltip?: string;
    imageSmall?: string;
    imageSmallTooltip?: string;
    buttonOneText?: string;
    buttonOneURL?: string;
}

export interface CachedSettings {
    triggerWords: string[];
    addOnWords: string[];
    targetWords: string[];
    listedUsers: string[];
    listedChannels: string[];
    listedGuilds: string[];
    directControlUsers: string[];
}
