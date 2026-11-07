/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

const API_URL = "https://tiktok-tts.weilnet.workers.dev/api/generation";

export async function fetchTikTokAudio(
    _: IpcMainInvokeEvent,
    text: string,
    voice: string
): Promise<{ success: boolean; data?: string; error?: string; }> {
    if (typeof text !== "string" || typeof voice !== "string" || text.trim().length === 0 || text.length > 500) {
        return { success: false, error: "Invalid parameters" };
    }

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: text.trim(),
                voice: voice.trim()
            })
        });

        if (!res.ok) {
            return { success: false, error: `TTS server responded with ${res.status} ${res.statusText}` };
        }

        const data = await res.json() as { success?: boolean; data?: string; error?: string; };
        if (!data?.success || !data?.data) {
            return { success: false, error: data?.error || "Unknown TTS generation error" };
        }

        return { success: true, data: data.data };
    } catch (e) {
        return { success: false, error: String(e) };
    }
}
