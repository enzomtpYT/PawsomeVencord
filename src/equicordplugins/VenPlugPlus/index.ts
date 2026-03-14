/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Needed header for all plugins

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { showNotification } from "@api/Notifications";
import { definePluginSettings, migratePluginSettings } from "@api/Settings";
import { Devs, EquicordDevs } from "@utils/constants";
import { getCurrentChannel, getCurrentGuild, sendMessage } from "@utils/discord";
import definePlugin, { makeRange, OptionType } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { FluxDispatcher, UserStore } from "@webpack/common";
import { ButtplugBrowserWebsocketClientConnector, ButtplugClient, ButtplugClientDevice, ButtplugDeviceError, DeviceOutput, InputType, OutputType } from "buttplug";
import type { PartialDeep } from "type-fest";

function isValidWebSocketUrl(url: string): boolean {
    const webSocketUrlPattern = /^wss?:\/\/[^\s/$.?#].[^\s]*$/;
    return webSocketUrlPattern.test(url);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// generate discord message link for debugging
function getMessageLink(message: DiscordMessage): string {
    const guildId = message.guild_id || "@me";
    return `https://discord.com/channels/${guildId}/${message.channel_id}/${message.id}`;
}

type DebugLevel = "silent" | "error" | "warn" | "info" | "verbose";

// centralized debug logging with configurable levels and notifications
function debugLog(message: string, data?: any, level: DebugLevel = "info") {
    if (!settings.store.debugMode) return;

    const currentLevel = settings.store.debugLogLevel as DebugLevel;
    const levels: DebugLevel[] = ["silent", "error", "warn", "info", "verbose"];
    const currentLevelIndex = levels.indexOf(currentLevel);
    const messageLevelIndex = levels.indexOf(level);

    if (messageLevelIndex <= currentLevelIndex) {
        const prefix = level === "error" ? "❌" : level === "warn" ? "⚠️" : level === "info" ? "ℹ️" : "🔍";
        console.log(`[VenPlugPlus Debug ${prefix}] ${message}`, data || "");

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

// global state for buttplug client and device management
let client: ButtplugClient | null = null;
let connector: ButtplugBrowserWebsocketClientConnector;
let batteryIntervalId: NodeJS.Timeout | null = null;
let vibrateQueue: VibrateEvent[] = [];
let intervalId;
const recentlyHandledMessages: string[] = [];
let richPresenceTitle;
let rpcDisconnectedTime: Date | null = null;

const settings = definePluginSettings({
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
        onChange: () => {
            handleDisconnection();
            handleConnection();
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

export default definePlugin({
    name: "VenPlugPlus",
    description: "Detects words in messages and uses them to control a buttplug device",
    authors: [EquicordDevs.KaydaFox, EquicordDevs.danthebitshifter, Devs.Mopi, EquicordDevs.enzomtp],
    settings,
    async start() {
        // initialize cached settings after plugin is loaded
        updateCachedSettings();

        richPresenceTitle = settings.store.richPresenceTitle;

        setRpc({
            appName: richPresenceTitle,
            details: "VenPlugPlus just started!",
            state: "Starting up...",
            type: ActivityType.PLAYING,
            imageBig: "1225879839622299748",
        });
        if (settings.store.connectAutomatically)
            await handleConnection();
    },
    stop() {
        handleDisconnection();
        setRpc({});
    },
    flux: {
        MESSAGE_CREATE: (payload: FluxMessageCreate) => {
            handleMessage(payload.message);
        },
    },
    commands: [
        {
            name: "connect",
            description: "Connect to the intiface server",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async (_opts, ctx) => {
                if (client && client.connected)
                    return sendBotMessage(ctx.channel.id, { content: "Already connected to intiface" });
                sendBotMessage(ctx.channel.id, { content: "Connecting to intiface..." });
                await handleConnection();
            }
        },
        {
            name: "disconnect",
            description: "Disconnect from the intiface server",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async (_opts, ctx) => {
                if (client && !client.connected)
                    return sendBotMessage(ctx.channel.id, { content: "You were already disconnected" });
                sendBotMessage(ctx.channel.id, { content: "Disconnecting from intiface..." });
                await handleDisconnection();
            }
        },
        {
            name: "start_scanning",
            description: "Start scanning for devices on the intiface server",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "auto-stop",
                    description: "Auto-stop scanning after 30 seconds (Default: true). if disabled, use /stop_scanning to stop scanning",
                    type: ApplicationCommandOptionType.BOOLEAN,
                    required: false,
                }
            ],
            execute: async (_opts, ctx) => {
                if (!client || !client.connected)
                    return sendBotMessage(ctx.channel.id, { content: "You are not connected to intiface" });

                await client.startScanning();
                const message = sendBotMessage(ctx.channel.id, { content: "Started scanning for devices" });
                if (findOption(_opts, "auto-stop", true) === true)
                    setTimeout(async () => {
                        await client?.stopScanning();
                        editMessage(message, "Finished scanning for devices");
                    }, 30000);
            }
        },
        {
            name: "stop_scanning",
            description: "Stop scanning for devices on the intiface server",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async (_opts, ctx) => {
                if (!client || !client.connected)
                    return sendBotMessage(ctx.channel.id, { content: "You are not connected to intiface" });
                await client.stopScanning();
                sendBotMessage(ctx.channel.id, { content: "Stopped scanning for devices" });
            }
        },
        {
            name: "words",
            description: "Send all your trigger words",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async (_opts, ctx) => {
                const triggerWords = settings.store.triggerWords?.split(",").map(s => s.trim());
                const addOnWords = settings.store.addOnWords?.split(",").map(s => s.trim());
                const targetWords = settings.store.targetWords?.split(",").map(s => s.trim());

                sendMessage(ctx.channel.id, { content: `**Target words:** ${targetWords?.join(", ")}\n\n**Trigger words:** ${triggerWords?.join(", ")}\n\n**Add-on words:** ${addOnWords?.join(", ")}` });
            }
        },
        {
            name: "test",
            description: "Test the vibration of all devices",
            options: [
                {
                    name: "intensity",
                    description: "The intensity to use (0 - 100). Default: 30%",
                    type: ApplicationCommandOptionType.INTEGER,
                    required: false,
                },
                {
                    name: "duration",
                    description: "The duration to use (uses ms (1000 = 1 second)). Default: 2000",
                    type: ApplicationCommandOptionType.INTEGER,
                    required: false,
                }
            ],
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async (opts, _ctx) => {
                const intensity = findOption(opts, "intensity", 30);
                const duration = findOption(opts, "duration", 2000);
                await addToVibrateQueue(<VibrateEvent>{ duration, strength: intensity / 100 });
            }
        },
        {
            name: "devices",
            description: "List all connected devices",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "send_to_channel",
                    description: "Send the list to the current channel (Default: false)",
                    type: ApplicationCommandOptionType.BOOLEAN,
                    required: false,
                }
            ],
            execute: async (_opts, ctx) => {
                if (!client || !client.connected)
                    return sendBotMessage(ctx.channel.id, { content: "You are not connected to intiface" });
                const { devices } = client;
                if (devices.size === 0)
                    return sendBotMessage(ctx.channel.id, { content: "No devices connected" });
                const deviceInfo: string[] = [];

                for (const device of client.devices.values()) {
                    deviceInfo.push(`**Name:** ${device.name}, **Battery:** ${device.hasInput(InputType.Battery) ? `${await device.battery() * 100}%` : "No battery"}`);
                }

                findOption(_opts, "send_to_channel") ? sendMessage(ctx.channel.id, {
                    content: `**Connected devices:** \n ${deviceInfo.join("\n")}`
                }) : sendBotMessage(ctx.channel.id, {
                    content: `**Connected devices:** \n ${deviceInfo.join("\n")}`
                });
            }
        },
        {
            name: "debug_info",
            description: "Show debug information (only available in debug mode)",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async (_opts, ctx) => {
                if (!settings.store.debugMode)
                    return sendBotMessage(ctx.channel.id, { content: "Debug mode is not enabled" });

                const debugInfo = [
                    `**Client Status:** ${client ? (client.connected ? "Connected" : "Disconnected") : "Not initialized"}`,
                    `**Devices:** ${client?.devices.size || 0}`,
                    `**Vibrate Queue Length:** ${vibrateQueue.length}`,
                    `**Recent Messages Tracked:** ${recentlyHandledMessages.length}`,
                    `**Battery Interval Active:** ${batteryIntervalId ? "Yes" : "No"}`,
                    `**RPC Disconnected Time:** ${rpcDisconnectedTime || "Not set"}`,
                    "**Settings:**",
                    `  - Max Vibration: ${settings.store.maxVibrationIntensity}%`,
                    `  - Ramp Up/Down: ${settings.store.rampUpAndDown}`,
                    `  - WebSocket URL: ${settings.store.websocketUrl}`,
                    `  - Auto Connect: ${settings.store.connectAutomatically}`,
                ];

                sendBotMessage(ctx.channel.id, { content: debugInfo.join("\n") });
            }
        },
        {
            name: "debug_clear_queue",
            description: "Clear the vibration queue (only available in debug mode)",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async (_opts, ctx) => {
                if (!settings.store.debugMode)
                    return sendBotMessage(ctx.channel.id, { content: "Debug mode is not enabled" });

                const queueLength = vibrateQueue.length;
                vibrateQueue = [];
                sendBotMessage(ctx.channel.id, { content: `Cleared vibration queue (had ${queueLength} items)` });
            }
        },
        {
            name: "debug_simulate_message",
            description: "Simulate a message with trigger words (only available in debug mode)",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "content",
                    description: "The message content to simulate",
                    type: ApplicationCommandOptionType.STRING,
                    required: true,
                }
            ],
            execute: async (opts, ctx) => {
                if (!settings.store.debugMode)
                    return sendBotMessage(ctx.channel.id, { content: "Debug mode is not enabled" });

                const content = findOption(opts, "content", "");
                const currentUser = UserStore.getCurrentUser();

                const simulatedMessage: DiscordMessage = {
                    content,
                    author: currentUser,
                    guild_id: ctx.guild?.id,
                    channel_id: ctx.channel.id,
                    id: `debug_${Date.now()}`,
                    type: 0,
                    channel: { id: ctx.channel.id },
                    member: currentUser,
                    mentions: [currentUser], // Simulate being mentioned
                };

                sendBotMessage(ctx.channel.id, { content: `Simulating message: "${content}"` });
                await handleMessage(simulatedMessage);
            }
        }
    ]
});

// cached split settings for performance optimization
let cachedTriggerWords: string[] = [];
let cachedAddOnWords: string[] = [];
let cachedTargetWords: string[] = [];
let cachedListedUsers: string[] = [];
let cachedListedChannels: string[] = [];
let cachedListedGuilds: string[] = [];
let cachedDirectControlUsers: string[] = [];

function updateCachedSettings() {
    cachedTriggerWords = (settings.store.triggerWords?.toLowerCase().split(",").map(s => s.trim()).filter(s => s !== "") || []);
    cachedAddOnWords = (settings.store.addOnWords?.toLowerCase().split(",").map(s => s.trim()).filter(s => s !== "") || []);
    cachedTargetWords = (settings.store.targetWords?.toLowerCase().split(",").map(s => s.trim()).filter(s => s !== "") || []);
    cachedListedUsers = (settings.store.listedUsers?.split(",").map(s => s.trim()).filter(s => s !== "") || []);
    cachedListedChannels = (settings.store.listedChannels?.split(",").map(s => s.trim()).filter(s => s !== "") || []);
    cachedListedGuilds = (settings.store.listedGuilds?.split(",").map(s => s.trim()).filter(s => s !== "") || []);
    cachedDirectControlUsers = (settings.store.directControlAllowedUsers?.split(" ").map(s => s.trim()).filter(id => id !== "") || []);
}

// Add onChange to relevant settings if needed, but since reconnect happens, it's fine.

async function handleMessage(message: DiscordMessage) {
    if (message.state && message.state === "SENDING") return;
    if (recentlyHandledMessages.includes(message.id)) {
        debugLog(`Message ${message.id} already handled, skipping`, undefined, "verbose");
        return;
    } else {
        recentlyHandledMessages.push(message.id);
        if (recentlyHandledMessages.length > 99) {
            recentlyHandledMessages.shift();
        }
    }

    debugLog(`Processing message from ${message.author.username}: "${message.content}"`, undefined, "verbose");

    const currentUser = UserStore.getCurrentUser();
    let intensity = 0;
    let length = 0;
    let triggered = false;
    let isTargeted = false;

    const listedUsers = cachedListedUsers;
    const listedChannels = cachedListedChannels;
    const listedGuilds = cachedListedGuilds;

    const directControlEnabled: boolean = settings.store.allowDirectUserControl;
    const directControlUsers = cachedDirectControlUsers;
    const { directControlCommandPrefix } = settings.store;

    const content = message.content.toLowerCase();

    debugLog(`Message content (lowercase): "${content}"`, undefined, "verbose");

    if (directControlEnabled && (message.author.id === currentUser.id || directControlUsers.length > 0) && content.startsWith(directControlCommandPrefix)) {
        await handleDirectControl(message, content, directControlCommandPrefix, directControlUsers);
        return;
    }

    if (message.author.id === currentUser.id) {
        if (!settings.store.allowSelfTrigger) {
            debugLog("Self message detected, but self trigger disabled", undefined, "verbose");
            return;
        }
        debugLog("Self message detected, self trigger enabled", undefined, "verbose");
    } else if (message.author.bot) {
        debugLog("Bot message detected, ignoring", undefined, "verbose");
        return;
    }

    // check if message targets the user through mentions, username, replies, dms, or target words
    const isMentioned = message.mentions?.some(mention => mention.id === currentUser.id) || content.includes(currentUser.username.toLowerCase()) || message.referenced_message?.author.id === currentUser.id || !message.guild_id || cachedTargetWords.some(targetWord => content.includes(targetWord));
    if (isMentioned) {
        isTargeted = true;
        debugLog("Message is targeted", {
            mentioned: message.mentions?.some(mention => mention.id === currentUser.id),
            usernameInContent: content.includes(currentUser.username.toLowerCase()),
            replyToUser: message.referenced_message?.author.id === currentUser.id,
            isDM: !message.guild_id,
            hasTargetWords: cachedTargetWords.some(targetWord => content.includes(targetWord))
        }, "verbose");
    }

    if (!isTargeted) {
        debugLog("Message not targeted, ignoring", undefined, "verbose");
        return;
    }

    // Alt options check
    if (settings.store.altOptions === "dmOnly" && message.guild_id) {
        debugLog("DM only mode enabled but message is from guild, ignoring", undefined, "verbose");
        return;
    } else if (settings.store.altOptions === "currentChannelOnly" && message.channel_id !== getCurrentChannel()?.id) {
        debugLog("Current channel only mode enabled but message is from different channel, ignoring", undefined, "verbose");
        return;
    } else if (settings.store.altOptions === "currentGuildOnly" && (!message.guild_id || message.guild_id !== getCurrentGuild()?.id)) {
        debugLog("Current guild only mode enabled but message is from different guild, ignoring", undefined, "verbose");
        return;
    }

    // List filtering
    const isUserListed = listedUsers.includes(message.author.id);
    const isChannelListed = listedChannels.includes(message.channel_id);
    const isGuildListed = message.guild_id && listedGuilds.includes(message.guild_id);

    const shouldIncludeMessage = settings.store.switchBlacklistToWhitelist
        ? isUserListed || isChannelListed || isGuildListed
        : !isUserListed && !isChannelListed && !isGuildListed;

    debugLog("Filtering check", {
        isUserListed,
        isChannelListed,
        isGuildListed,
        shouldIncludeMessage,
        isWhitelist: settings.store.switchBlacklistToWhitelist
    }, "verbose");

    if (!shouldIncludeMessage) {
        debugLog("Message filtered out by user/channel/guild list", undefined, "verbose");
        return;
    }

    if (cachedTriggerWords.length === 0) {
        debugLog("No trigger words configured", undefined, "verbose");
        return;
    }

    debugLog("Checking trigger words", { triggerWords: cachedTriggerWords, addOnWords: cachedAddOnWords }, "verbose");

    // calculate intensity based on trigger words found
    const triggerIntensity = cachedTriggerWords.reduce((acc, triggerWord) => {
        if (content.includes(triggerWord)) {
            triggered = true;
            acc += 19;
            length += 2000;
            const messageLink = getMessageLink(message);
            debugLog(`Trigger word found: "${triggerWord}" in message: ${messageLink}`, { triggerWord, messageLink }, "info");
        }
        return acc;
    }, 0);

    intensity += triggerIntensity;

    if (triggered) {
        debugLog("Message triggered!", { initialIntensity: intensity, initialLength: length }, "info");

        const addOnIntensity = cachedAddOnWords.reduce((acc, addOnWord) => {
            if (content.includes(addOnWord)) {
                acc += 7.5;
                length += Math.floor(Math.random() * (30 - 5 + 1) + 5);
                const messageLink = getMessageLink(message);
                debugLog(`Add-on word found: "${addOnWord}" in message: ${messageLink}`, { addOnWord, messageLink }, "info");
            }
            return acc;
        }, 0);

        intensity += addOnIntensity;

        if (!message.guild_id) {
            intensity *= 1.35;
            length *= 2;
            debugLog("DM bonus applied", undefined, "info");
        }

        if (settings.store.rampUpAndDown)
            length += 1250;

        intensity = Math.min(intensity, 100);

        const messageLink = getMessageLink(message);
        debugLog("Final vibration parameters", {
            intensity,
            length,
            normalizedIntensity: (intensity * (settings.store.maxVibrationIntensity / 100) / 100),
            messageLink
        }, "info");

        addToVibrateQueue({ strength: (intensity * (settings.store.maxVibrationIntensity / 100) / 100), duration: length });
    } else {
        debugLog("No trigger words found in message", undefined, "verbose");
    }
}

async function handleDirectControl(message: DiscordMessage, content: string, prefix: string, allowedUsers: string[]) {
    if (message.author.id !== UserStore.getCurrentUser().id && !allowedUsers.includes(message.author.id)) return;

    debugLog(`Direct control command detected: ${content}`, undefined, "info");
    const command = content.replace(prefix, "");
    const commandInfo = command.split(" "); // parse command arguments

    switch (commandInfo[0]) {
        case "h":
        case "help": {
            return sendMessage(message.channel_id, {
                content: `**Commands**
                \n${prefix}vibrate <amount> - Vibrate all devices
                Example: \`${prefix}vibrate 20\`
                \n${prefix}vibrate <deviceId> <amount> - Vibrate a specific device
                Example: \`${prefix}vibrate 1 20\`
                \n${prefix}vibrate <amount> <timeInMilliseconds> - Vibrate all devices for a specific duration
                Example: \`${prefix}vibrate 20 2000\`
                \n${prefix}vibrate <deviceId> <amount> <timeInMilliseconds> - Vibrate a specific device for a specific duration
                Example: \`${prefix}vibrate 1 20 2000\`
                \n${prefix}oscillate <speed> - Oscillate all devices
                Example: \`${prefix}oscillate 50\`
                \n${prefix}oscillate <deviceId> <speed> - Oscillate a specific device
                Example: \`${prefix}oscillate 1 50\`
                \n${prefix}devices - List all connected devices
                Example: \`${prefix}devices\`
                \n${prefix}list [ping] - List allowed users
                Example: \`${prefix}list\` or \`${prefix}list ping\`
                \n${prefix}pattern <vibrationStrength> <intervalDuration> - Set a vibration pattern
                Example: \`${prefix}pattern 20 1000\`
                \n${prefix}stop - Stop all movement`
            });
        }

        case "l":
        case "list": {
            const users = allowedUsers;
            if (users.length === 0) {
                return sendMessage(message.channel_id, {
                    content: "There are no allowed users configured."
                });
            }

            const ping = commandInfo[1] === "ping";
            let userList = "**Allowed users:**\n";

            if (ping) {
                userList += users.map(id => `- (${id}) - <@${id}>`).join("\n");
            } else {
                userList += users.map(id => `- (${id})`).join("\n");
            }

            return sendMessage(message.channel_id, {
                content: userList
            });
        }

        case "w":
        case "words": {
            return sendMessage(message.channel_id, {
                content: `**Word list**
\n**Target words:** ${settings.store.targetWords}
**Trigger words:** ${settings.store.triggerWords}
**Add-on words:** ${settings.store.addOnWords}
**How does this work?**
Ping me, mention me or say a target word in a message with any of the trigger words and my device will vibrate. The more add-on words you use, the more intense the vibration will be.`
            });
        }
    }

    if (!client || !client.connected) {
        return sendMessage(message.channel_id, {
            content: "My client isn't connected right now"
        });
    }

    await handleDirectControlCommand(commandInfo, message, prefix);
}

async function handleDirectControlCommand(commandInfo: string[], message: DiscordMessage, prefix: string) {
    const maxIntensity = settings.store.maxVibrationIntensity;

    switch (commandInfo[0]) {
        case "v":
        case "vibrate": {
            if (commandInfo.length < 2 || commandInfo.length > 4) {
                return sendMessage(message.channel_id, {
                    content: `Incorrect arguments provided. \n**Correct usages**\nAll devices: ${prefix}vibrate 20\nSpecific device: ${prefix}vibrate 1 20\nWith duration: ${prefix}vibrate 20 2000\nWith duration and device: ${prefix}vibrate 1 20 2000`
                });
            }

            const normalizeStrength = (strength: number) => Math.min(Math.max(strength, 0), 100) * (maxIntensity / 100) / 100;

            if (commandInfo.length === 3 && !isNaN(Number(commandInfo[2]))) {
                const vibrationStrength = normalizeStrength(Number(commandInfo[1]));
                const durationTime = Number(commandInfo[2]);
                if (isNaN(durationTime) || durationTime < 0) return sendMessage(message.channel_id, { content: "Invalid duration time" });

                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }

                return addToVibrateQueue({ strength: vibrationStrength, duration: durationTime });
            }

            if (commandInfo.length === 4) {
                const deviceId = Number(commandInfo[1]);
                if (isNaN(deviceId) || deviceId > client!.devices.size || deviceId < 1) return sendMessage(message.channel_id, { content: "Invalid device ID provided" });

                const vibrationStrength = normalizeStrength(Number(commandInfo[2]));
                const durationTime = Number(commandInfo[3]);
                if (isNaN(durationTime) || durationTime < 0) return sendMessage(message.channel_id, { content: "Invalid duration time" });

                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }

                return addToVibrateQueue({ strength: vibrationStrength, duration: durationTime, deviceId: deviceId - 1 });
            }

            if (commandInfo.length === 3) {
                const deviceId = Number(commandInfo[1]);
                if (isNaN(deviceId) || deviceId > client!.devices.size || deviceId < 1) return sendMessage(message.channel_id, { content: "Invalid device ID provided" });

                const vibrationStrength = normalizeStrength(Number(commandInfo[2]));

                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                    return;
                }

                setRpc({
                    appName: richPresenceTitle,
                    details: `Connected to ${client?.devices.size} ${client?.devices.size === 1 ? "device" : "devices"}`,
                    state: `Vibrating device ${deviceId} with a strength of ${vibrationStrength * 100}%`,
                    type: ActivityType.PLAYING,
                    imageBig: "1225879839622299748",
                    imageSmall: "1225888933729145003",
                });

                return Array.from(client!.devices.values())[deviceId - 1].runOutput(DeviceOutput.Vibrate.percent(vibrationStrength));
            }

            const vibrationStrength = normalizeStrength(Number(commandInfo[1]));

            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client?.devices.size} ${client?.devices.size === 1 ? "device" : "devices"}`,
                state: `Vibrating all devices with a strength of ${vibrationStrength * 100}%`,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
                imageSmall: "1225888933729145003",
            });
            return Array.from(client!.devices.values()).forEach(device => {
                device.runOutput(DeviceOutput.Vibrate.percent(vibrationStrength));
            });
        }
        case "durationVibration":
        case "vibrationDuration":
        case "vd":
            return sendMessage(message.channel_id, {
                content: `This command is deprecated. Please use \`${prefix}vibrate <deviceId?> <amount> <timeInMilliseconds>\` instead.`
            });
        case "o":
        case "oscillate": {
            if (commandInfo.length < 2 || commandInfo.length > 3) {
                return sendMessage(message.channel_id, {
                    content: `Incorrect arguments provided. \n**Correct usages**\nAll devices: ${prefix}oscillate 50\nSpecific device: ${prefix}oscillate 1 50\nArguments: oscillate <deviceId?> <speed>`
                });
            }

            const speed = Number(commandInfo[commandInfo.length - 1]);
            if (isNaN(speed) || speed < 0) {
                return sendMessage(message.channel_id, { content: "Invalid oscillation speed" });
            }

            const devices = commandInfo.length === 3 ? [Array.from(client!.devices.values())[Number(commandInfo[1]) - 1]] : Array.from(client!.devices.values());
            if (commandInfo.length === 3) {
                const deviceId = Number(commandInfo[1]);
                if (isNaN(deviceId) || deviceId > client!.devices.size || deviceId < 1) {
                    return sendMessage(message.channel_id, { content: "Invalid device ID provided" });
                }
            }

            const state = commandInfo.length === 3 ? `Oscillating device ${commandInfo[1]} with a speed of ${speed}` : `Oscillating all devices with a speed of ${speed}`;
            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client?.devices.size} ${client?.devices.size === 1 ? "device" : "devices"}`,
                state,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
                imageSmall: "1225888933729145003",
            });

            return oscillateDevices(devices, speed);
        }
        case "d": case "devices": {
            const deviceInfo: string[] = [];
            for (let i = 0; i < client!.devices.size; i++) {
                const device = Array.from(client!.devices.values())[i];

                // Battery Information
                const batteryInfo = device.hasInput(InputType.Battery)
                    ? `${await device.battery() * 100}%`
                    : "No battery";

                // Feature Detection (Enhancement)
                const features: string[] = [];
                if (device.hasOutput(OutputType.Vibrate)) features.push("Vibration");
                if (device.hasOutput(OutputType.Oscillate)) features.push("Oscillation");
                if (device.hasOutput(OutputType.Position)) features.push("Linear Actuation");
                if (device.hasOutput(OutputType.Rotate)) features.push("Rotation");

                deviceInfo.push(`**Name:** ${device.name}, **ID:** ${i + 1}, **Battery:** ${batteryInfo}, **Features:** ${features.join(", ")}`);
            }
            return sendMessage(message.channel_id, { content: `**Connected devices:** \n${deviceInfo.join("\n")}` });
        }

        case "r":
        case "rotate": {
            if (commandInfo.length < 2 || commandInfo.length > 3) {
                return sendMessage(message.channel_id, {
                    content: `Incorrect arguments provided. \n**Correct usages**\nAll devices: ${prefix}rotate 50\nSpecific device: ${prefix}rotate 1 50\nArguments: rotate <deviceId?> <speed>`
                });
            }

            const speed = Number(commandInfo[commandInfo.length - 1]);
            if (isNaN(speed) || speed < 0 || speed > 100) {
                return sendMessage(message.channel_id, { content: "Invalid rotation speed. Please provide a number between 0 and 100." });
            }

            const devices = commandInfo.length === 3 ? [Array.from(client!.devices.values())[Number(commandInfo[1]) - 1]] : Array.from(client!.devices.values());
            if (commandInfo.length === 3) {
                const deviceId = Number(commandInfo[1]);
                if (isNaN(deviceId) || deviceId > client!.devices.size || deviceId < 1) {
                    return sendMessage(message.channel_id, { content: "Invalid device ID provided" });
                }
            }

            const state = commandInfo.length === 3 ? `Rotating device ${commandInfo[1]} with a speed of ${speed}` : `Rotating all devices with a speed of ${speed}`;
            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client?.devices.size} ${client?.devices.size === 1 ? "device" : "devices"}`,
                state,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
                imageSmall: "1225888933729145003",
            });

            return rotateDevices(devices, speed);
        }

        case "a":
        case "all": {
            if (commandInfo.length < 2 || commandInfo.length > 3) {
                return sendMessage(message.channel_id, {
                    content: `Incorrect arguments provided. \n**Correct usages**\nAll devices: ${prefix}all 50\nSpecific device: ${prefix}all 1 50\nArguments: all <deviceId?> <intensity>`
                });
            }

            const intensity = Number(commandInfo[commandInfo.length - 1]);
            if (isNaN(intensity) || intensity < 0 || intensity > 100) {
                return sendMessage(message.channel_id, { content: "Invalid intensity. Please provide a number between 0 and 100." });
            }

            const devices = commandInfo.length === 3 ? [Array.from(client!.devices.values())[Number(commandInfo[1]) - 1]] : Array.from(client!.devices.values());
            if (commandInfo.length === 3) {
                const deviceId = Number(commandInfo[1]);
                if (isNaN(deviceId) || deviceId > client!.devices.size || deviceId < 1) {
                    return sendMessage(message.channel_id, { content: "Invalid device ID provided" });
                }
            }

            const deviceDesc = commandInfo.length === 3 ? `device ${commandInfo[1]}` : "all devices";
            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client?.devices.size} ${client?.devices.size === 1 ? "device" : "devices"}`,
                state: `Activating all features on ${deviceDesc} with intensity ${intensity}`,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
                imageSmall: "1225888933729145003",
            });

            return activateAllFeatures(devices, intensity);
        }

        case "pattern":
        case "p": {
            if (commandInfo.length < 3) {
                return sendMessage(message.channel_id, {
                    content: `Incorrect arguments provided. \n**Correct usage**\n${prefix}pattern <vibrationStrength> <intervalDuration>\nArguments: pattern <vibrationStrength> <intervalDuration>`
                });
            }

            const vibrationStrength = Math.max(0, Math.min(Number(commandInfo[1]), maxIntensity));
            const intervalDuration = Math.max(0, Number(commandInfo[2]));

            // Initial stop
            addToVibrateQueue({ strength: 0, duration: 0 });

            intervalId = setInterval(() => {
                if (client && client.devices) {
                    Array.from(client.devices.values()).forEach(device => {
                        device.runOutput(DeviceOutput.Vibrate.percent(vibrationStrength / 100));
                    });
                }

                setTimeout(() => {
                    if (client && client.devices) {
                        Array.from(client.devices.values()).forEach(device => {
                            device.runOutput(DeviceOutput.Vibrate.percent(0));
                        });
                    }
                }, intervalDuration);
            }, intervalDuration * 2);

            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client?.devices.size} ${client?.devices.size === 1 ? "device" : "devices"}`,
                state: `Vibrating with a strength of ${vibrationStrength}% and an interval of ${intervalDuration}ms`,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
                imageSmall: "1225888933729145003",
            });

            return intervalId;
        }
        case "stop":
        case "s": {
            sendMessage(message.channel_id, { content: "**Stopping all devices**" });

            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }

            // Clear the vibrate queue
            vibrateQueue = [];

            // Immediately stop all devices
            if (client && client.devices) {
                Array.from(client.devices.values()).forEach(device => {
                    device.stop().catch(error => {
                        console.error(`Error stopping device ${device.name}:`, error);
                    });
                });
            }

            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client?.devices.size} ${client?.devices.size === 1 ? "device" : "devices"}`,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
            });

            return;
        }
    }
}

async function handleDisconnection() {
    try {
        debugLog("Starting disconnection process", undefined, "info");
        vibrateQueue = [];
        if (client && client.connected) await client.disconnect();
        client = null;
        if (batteryIntervalId) clearInterval(batteryIntervalId);

        setRpc({
            appName: richPresenceTitle,
            details: "Intiface not connected",
            type: ActivityType.PLAYING,
            imageBig: "1225879839622299748",
            buttonOneText: "test",
            buttonOneURL: "https://google.com",
        });
        showNotification({
            title: "Disconnected from intiface",
            body: "You are now disconnected from intiface",
            permanent: false,
            noPersist: false,
        });
        debugLog("Disconnection completed successfully", undefined, "info");
    } catch (error) {
        debugLog("Error during disconnection", error, "error");
        console.error(error);
    }
}

export function editMessage(message: PartialDeep<Message>, content: string): Message {
    message.content = content;
    FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", message });
    return message as Message;
}

async function handleConnection() {
    try {
        debugLog("Starting connection process", undefined, "info");

        if (!settings.store.websocketUrl) {
            debugLog("No WebSocket URL configured", undefined, "warn");
            setRpc({
                appName: richPresenceTitle,
                details: "Intiface not connected",
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
            });
            return showNotification({
                title: "No URL provided for intiface",
                body: "Please provide a URL in the settings, connecting to intiface disabled",
                permanent: false,
                noPersist: false,
            });
        }

        debugLog(`Connecting to WebSocket URL: ${settings.store.websocketUrl}`, undefined, "info");

        connector = new ButtplugBrowserWebsocketClientConnector(settings.store.websocketUrl);
        if (!client)
            client = new ButtplugClient("Vencord (via VenPlugPlus)");

        client.addListener("deviceadded", async (device: ButtplugClientDevice) => {
            debugLog(`Device added: ${device.name}`, {
                hasBattery: device.hasInput(InputType.Battery),
                vibrateAttributes: device.hasOutput(OutputType.Vibrate) ? 1 : 0,
                oscillateAttributes: device.hasOutput(OutputType.Oscillate) ? 1 : 0,
                rotateAttributes: device.hasOutput(OutputType.Rotate) ? 1 : 0,
                linearAttributes: device.hasOutput(OutputType.Position) ? 1 : 0
            }, "info");

            device.warnedLowBattery = false;

            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client?.devices.size} ${client?.devices.size === 1 ? "device" : "devices"}`,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
            });

            showNotification({
                title: `Device added (Total devices: ${client?.devices.size})`,
                body: `A device named "${device.name}" was added${device.hasInput(InputType.Battery) ? ` and has a battery level of ${await device.battery() * 100}%` : ". No battery detected."} `,
                permanent: false,
                noPersist: false,
            });

            if (!device.hasOutput(OutputType.Vibrate))
                return;

            // brief test vibration for newly connected devices
            try {
                debugLog(`Testing device vibration: ${device.name}`, undefined, "verbose");
                await device.runOutput(DeviceOutput.Vibrate.percent(0.1));
                await new Promise(r => setTimeout(r, 500));
                await device.stop();
                debugLog(`Device test completed: ${device.name}`, undefined, "verbose");
            } catch (error) {
                debugLog(`Device test failed: ${device.name}`, error, "warn");
                console.log(error);
                if (error instanceof ButtplugDeviceError) {
                    console.log("got a device error!");
                }
            }
        });

        client.addListener("deviceremoved", (device: ButtplugClientDevice) => {
            debugLog(`Device removed: ${device.name}`, undefined, "info");

            setRpc({
                appName: richPresenceTitle,
                details: client?.devices.size === 0 ? "Intiface connected, no devices connected" : `Connected to ${client?.devices.size} ${client?.devices.size === 1 ? "device" : "devices"}`,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
            });

            showNotification({
                title: "Device removed",
                body: `A device named "${device.name}" was removed`,
                permanent: false,
                noPersist: false,
            });
        });

        await client.connect(connector).then(() => {
            console.log("Buttplug.io connected");
            debugLog("Successfully connected to Buttplug.io", undefined, "info");
        });

        checkDeviceBattery();

        setRpc({
            appName: richPresenceTitle,
            details: client?.devices.size === 0 ? "Intiface connected, no devices connected" : `Connected to ${client?.devices.size} ${client?.devices.size === 1 ? "device" : "devices"}`,
            type: ActivityType.PLAYING,
            imageBig: "1225879839622299748",
        });

        showNotification({
            title: "Connected to intiface",
            body: "You are now connected to intiface",
            permanent: false,
            noPersist: false,
        });
        debugLog("Connection process completed successfully", undefined, "info");
    } catch (error) {
        debugLog("Connection failed", error, "error");
        console.error(error);
        setRpc({
            appName: richPresenceTitle,
            details: "Intiface not connected",
            type: ActivityType.PLAYING,
            imageBig: "1225879839622299748",
        });
        showNotification({
            title: "Failed to connect to intiface",
            body: "Failed to connect to intiface, please check the console for more information",
            permanent: false,
            noPersist: false,
        });
    }
}

