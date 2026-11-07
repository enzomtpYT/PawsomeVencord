/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FluxDispatcher } from "@webpack/common";

import { settings } from "./settings";
import { Activity, ActivityType, RpcData } from "./types";

let rpcDisconnectedTime: Date | null = null;
let rpcIntervalId: NodeJS.Timeout | null = null;

export function getRpcDisconnectedTime(): Date | null {
    return rpcDisconnectedTime;
}

export async function createActivity(data: RpcData): Promise<Activity | undefined> {
    const { appName, details, state, type = ActivityType.PLAYING, imageBig, imageBigTooltip, imageSmall, imageSmallTooltip, buttonOneText, buttonOneURL } = data;
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
            button_urls: [buttonOneURL || ""],
        };
    }

    for (const k in activity) {
        if (k === "type") continue;
        const v = activity[k];
        if (!v || (typeof v === "string" && v.length === 0) || (Array.isArray(v) && v.length === 0)) {
            delete activity[k];
        }
    }

    return activity;
}

export async function setRpc(data: RpcData): Promise<void> {
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

export function checkRpcDisconnectedTime(): void {
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

export function startRpcTimer(): void {
    if (rpcIntervalId) clearInterval(rpcIntervalId);
    rpcIntervalId = setInterval(checkRpcDisconnectedTime, 60000);
}

export function stopRpcTimer(): void {
    if (rpcIntervalId) {
        clearInterval(rpcIntervalId);
        rpcIntervalId = null;
    }
}
