/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

import type { ServerProfilePreset } from "./types";

const PRESETS_STORAGE_KEY = "ServerProfilesToolbox_presets";

export async function getPresets(): Promise<ServerProfilePreset[]> {
    const list = await DataStore.get<ServerProfilePreset[]>(PRESETS_STORAGE_KEY);
    return Array.isArray(list) ? list : [];
}

export async function savePreset(preset: ServerProfilePreset): Promise<ServerProfilePreset[]> {
    const current = await getPresets();
    const existingIndex = current.findIndex(p => p.id === preset.id || p.name.toLowerCase() === preset.name.toLowerCase());

    if (existingIndex >= 0) {
        current[existingIndex] = { ...preset, timestamp: Date.now() };
    } else {
        current.push({ ...preset, timestamp: Date.now() });
    }

    await DataStore.set(PRESETS_STORAGE_KEY, current);
    return current;
}

export async function deletePreset(id: string): Promise<ServerProfilePreset[]> {
    const current = await getPresets();
    const updated = current.filter(p => p.id !== id);
    await DataStore.set(PRESETS_STORAGE_KEY, updated);
    return updated;
}

export function exportPresetJson(preset: ServerProfilePreset): string {
    return JSON.stringify(preset, null, 2);
}

export function parsePresetJson(rawJson: string): ServerProfilePreset | null {
    try {
        const parsed = JSON.parse(rawJson);
        if (!parsed || typeof parsed !== "object") return null;

        return {
            id: typeof parsed.id === "string" ? parsed.id : `preset_${Date.now()}`,
            name: typeof parsed.name === "string" ? parsed.name : "Imported Preset",
            timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now(),
            nick: typeof parsed.nick === "string" || parsed.nick === null ? parsed.nick : null,
            pronouns: typeof parsed.pronouns === "string" || parsed.pronouns === null ? parsed.pronouns : null,
            bio: typeof parsed.bio === "string" || parsed.bio === null ? parsed.bio : null,
            themeColors: Array.isArray(parsed.themeColors) ? parsed.themeColors : undefined,
            banner: typeof parsed.banner === "string" ? parsed.banner : undefined,
            avatar: typeof parsed.avatar === "string" ? parsed.avatar : undefined,
            profileEffectId: typeof parsed.profileEffectId === "string" ? parsed.profileEffectId : undefined,
            avatarDecoration: typeof parsed.avatarDecoration === "string" ? parsed.avatarDecoration : undefined,
        };
    } catch {
        return null;
    }
}