// monitor device battery levels and warn when low
async function checkDeviceBattery() {
    if (!client) return;
    batteryIntervalId = setInterval(async () => {
        Array.from(client!.devices.values()).forEach(async (device: ButtplugClientDevice) => {
            if (device.hasInput(InputType.Battery) && !device.warnedLowBattery) {
                const battery = await device.battery();
                if (battery < 0.1) {
                    device.warnedLowBattery = true;
                    showNotification({
                        title: "Device battery low",
                        body: `The battery of device "${device.name}" is low (${battery * 100}%)`,
                        permanent: false,
                        noPersist: false,
                    });
                }
            }
        });
    }, 60000);
}

// queue system to handle sequential vibration events
async function addToVibrateQueue(data: VibrateEvent) {
    if (!client || !client.connected) {
        debugLog("Cannot add to vibrate queue: client not connected", undefined, "warn");
        return;
    }

    vibrateQueue.push(data);
    debugLog("Added to vibrate queue", {
        queueLength: vibrateQueue.length,
        strength: data.strength,
        duration: data.duration,
        deviceId: data.deviceId
    }, "verbose");
    if (vibrateQueue.length === 1) {
        processVibrateQueue();
    }
    console.log("VibrateQueue" + JSON.stringify(vibrateQueue));
}

