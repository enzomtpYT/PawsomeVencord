/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Settings } from "@api/Settings";
import { useEffect, useState } from "@webpack/common";

export type PluginSettings = {
    [key: string]: any;
};

export type PluginUse<Z extends PluginSettings> = () => Z;
export type PluginGet<Z extends PluginSettings> = () => Z;
export type PluginSet<Z extends PluginSettings> = (s: Z | ((settings: Z) => Z | undefined)) => Z;
export type PluginInitializer<Z extends PluginSettings, T = Z> = (set: PluginSet<Z>, get: PluginGet<Z>) => T;
export interface PluginStore<Z extends PluginSettings> {
    use: PluginUse<Z>;
    get: PluginGet<Z>;
    set: PluginSet<Z>;
}

export function createPluginStore<Z extends PluginSettings = {}>(
    pluginName: string,
    storeName: string,
    f: PluginInitializer<Z>
): PluginStore<Z> {
    const dataStoreKey = `${pluginName}_${storeName}`;
    const listeners = new Set<() => void>();
    const emitUpdate = () => listeners.forEach(cb => {
        try {
            cb();
        } catch {}
    });

    let state: Z = {} as Z;

    const get: PluginGet<Z> = () => state;

    const persist = (data: any) => {
        const toSave = {
            simpleMode: data.simpleMode ?? false,
            profiles: Array.isArray(data.profiles) ? data.profiles.map((p: any) => ({ ...p })) : [],
            currentProfile: data.currentProfile ? { ...data.currentProfile } : { name: "" }
        };
        DataStore.set(dataStoreKey, toSave).catch(() => {});
    };

    const set: PluginSet<Z> = (s: ((settings: Z) => Z | undefined) | Z) => {
        const next = typeof s === "function" ? s(state) : s;
        if (next) {
            Object.assign(state, next);
            persist(state);
            emitUpdate();
        }
        return state;
    };

    state = f(set, get);

    // Initial async load & legacy migration
    const initStore = async () => {
        try {
            // Check legacy Settings migration
            const legacyStore = (Settings.plugins as any)?.[pluginName]?.stores?.[storeName];
            let saved = await DataStore.get<any>(dataStoreKey);

            if (!saved && legacyStore) {
                saved = {
                    simpleMode: legacyStore.simpleMode ?? false,
                    profiles: legacyStore.profiles || [],
                    currentProfile: legacyStore.currentProfile || { name: "" }
                };
                await DataStore.set(dataStoreKey, saved);
                // Clean up legacy store from Settings
                delete (Settings.plugins as any)[pluginName].stores[storeName];
                if (Object.keys((Settings.plugins as any)[pluginName].stores).length === 0) {
                    delete (Settings.plugins as any)[pluginName].stores;
                }
            }

            if (saved) {
                if (saved.simpleMode !== undefined) (state as any).simpleMode = saved.simpleMode;
                if (saved.profiles) (state as any).profiles = saved.profiles;
                if (saved.currentProfile) (state as any).currentProfile = saved.currentProfile;
                emitUpdate();
            }
        } catch {
            // Keep default state on error
        }
    };

    initStore();

    const use: PluginUse<Z> = () => {
        const [, setTick] = useState({});
        useEffect(() => {
            const onUpdate = () => setTick({});
            listeners.add(onUpdate);
            return () => {
                listeners.delete(onUpdate);
            };
        }, []);
        return state;
    };

    return {
        use,
        get,
        set
    };
}
