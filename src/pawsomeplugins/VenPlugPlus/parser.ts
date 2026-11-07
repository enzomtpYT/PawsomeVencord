/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface ParsedMotion {
    deviceId?: number; // 0-based index
    normalizedValue: number; // 0.0 - 1.0 (scaled by maxIntensity)
    rawPercent: number; // 0 - 100
    duration?: number; // milliseconds
    error?: string;
}

export interface ParsedPattern {
    deviceId?: number;
    rawPercent: number;
    intervalDuration: number; // milliseconds
    error?: string;
}

export function parseDuration(token: string): number | null {
    const trimmed = token.trim().toLowerCase();
    const msMatch = /^(\d+(?:\.\d+)?)\s*ms$/.exec(trimmed);
    if (msMatch) {
        const val = Number(msMatch[1]);
        return isNaN(val) || val < 0 ? null : Math.round(val);
    }

    const secMatch = /^(\d+(?:\.\d+)?)\s*s$/.exec(trimmed);
    if (secMatch) {
        const val = Number(secMatch[1]);
        return isNaN(val) || val < 0 ? null : Math.round(val * 1000);
    }

    // Pure number > 100 is treated as milliseconds duration (intensity cannot exceed 100)
    const num = Number(trimmed);
    if (!isNaN(num) && num > 100) {
        return Math.round(num);
    }

    return null;
}