async function processVibrateQueue() {
    if (vibrateQueue.length === 0) {
        debugLog("Vibrate queue is empty", undefined, "verbose");
        return;
    }

    const data = vibrateQueue[0];
    debugLog("Processing vibrate queue item", data, "verbose");

    try {
        await handleVibrate(data);
    } catch (error) {
        debugLog("Error in handleVibrate", error, "error");
        console.error("Error in handleVibrate:", error);
    } finally {
        vibrateQueue.shift();
        debugLog(`Vibrate queue item processed, remaining: ${vibrateQueue.length}`, undefined, "verbose");

        processVibrateQueue();
    }
}

async function oscillateDevices(devices: ButtplugClientDevice[], speed: number) {
    const normalizedSpeed = Math.min(speed / 100, 1);
    for (const device of devices) {
        if (device.hasOutput(OutputType.Oscillate)) {
            try {
                await device.runOutput(DeviceOutput.Oscillate.percent(normalizedSpeed));
            } catch (error: any) {
                if (error.message && (error.message.includes("Outside valid range") || error.message.includes("Feature not implemented"))) {
                    debugLog(`Oscillation speed ${speed} is outside the supported range or feature is not implemented for device ${device.name}`, undefined, "warn");
                } else if (error.message && error.message.includes("not connected")) {
                    debugLog(`Device ${device.name} not connected for oscillation`, undefined, "warn");
                } else {
                    debugLog(`Error oscillating device ${device.name}`, error, "warn");
                }
            }
        } else {
            debugLog(`Device ${device.name} does not support oscillation`, undefined, "verbose");
        }
    }
}

