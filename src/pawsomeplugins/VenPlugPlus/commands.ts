/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { sendMessage } from "@utils/discord";
import type { Command } from "@vencord/discord-types";
import { UserStore } from "@webpack/common";
import { InputType } from "buttplug";

import { getClient, getLiveDevicesSnapshot, handleConnection, handleDisconnection, pruneUnavailableDevice } from "./client";
import { getRecentlyHandledMessages, handleMessage } from "./handlers";
import { addToVibrateQueue, clearVibrateQueue, getVibrateQueue } from "./queue";
import { getRpcDisconnectedTime } from "./rpc";
import { settings } from "./settings";
import type { DiscordMessage } from "./types";
import { editMessage, formatBatteryLevel } from "./utils";

export function getCommands(): Command[] {
    return [
        {
            name: "connect",
            description: "Connect to the intiface server",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async (_opts, ctx) => {
                const client = getClient();
                if (client && client.connected) {
                    return sendBotMessage(ctx.channel.id, { content: "Already connected to intiface" });
                }
                sendBotMessage(ctx.channel.id, { content: "Connecting to intiface..." });
                await handleConnection();
            }
        },
        {
            name: "disconnect",
            description: "Disconnect from the intiface server",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async (_opts, ctx) => {
                const client = getClient();
                if (client && !client.connected) {
                    return sendBotMessage(ctx.channel.id, { content: "You were already disconnected" });
                }
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
                const client = getClient();
                if (!client || !client.connected) {
                    return sendBotMessage(ctx.channel.id, { content: "You are not connected to intiface" });
                }

                await client.startScanning();
                const message = sendBotMessage(ctx.channel.id, { content: "Started scanning for devices" });
                if (findOption(_opts, "auto-stop", true) === true) {
                    setTimeout(async () => {
                        const currentClient = getClient();
                        await currentClient?.stopScanning();
                        editMessage(message, "Finished scanning for devices");
                    }, 30000);
                }
            }
        },
        {
            name: "stop_scanning",
            description: "Stop scanning for devices on the intiface server",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async (_opts, ctx) => {
                const client = getClient();
                if (!client || !client.connected) {
                    return sendBotMessage(ctx.channel.id, { content: "You are not connected to intiface" });
                }
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

                sendMessage(ctx.channel.id, {
                    content: `**Target words:** ${targetWords?.join(", ") ?? ""}\n\n**Trigger words:** ${triggerWords?.join(", ") ?? ""}\n\n**Add-on words:** ${addOnWords?.join(", ") ?? ""}`
                });
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
                await addToVibrateQueue({ duration, strength: intensity / 100 });
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
                const client = getClient();
                if (!client || !client.connected) {
                    return sendBotMessage(ctx.channel.id, { content: "You are not connected to intiface" });
                }
                const devices = await getLiveDevicesSnapshot();
                if (devices.length === 0) {
                    return sendBotMessage(ctx.channel.id, { content: "No devices connected" });
                }
                const deviceInfo: string[] = [];

                for (const device of devices) {
                    let batteryInfo = "No battery";
                    if (device.hasInput(InputType.Battery)) {
                        try {
                            batteryInfo = formatBatteryLevel(await device.battery());
                        } catch (error) {
                            if (pruneUnavailableDevice(device, error)) continue;
                            batteryInfo = "Unknown";
                        }
                    }
                    deviceInfo.push(`**Name:** ${device.name}, **Battery:** ${batteryInfo}`);
                }

                if (deviceInfo.length === 0) {
                    return sendBotMessage(ctx.channel.id, { content: "No devices connected" });
                }

                findOption(_opts, "send_to_channel")
                    ? sendMessage(ctx.channel.id, { content: `**Connected devices:** \n ${deviceInfo.join("\n")}` })
                    : sendBotMessage(ctx.channel.id, { content: `**Connected devices:** \n ${deviceInfo.join("\n")}` });
            }
        },
        {
            name: "debug_info",
            description: "Show debug information (only available in debug mode)",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async (_opts, ctx) => {
                if (!settings.store.debugMode) {
                    return sendBotMessage(ctx.channel.id, { content: "Debug mode is not enabled" });
                }

                const client = getClient();
                const vibrateQueue = getVibrateQueue();
                const recentlyHandledMessages = getRecentlyHandledMessages();
                const rpcDisconnectedTime = getRpcDisconnectedTime();

                const debugInfo = [
                    `**Client Status:** ${client ? (client.connected ? "Connected" : "Disconnected") : "Not initialized"}`,
                    `**Devices:** ${client?.devices.size || 0}`,
                    `**Vibrate Queue Length:** ${vibrateQueue.length}`,
                    `**Recent Messages Tracked:** ${recentlyHandledMessages.length}`,
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
                if (!settings.store.debugMode) {
                    return sendBotMessage(ctx.channel.id, { content: "Debug mode is not enabled" });
                }

                const queueLength = clearVibrateQueue();
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
                if (!settings.store.debugMode) {
                    return sendBotMessage(ctx.channel.id, { content: "Debug mode is not enabled" });
                }

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
                    mentions: [currentUser],
                };

                sendBotMessage(ctx.channel.id, { content: `Simulating message: "${content}"` });
                await handleMessage(simulatedMessage);
            }
        }
    ];
}
