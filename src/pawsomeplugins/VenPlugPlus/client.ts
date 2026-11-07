/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import {
    ButtplugBrowserWebsocketClientConnector,
    ButtplugClient,
    ButtplugClientDevice,
    ButtplugDeviceError,
    DeviceOutput,
    InputType,
    OutputType
} from "buttplug";

import { setRpc } from "./rpc";
import { settings } from "./settings";
import { ActivityType } from "./types";
import { debugLog, formatBatteryLevel, isBatteryLow, logger, sleep } from "./utils";

let client: ButtplugClient | null = null;
let connector: ButtplugBrowserWebsocketClientConnector | null = null;
let batteryIntervalId: NodeJS.Timeout | null = null;
let onDisconnectionCallback: (() => void) | null = null;

export function setDisconnectionCallback(cb: () => void) {
    onDisconnectionCallback = cb;
}

export function getClient(): ButtplugClient | null {
    return client;
}

export function isClientConnected(): boolean {
    return client?.connected === true;
}

export async function disconnectClientTransport(): Promise<void> {
    if (!client) return;

    try {
        client.removeAllListeners();
        const activeConnector = (client as unknown as { _connector?: { Connected?: boolean; disconnect(): Promise<void>; }; })._connector;

        if (activeConnector?.Connected) {
            await activeConnector.disconnect();
        } else if ((connector as unknown as { Connected?: boolean; disconnect(): Promise<void>; })?.Connected) {
            await (connector as unknown as { disconnect(): Promise<void>; }).disconnect();
        }
    } catch (error) {
        debugLog("Error while disconnecting connector transport", error, "warn");
    }
}

export function isDeviceUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("DeviceNotAvailable") || message.includes("not connected");
}

export function pruneUnavailableDevice(device: ButtplugClientDevice, error: unknown): boolean {
    if (!client || !isDeviceUnavailableError(error)) return false;

    const wasPresent = client.devices.delete(device.index);
    if (wasPresent) {
        debugLog(`Pruned unavailable device from local list: ${device.name} (#${device.index})`, error, "warn");
    }
    return wasPresent;
}

export async function probeDeviceAvailability(device: ButtplugClientDevice): Promise<void> {
    if (device.hasInput(InputType.Battery)) {
        await device.battery();
        return;
    }

    if (device.hasOutput(OutputType.Vibrate)) {
        await device.runOutput(DeviceOutput.Vibrate.percent(0));
        return;
    }

    if (device.hasOutput(OutputType.Rotate)) {
        await device.runOutput(DeviceOutput.Rotate.percent(0));
        return;
    }

    if (device.hasOutput(OutputType.Oscillate)) {
        await device.runOutput(DeviceOutput.Oscillate.percent(0));
        return;
    }
}

export async function getLiveDevicesSnapshot(): Promise<ButtplugClientDevice[]> {
    if (!client) return [];

    const collectLiveDevices = async (): Promise<ButtplugClientDevice[]> => {
        const devices: ButtplugClientDevice[] = [];
        for (const device of client!.devices.values()) {
            try {
                await probeDeviceAvailability(device);
                devices.push(device);
            } catch (error) {
                if (!pruneUnavailableDevice(device, error)) {
                    debugLog(`Device probe failed for ${device.name}`, error, "warn");
                    devices.push(device);
                }
            }
        }
        return devices;
    };

    let liveDevices = await collectLiveDevices();

    // If no devices are currently known, perform a short scan so devices plugged
    // in after plugin startup can be discovered without manual /start_scanning.
    if (liveDevices.length === 0 && client.connected) {
        try {
            const wasScanning = client.isScanning;
            if (!wasScanning) {
                await client.startScanning();
            }
            await sleep(2000);
            if (!wasScanning && client.isScanning) {
                await client.stopScanning();
            }
        } catch (error) {
            debugLog("Auto device scan failed during snapshot refresh", error, "warn");
        }

        liveDevices = await collectLiveDevices();
    }

    return liveDevices;
}

