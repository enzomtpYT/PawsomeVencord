/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, migratePluginSettings } from "@api/Settings";
import { makeRange, OptionType } from "@utils/types";

import type { CachedSettings } from "./types";
import { isValidWebSocketUrl, setDebugConfigGetter } from "./utils";

let reconnectHandler: (() => Promise<void>) | null = null;

export function setReconnectHandler(handler: () => Promise<void>) {
    reconnectHandler = handler;
}

export const settings = definePluginSettings({
    connectAutomatically: {
        type: OptionType.BOOLEAN,
        description: "If true, it will connect to intiface on startup. (With this off, you need to re-enable the plugin to reconnect)",
        default: true,
    },
    rampUpAndDown: {
        type: OptionType.BOOLEAN,
        description: "If true, it will try and smoothly ramp the vibration intensity up and down",
        default: true,
    },
    rampUpAndDownSteps: {
        type: OptionType.SLIDER,
        description: "How many steps to use when ramping up and down (Default: 20)\nHigher steps will add more delay",
        markers: makeRange(0, 40, 1),
        stickToMarkers: true,
        default: 20,
    },
    websocketUrl: {
        type: OptionType.STRING,
        description: "The URL of the websocket server",
        default: "ws://127.0.0.1:12345",
        onChange: async () => {
            if (reconnectHandler) {
                await reconnectHandler();
            }
        },
        isValid: (value: string) => {
            if (!value) return "Please enter a URL";
            if (!isValidWebSocketUrl(value)) return "Invalid URL provided. Expected format: ws://127.0.0.1:12345";
            return true;
        },
    },
    maxVibrationIntensity: {
        type: OptionType.SLIDER,
        description: "The maximum intensity of vibration",
        markers: makeRange(0, 100, 10),
        stickToMarkers: false,
        default: 70,
    },
    targetWords: {
        type: OptionType.STRING,
        description: "Comma-separated list of words to use as targets (used for detecting things when you was not mentioned)",
        onChange: () => updateCachedSettings(),
    },
    triggerWords: {
        type: OptionType.STRING,
        description: "Comma-separated list of words to use as triggers",
        onChange: () => updateCachedSettings(),
    },
    addOnWords: {
        type: OptionType.STRING,
        description: "Comma-separated list of words to add to the trigger words (increases vibration per word)",
        onChange: () => updateCachedSettings(),
    },
    switchBlacklistToWhitelist: {
        type: OptionType.BOOLEAN,
        description: "If true, will switch the blacklist to a whitelist",
    },
    allowSelfTrigger: {
        type: OptionType.BOOLEAN,
        description: "Allow trigger words to work on your own messages",
        default: false,
    },
    listedUsers: {
        type: OptionType.STRING,
        description: "Comma-separated list of user IDs to blacklist/whitelist",
        onChange: () => updateCachedSettings(),
    },
    listedChannels: {
        type: OptionType.STRING,
        description: "Comma-separated list of channel IDs to blacklist/whitelist",
        onChange: () => updateCachedSettings(),
    },
    listedGuilds: {
        type: OptionType.STRING,
        description: "Comma-separated list of guild IDs to blacklist/whitelist",
        onChange: () => updateCachedSettings(),
    },
    altOptions: {
        type: OptionType.SELECT,
        description: "Alternative options to use",
        default: "none",
        options: [
            {
                value: "none",
                label: "None (Default)",
            },
            {
                value: "dmOnly",
                label: "DM Only",
            },
            {
                value: "currentChannelOnly",
                label: "Current Channel Only",
            },
            {
                value: "currentGuildOnly",
                label: "Current Guild Only",
            },
        ],
    },
    richPresence: {
        type: OptionType.BOOLEAN,
        description: "Enable rich presence (requires restart)",
        default: false,
    },
    richPresenceTitle: {
        type: OptionType.STRING,
        description: "The name of the rich presence",
        default: "venPlugPlus",
    },
    rpcDisconnectTimeout: {
        type: OptionType.SLIDER,
        description: "Timeout for the 'Intiface not connected' RPC (in minutes)",
        markers: makeRange(1, 30, 1),
        stickToMarkers: true,
        default: 5,
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Enable debug mode (adds console logging, notifications for debugging, and additional commands)",
        default: false,
    },
    debugLogLevel: {
        type: OptionType.SELECT,
        description: "Debug logging level (only works when debug mode is enabled)",
        default: "error",
        options: [
            {
                value: "silent",
                label: "Silent - No debug logs",
            },
            {
                value: "error",
                label: "Error - Only errors and critical issues",
            },
            {
                value: "warn",
                label: "Warning - Errors + connection issues",
            },
            {
                value: "info",
                label: "Info - Errors + connections + major events",
            },
            {
                value: "verbose",
                label: "Verbose - All debug information (spammy)",
            },
        ],
    },
    allowDirectUserControl: {
        type: OptionType.BOOLEAN,
        description: "Allow other users to directly control your toy",
        default: false,
    },
    directControlAllowedUsers: {
        type: OptionType.STRING,
        description: "UserIDs to grant command access to, separated by spaces",
        onChange: () => updateCachedSettings(),
    },
    directControlCommandPrefix: {
        type: OptionType.STRING,
        description: "The prefix for the command to be used",
        default: ">.",
        onChange(newValue: string) {
            if (!newValue || newValue === "") {
                settings.store.directControlCommandPrefix = ">.";
            }
        },
    },
});

migratePluginSettings("VenPlugPlus", "Venplug");

setDebugConfigGetter(() => ({
    debugMode: settings.store.debugMode,
    debugLogLevel: settings.store.debugLogLevel ?? "error",
}));

export const cachedSettings: CachedSettings = {
    triggerWords: [],
    addOnWords: [],
    targetWords: [],
    listedUsers: [],
    listedChannels: [],
    listedGuilds: [],
    directControlUsers: [],
};

export function updateCachedSettings() {
    cachedSettings.triggerWords = settings.store.triggerWords?.toLowerCase().split(",").map(s => s.trim()).filter(s => s !== "") || [];
    cachedSettings.addOnWords = settings.store.addOnWords?.toLowerCase().split(",").map(s => s.trim()).filter(s => s !== "") || [];
    cachedSettings.targetWords = settings.store.targetWords?.toLowerCase().split(",").map(s => s.trim()).filter(s => s !== "") || [];
    cachedSettings.listedUsers = settings.store.listedUsers?.split(",").map(s => s.trim()).filter(s => s !== "") || [];
    cachedSettings.listedChannels = settings.store.listedChannels?.split(",").map(s => s.trim()).filter(s => s !== "") || [];
    cachedSettings.listedGuilds = settings.store.listedGuilds?.split(",").map(s => s.trim()).filter(s => s !== "") || [];
    cachedSettings.directControlUsers = settings.store.directControlAllowedUsers?.split(" ").map(s => s.trim()).filter(id => id !== "") || [];
}
