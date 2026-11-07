/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { executeVibrate } from "./actuation";
import { getClient, setDisconnectionCallback } from "./client";
import { settings } from "./settings";
import type { VibrateEvent } from "./types";
import { debugLog, logger } from "./utils";

let vibrateQueue: VibrateEvent[] = [];
let patternIntervalId: NodeJS.Timeout | null = null;

export function getVibrateQueue(): VibrateEvent[] {
    return vibrateQueue;
}

export function clearVibrateQueue(): number {
    const { length } = vibrateQueue;
    vibrateQueue = [];
    return length;
}

export function setPatternInterval(interval: NodeJS.Timeout | null): void {
    if (patternIntervalId) {
        clearInterval(patternIntervalId);
    }
    patternIntervalId = interval;
}

export function clearPatternInterval(): void {
    if (patternIntervalId) {
        clearInterval(patternIntervalId);
        patternIntervalId = null;
    }
}

export function hasPatternInterval(): boolean {
    return patternIntervalId !== null;
}

setDisconnectionCallback(() => {
    clearVibrateQueue();
    clearPatternInterval();
});

export async function addToVibrateQueue(data: VibrateEvent): Promise<void> {
    const client = getClient();
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
}

export async function processVibrateQueue(): Promise<void> {
    if (vibrateQueue.length === 0) {
        debugLog("Vibrate queue is empty", undefined, "verbose");
        return;
    }

    const data = vibrateQueue[0];
    debugLog("Processing vibrate queue item", data, "verbose");

    try {
        const client = getClient();
        if (client && client.devices && client.connected) {
            const devices = data.deviceId !== undefined
                ? [Array.from(client.devices.values())[data.deviceId]].filter(Boolean)
                : Array.from(client.devices.values());

            if (devices.length > 0) {
                await executeVibrate(devices, data, settings.store.rampUpAndDown, settings.store.rampUpAndDownSteps);
            }
        }
    } catch (error) {
        debugLog("Error in processVibrateQueue", error, "error");
        logger.error("Error in processVibrateQueue:", error);
    } finally {
        vibrateQueue.shift();
        debugLog(`Vibrate queue item processed, remaining: ${vibrateQueue.length}`, undefined, "verbose");

        if (vibrateQueue.length > 0) {
            processVibrateQueue();
        }
    }
}