export function stopBatteryMonitor(): void {
    if (batteryIntervalId) {
        clearInterval(batteryIntervalId);
        batteryIntervalId = null;
    }
}

export function checkDeviceBattery(): void {
    if (!client) return;
    stopBatteryMonitor();

    batteryIntervalId = setInterval(async () => {
        if (!client) return;
        for (const device of Array.from(client.devices.values())) {
            if (!device.hasInput(InputType.Battery) || device.warnedLowBattery) continue;

            try {
                const battery = await device.battery();
                if (isBatteryLow(battery)) {
                    device.warnedLowBattery = true;
                    showNotification({
                        title: "Device battery low",
                        body: `The battery of device "${device.name}" is low (${formatBatteryLevel(battery)})`,
                        permanent: false,
                        noPersist: false,
                    });
                }
            } catch (error) {
                pruneUnavailableDevice(device, error);
                debugLog(`Battery check failed for device ${device.name}`, error, "warn");
            }
        }
    }, 60000);
}

export async function handleConnection(): Promise<void> {
    try {
        debugLog("Starting connection process", undefined, "info");

        if (!settings.store.websocketUrl) {
            debugLog("No WebSocket URL configured", undefined, "warn");
            setRpc({
                appName: settings.store.richPresenceTitle,
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

        // Always create a fresh client to avoid stale connector/listener state
        if (client) {
            await disconnectClientTransport();
        }

        connector = new ButtplugBrowserWebsocketClientConnector(settings.store.websocketUrl);
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
                appName: settings.store.richPresenceTitle,
                details: `Connected to ${client?.devices.size} ${client?.devices.size === 1 ? "device" : "devices"}`,
                type: ActivityType.PLAYING,
                imageBig: "1225879839622299748",
            });

            showNotification({
                title: `Device added (Total devices: ${client?.devices.size})`,
                body: `A device named "${device.name}" was added${device.hasInput(InputType.Battery) ? ` and has a battery level of ${formatBatteryLevel(await device.battery())}` : ". No battery detected."} `,
                permanent: false,
                noPersist: false,
            });

            if (!device.hasOutput(OutputType.Vibrate))
                return;

            try {
                debugLog(`Testing device vibration: ${device.name}`, undefined, "verbose");
                await device.runOutput(DeviceOutput.Vibrate.percent(0.1));
                await sleep(500);
                await device.runOutput(DeviceOutput.Vibrate.percent(0));
                debugLog(`Device test completed: ${device.name}`, undefined, "verbose");
            } catch (error) {
                debugLog(`Device test failed: ${device.name}`, error, "warn");
                if (error instanceof ButtplugDeviceError) {
                    logger.warn("Got a device error during test vibration");
                }
            }
        });

        client.addListener("deviceremoved", (device: ButtplugClientDevice) => {
            debugLog(`Device removed: ${device.name}`, undefined, "info");

            setRpc({
                appName: settings.store.richPresenceTitle,
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

        await client.connect(connector);
        logger.info("Buttplug.io connected");
        debugLog("Successfully connected to Buttplug.io", undefined, "info");

        checkDeviceBattery();

        setRpc({
            appName: settings.store.richPresenceTitle,
            details: client.devices.size === 0 ? "Intiface connected, no devices connected" : `Connected to ${client.devices.size} ${client.devices.size === 1 ? "device" : "devices"}`,
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
        logger.error("Connection failed:", error);
        setRpc({
            appName: settings.store.richPresenceTitle,
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

export async function handleDisconnection(): Promise<void> {
    try {
        debugLog("Starting disconnection process", undefined, "info");
        onDisconnectionCallback?.();

        await disconnectClientTransport();
        client = null;
        stopBatteryMonitor();

        setRpc({
            appName: settings.store.richPresenceTitle,
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
        logger.error("Error during disconnection:", error);
    }
}