export function parseDeviceToken(token: string, totalDevices: number): number | null {
    const trimmed = token.trim().toLowerCase();
    const match = /^(?:#|d|dev)(\d+)$/.exec(trimmed);
    if (match) {
        const id = Number(match[1]);
        if (isNaN(id) || id < 1 || (totalDevices > 0 && id > totalDevices)) return null;
        return id - 1;
    }
    return null;
}

export function parsePercentToken(token: string): number | null {
    const trimmed = token.trim();
    const match = /^(\d+(?:\.\d+)?)\s*%$/.exec(trimmed);
    if (match) {
        const val = Number(match[1]);
        return isNaN(val) ? null : Math.max(0, Math.min(val, 100));
    }
    return null;
}

export function parseMotionArgs(args: string[], totalDevices: number, maxIntensity = 100): ParsedMotion {
    if (args.length === 0) {
        return { normalizedValue: 0, rawPercent: 0, error: "Please provide an intensity or speed (e.g. 50% or 50)." };
    }

    let deviceId: number | undefined;
    let duration: number | undefined;
    let rawPercent: number | undefined;

    const remainingTokens: string[] = [];

    // Pass 1: Identify tokens with explicit units (#1/d1, 2s/500ms, 50%)
    for (const token of args) {
        const dev = parseDeviceToken(token, totalDevices);
        if (dev !== null && deviceId === undefined) {
            deviceId = dev;
            continue;
        }

        const dur = parseDuration(token);
        if (dur !== null && duration === undefined) {
            duration = dur;
            continue;
        }

        const pct = parsePercentToken(token);
        if (pct !== null && rawPercent === undefined) {
            rawPercent = pct;
            continue;
        }

        remainingTokens.push(token);
    }

    // Pass 2: Handle raw numbers for backwards compatibility
    if (remainingTokens.length > 0) {
        if (remainingTokens.length === 3 && deviceId === undefined && rawPercent === undefined && duration === undefined) {
            // Format: <deviceId> <intensity> <durationMs>
            const devNum = Number(remainingTokens[0]);
            const pctNum = Number(remainingTokens[1]);
            const durNum = Number(remainingTokens[2]);

            if (!isNaN(devNum) && devNum >= 1 && (totalDevices === 0 || devNum <= totalDevices)) {
                deviceId = devNum - 1;
            } else {
                return { normalizedValue: 0, rawPercent: 0, error: `Invalid device ID "${remainingTokens[0]}".` };
            }

            if (!isNaN(pctNum) && pctNum >= 0) {
                rawPercent = Math.min(pctNum, 100);
            }

            if (!isNaN(durNum) && durNum >= 0) {
                duration = Math.round(durNum);
            }
        } else if (remainingTokens.length === 2) {
            const num1 = Number(remainingTokens[0]);
            const num2 = Number(remainingTokens[1]);

            if (deviceId === undefined && rawPercent === undefined && duration === undefined) {
                // If second number is > 100, it's <intensity> <duration> (e.g. 50 2000)
                if (!isNaN(num2) && num2 > 100) {
                    rawPercent = Math.max(0, Math.min(num1, 100));
                    duration = Math.round(num2);
                } else if (!isNaN(num1) && num1 >= 1 && (totalDevices === 0 || num1 <= totalDevices)) {
                    // Otherwise it's <deviceId> <intensity> (e.g. 1 50)
                    deviceId = num1 - 1;
                    rawPercent = Math.max(0, Math.min(num2, 100));
                } else {
                    rawPercent = Math.max(0, Math.min(num1, 100));
                }
            } else if (rawPercent === undefined) {
                rawPercent = Math.max(0, Math.min(num1, 100));
            }
        } else if (remainingTokens.length === 1) {
            const num = Number(remainingTokens[0]);
            if (!isNaN(num)) {
                if (rawPercent === undefined) {
                    rawPercent = Math.max(0, Math.min(num, 100));
                } else if (duration === undefined && num > 0) {
                    duration = Math.round(num);
                } else if (deviceId === undefined && num >= 1 && (totalDevices === 0 || num <= totalDevices)) {
                    deviceId = num - 1;
                }
            } else {
                return { normalizedValue: 0, rawPercent: 0, error: `Unrecognized argument "${remainingTokens[0]}".` };
            }
        }
    }

    if (rawPercent === undefined) {
        return { normalizedValue: 0, rawPercent: 0, error: "Missing intensity or speed parameter (e.g. 50% or 50)." };
    }

    const safeMax = Math.max(0, Math.min(maxIntensity, 100));
    const normalizedValue = (rawPercent / 100) * (safeMax / 100);

    return {
        deviceId,
        rawPercent,
        normalizedValue,
        duration,
    };
}

export function parsePatternArgs(args: string[], totalDevices: number, maxIntensity = 100): ParsedPattern {
    if (args.length < 2) {
        return { rawPercent: 0, intervalDuration: 0, error: "Pattern requires intensity and interval (e.g. pattern 30% 1s or pattern #1 30% 500ms)." };
    }

    let deviceId: number | undefined;
    let rawPercent: number | undefined;
    let intervalDuration: number | undefined;

    const remaining: string[] = [];

    for (const token of args) {
        const dev = parseDeviceToken(token, totalDevices);
        if (dev !== null && deviceId === undefined) {
            deviceId = dev;
            continue;
        }

        const dur = parseDuration(token);
        if (dur !== null && intervalDuration === undefined) {
            intervalDuration = dur;
            continue;
        }

        const pct = parsePercentToken(token);
        if (pct !== null && rawPercent === undefined) {
            rawPercent = pct;
            continue;
        }

        remaining.push(token);
    }

    if (remaining.length > 0) {
        if (rawPercent === undefined && remaining.length >= 1) {
            const num = Number(remaining[0]);
            if (!isNaN(num)) rawPercent = Math.max(0, Math.min(num, 100));
        }
        if (intervalDuration === undefined && remaining.length >= 2) {
            const dur = Number(remaining[1]);
            if (!isNaN(dur) && dur > 0) intervalDuration = Math.round(dur);
        }
    }

    if (rawPercent === undefined || intervalDuration === undefined || intervalDuration <= 0) {
        return { rawPercent: 0, intervalDuration: 0, error: "Please provide a valid intensity (0-100%) and interval (e.g. 1s or 500ms)." };
    }

    const safeMax = Math.max(0, Math.min(maxIntensity, 100));
    rawPercent = Math.min(rawPercent, safeMax);

    return {
        deviceId,
        rawPercent,
        intervalDuration,
    };
}