async function rotateDevices(devices: ButtplugClientDevice[], speed: number) {
    const normalizedSpeed = speed / 100;
    for (const device of devices) {
        if (device.hasOutput(OutputType.Rotate)) {
            try {
                await device.runOutput(DeviceOutput.Rotate.percent(normalizedSpeed));
            } catch (error: any) {
                if (error.message && error.message.includes("not connected")) {
                    debugLog(`Device ${device.name} not connected for rotation`, undefined, "warn");
                } else {
                    debugLog(`Error rotating device ${device.name}`, error, "warn");
                }
            }
        } else {
            debugLog(`Device ${device.name} does not support rotation`, undefined, "verbose");
        }
    }
}

async function activateAllFeatures(devices: ButtplugClientDevice[], intensity: number) {
    const normalizedIntensity = intensity / 100;
    for (const device of devices) {
        try {
            if (device.hasOutput(OutputType.Vibrate)) {
                try {
                    await device.runOutput(DeviceOutput.Vibrate.percent(normalizedIntensity));
                } catch (error: any) {
                    if (error.message && error.message.includes("not connected")) {
                        debugLog(`Device ${device.name} not connected for vibration`, undefined, "warn");
                    } else {
                        debugLog(`Error vibrating device ${device.name}`, error, "warn");
                    }
                }
            }
            if (device.hasOutput(OutputType.Rotate)) {
                try {
                    await device.runOutput(DeviceOutput.Rotate.percent(normalizedIntensity));
                } catch (error: any) {
                    if (error.message && error.message.includes("not connected")) {
                        debugLog(`Device ${device.name} not connected for rotation`, undefined, "warn");
                    } else {
                        debugLog(`Error rotating device ${device.name}`, error, "warn");
                    }
                }
            }
            if (device.hasOutput(OutputType.Oscillate)) {
                try {
                    await device.runOutput(DeviceOutput.Oscillate.percent(normalizedIntensity));
                } catch (error: any) {
                    if (error.message && error.message.includes("not connected")) {
                        debugLog(`Device ${device.name} not connected for oscillation`, undefined, "warn");
                    } else {
                        debugLog(`Error oscillating device ${device.name}`, error, "warn");
                    }
                }
            }
        } catch (error) {
            debugLog(`Error activating features for device ${device.name}`, error, "warn");
        }
    }
}

