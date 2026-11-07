/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ButtplugClientDevice, DeviceOutput, OutputType } from "buttplug";

import type { VibrateEvent } from "./types";
import { debugLog, sleep } from "./utils";

export async function oscillateDevices(devices: ButtplugClientDevice[], speed: number): Promise<void> {
    const normalizedSpeed = Math.min(speed / 100, 1);
    for (const device of devices) {
        if (device.hasOutput(OutputType.Oscillate)) {
            try {
                await device.runOutput(DeviceOutput.Oscillate.percent(normalizedSpeed));
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.includes("Outside valid range") || message.includes("Feature not implemented")) {
                    debugLog(`Oscillation speed ${speed} is outside the supported range or feature is not implemented for device ${device.name}`, undefined, "warn");
                } else if (message.includes("not connected")) {
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

export async function rotateDevices(devices: ButtplugClientDevice[], speed: number): Promise<void> {
    const normalizedSpeed = speed / 100;
    for (const device of devices) {
        if (device.hasOutput(OutputType.Rotate)) {
            try {
                await device.runOutput(DeviceOutput.Rotate.percent(normalizedSpeed));
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.includes("not connected")) {
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

export async function activateAllFeatures(devices: ButtplugClientDevice[], intensity: number): Promise<void> {
    const normalizedIntensity = intensity / 100;
    for (const device of devices) {
        try {
            if (device.hasOutput(OutputType.Vibrate)) {
                try {
                    await device.runOutput(DeviceOutput.Vibrate.percent(normalizedIntensity));
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    if (message.includes("not connected")) {
                        debugLog(`Device ${device.name} not connected for vibration`, undefined, "warn");
                    } else {
                        debugLog(`Error vibrating device ${device.name}`, error, "warn");
                    }
                }
            }
            if (device.hasOutput(OutputType.Rotate)) {
                try {
                    await device.runOutput(DeviceOutput.Rotate.percent(normalizedIntensity));
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    if (message.includes("not connected")) {
                        debugLog(`Device ${device.name} not connected for rotation`, undefined, "warn");
                    } else {
                        debugLog(`Error rotating device ${device.name}`, error, "warn");
                    }
                }
            }
            if (device.hasOutput(OutputType.Oscillate)) {
                try {
                    await device.runOutput(DeviceOutput.Oscillate.percent(normalizedIntensity));
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    if (message.includes("not connected")) {
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

export async function stopDevices(devices: ButtplugClientDevice[]): Promise<void> {
    for (const device of devices) {
        try {
            // device.stop() sends StopDeviceCmd which is removed in Buttplug spec v4;
            // zero out every active output via OutputCmd instead
            if (device.hasOutput(OutputType.Vibrate))
                await device.runOutput(DeviceOutput.Vibrate.percent(0));
            if (device.hasOutput(OutputType.Rotate))
                await device.runOutput(DeviceOutput.Rotate.percent(0));
            if (device.hasOutput(OutputType.Oscillate))
                await device.runOutput(DeviceOutput.Oscillate.percent(0));
        } catch (error) {
            debugLog(`Error stopping device ${device.name}`, error, "warn");
        }
    }
}

export async function vibrateDevices(devices: ButtplugClientDevice[], intensity: number): Promise<void> {
    const clampedIntensity = Math.max(0, Math.min(intensity, 1));
    for (const device of devices) {
        try {
            await device.runOutput(DeviceOutput.Vibrate.percent(clampedIntensity));
        } catch (error) {
            debugLog(`Error vibrating device ${device.name}`, error, "warn");
        }
    }
}

export async function executeVibrate(
    devices: ButtplugClientDevice[],
    data: VibrateEvent,
    rampUpAndDown: boolean,
    rampUpAndDownSteps: number
): Promise<void> {
    debugLog("Vibrating devices", {
        deviceCount: devices.length,
        targetDeviceId: data.deviceId,
        strength: data.strength,
        duration: data.duration,
        rampEnabled: rampUpAndDown
    }, "info");

    const shouldOscillate = data.oscillationSpeed !== undefined;
    let oscillationSpeed = 0;
    if (typeof data.oscillationSpeed === "number") {
        oscillationSpeed = data.oscillationSpeed;
    } else if (Array.isArray(data.oscillationSpeed) && data.oscillationSpeed.length > 0) {
        oscillationSpeed = data.oscillationSpeed[0] ?? 0;
    }

    try {
        if (!rampUpAndDown) {
            debugLog("Direct vibration (no ramping)", undefined, "verbose");
            await vibrateDevices(devices, data.strength);
            if (shouldOscillate) {
                await oscillateDevices(devices, oscillationSpeed);
            }
            await sleep(data.duration);
            await stopDevices(devices);
        } else {
            debugLog("Ramped vibration starting", undefined, "verbose");
            const steps = rampUpAndDownSteps;
            const rampLength = data.duration * 0.2 / steps;
            const startIntensity = 0;
            const endIntensity = data.strength;
            const stepIntensity = (endIntensity - startIntensity) / steps;

            debugLog(`Ramping up with ${steps} steps`, undefined, "verbose");
            for (let i = 0; i <= steps; i++) {
                await vibrateDevices(devices, startIntensity + (stepIntensity * i));
                if (shouldOscillate) {
                    await oscillateDevices(devices, oscillationSpeed);
                }
                await sleep(rampLength);
            }

            debugLog("Sustaining vibration", undefined, "verbose");
            await sleep(data.duration * 0.54);

            debugLog("Ramping down", undefined, "verbose");
            const rampDownStart = data.strength;
            const rampDownEnd = 0;
            const rampDownStep = (rampDownEnd - rampDownStart) / steps;

            for (let i = 0; i <= steps; i++) {
                await vibrateDevices(devices, rampDownStart + (rampDownStep * i));
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
