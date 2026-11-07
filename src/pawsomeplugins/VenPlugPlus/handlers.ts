/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getCurrentChannel, getCurrentGuild, sendMessage } from "@utils/discord";
import { UserStore } from "@webpack/common";
import { DeviceOutput, InputType, OutputType } from "buttplug";

import { activateAllFeatures, oscillateDevices, rotateDevices, stopDevices } from "./actuation";
import { getClient, getLiveDevicesSnapshot, pruneUnavailableDevice } from "./client";
import { parseDeviceToken, parseMotionArgs, parsePatternArgs } from "./parser";
import { addToVibrateQueue, clearPatternInterval, clearVibrateQueue, setPatternInterval } from "./queue";
import { setRpc } from "./rpc";
import { cachedSettings, settings } from "./settings";
import { ActivityType, DiscordMessage } from "./types";
import { debugLog, formatBatteryLevel, getMessageLink } from "./utils";

const recentlyHandledMessages: string[] = [];

export function getRecentlyHandledMessages(): string[] {
    return recentlyHandledMessages;
}

export async function handleMessage(message: DiscordMessage): Promise<void> {
    if (message.state && message.state === "SENDING") return;
    if (recentlyHandledMessages.includes(message.id)) {
        debugLog(`Message ${message.id} already handled, skipping`, undefined, "verbose");
        return;
    }

    recentlyHandledMessages.push(message.id);
    if (recentlyHandledMessages.length > 99) {
        recentlyHandledMessages.shift();
    }

    debugLog(`Processing message from ${message.author.username}: "${message.content}"`, undefined, "verbose");

    const currentUser = UserStore.getCurrentUser();
    let intensity = 0;
    let length = 0;
    let triggered = false;
    let isTargeted = false;

    const { listedUsers } = cachedSettings;
    const { listedChannels } = cachedSettings;
    const { listedGuilds } = cachedSettings;

    const directControlEnabled = settings.store.allowDirectUserControl;
    const { directControlUsers } = cachedSettings;
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

    const isMentioned = message.mentions?.some(mention => mention.id === currentUser.id)
        || content.includes(currentUser.username.toLowerCase())
        || message.referenced_message?.author.id === currentUser.id
        || !message.guild_id
        || cachedSettings.targetWords.some(targetWord => content.includes(targetWord));

    if (isMentioned) {
        isTargeted = true;
        debugLog("Message is targeted", {
            mentioned: message.mentions?.some(mention => mention.id === currentUser.id),
            usernameInContent: content.includes(currentUser.username.toLowerCase()),
            replyToUser: message.referenced_message?.author.id === currentUser.id,
            isDM: !message.guild_id,
            hasTargetWords: cachedSettings.targetWords.some(targetWord => content.includes(targetWord))
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

    if (cachedSettings.triggerWords.length === 0) {
        debugLog("No trigger words configured", undefined, "verbose");
        return;
    }

    debugLog("Checking trigger words", { triggerWords: cachedSettings.triggerWords, addOnWords: cachedSettings.addOnWords }, "verbose");

    const triggerIntensity = cachedSettings.triggerWords.reduce((acc, triggerWord) => {
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

        const addOnIntensity = cachedSettings.addOnWords.reduce((acc, addOnWord) => {
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

        if (settings.store.rampUpAndDown) {
            length += 1250;
        }

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

export async function handleDirectControl(message: DiscordMessage, content: string, prefix: string, allowedUsers: string[]): Promise<void> {
    if (message.author.id !== UserStore.getCurrentUser().id && !allowedUsers.includes(message.author.id)) return;

    debugLog(`Direct control command detected: ${content}`, undefined, "info");
    const command = content.replace(prefix, "");
    const commandInfo = command.split(" ");

    switch (commandInfo[0]) {
        case "h":
        case "help": {
            return sendMessage(message.channel_id, {
                content: `**VenPlugPlus Commands** (\`${prefix}\`)
Targets: \`#1\` or \`d1\` for a specific device. Units: \`%\` for intensity, \`s\` or \`ms\` for duration.

**Motion**
• \`${prefix}vibrate [#dev] <intensity%> [duration]\` — Vibrate (e.g. \`${prefix}v 50%\`, \`${prefix}v 80% 2s\`, \`${prefix}v #1 100% 5s\`)
• \`${prefix}oscillate [#dev] <speed%> [duration]\` — Oscillate (e.g. \`${prefix}o 50%\`, \`${prefix}o #1 75% 3s\`)
• \`${prefix}rotate [#dev] <speed%> [duration]\` — Rotate (e.g. \`${prefix}r 60%\`, \`${prefix}r #1 40% 2s\`)
• \`${prefix}all [#dev] <intensity%> [duration]\` — Run all features at once (e.g. \`${prefix}a 50% 3s\`)
• \`${prefix}stop [#dev]\` — Stop all movement or a specific device (e.g. \`${prefix}stop\`, \`${prefix}s #1\`)

**Patterns**
• \`${prefix}pattern [#dev] <intensity%> <interval>\` — Pulse pattern (e.g. \`${prefix}pattern 30% 1s\`, \`${prefix}p #1 50% 500ms\`)

**Info**
• \`${prefix}devices\` — List connected devices, battery, and features
• \`${prefix}list [ping]\` — List allowed users
• \`${prefix}words\` — Show trigger and target words
• \`${prefix}help\` — Show this message`
            });
        }

        case "l":
        case "list": {
            if (allowedUsers.length === 0) {
                return sendMessage(message.channel_id, {
                    content: "There are no allowed users configured."
                });
            }

            const ping = commandInfo[1] === "ping";
            let userList = "**Allowed users:**\n";

            if (ping) {
                userList += allowedUsers.map(id => `- (${id}) - <@${id}>`).join("\n");
            } else {
                userList += allowedUsers.map(id => `- (${id})`).join("\n");
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

    const client = getClient();
    if (!client || !client.connected) {
        return sendMessage(message.channel_id, {
            content: "My client isn't connected right now"
        });
    }

    await handleDirectControlCommand(commandInfo, message, prefix);
}

export async function handleDirectControlCommand(commandInfo: string[], message: DiscordMessage, prefix: string): Promise<void> {
    const maxIntensity = settings.store.maxVibrationIntensity;
    const client = getClient();
    if (!client || !client.connected) return;

    const { richPresenceTitle } = settings.store;
    const args = commandInfo.slice(1);

    switch (commandInfo[0]) {
        case "v":
        case "vibrate": {
            const parsed = parseMotionArgs(args, client.devices.size, maxIntensity);
            if (parsed.error) {
                return sendMessage(message.channel_id, {
                    content: `${parsed.error}\nUsage: \`${prefix}vibrate [#dev] <intensity%> [duration]\` (e.g. \`${prefix}v 50%\`, \`${prefix}v 80% 2s\`, \`${prefix}v #1 100% 5s\`)`
                });
            }

            clearPatternInterval();

            if (parsed.duration) {
                return addToVibrateQueue({
                    strength: parsed.normalizedValue,
                    duration: parsed.duration,
                    deviceId: parsed.deviceId
                });
            }

            const targetDevices = parsed.deviceId !== undefined
                ? [Array.from(client.devices.values())[parsed.deviceId]].filter(Boolean)
                : Array.from(client.devices.values());

            const devDesc = parsed.deviceId !== undefined ? `device #${parsed.deviceId + 1}` : "all devices";
            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client.devices.size} ${client.devices.size === 1 ? "device" : "devices"}`,
                state: `Vibrating ${devDesc} with a strength of ${Math.round(parsed.normalizedValue * 100)}%`,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
                imageSmall: "1225888933729145003",
            });

            for (const device of targetDevices) {
                await device.runOutput(DeviceOutput.Vibrate.percent(parsed.normalizedValue));
            }
            return;
        }

        case "durationVibration":
        case "vibrationDuration":
        case "vd":
            return sendMessage(message.channel_id, {
                content: `This command is deprecated. Use \`${prefix}vibrate [intensity%] [duration]\` instead (e.g. \`${prefix}v 50% 2s\`).`
            });

        case "o":
        case "oscillate": {
            const parsed = parseMotionArgs(args, client.devices.size, maxIntensity);
            if (parsed.error) {
                return sendMessage(message.channel_id, {
                    content: `${parsed.error}\nUsage: \`${prefix}oscillate [#dev] <speed%> [duration]\` (e.g. \`${prefix}o 50%\`, \`${prefix}o #1 75% 3s\`)`
                });
            }

            const devices = parsed.deviceId !== undefined
                ? [Array.from(client.devices.values())[parsed.deviceId]].filter(Boolean)
                : Array.from(client.devices.values());

            const devDesc = parsed.deviceId !== undefined ? `device #${parsed.deviceId + 1}` : "all devices";
            const state = `Oscillating ${devDesc} at speed ${parsed.rawPercent}%${parsed.duration ? ` for ${parsed.duration / 1000}s` : ""}`;

            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client.devices.size} ${client.devices.size === 1 ? "device" : "devices"}`,
                state,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
                imageSmall: "1225888933729145003",
            });

            await oscillateDevices(devices, parsed.rawPercent);

            if (parsed.duration) {
                setTimeout(async () => {
                    await stopDevices(devices);
                }, parsed.duration);
            }
            return;
        }

        case "d":
        case "devices": {
            const devices = await getLiveDevicesSnapshot();
            if (devices.length === 0) {
                return sendMessage(message.channel_id, { content: "No devices connected" });
            }

            const deviceInfo: string[] = [];
            for (let i = 0; i < devices.length; i++) {
                const device = devices[i];

                let batteryInfo = "No battery";
                if (device.hasInput(InputType.Battery)) {
                    try {
                        batteryInfo = formatBatteryLevel(await device.battery());
                    } catch (error) {
                        if (pruneUnavailableDevice(device, error)) continue;
                        batteryInfo = "Unknown";
                    }
                }

                const features: string[] = [];
                if (device.hasOutput(OutputType.Vibrate)) features.push("Vibration");
                if (device.hasOutput(OutputType.Oscillate)) features.push("Oscillation");
                if (device.hasOutput(OutputType.Position)) features.push("Linear Actuation");
                if (device.hasOutput(OutputType.Rotate)) features.push("Rotation");

                deviceInfo.push(`**Name:** ${device.name}, **ID:** ${i + 1}, **Battery:** ${batteryInfo}, **Features:** ${features.join(", ")}`);
            }

            if (deviceInfo.length === 0) {
                return sendMessage(message.channel_id, { content: "No devices connected" });
            }

            return sendMessage(message.channel_id, { content: `**Connected devices:** \n${deviceInfo.join("\n")}` });
        }

        case "r":
        case "rotate": {
            const parsed = parseMotionArgs(args, client.devices.size, maxIntensity);
            if (parsed.error) {
                return sendMessage(message.channel_id, {
                    content: `${parsed.error}\nUsage: \`${prefix}rotate [#dev] <speed%> [duration]\` (e.g. \`${prefix}r 50%\`, \`${prefix}r #1 60% 2s\`)`
                });
            }

            const devices = parsed.deviceId !== undefined
                ? [Array.from(client.devices.values())[parsed.deviceId]].filter(Boolean)
                : Array.from(client.devices.values());

            const devDesc = parsed.deviceId !== undefined ? `device #${parsed.deviceId + 1}` : "all devices";
            const state = `Rotating ${devDesc} at speed ${parsed.rawPercent}%${parsed.duration ? ` for ${parsed.duration / 1000}s` : ""}`;

            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client.devices.size} ${client.devices.size === 1 ? "device" : "devices"}`,
                state,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
                imageSmall: "1225888933729145003",
            });

            await rotateDevices(devices, parsed.rawPercent);

            if (parsed.duration) {
                setTimeout(async () => {
                    await stopDevices(devices);
                }, parsed.duration);
            }
            return;
        }

        case "a":
        case "all": {
            const parsed = parseMotionArgs(args, client.devices.size, maxIntensity);
            if (parsed.error) {
                return sendMessage(message.channel_id, {
                    content: `${parsed.error}\nUsage: \`${prefix}all [#dev] <intensity%> [duration]\` (e.g. \`${prefix}a 50%\`, \`${prefix}a #1 70% 3s\`)`
                });
            }

            const devices = parsed.deviceId !== undefined
                ? [Array.from(client.devices.values())[parsed.deviceId]].filter(Boolean)
                : Array.from(client.devices.values());

            const devDesc = parsed.deviceId !== undefined ? `device #${parsed.deviceId + 1}` : "all devices";
            const state = `Running all features on ${devDesc} at ${parsed.rawPercent}%${parsed.duration ? ` for ${parsed.duration / 1000}s` : ""}`;

            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client.devices.size} ${client.devices.size === 1 ? "device" : "devices"}`,
                state,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
                imageSmall: "1225888933729145003",
            });

            await activateAllFeatures(devices, parsed.rawPercent);

            if (parsed.duration) {
                setTimeout(async () => {
                    await stopDevices(devices);
                }, parsed.duration);
            }
            return;
        }

        case "pattern":
        case "p": {
            const parsed = parsePatternArgs(args, client.devices.size, maxIntensity);
            if (parsed.error) {
                return sendMessage(message.channel_id, {
                    content: `${parsed.error}\nUsage: \`${prefix}pattern [#dev] <intensity%> <interval>\` (e.g. \`${prefix}pattern 30% 1s\` or \`${prefix}p #1 50% 500ms\`)`
                });
            }

            clearPatternInterval();

            // Initial stop
            addToVibrateQueue({ strength: 0, duration: 0 });

            const targetDevices = parsed.deviceId !== undefined
                ? [Array.from(client.devices.values())[parsed.deviceId]].filter(Boolean)
                : null;

            const interval = setInterval(() => {
                const currentClient = getClient();
                if (currentClient && currentClient.devices) {
                    const devs = targetDevices || Array.from(currentClient.devices.values());
                    for (const device of devs) {
                        device.runOutput(DeviceOutput.Vibrate.percent(parsed.rawPercent / 100));
                    }
                }

                setTimeout(() => {
                    const c = getClient();
                    if (c && c.devices) {
                        const devs = targetDevices || Array.from(c.devices.values());
                        for (const device of devs) {
                            device.runOutput(DeviceOutput.Vibrate.percent(0));
                        }
                    }
                }, parsed.intervalDuration);
            }, parsed.intervalDuration * 2);

            setPatternInterval(interval);

            const devDesc = parsed.deviceId !== undefined ? `device #${parsed.deviceId + 1}` : "all devices";
            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client.devices.size} ${client.devices.size === 1 ? "device" : "devices"}`,
                state: `Pattern on ${devDesc}: ${parsed.rawPercent}% every ${parsed.intervalDuration}ms`,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
                imageSmall: "1225888933729145003",
            });
            return;
        }

        case "stop":
        case "s": {
            const targetArg = args[0];
            let targetDeviceIndex: number | null = null;
            if (targetArg) {
                targetDeviceIndex = parseDeviceToken(targetArg, client.devices.size);
                if (targetDeviceIndex === null && !isNaN(Number(targetArg))) {
                    const num = Number(targetArg);
                    if (num >= 1 && num <= client.devices.size) {
                        targetDeviceIndex = num - 1;
                    }
                }
            }

            if (targetDeviceIndex !== null) {
                const targetDev = Array.from(client.devices.values())[targetDeviceIndex];
                if (targetDev) {
                    sendMessage(message.channel_id, { content: `**Stopping device #${targetDeviceIndex + 1} (${targetDev.name})**` });
                    await stopDevices([targetDev]);
                }
            } else {
                sendMessage(message.channel_id, { content: "**Stopping all devices**" });
                clearPatternInterval();
                clearVibrateQueue();
                if (client && client.devices) {
                    await stopDevices(Array.from(client.devices.values()));
                }
            }

            setRpc({
                appName: richPresenceTitle,
                details: `Connected to ${client.devices.size} ${client.devices.size === 1 ? "device" : "devices"}`,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
            });
            return;
        }
    }
}