// execute vibration with optional ramping for smooth intensity transitions
async function handleVibrate(data: VibrateEvent) {
    if (!client || !client.devices || !client.connected) {
        debugLog("No client or devices available for vibration", undefined, "warn");
        return;
    }

    const devices = data.deviceId !== undefined ? [Array.from(client.devices.values())[data.deviceId]] : Array.from(client.devices.values());
    debugLog("Vibrating devices", {
        deviceCount: devices.length,
        targetDeviceId: data.deviceId,
        strength: data.strength,
        duration: data.duration,
        rampEnabled: settings.store.rampUpAndDown
    }, "info");

    let oscillationSpeed = 50;
    if (typeof data.oscillationSpeed === "number") {
        oscillationSpeed = data.oscillationSpeed;
    } else if (Array.isArray(data.oscillationSpeed)) {
        oscillationSpeed = data.oscillationSpeed[0] || oscillationSpeed;
    }

    try {
        if (!settings.store.rampUpAndDown) {
            debugLog("Direct vibration (no ramping)", undefined, "verbose");
            await vibrateDevices(devices, data.strength);
            await oscillateDevices(devices, oscillationSpeed);
            await sleep(data.duration);
            await stopDevices(devices);
        } else {
            debugLog("Ramped vibration starting", undefined, "verbose");
            const steps = settings.store.rampUpAndDownSteps;
            const rampLength = data.duration * 0.2 / steps;
            let startIntensity = 0;
            let endIntensity = data.strength;
            let stepIntensity = (endIntensity - startIntensity) / steps;

            debugLog(`Ramping up with ${steps} steps`, undefined, "verbose");
            for (let i = 0; i <= steps; i++) {
                await vibrateDevices(devices, startIntensity + (stepIntensity * i));
                await oscillateDevices(devices, oscillationSpeed);
                await sleep(rampLength);
            }

            debugLog("Sustaining vibration", undefined, "verbose");
            await sleep(data.duration * 0.54);

            debugLog("Ramping down", undefined, "verbose");
            startIntensity = data.strength;
            endIntensity = 0;

            stepIntensity = (endIntensity - startIntensity) / steps;

            for (let i = 0; i <= steps; i++) {
                await vibrateDevices(devices, startIntensity + (stepIntensity * i));
                await sleep(rampLength);
            }
            await stopDevices(devices);
            debugLog("Ramped vibration completed", undefined, "verbose");
        }
    } catch (error) {
        debugLog("Error during vibration execution", error, "error");
        try {
            await stopDevices(devices);
        } catch (stopError) {
            debugLog("Error stopping devices after vibration error", stopError, "error");
        }
    }
}

async function stopDevices(devices: ButtplugClientDevice[]) {
    for (const device of devices) {
        try {
            await device.stop();
        } catch (error) {
            debugLog(`Error stopping device ${device.name}`, error, "warn");
        }
    }
}

async function vibrateDevices(devices: ButtplugClientDevice[], intensity: number) {
    const clampedIntensity = Math.max(0, Math.min(intensity, 1));
    for (const device of devices) {
        try {
            await device.runOutput(DeviceOutput.Vibrate.percent(clampedIntensity));
        } catch (error) {
            debugLog(`Error vibrating device ${device.name}`, error, "warn");
        }
    }
}

// interface definitions for discord message handling
interface FluxMessageCreate {
    type: "MESSAGE_CREATE";
    channelId: string;
    guildId?: string;
    isPushNotification: boolean;
    message: DiscordMessage;
    optimistic: boolean;
}

interface DiscordMessage {
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

interface DiscordUser {
    avatar: string;
    username: string;
    id: string;
    bot: boolean;
}

// extend buttplug device interface to track battery warning state
declare module "buttplug" {
    interface ButtplugClientDevice {
        warnedLowBattery: boolean;
    }
}

type VibrateEvent = {
    duration: number,
    strength: number,
    deviceId?: number;
    oscillationSpeed?: number | number[];
};

interface ActivityAssets {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
}

interface Activity {
    state?: string;
    details?: string;
    timestamps?: {
        start?: number;
        end?: number;
    };
    assets?: ActivityAssets;
    buttons?: Array<string>;
    name: string;
    application_id: string;
    metadata?: {
        button_urls?: Array<string>;
    };
    type: ActivityType;
    url?: string;
    flags: number;
}

const enum ActivityType {
    PLAYING = 0,
    STREAMING = 1,
    LISTENING = 2,
    WATCHING = 3,
    COMPETING = 5
}

// create discord rich presence activity from plugin data
async function createActivity(data) {
    const { appName, details, state, type, imageBig, imageBigTooltip, imageSmall, imageSmallTooltip, buttonOneText, buttonOneURL } = data;
    if (!appName) return;

    const activity: Activity = {
        application_id: "1212529029991628802",
        name: appName,
        state,
        details,
        type,
        flags: 1 << 0,
    };

    if (imageBig) {
        activity.assets = {
            large_image: imageBig,
            large_text: imageBigTooltip || undefined,
        };
    }

    if (imageSmall) {
        activity.assets = {
            ...activity.assets,
            small_image: imageSmall,
            small_text: imageSmallTooltip || undefined,
        };
    }

    if (buttonOneText) {
        activity.buttons = [buttonOneText];
        activity.metadata = {
            button_urls: [buttonOneURL],
        };
    }

    for (const k in activity) {
        if (k === "type") continue;
        const v = activity[k];
        if (!v || (typeof v === "string" && v.length === 0) || (Array.isArray(v) && v.length === 0)) delete activity[k];
    }

    return activity;
}

async function setRpc(data) {
    const richPresenceEnabled = settings.store.richPresence;
    if (richPresenceEnabled) {
        const activity = await createActivity(data);
        FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity, socketId: "CustomRPC" });

        if (activity && activity.details === "Intiface not connected") {
            rpcDisconnectedTime = new Date();
        } else {
            rpcDisconnectedTime = null;
        }
    }
}

function checkRpcDisconnectedTime() {
    if (rpcDisconnectedTime) {
        const currentTime = new Date();
        const timeDiff = currentTime.getTime() - rpcDisconnectedTime.getTime();
        const timeout = settings.store.rpcDisconnectTimeout * 60 * 1000;

        if (timeDiff >= timeout) {
            setRpc({
                appName: "",
                details: "",
                type: ActivityType.PLAYING,
                imageBig: "",
            });
        }
    }
}

setInterval(checkRpcDisconnectedTime, 60000);
